/*
  # Fix Provider Registration

  1. Changes
    - Add provider_profiles table if not exists
    - Drop and recreate handle_new_user function with provider support
    - Enable RLS
    - Add policies for provider access
    - Add verification status index

  2. Security
    - Enable RLS
    - Add proper access policies
    - Secure role handling
*/

-- Create provider_profiles table if not exists
CREATE TABLE IF NOT EXISTS public.provider_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  business_address text NOT NULL,
  phone text,
  service_radius integer,
  verification_status text DEFAULT 'incomplete',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Then drop the function
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create updated handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_role text;
BEGIN
  -- Get role from metadata, default to 'customer'
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'customer');
  
  -- Create profile based on role
  IF v_role = 'provider' THEN
    -- For providers, only create the auth user
    -- The provider_profile will be created after signup
    NULL;
  ELSE
    -- For customers, create regular profile
    INSERT INTO public.profiles (id, email, role)
    VALUES (
      new.id,
      new.email,
      v_role
    );
  END IF;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create policies for provider_profiles

-- Allow providers to read their own profile
CREATE POLICY "Providers can view own profile"
  ON public.provider_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow providers to update their own profile
CREATE POLICY "Providers can update own profile"
  ON public.provider_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow providers to insert their own profile
CREATE POLICY "Providers can insert own profile"
  ON public.provider_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create indexes
CREATE INDEX IF NOT EXISTS provider_profiles_verification_status_idx 
  ON public.provider_profiles(verification_status);