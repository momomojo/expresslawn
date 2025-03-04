/*
  # Add provider profile insert policy
  
  1. Security Changes
    - Add INSERT policy for provider profiles to allow registration
    
  2. Notes
    - Only adds the missing INSERT policy
    - Existing SELECT and UPDATE policies are preserved from previous migration
*/

-- Allow providers to insert their own profile during registration
CREATE POLICY "Providers can insert own profile"
  ON provider_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);