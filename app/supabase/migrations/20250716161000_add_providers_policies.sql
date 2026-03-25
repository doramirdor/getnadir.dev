-- Add RLS policies for providers table

-- Allow all authenticated users to view providers
CREATE POLICY "Authenticated users can view providers" ON public.providers
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow admins to insert providers
CREATE POLICY "Admins can insert providers" ON public.providers
  FOR INSERT WITH CHECK (public.is_admin());

-- Allow admins to update providers
CREATE POLICY "Admins can update providers" ON public.providers
  FOR UPDATE USING (public.is_admin());

-- Allow admins to delete providers
CREATE POLICY "Admins can delete providers" ON public.providers
  FOR DELETE USING (public.is_admin());

-- Add RLS policies for integrations table

-- Allow all authenticated users to view integrations
CREATE POLICY "Authenticated users can view integrations" ON public.integrations
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow admins to insert integrations
CREATE POLICY "Admins can insert integrations" ON public.integrations
  FOR INSERT WITH CHECK (public.is_admin());

-- Allow admins to update integrations
CREATE POLICY "Admins can update integrations" ON public.integrations
  FOR UPDATE USING (public.is_admin());

-- Allow admins to delete integrations
CREATE POLICY "Admins can delete integrations" ON public.integrations
  FOR DELETE USING (public.is_admin());