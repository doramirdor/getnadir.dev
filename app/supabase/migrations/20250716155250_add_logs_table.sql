-- Add logs table for tracking requests and activity
CREATE TABLE public.logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  cost DECIMAL(10,6) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pending',
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for logs
CREATE POLICY "Admins can view all logs" ON public.logs
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Users can view own logs" ON public.logs
  FOR SELECT USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_logs_updated_at
  BEFORE UPDATE ON public.logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some sample data
INSERT INTO public.logs (request_id, prompt, model, provider, cost, status, response_time_ms) VALUES
  ('req_001', 'Analyze market trends for renewable energy sector', 'GPT-4', 'OpenAI', 0.024, 'completed', 1200),
  ('req_002', 'Generate Python code for data visualization', 'Claude-3 Opus', 'Anthropic', 0.018, 'completed', 800),
  ('req_003', 'Summarize research paper on quantum computing', 'GPT-3.5 Turbo', 'OpenAI', 0.008, 'completed', 600),
  ('req_004', 'Create marketing copy for new product launch', 'Claude-3 Sonnet', 'Anthropic', 0.012, 'failed', 2400);