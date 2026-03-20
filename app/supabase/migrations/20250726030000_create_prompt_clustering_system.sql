-- Create prompt clustering system
-- This system allows users to upload CSV prompts and create/manage clusters

-- Table to store uploaded CSV files with prompts
CREATE TABLE IF NOT EXISTS public.prompt_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  upload_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_prompts INTEGER NOT NULL DEFAULT 0,
  processed_prompts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'clustered', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store individual prompts from CSV uploads
CREATE TABLE IF NOT EXISTS public.prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES public.prompt_uploads(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  cluster_id UUID NULL, -- Will be set when clustered
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store clusters
CREATE TABLE IF NOT EXISTS public.prompt_clusters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES public.prompt_uploads(id) ON DELETE CASCADE,
  cluster_name TEXT NOT NULL,
  description TEXT NOT NULL,
  usage_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  classification_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store cluster warm-up configurations
CREATE TABLE IF NOT EXISTS public.cluster_warmups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES public.prompt_uploads(id) ON DELETE CASCADE,
  warmup_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  clusters_generated INTEGER NOT NULL DEFAULT 0,
  total_clusters_expected INTEGER NOT NULL DEFAULT 0,
  warmup_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- Configuration for clustering algorithm
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.prompt_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cluster_warmups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for prompt_uploads
CREATE POLICY "Users can manage own prompt uploads" ON public.prompt_uploads
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for prompts
CREATE POLICY "Users can manage own prompts" ON public.prompts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for prompt_clusters
CREATE POLICY "Users can manage own prompt clusters" ON public.prompt_clusters
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for cluster_warmups
CREATE POLICY "Users can manage own cluster warmups" ON public.cluster_warmups
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_prompt_uploads_user_id 
ON public.prompt_uploads (user_id);

CREATE INDEX IF NOT EXISTS idx_prompt_uploads_status 
ON public.prompt_uploads (user_id, status);

CREATE INDEX IF NOT EXISTS idx_prompts_user_id 
ON public.prompts (user_id);

CREATE INDEX IF NOT EXISTS idx_prompts_upload_id 
ON public.prompts (upload_id);

CREATE INDEX IF NOT EXISTS idx_prompts_cluster_id 
ON public.prompts (cluster_id) 
WHERE cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prompt_clusters_user_id 
ON public.prompt_clusters (user_id);

CREATE INDEX IF NOT EXISTS idx_prompt_clusters_upload_id 
ON public.prompt_clusters (upload_id);

CREATE INDEX IF NOT EXISTS idx_cluster_warmups_user_id 
ON public.cluster_warmups (user_id);

CREATE INDEX IF NOT EXISTS idx_cluster_warmups_status 
ON public.cluster_warmups (user_id, status);

-- Create indexes on JSONB columns for better performance
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_usage_examples 
ON public.prompt_clusters USING GIN (usage_examples);

CREATE INDEX IF NOT EXISTS idx_prompt_clusters_classification_criteria 
ON public.prompt_clusters USING GIN (classification_criteria);

-- Create updated_at trigger for tables
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_prompt_uploads_updated_at
  BEFORE UPDATE ON public.prompt_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_prompt_clusters_updated_at
  BEFORE UPDATE ON public.prompt_clusters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cluster_warmups_updated_at
  BEFORE UPDATE ON public.cluster_warmups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.prompt_uploads IS 'Stores CSV file uploads containing prompts for clustering';
COMMENT ON TABLE public.prompts IS 'Individual prompts extracted from CSV uploads';
COMMENT ON TABLE public.prompt_clusters IS 'Generated clusters with descriptions and criteria';
COMMENT ON TABLE public.cluster_warmups IS 'Cluster generation/warmup job tracking';

COMMENT ON COLUMN public.prompt_uploads.status IS 'Upload status: uploaded, processing, clustered, failed';
COMMENT ON COLUMN public.prompts.cluster_id IS 'Reference to assigned cluster (NULL if not yet clustered)';
COMMENT ON COLUMN public.prompt_clusters.usage_examples IS 'Array of example use cases for this cluster';
COMMENT ON COLUMN public.prompt_clusters.classification_criteria IS 'Array of criteria used to classify prompts into this cluster';
COMMENT ON COLUMN public.cluster_warmups.warmup_config IS 'Configuration parameters for the clustering algorithm';