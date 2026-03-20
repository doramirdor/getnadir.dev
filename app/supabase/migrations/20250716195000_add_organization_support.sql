-- Add organization support for multi-tenant architecture

-- Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  plan TEXT DEFAULT 'free',
  max_users INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add organization_id to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Create default organization for existing users
INSERT INTO public.organizations (name, slug, description, plan) VALUES
  ('Default Organization', 'default-org', 'Default organization for existing users', 'pro')
ON CONFLICT (slug) DO NOTHING;

-- Update existing profiles to belong to the default organization
UPDATE public.profiles 
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default-org')
WHERE organization_id IS NULL;

-- Add RLS policies for organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization" ON public.organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage their organization" ON public.organizations
  FOR ALL USING (
    public.is_admin() AND id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Update profiles policies to be organization-scoped
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view organization profiles" ON public.profiles
  FOR SELECT USING (
    public.is_admin() AND organization_id = (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

-- Add updated_at trigger for organizations
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add constraints
ALTER TABLE public.profiles ADD CONSTRAINT profiles_organization_required 
  CHECK (organization_id IS NOT NULL);