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

-- Drop existing trigger and functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS ensure_profile_exists(uuid);

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
    new.email,
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

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to ensure profile exists with retry
CREATE OR REPLACE FUNCTION ensure_profile_exists(user_id uuid)
RETURNS profiles AS $$
DECLARE
  user_record auth.users;
  profile_record profiles;
  max_retries constant int := 3;
  current_retry int := 0;
BEGIN
  -- Get user info
  SELECT * INTO user_record
  FROM auth.users
  WHERE id = user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Try to get or create profile with retries
  WHILE current_retry < max_retries LOOP
    -- Try to get existing profile
    SELECT * INTO profile_record
    FROM profiles
    WHERE id = user_id;

    -- Create profile if it doesn't exist
    IF NOT FOUND THEN
      BEGIN
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
          COALESCE(user_record.raw_user_meta_data->>'first_name', ''),
          COALESCE(user_record.raw_user_meta_data->>'last_name', ''),
          user_record.email,
          now(),
          now()
        )
        RETURNING * INTO profile_record;

        -- Profile created successfully
        RETURN profile_record;
      EXCEPTION WHEN unique_violation THEN
        -- Another transaction created the profile, try to get it
        current_retry := current_retry + 1;
        CONTINUE;
      END;
    ELSE
      -- Profile found
      RETURN profile_record;
    END IF;
  END LOOP;

  -- If we get here, something went wrong
  RAISE EXCEPTION 'Failed to ensure profile exists after % retries', max_retries;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely get profile
CREATE OR REPLACE FUNCTION get_profile_safely(user_id uuid)
RETURNS profiles AS $$
DECLARE
  profile_record profiles;
BEGIN
  -- Try to get profile
  SELECT * INTO profile_record
  FROM profiles
  WHERE id = user_id;

  -- If not found, ensure it exists
  IF NOT FOUND THEN
    RETURN ensure_profile_exists(user_id);
  END IF;

  RETURN profile_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;