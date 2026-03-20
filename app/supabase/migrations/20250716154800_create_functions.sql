-- Create required functions before other migrations

-- Create update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create is_admin function (will be recreated properly in main schema migration)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Temporary implementation - will be replaced by proper one
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;