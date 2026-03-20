require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const swaggerSpec = require('./config/swagger');
const routes = require('./routes');
const { connect, consumeEvent } = require('./services/rabbitmq');
const { query } = require('./config/database');

const app = express();

// Webhook route MUST receive raw body before express.json() parses it
app.post(
  '/subscription/webhook',
  express.raw({ type: 'application/json' }),
  require('./controllers/subscriptionController').handleWebhook
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/', routes);

// RabbitMQ consumer for user.deleted
const startConsumers = async () => {
  await connect();
  await consumeEvent('user.deleted', async (payload) => {
    const { user_id } = payload;
    console.log(`Processing user.deleted for user_id: ${user_id}`);
    await query('DELETE FROM payment_history WHERE user_id = $1', [user_id]);
    await query('DELETE FROM subscriptions WHERE user_id = $1', [user_id]);
  });
};

if (config.rabbitmqEnabled && config.rabbitmqUrl) {
  startConsumers()
    .then(() => console.log('RabbitMQ consumers activos'))
    .catch((err) => console.error('Failed to start consumers:', err.message));
} else {
  console.warn('RabbitMQ deshabilitado');
}

app.listen(config.port, () => {
  console.log(`Subscription Service running on port ${config.port} [${config.nodeEnv}]`);
});
