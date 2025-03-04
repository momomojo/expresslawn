/*
  # Fix profiles policy recursion

  1. Changes
    - Drop existing policies on profiles table
    - Create new non-recursive policies for profiles table
    - Add separate policies for customers and providers

  2. Security
    - Maintain row-level security
    - Allow users to manage their own profiles
    - Allow providers to view customer profiles for service delivery
*/

-- Drop existing policies to clean up
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Service providers can view customer profiles" ON profiles;

-- Create new non-recursive policies
CREATE POLICY "Allow users to manage own profile"
  ON profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow providers to view customer profiles
CREATE POLICY "Allow providers to view customer profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM provider_profiles
      WHERE provider_profiles.id = auth.uid()
    )
    AND
    role = 'customer'
  );