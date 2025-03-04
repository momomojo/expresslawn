/*
  # Initial schema setup for Express Lawn

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `first_name` (text)
      - `last_name` (text)
      - `phone` (text)
      - `address` (text)
      - `role` (text, default: 'customer')
      - `created_at` (timestamp with time zone)
      - `updated_at` (timestamp with time zone)

  2. Security
    - Enable RLS on `profiles` table
    - Add policies for authenticated users to:
      - Read their own profile
      - Update their own profile
    - Add policy for service providers to view customer profiles
*/

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  first_name text,
  last_name text,
  phone text,
  address text,
  role text DEFAULT 'customer',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Allow service providers to view customer profiles
CREATE POLICY "Service providers can view customer profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (role = 'provider' AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'provider'
  ));