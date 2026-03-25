-- Add comprehensive list of LLM providers including Bedrock and others
-- This will add missing providers that are commonly used in production

INSERT INTO public.providers (name, provider_id, models, status, enabled) VALUES
  -- Amazon Bedrock
  ('Amazon Bedrock', 'bedrock', ARRAY[
    'anthropic.claude-3-opus-20240229-v1:0',
    'anthropic.claude-3-sonnet-20240229-v1:0', 
    'anthropic.claude-3-haiku-20240307-v1:0',
    'anthropic.claude-3-5-sonnet-20240620-v1:0',
    'amazon.titan-text-express-v1',
    'amazon.titan-text-lite-v1',
    'ai21.j2-ultra-v1',
    'ai21.j2-mid-v1',
    'cohere.command-text-v14',
    'cohere.command-light-text-v14',
    'meta.llama2-70b-chat-v1',
    'meta.llama2-13b-chat-v1'
  ], 'disconnected', false),
  
  -- Azure OpenAI
  ('Azure OpenAI', 'azure', ARRAY[
    'gpt-4o',
    'gpt-4o-mini', 
    'gpt-4',
    'gpt-4-32k',
    'gpt-35-turbo',
    'gpt-35-turbo-16k',
    'text-davinci-003',
    'text-embedding-ada-002',
    'dall-e-3',
    'whisper'
  ], 'disconnected', false),
  
  -- Cohere
  ('Cohere', 'cohere', ARRAY[
    'command-r-plus',
    'command-r',
    'command',
    'command-nightly',
    'command-light',
    'command-light-nightly',
    'embed-english-v3.0',
    'embed-multilingual-v3.0',
    'rerank-english-v3.0',
    'rerank-multilingual-v3.0'
  ], 'disconnected', false),
  
  -- Hugging Face
  ('Hugging Face', 'huggingface', ARRAY[
    'meta-llama/Llama-2-70b-chat-hf',
    'meta-llama/Llama-2-13b-chat-hf',
    'meta-llama/Llama-2-7b-chat-hf',
    'microsoft/DialoGPT-medium',
    'microsoft/DialoGPT-large',
    'facebook/blenderbot-400M-distill',
    'facebook/blenderbot-1B-distill',
    'google/flan-t5-large',
    'google/flan-t5-xl',
    'bigscience/bloom-560m'
  ], 'disconnected', false),
  
  -- Replicate
  ('Replicate', 'replicate', ARRAY[
    'meta/llama-2-70b-chat',
    'meta/llama-2-13b-chat', 
    'meta/llama-2-7b-chat',
    'replicate/flan-t5-xl',
    'stability-ai/stable-diffusion',
    'riffusion/riffusion',
    'cjwbw/seamless_communication',
    'meta/musicgen'
  ], 'disconnected', false),
  
  -- Together AI
  ('Together AI', 'together', ARRAY[
    'meta-llama/Llama-2-70b-chat-hf',
    'meta-llama/Llama-2-13b-chat-hf',
    'meta-llama/Llama-2-7b-chat-hf',
    'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'mistralai/Mistral-7B-Instruct-v0.1',
    'togethercomputer/RedPajama-INCITE-Chat-3B-v1',
    'togethercomputer/RedPajama-INCITE-7B-Chat'
  ], 'disconnected', false),
  
  -- Fireworks AI
  ('Fireworks AI', 'fireworks', ARRAY[
    'accounts/fireworks/models/llama-v2-70b-chat',
    'accounts/fireworks/models/llama-v2-13b-chat',
    'accounts/fireworks/models/llama-v2-7b-chat',
    'accounts/fireworks/models/mixtral-8x7b-instruct',
    'accounts/fireworks/models/mixtral-8x22b-instruct',
    'accounts/fireworks/models/yi-34b-200k-capybara'
  ], 'disconnected', false),
  
  -- Anyscale
  ('Anyscale', 'anyscale', ARRAY[
    'meta-llama/Llama-2-70b-chat-hf',
    'meta-llama/Llama-2-13b-chat-hf',
    'meta-llama/Llama-2-7b-chat-hf',
    'codellama/CodeLlama-34b-Instruct-hf',
    'mistralai/Mistral-7B-Instruct-v0.1',
    'Open-Orca/Mistral-7B-OpenOrca'
  ], 'disconnected', false),
  
  -- Perplexity AI
  ('Perplexity AI', 'perplexity', ARRAY[
    'llama-3.1-sonar-small-128k-online',
    'llama-3.1-sonar-large-128k-online',
    'llama-3.1-sonar-huge-128k-online',
    'llama-3.1-8b-instruct',
    'llama-3.1-70b-instruct',
    'mixtral-8x7b-instruct'
  ], 'disconnected', false)

ON CONFLICT (provider_id) DO UPDATE SET
  models = EXCLUDED.models,
  name = EXCLUDED.name;

-- Also update existing providers with more complete model lists
UPDATE public.providers SET
  models = CASE 
    WHEN provider_id = 'openai' THEN ARRAY[
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4',
      'gpt-4-32k', 
      'gpt-4-turbo',
      'gpt-4-turbo-preview',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k',
      'gpt-4-vision-preview',
      'dall-e-3',
      'dall-e-2',
      'whisper-1',
      'tts-1',
      'tts-1-hd',
      'text-embedding-ada-002',
      'text-embedding-3-small',
      'text-embedding-3-large'
    ]
    WHEN provider_id = 'anthropic' THEN ARRAY[
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-3-5-sonnet-20240620',
      'claude-3-5-sonnet-20241022',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2'
    ]
    WHEN provider_id = 'google' THEN ARRAY[
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-pro',
      'gemini-pro-vision',
      'palm2-chat-bison',
      'palm2-text-bison',
      'text-embedding-004'
    ]
    WHEN provider_id = 'mistral' THEN ARRAY[
      'mistral-large-latest',
      'mistral-medium-latest', 
      'mistral-small-latest',
      'mistral-tiny',
      'mixtral-8x7b-instruct',
      'mixtral-8x22b-instruct',
      'codestral-latest',
      'mistral-embed'
    ]
    WHEN provider_id = 'xai' THEN ARRAY[
      'grok-beta',
      'grok-vision-beta'
    ]
    ELSE models
  END
WHERE provider_id IN ('openai', 'anthropic', 'google', 'mistral', 'xai');