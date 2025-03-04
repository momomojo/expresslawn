/*
  # Fix Profile Data and Add Missing Fields

  1. Changes
    - Add temporary NULL constraints to allow data migration
    - Migrate existing profiles with default values
    - Re-add NOT NULL constraints
    - Update trigger to handle all fields properly

  2. Security
    - Maintain existing RLS policies
    - Ensure data integrity during migration
*/

-- Temporarily remove NOT NULL constraints
ALTER TABLE profiles
ALTER COLUMN first_name DROP NOT NULL,
ALTER COLUMN last_name DROP NOT NULL,
ALTER COLUMN email DROP NOT NULL;

-- Update existing profiles with default values
UPDATE profiles
SET
  first_name = COALESCE(first_name, ''),
  last_name = COALESCE(last_name, ''),
  email = COALESCE(
    email,
    (
      SELECT email 
      FROM auth.users 
      WHERE auth.users.id = profiles.id
    ),
    ''
  ),
  updated_at = now()
WHERE
  first_name IS NULL
  OR last_name IS NULL
  OR email IS NULL;

-- Re-add NOT NULL constraints
ALTER TABLE profiles
ALTER COLUMN first_name SET NOT NULL,
ALTER COLUMN last_name SET NOT NULL,
ALTER COLUMN email SET NOT NULL;

-- Update the handle_new_user trigger function to be more robust
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    role,
    first_name,
    last_name,
    email,
    created_at,
    updated_at
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'role', 'customer'),
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.email, ''),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), profiles.first_name),
    last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), profiles.last_name),
    updated_at = now()
  WHERE
    profiles.id = EXCLUDED.id;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to ensure profile completeness
CREATE OR REPLACE FUNCTION ensure_profile_complete()
RETURNS trigger AS $$
BEGIN
  IF NEW.first_name IS NULL OR NEW.first_name = '' OR
     NEW.last_name IS NULL OR NEW.last_name = '' OR
     NEW.email IS NULL OR NEW.email = '' THEN
    RAISE EXCEPTION 'Profile must have first name, last name and email';
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to enforce profile completeness
DROP TRIGGER IF EXISTS ensure_profile_complete_trigger ON profiles;
CREATE TRIGGER ensure_profile_complete_trigger
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION ensure_profile_complete();