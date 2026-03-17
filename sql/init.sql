CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  interval VARCHAR(20) NOT NULL,
  currency VARCHAR(10) DEFAULT 'usd',
  stripe_price_id VARCHAR(255) UNIQUE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_id INT REFERENCES plans(id),
  status VARCHAR(50) DEFAULT 'active',
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_history (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  subscription_id INT REFERENCES subscriptions(id),
  amount DECIMAL(10, 2),
  currency VARCHAR(10),
  status VARCHAR(50),
  stripe_payment_intent_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255) UNIQUE,
  paid_at TIMESTAMPTZ DEFAULT NOW()
);
