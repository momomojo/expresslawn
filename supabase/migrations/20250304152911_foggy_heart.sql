/*
  # Add provider roles and policies

  1. New Tables
    - `provider_profiles`
      - `id` (uuid, primary key)
      - `business_name` (text)
      - `business_address` (text)
      - `phone` (text)
      - `service_radius` (integer)
      - `verification_status` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on provider_profiles table
    - Add policies for provider access
*/

CREATE TABLE IF NOT EXISTS provider_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  business_name text NOT NULL,
  business_address text NOT NULL,
  phone text,
  service_radius integer,
  verification_status text DEFAULT 'incomplete',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;

-- Allow providers to read their own profile
CREATE POLICY "Providers can read own profile"
  ON provider_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow providers to update their own profile
CREATE POLICY "Providers can update own profile"
  ON provider_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Function to check if a user is a provider
CREATE OR REPLACE FUNCTION is_provider(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM provider_profiles
    WHERE id = user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;