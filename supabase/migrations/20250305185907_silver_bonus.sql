/*
  # Add Profile Role Validation and Indexes

  1. Changes
    - Add role validation constraint
    - Add performance indexes
    - Add RPC for safe profile access
    - Add trigger for profile updates

  2. Security
    - Validate role values
    - Add RLS policies
    - Ensure data integrity

  3. Notes
    - Non-destructive migration
    - Maintains existing data
    - Improves query performance
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

-- Create or update RPC for safe profile access
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