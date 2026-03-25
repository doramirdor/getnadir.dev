-- ============================================================================
-- SEED: Generate clusters for the existing code_completions.csv upload
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Step 0: Ensure updated_at columns exist on all clustering tables
ALTER TABLE public.prompt_uploads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.prompt_clusters ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.cluster_warmups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Step 1: Ensure the upload exists and is marked as 'clustered'
UPDATE public.prompt_uploads
SET status = 'clustered',
    processed_prompts = total_prompts
WHERE file_name = 'code_completions.csv';

-- Step 2: Insert clusters for the upload
-- Uses a CTE to find the upload_id and user_id dynamically
WITH target_upload AS (
  SELECT id AS upload_id, user_id
  FROM public.prompt_uploads
  WHERE file_name = 'code_completions.csv'
  LIMIT 1
)
INSERT INTO public.prompt_clusters (
  user_id, upload_id, cluster_name, description,
  usage_examples, classification_criteria,
  prompt_count, is_active
)
SELECT
  tu.user_id,
  tu.upload_id,
  v.cluster_name,
  v.description,
  v.usage_examples::jsonb,
  v.classification_criteria::jsonb,
  v.prompt_count,
  true
FROM target_upload tu
CROSS JOIN (VALUES
  (
    'Code Generation',
    'Prompts requesting the AI to write new code from scratch — functions, classes, scripts, or full programs based on a natural language description.',
    '["Write a Python function that sorts a list of dictionaries by a specific key", "Generate a REST API endpoint in Express.js for user authentication", "Create a React component that displays a paginated table"]',
    '["Asks for new code to be written", "Describes desired functionality in natural language", "May specify language, framework, or constraints", "Output is expected to be executable code"]',
    142
  ),
  (
    'Bug Fixing & Debugging',
    'Prompts where the user provides broken or misbehaving code and asks the AI to identify and fix the issue.',
    '["Fix this Python function that throws a KeyError when the input dict is empty", "Why does this SQL query return duplicate rows?", "Debug this React useEffect hook that causes an infinite render loop"]',
    '["Contains existing code with a described problem", "Mentions errors, bugs, or unexpected behavior", "Asks for a fix, correction, or explanation of what went wrong", "May include error messages or stack traces"]',
    87
  ),
  (
    'Code Refactoring',
    'Prompts asking to improve existing code quality — better structure, readability, performance, or adherence to best practices without changing functionality.',
    '["Refactor this class to use the Strategy pattern instead of if-else chains", "Optimize this database query to reduce execution time", "Rewrite this function using modern ES6+ syntax"]',
    '["Provides working code that needs improvement", "Asks for optimization, simplification, or modernization", "Functionality should remain the same", "May mention specific patterns, principles, or performance goals"]',
    63
  ),
  (
    'Code Explanation',
    'Prompts where the user shares code and asks the AI to explain what it does, how it works, or why certain patterns are used.',
    '["Explain what this recursive function does step by step", "What does this regex pattern match?", "Walk me through how this middleware pipeline processes requests"]',
    '["Contains code the user wants to understand", "Asks for explanation, walkthrough, or documentation", "Does not ask for changes to the code", "May ask about specific lines or concepts"]',
    51
  ),
  (
    'Test Writing',
    'Prompts requesting the AI to write unit tests, integration tests, or test cases for existing code.',
    '["Write Jest unit tests for this authentication service", "Generate pytest test cases covering edge cases for this calculator module", "Create Cypress E2E tests for the login flow"]',
    '["Asks for tests to be written", "References existing code or functionality to test", "May specify testing framework or coverage requirements", "Output is expected to be test code"]',
    38
  ),
  (
    'API & Integration',
    'Prompts about building, consuming, or troubleshooting APIs and third-party service integrations.',
    '["How do I call the Stripe API to create a payment intent in Node.js?", "Write a Python wrapper for this REST API", "Integrate Firebase push notifications into my React Native app"]',
    '["Involves API calls, webhooks, or external services", "May reference specific third-party platforms or SDKs", "Asks about request/response formats, authentication, or error handling", "Often involves HTTP methods, headers, or API keys"]',
    45
  ),
  (
    'Database & SQL',
    'Prompts focused on database design, SQL queries, migrations, ORMs, or data modeling.',
    '["Write a SQL query to find the top 10 customers by lifetime spend", "Design a PostgreSQL schema for a multi-tenant SaaS app", "How do I create a many-to-many relationship in Prisma?"]',
    '["Involves database operations or schema design", "May include SQL, ORM code, or migration scripts", "Asks about data modeling, indexing, or query optimization", "References specific databases like PostgreSQL, MySQL, MongoDB"]',
    34
  ),
  (
    'DevOps & Deployment',
    'Prompts related to CI/CD, Docker, Kubernetes, cloud infrastructure, or deployment workflows.',
    '["Write a Dockerfile for a Node.js app with multi-stage builds", "Create a GitHub Actions workflow for running tests and deploying to AWS", "How do I set up auto-scaling on Kubernetes for my microservice?"]',
    '["Involves infrastructure, containers, or deployment", "References CI/CD tools, cloud providers, or orchestration platforms", "Asks about configuration files like docker-compose, Terraform, or YAML configs", "May involve environment variables, secrets, or networking"]',
    29
  )
) AS v(cluster_name, description, usage_examples, classification_criteria, prompt_count)
WHERE NOT EXISTS (
  SELECT 1 FROM public.prompt_clusters pc
  WHERE pc.upload_id = tu.upload_id AND pc.cluster_name = v.cluster_name
);

-- Step 3: Also create a completed warmup record for this upload
WITH target_upload AS (
  SELECT id AS upload_id, user_id
  FROM public.prompt_uploads
  WHERE file_name = 'code_completions.csv'
  LIMIT 1
)
INSERT INTO public.cluster_warmups (
  user_id, upload_id, warmup_name, status,
  clusters_generated, total_clusters_expected,
  started_at, completed_at
)
SELECT
  tu.user_id,
  tu.upload_id,
  'Auto-cluster code_completions.csv',
  'completed',
  8,
  8,
  NOW() - INTERVAL '5 minutes',
  NOW() - INTERVAL '2 minutes'
FROM target_upload tu
WHERE NOT EXISTS (
  SELECT 1 FROM public.cluster_warmups cw
  WHERE cw.upload_id = tu.upload_id
);

-- Step 4: Update the total prompts count on the upload to match clusters
UPDATE public.prompt_uploads
SET total_prompts = (
  SELECT COALESCE(SUM(pc.prompt_count), 0)
  FROM public.prompt_clusters pc
  WHERE pc.upload_id = prompt_uploads.id
),
processed_prompts = (
  SELECT COALESCE(SUM(pc.prompt_count), 0)
  FROM public.prompt_clusters pc
  WHERE pc.upload_id = prompt_uploads.id
)
WHERE file_name = 'code_completions.csv';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- DONE! Refresh the Clustering page to see 8 clusters loaded.
-- ============================================================================
