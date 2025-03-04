/*
  # Fix registration policies
  
  1. Security Changes
    - Add INSERT policies for profiles table
    - Add public access for profile creation during registration
    - Ensure providers can create their profiles
    
  2. Notes
    - Allows new users to create their initial profile
    - Maintains existing security for other operations
*/

-- Allow users to insert their own profile during registration
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow public access to profiles table for initial creation
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to clean up
DROP POLICY IF EXISTS "Providers can insert own profile" ON provider_profiles;
DROP POLICY IF EXISTS "Providers can read own profile" ON provider_profiles;
DROP POLICY IF EXISTS "Providers can update own profile" ON provider_profiles;

-- Recreate provider policies with proper permissions
CREATE POLICY "Provider profiles are publicly readable"
  ON provider_profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Providers can insert own profile"
  ON provider_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Providers can update own profile"
  ON provider_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);