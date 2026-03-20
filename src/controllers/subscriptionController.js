const { query } = require('../config/database');
const config = require('../config');
const stripe = config.stripeSecretKey
  ? require('stripe')(config.stripeSecretKey)
  : null;
const { publishEvent } = require('../services/rabbitmq');

// GET /subscription/plans — público
const getPlans = async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, price, interval, currency FROM plans WHERE active = true ORDER BY price ASC'
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error('getPlans error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /subscription/checkout — privado
const createCheckout = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe no está configurado' });
    }
    const { plan_id } = req.body;

    if (!plan_id) {
      return res.status(400).json({ error: 'plan_id es requerido' });
    }

    if (req.user.role === 'premium' || req.user.role === 'admin') {
      return res.status(400).json({ error: 'Ya tienes una suscripción activa' });
    }

    const { rows } = await query(
      'SELECT * FROM plans WHERE id = $1 AND active = true',
      [plan_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }

    const plan = rows[0];

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      client_reference_id: String(req.user.id),
      customer_email: req.user.email,
      success_url: `${config.clientUrl}/subscribe/success`,
      cancel_url: `${config.clientUrl}/subscribe`,
    });

    return res.status(200).json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('createCheckout error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /subscription/me — privado
const getMySubscription = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT s.*, p.name AS plan_name, p.price, p.interval, p.currency
       FROM subscriptions s
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = $1
         AND (
           s.status IN ('active', 'canceling')
           OR (s.status = 'canceled' AND s.current_period_end > NOW())
         )
       ORDER BY s.created_at DESC LIMIT 1`,
      [req.user.id]
    );

    return res.status(200).json(rows[0] || null);
  } catch (err) {
    console.error('getMySubscription error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /subscription/history — privado
const getHistory = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, user_id, subscription_id, amount, currency, status,
              stripe_payment_intent_id, stripe_invoice_id, paid_at
       FROM payment_history
       WHERE user_id = $1
       ORDER BY paid_at DESC LIMIT 20`,
      [req.user.id]
    );

    return res.status(200).json(rows);
  } catch (err) {
    console.error('getHistory error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /subscription/cancel — privado
const cancelSubscription = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe no está configurado' });
    }
    const { rows } = await query(
      `SELECT * FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No tienes suscripción activa' });
    }

    const sub = rows[0];

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    await query(
      'UPDATE subscriptions SET cancel_at_period_end = true WHERE id = $1',
      [sub.id]
    );

    return res.status(200).json({
      message: 'Suscripción cancelada al final del periodo',
      ends_at: sub.current_period_end,
    });
  } catch (err) {
    console.error('cancelSubscription error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /subscription/webhook — webhook de Stripe (sin auth, body raw)
const handleWebhook = async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe no está configurado' });
  }
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripeWebhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Firma del webhook inválida' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const stripeSubId = session.subscription;
        const stripeCustomerId = session.customer;

        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
        const priceId = stripeSub.items.data[0]?.price?.id;

        const { rows: planRows } = await query(
          'SELECT id FROM plans WHERE stripe_price_id = $1',
          [priceId]
        );

        if (planRows.length === 0) {
          console.error('Plan not found for stripe_price_id:', priceId);
          break;
        }

        const planId = planRows[0].id;
        const periodEnd = new Date(stripeSub.current_period_end * 1000);

        const { rows: subRows } = await query(
          `INSERT INTO subscriptions
            (user_id, plan_id, status, stripe_subscription_id, stripe_customer_id, current_period_end)
           VALUES ($1, $2, 'active', $3, $4, $5)
           ON CONFLICT (stripe_subscription_id) DO UPDATE
            SET status = 'active', current_period_end = $5, canceled_at = NULL
           RETURNING id`,
          [userId, planId, stripeSubId, stripeCustomerId, periodEnd]
        );

        const subscriptionId = subRows[0].id;

        // Guardar pago inicial si hay invoice
        if (stripeSub.latest_invoice) {
          const invoice = await stripe.invoices.retrieve(stripeSub.latest_invoice);
          await query(
            `INSERT INTO payment_history
              (user_id, subscription_id, amount, currency, status, stripe_payment_intent_id, stripe_invoice_id)
             VALUES ($1, $2, $3, $4, 'paid', $5, $6)
             ON CONFLICT (stripe_invoice_id) DO NOTHING`,
            [
              userId,
              subscriptionId,
              invoice.amount_paid / 100,
              invoice.currency,
              invoice.payment_intent,
              invoice.id,
            ]
          );
        }

        await publishEvent('user.upgraded', { user_id: userId });
        await publishEvent('subscription.created', {
          user_id: userId,
          subscription_id: subscriptionId,
        });
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const stripeSubId = invoice.subscription;

        const { rows: subRows } = await query(
          'SELECT id, user_id FROM subscriptions WHERE stripe_subscription_id = $1',
          [stripeSubId]
        );

        if (subRows.length === 0) break;

        const sub = subRows[0];

        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
        const periodEnd = new Date(stripeSub.current_period_end * 1000);

        await query(
          `UPDATE subscriptions SET current_period_end = $1, status = 'active' WHERE id = $2`,
          [periodEnd, sub.id]
        );

        await query(
          `INSERT INTO payment_history
            (user_id, subscription_id, amount, currency, status, stripe_payment_intent_id, stripe_invoice_id)
           VALUES ($1, $2, $3, $4, 'paid', $5, $6)
           ON CONFLICT (stripe_invoice_id) DO NOTHING`,
          [
            sub.user_id,
            sub.id,
            invoice.amount_paid / 100,
            invoice.currency,
            invoice.payment_intent,
            invoice.id,
          ]
        );
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const stripeSubId = invoice.subscription;

        const { rows: subRows } = await query(
          'SELECT id, user_id FROM subscriptions WHERE stripe_subscription_id = $1',
          [stripeSubId]
        );

        if (subRows.length === 0) break;

        const sub = subRows[0];

        await query(
          `UPDATE subscriptions SET status = 'past_due' WHERE id = $1`,
          [sub.id]
        );

        await query(
          `INSERT INTO payment_history
            (user_id, subscription_id, amount, currency, status, stripe_payment_intent_id, stripe_invoice_id)
           VALUES ($1, $2, $3, $4, 'failed', $5, $6)
           ON CONFLICT (stripe_invoice_id) DO NOTHING`,
          [
            sub.user_id,
            sub.id,
            invoice.amount_due / 100,
            invoice.currency,
            invoice.payment_intent,
            invoice.id,
          ]
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        const stripeSubId = stripeSub.id;
        const periodExpired =
          new Date(stripeSub.current_period_end * 1000) <= new Date();

        const status = periodExpired ? 'canceled' : 'canceling';

        const { rows: subRows } = await query(
          `UPDATE subscriptions
           SET status = $1, canceled_at = NOW()
           WHERE stripe_subscription_id = $2
           RETURNING user_id, id`,
          [status, stripeSubId]
        );

        if (subRows.length === 0) break;

        const sub = subRows[0];

        if (periodExpired) {
          await publishEvent('user.downgraded', { user_id: sub.user_id });
        }

        await publishEvent('subscription.canceled', {
          user_id: sub.user_id,
          subscription_id: sub.id,
        });
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing webhook event ${event.type}:`, err.message);
  }

  return res.status(200).json({ received: true });
};

// GET /subscription/admin/stats — admin
const getAdminStats = async (req, res) => {
  try {
    const { rows: statusRows } = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'active')   AS active,
        COUNT(*) FILTER (WHERE status = 'canceled') AS canceled,
        COUNT(*) FILTER (WHERE status = 'past_due') AS past_due
       FROM subscriptions`
    );

    const { rows: revenueRows } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_revenue
       FROM payment_history WHERE status = 'paid'`
    );

    const { rows: recentPayments } = await query(
      `SELECT user_id, amount, currency, paid_at
       FROM payment_history WHERE status = 'paid'
       ORDER BY paid_at DESC LIMIT 10`
    );

    return res.status(200).json({
      active: parseInt(statusRows[0].active),
      canceled: parseInt(statusRows[0].canceled),
      past_due: parseInt(statusRows[0].past_due),
      total_revenue: parseFloat(revenueRows[0].total_revenue),
      recent_payments: recentPayments,
    });
  } catch (err) {
    console.error('getAdminStats error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  getPlans,
  createCheckout,
  getMySubscription,
  getHistory,
  cancelSubscription,
  handleWebhook,
  getAdminStats,
};
