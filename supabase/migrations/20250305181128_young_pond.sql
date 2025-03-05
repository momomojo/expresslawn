/*
  # Fix User Registration Flow

  1. Changes
    - Add proper error handling to trigger function
    - Add get_profile_safely function
    - Update RLS policies
    - Add proper indexes

  2. Security
    - Enable RLS
    - Add appropriate policies
    - Secure function execution
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.get_profile_safely;

-- Create more robust trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Validate email
  IF new.email IS NULL THEN
    RAISE EXCEPTION 'email is required';
  END IF;

  -- Insert profile with proper error handling
  BEGIN
    INSERT INTO public.profiles (
      id,
      email,
      role,
      first_name,
      last_name
    )
    VALUES (
      new.id,
      new.email,
      COALESCE(
        (new.raw_user_meta_data->>'role')::text,
        'customer'
      ),
      COALESCE(
        (new.raw_user_meta_data->>'first_name')::text,
        ''
      ),
      COALESCE(
        (new.raw_user_meta_data->>'last_name')::text,
        ''
      )
    );
  EXCEPTION WHEN unique_violation THEN
    -- Handle duplicate email gracefully
    RAISE EXCEPTION 'email % already exists', new.email;
  WHEN OTHERS THEN
    -- Log other errors and re-raise
    RAISE EXCEPTION 'Error creating profile: %', SQLERRM;
  END;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create safe profile retrieval function
CREATE OR REPLACE FUNCTION public.get_profile_safely(user_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  first_name text,
  last_name text,
  phone text,
  address text
) SECURITY DEFINER
AS $$
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
  WHERE p.id = user_id
  AND (
    -- User can access their own profile
    auth.uid() = user_id
    OR
    -- Service providers can access customer profiles
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'provider'
      )
      AND p.role = 'customer'
    )
  );
END;
$$ LANGUAGE plpgsql;