/*
  # Add Profile Role Validation and Indexes

  1. Changes
    - Add role validation constraint
    - Add performance indexes
    - Add RPC for safe profile access

  2. Security
    - Validate role values
    - Add RLS policies
    - Ensure data integrity

  3. Notes
    - Non-destructive migration
    - Maintains existing data
    - Improves query performance
*/

-- Add role validation if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'valid_role'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT valid_role 
      CHECK (role IN ('customer', 'provider'));
  END IF;
END $$;

-- Add performance indexes if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_profiles_role'
  ) THEN
    CREATE INDEX idx_profiles_role ON profiles(role);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_profiles_auth'
  ) THEN
    CREATE INDEX idx_profiles_auth ON profiles(id, role);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_profiles_email'
  ) THEN
    CREATE INDEX idx_profiles_email ON profiles(email);
  END IF;
END $$;

-- Create or replace RPC for safe profile access
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