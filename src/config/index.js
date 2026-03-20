const config = {
  port: process.env.PORT || 8004,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
    db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'subscription',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  rabbitmqUrl: process.env.RABBITMQ_URL,
  rabbitmqEnabled: process.env.RABBITMQ_ENABLED === 'true',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3000',
};

module.exports = config;
