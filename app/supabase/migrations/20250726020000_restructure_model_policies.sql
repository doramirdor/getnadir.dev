-- Restructure model policies to use JSON instead of separate table
-- Add smart route as a policy type

-- First, backup existing data if any exists
CREATE TABLE IF NOT EXISTS model_policies_backup AS 
SELECT * FROM model_policies;

CREATE TABLE IF NOT EXISTS model_policy_items_backup AS 
SELECT * FROM model_policy_items;

-- Drop the model_policy_items table since we'll use JSON
DROP TABLE IF EXISTS model_policy_items;

-- Update the policy_type enum to include smart_route
ALTER TYPE policy_type ADD VALUE IF NOT EXISTS 'smart_route';

-- Add models column as JSONB to store the model configurations
ALTER TABLE model_policies 
ADD COLUMN IF NOT EXISTS models JSONB DEFAULT '[]'::jsonb;

-- Update the table structure with better organization
ALTER TABLE model_policies 
ADD COLUMN IF NOT EXISTS policy_config JSONB DEFAULT '{}'::jsonb;

-- Add index for better performance on JSON queries
CREATE INDEX IF NOT EXISTS idx_model_policies_models 
ON model_policies USING GIN (models);

CREATE INDEX IF NOT EXISTS idx_model_policies_config 
ON model_policies USING GIN (policy_config);

-- Update comments
COMMENT ON TABLE model_policies IS 'Model routing policies for fallback, load balancing, and smart routing. Models stored as JSON.';
COMMENT ON COLUMN model_policies.models IS 'Array of model configurations with weights, costs, and routing parameters';
COMMENT ON COLUMN model_policies.policy_config IS 'Policy-specific configuration options (benchmarks, thresholds, etc.)';

-- Example of models JSON structure:
-- [
--   {
--     "model_name": "gpt-4o",
--     "provider_name": "openai",
--     "owner": "OpenAI",
--     "input_cost": 0.000005,
--     "output_cost": 0.000015,
--     "token_capacity": 128000,
--     "sequence_order": 1,
--     "distribution_percentage": 50,
--     "enabled": true
--   }
-- ]

-- Example of policy_config JSON structure:
-- Fallback: { "mode": "custom" | "performance" }
-- Load Balance: { "distribution_method": "random" | "round_robin" | "weighted" }
-- Smart Route: { "benchmark_model": "gpt-4o", "performance_threshold": 0.8, "cost_threshold": 0.5 }