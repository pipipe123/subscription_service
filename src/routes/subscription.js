const { Router } = require('express');
const requireAuth = require('../middlewares/requireAuth');
const requireAdmin = require('../middlewares/requireAdmin');
const ctrl = require('../controllers/subscriptionController');

const router = Router();

/**
 * @swagger
 * /subscription/plans:
 *   get:
 *     summary: Obtener planes activos
 *     tags: [Subscriptions]
 *     responses:
 *       200:
 *         description: Lista de planes activos
 */
router.get('/plans', ctrl.getPlans);

/**
 * @swagger
 * /subscription/checkout:
 *   post:
 *     summary: Crear sesión de checkout en Stripe
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: URL de checkout de Stripe
 *       400:
 *         description: Ya tiene suscripción activa o plan_id faltante
 *       404:
 *         description: Plan no encontrado
 */
router.post('/checkout', requireAuth, ctrl.createCheckout);

/**
 * @swagger
 * /subscription/me:
 *   get:
 *     summary: Obtener mi suscripción actual
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Suscripción actual o null
 */
router.get('/me', requireAuth, ctrl.getMySubscription);

/**
 * @swagger
 * /subscription/history:
 *   get:
 *     summary: Obtener historial de pagos
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Últimos 20 pagos
 */
router.get('/history', requireAuth, ctrl.getHistory);

/**
 * @swagger
 * /subscription/cancel:
 *   post:
 *     summary: Cancelar suscripción al final del periodo
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Suscripción cancelada al final del periodo
 *       404:
 *         description: No tiene suscripción activa
 */
router.post('/cancel', requireAuth, ctrl.cancelSubscription);

/**
 * @swagger
 * /subscription/admin/stats:
 *   get:
 *     summary: Estadísticas de suscripciones (solo admin)
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas de suscripciones
 *       403:
 *         description: Solo admins
 */
router.get('/admin/stats', requireAuth, requireAdmin, ctrl.getAdminStats);

module.exports = router;
