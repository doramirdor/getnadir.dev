-- Create billing plans table
CREATE TABLE IF NOT EXISTS billing_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  plan_type VARCHAR(50) NOT NULL CHECK (plan_type IN ('subscription', 'pay_as_you_go', 'buy_credit')),
  price_per_month DECIMAL(10, 2), -- For subscription plans
  price_per_request DECIMAL(10, 6), -- For pay-as-you-go
  credit_amount DECIMAL(10, 2), -- For buy credit plans
  credit_price DECIMAL(10, 2), -- Price for the credit amount
  is_active BOOLEAN DEFAULT true,
  features JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES billing_plans(id),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  stripe_payment_method_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'cancelled', 'past_due', 'trialing')),
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create user credits table
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance DECIMAL(10, 2) DEFAULT 0.00,
  auto_charge_enabled BOOLEAN DEFAULT false,
  auto_charge_threshold DECIMAL(10, 2) DEFAULT 10.00,
  auto_charge_amount DECIMAL(10, 2) DEFAULT 20.00,
  upper_limit DECIMAL(10, 2), -- For pay-as-you-go upper bound
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create credit transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('purchase', 'usage', 'refund', 'auto_charge', 'token_grant')),
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  description TEXT,
  stripe_payment_intent_id VARCHAR(255),
  api_key_id UUID REFERENCES api_keys(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tokens table for time-limited and credit tokens
CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_code VARCHAR(255) NOT NULL UNIQUE,
  token_type VARCHAR(50) NOT NULL CHECK (token_type IN ('time_limited', 'credit_token')),
  
  -- For time-limited tokens
  days_valid INTEGER,
  
  -- For credit tokens  
  credit_amount DECIMAL(10, 2),
  
  -- Common fields
  is_redeemed BOOLEAN DEFAULT false,
  redeemed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Add constraint to ensure proper token data
  CONSTRAINT check_token_data CHECK (
    (token_type = 'time_limited' AND days_valid IS NOT NULL AND credit_amount IS NULL) OR
    (token_type = 'credit_token' AND credit_amount IS NOT NULL AND days_valid IS NULL)
  )
);

-- Create payment methods table
CREATE TABLE IF NOT EXISTS user_payment_methods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_payment_method_id VARCHAR(255) NOT NULL,
  card_brand VARCHAR(50),
  card_last_four VARCHAR(4),
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create usage tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id),
  model_name VARCHAR(255),
  tokens_used INTEGER DEFAULT 0,
  cost DECIMAL(10, 6) DEFAULT 0.000000,
  request_count INTEGER DEFAULT 1,
  created_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate daily entries
  UNIQUE(user_id, api_key_id, model_name, created_date)
);

-- Insert default billing plans
INSERT INTO billing_plans (name, description, plan_type, price_per_month, features) VALUES
('Free Tier', 'Basic access with limited requests', 'subscription', 0.00, '{"max_requests": 1000, "models": ["gpt-3.5-turbo"], "support": "community"}'),
('Pro Plan', 'Advanced features for professionals', 'subscription', 29.99, '{"max_requests": 50000, "models": ["gpt-4", "claude-3"], "support": "email", "analytics": true}'),
('Enterprise', 'Unlimited access for teams', 'subscription', 99.99, '{"max_requests": -1, "models": ["all"], "support": "priority", "analytics": true, "custom_models": true}'),
('Pay-As-You-Go', 'Pay per request', 'pay_as_you_go', NULL, '{"price_per_request": 0.002, "models": ["all"]}'),
('Buy Credits - $10', 'Purchase $10 in credits', 'buy_credit', NULL, '{}'),
('Buy Credits - $25', 'Purchase $25 in credits', 'buy_credit', NULL, '{}'),
('Buy Credits - $50', 'Purchase $50 in credits', 'buy_credit', NULL, '{}'),
('Buy Credits - $100', 'Purchase $100 in credits', 'buy_credit', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Update buy credit plans with proper pricing
UPDATE billing_plans SET 
  credit_amount = 10.00, 
  credit_price = 10.00 
WHERE name = 'Buy Credits - $10';

UPDATE billing_plans SET 
  credit_amount = 25.00, 
  credit_price = 25.00 
WHERE name = 'Buy Credits - $25';

UPDATE billing_plans SET 
  credit_amount = 50.00, 
  credit_price = 50.00 
WHERE name = 'Buy Credits - $50';

UPDATE billing_plans SET 
  credit_amount = 100.00, 
  credit_price = 100.00 
WHERE name = 'Buy Credits - $100';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_user_tokens_token_code ON user_tokens(token_code);
CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON user_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_date ON usage_tracking(user_id, created_date);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_api_key ON usage_tracking(api_key_id);

-- Create RLS policies
ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Billing plans are readable by all authenticated users
CREATE POLICY "Billing plans are viewable by authenticated users" ON billing_plans
  FOR SELECT USING (auth.role() = 'authenticated');

-- Users can only see their own subscription data
CREATE POLICY "Users can view own subscription" ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription" ON user_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription" ON user_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only see their own credit data
CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own credits" ON user_credits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credits" ON user_credits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only see their own transactions
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert transactions" ON credit_transactions
  FOR INSERT WITH CHECK (true);

-- Users can only see their own tokens
CREATE POLICY "Users can view own tokens" ON user_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens" ON user_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can insert tokens" ON user_tokens
  FOR INSERT WITH CHECK (true);

-- Users can only see their own payment methods
CREATE POLICY "Users can view own payment methods" ON user_payment_methods
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own payment methods" ON user_payment_methods
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own usage data
CREATE POLICY "Users can view own usage" ON usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert usage" ON usage_tracking
  FOR INSERT WITH CHECK (true);

-- Functions for credit management
CREATE OR REPLACE FUNCTION update_user_credits(
  p_user_id UUID,
  p_amount DECIMAL(10, 2),
  p_transaction_type VARCHAR(50),
  p_description TEXT DEFAULT NULL,
  p_stripe_payment_intent_id VARCHAR(255) DEFAULT NULL
) RETURNS DECIMAL(10, 2) AS $$
DECLARE
  current_balance DECIMAL(10, 2);
  new_balance DECIMAL(10, 2);
BEGIN
  -- Get current balance
  SELECT balance INTO current_balance 
  FROM user_credits 
  WHERE user_id = p_user_id;
  
  -- If user doesn't have a credits record, create one
  IF NOT FOUND THEN
    INSERT INTO user_credits (user_id, balance) VALUES (p_user_id, 0.00);
    current_balance := 0.00;
  END IF;
  
  -- Calculate new balance
  new_balance := current_balance + p_amount;
  
  -- Update balance
  UPDATE user_credits 
  SET balance = new_balance, updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Insert transaction record
  INSERT INTO credit_transactions (
    user_id, transaction_type, amount, balance_after, 
    description, stripe_payment_intent_id
  ) VALUES (
    p_user_id, p_transaction_type, p_amount, new_balance,
    p_description, p_stripe_payment_intent_id
  );
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if auto-charge should trigger
CREATE OR REPLACE FUNCTION check_auto_charge(p_user_id UUID) 
RETURNS BOOLEAN AS $$
DECLARE
  user_credits_record RECORD;
BEGIN
  SELECT * INTO user_credits_record
  FROM user_credits 
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  RETURN (
    user_credits_record.auto_charge_enabled = TRUE AND 
    user_credits_record.balance <= user_credits_record.auto_charge_threshold
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;