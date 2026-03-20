-- Create presets table for account-level configuration presets
CREATE TABLE IF NOT EXISTS presets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT,
    selected_models JSONB DEFAULT '[]'::jsonb,
    model_parameters JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for faster queries by user_id
CREATE INDEX IF NOT EXISTS idx_presets_user_id ON presets(user_id);

-- Create index for faster queries by name (for searching)
CREATE INDEX IF NOT EXISTS idx_presets_name ON presets(name);

-- Enable RLS (Row Level Security)
ALTER TABLE presets ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to only see their own presets
CREATE POLICY "Users can view their own presets" ON presets
    FOR SELECT USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own presets
CREATE POLICY "Users can insert their own presets" ON presets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own presets
CREATE POLICY "Users can update their own presets" ON presets
    FOR UPDATE USING (auth.uid() = user_id);

-- Create policy to allow users to delete their own presets
CREATE POLICY "Users can delete their own presets" ON presets
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_presets_updated_at
    BEFORE UPDATE ON presets
    FOR EACH ROW
    EXECUTE FUNCTION update_presets_updated_at();

-- Grant necessary permissions
GRANT ALL ON presets TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;