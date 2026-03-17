const config = {
  port: process.env.PORT || 8004,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://localhost',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3000',
};

module.exports = config;
