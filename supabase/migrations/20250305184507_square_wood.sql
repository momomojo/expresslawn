/*
  # Update Profiles Table Schema

  1. Changes
    - Add role validation
    - Add indexes for performance
    - Add RPC for safe profile access
    - Add trigger for profile updates

  2. Security
    - Add RLS policies for profile access
    - Validate role values
    - Ensure data integrity

  3. Notes
    - Non-destructive migration
    - Maintains existing data
    - Adds performance optimizations
*/

-- Add role validation
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS valid_role;

ALTER TABLE profiles
  ADD CONSTRAINT valid_role 
  CHECK (role IN ('customer', 'provider'));

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role 
  ON profiles(role);

CREATE INDEX IF NOT EXISTS idx_profiles_auth 
  ON profiles(id, role);

CREATE INDEX IF NOT EXISTS idx_profiles_email 
  ON profiles(email);

-- Update or create RPC for safe profile access
CREATE OR REPLACE FUNCTION get_profile_safely(user_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  first_name text,
  last_name text,
  phone text,
  address text
) SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.role,
    p.first_name,
    p.last_name,
    p.phone,
    p.address
  FROM profiles p
  WHERE p.id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for profile updates
CREATE OR REPLACE FUNCTION handle_profile_update()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  
  -- Validate role changes
  IF TG_OP = 'UPDATE' AND NEW.role != OLD.role THEN
    RAISE EXCEPTION 'Role cannot be changed after creation';
  END IF;

  -- Ensure required fields
  IF NEW.first_name IS NULL OR NEW.last_name IS NULL OR NEW.email IS NULL THEN
    RAISE EXCEPTION 'Name and email are required';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_profile_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_profile_update();

-- Update RLS policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Service providers can view customer profiles" ON profiles;

-- Create new policies
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service providers can view customer profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM provider_profiles
      WHERE provider_profiles.id = auth.uid()
    ))
    AND
    (role = 'customer')
  );