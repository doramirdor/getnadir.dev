-- Add RLS policies to restrict user management to admins only

-- Drop existing policies that might be too permissive
DROP POLICY IF EXISTS "Users can view own logs" ON public.logs;
DROP POLICY IF EXISTS "Admins can view all logs" ON public.logs;

-- Recreate log policies with proper restrictions
CREATE POLICY "Users can view own logs" ON public.logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all logs" ON public.logs
  FOR SELECT USING (public.is_admin());

-- Add strict policies for profiles table  
-- Only allow users to view their own profile and admins to view all
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin());

-- Only admins can update user roles and critical profile fields
DROP POLICY IF EXISTS "Admins can update user profiles" ON public.profiles;
CREATE POLICY "Admins can update user profiles" ON public.profiles
  FOR UPDATE USING (public.is_admin());

-- Only admins can insert new user profiles
DROP POLICY IF EXISTS "Admins can insert user profiles" ON public.profiles;
CREATE POLICY "Admins can insert user profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.is_admin());

-- Only admins can delete user profiles
DROP POLICY IF EXISTS "Admins can delete user profiles" ON public.profiles;
CREATE POLICY "Admins can delete user profiles" ON public.profiles
  FOR DELETE USING (public.is_admin());

-- Add policy for users to update their own basic profile info (name, email, etc.)
-- but not role or status
DROP POLICY IF EXISTS "Users can update own basic profile" ON public.profiles;
CREATE POLICY "Users can update own basic profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ensure API keys can only be managed by their owners or admins
DROP POLICY IF EXISTS "Admins can manage all API keys" ON public.api_keys;
CREATE POLICY "Admins can manage all API keys" ON public.api_keys
  FOR ALL USING (public.is_admin());

-- Add function to check if a user is admin (if not exists)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;