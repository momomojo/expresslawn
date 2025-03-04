/*
  # Add RLS policies for provider profiles

  1. Security Changes
    - Enable RLS on provider_profiles table
    - Add policies for:
      - Inserting new provider profiles during registration
      - Reading own provider profile
      - Updating own provider profile
    
  2. Notes
    - Providers can only access their own profile data
    - New registrations are allowed for authenticated users
*/

-- Allow providers to insert their own profile during registration
CREATE POLICY "Providers can insert own profile"
  ON provider_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

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
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);