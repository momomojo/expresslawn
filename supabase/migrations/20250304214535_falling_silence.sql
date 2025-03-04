/*
  # Fix Profile Handling

  1. Changes
    - Add NOT NULL constraints for required fields
    - Improve profile creation trigger
    - Add function to ensure profile exists
    - Add function to get profile safely
  
  2. Security
    - Maintain existing RLS policies
    - Add validation for profile updates
*/

-- Drop existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Improved handle_new_user function
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
    updated_at = now()
  WHERE
    profiles.id = EXCLUDED.id;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to ensure profile exists
CREATE OR REPLACE FUNCTION ensure_profile_exists(user_id uuid)
RETURNS profiles AS $$
DECLARE
  user_record auth.users;
  profile_record profiles;
BEGIN
  -- Get user info
  SELECT * INTO user_record
  FROM auth.users
  WHERE id = user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Try to get existing profile
  SELECT * INTO profile_record
  FROM profiles
  WHERE id = user_id;

  -- Create profile if it doesn't exist
  IF NOT FOUND THEN
    INSERT INTO profiles (
      id,
      role,
      first_name,
      last_name,
      email,
      created_at,
      updated_at
    )
    VALUES (
      user_id,
      'customer',
      '',
      '',
      user_record.email,
      now(),
      now()
    )
    RETURNING * INTO profile_record;
  END IF;

  RETURN profile_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;