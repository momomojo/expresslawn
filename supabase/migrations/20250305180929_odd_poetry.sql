/*
  # Fix User Registration Setup

  1. Changes
    - Remove auth.users table creation (managed by Supabase)
    - Fix profiles table structure
    - Update trigger function to handle metadata correctly
    - Add proper RLS policies

  2. Security
    - Enable RLS
    - Add appropriate policies
*/

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  first_name text,
  last_name text,
  phone text,
  address text,
  role text DEFAULT 'customer',
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT profiles_email_key UNIQUE (email)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create profile creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
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
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create new trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Drop existing policies if they exist
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Service providers can view customer profiles" ON public.profiles;
EXCEPTION
  WHEN undefined_object THEN 
    NULL;
END $$;

-- Create RLS policies
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service providers can view customer profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM provider_profiles
      WHERE provider_profiles.id = auth.uid()
    ))
    AND (role = 'customer')
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);
CREATE INDEX IF NOT EXISTS profiles_updated_at_idx ON public.profiles(updated_at);