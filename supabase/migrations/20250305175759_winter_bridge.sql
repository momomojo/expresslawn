/*
  # Clean Auth and Profile Setup

  1. Changes
    - Clean up existing profiles and provider profiles
    - Ensure auth triggers are properly configured
    - Set up RLS policies for both customer and provider profiles

  2. Security
    - Enable RLS on all tables
    - Add policies for user access
    - Ensure proper data isolation
*/

-- First clean up existing data to allow fresh signups
DELETE FROM provider_profiles;
DELETE FROM profiles;

-- Ensure we have the trigger function for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert into profiles table
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

  -- If user is a provider, also create provider profile
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

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;

-- Recreate RLS policies for profiles
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" 
ON profiles FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Service providers can view customer profiles" ON profiles;
CREATE POLICY "Service providers can view customer profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  (EXISTS (
    SELECT 1 FROM provider_profiles
    WHERE provider_profiles.id = auth.uid()
  ))
  AND (role = 'customer')
);

-- Recreate RLS policies for provider profiles
DROP POLICY IF EXISTS "Provider profiles are publicly readable" ON provider_profiles;
CREATE POLICY "Provider profiles are publicly readable"
ON provider_profiles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Providers can update own profile" ON provider_profiles;
CREATE POLICY "Providers can update own profile"
ON provider_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Providers can insert own profile" ON provider_profiles;
CREATE POLICY "Providers can insert own profile"
ON provider_profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);