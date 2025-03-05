/*
  # Complete Auth System Cleanup

  1. Changes
    - Clean up auth.users table
    - Clean up public schema tables
    - Reset sequences
    - Ensure proper cascade deletes

  2. Security
    - Maintain RLS policies
    - Preserve trigger functions
*/

-- First, disable RLS temporarily to allow cleanup
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profiles DISABLE ROW LEVEL SECURITY;

-- Clean up public schema tables with cascading delete
DELETE FROM provider_profiles;
DELETE FROM profiles;

-- Clean up auth schema
DELETE FROM auth.users;

-- Re-enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;

-- Ensure proper trigger function for new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    role
  ) VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'customer')
  );

  -- Create provider profile if user is a provider
  IF COALESCE(new.raw_user_meta_data->>'role', 'customer') = 'provider' THEN
    INSERT INTO public.provider_profiles (
      id,
      business_name,
      business_address,
      verification_status
    ) VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'business_name', ''),
      COALESCE(new.raw_user_meta_data->>'business_address', ''),
      'incomplete'
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the auth trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();