/*
  # Fix Service Management

  1. Changes
    - Add trigger to handle service updates
    - Add function to validate service changes
    - Add function to update service

  2. Security
    - Update RLS policies for better access control
*/

-- Function to validate service changes
CREATE OR REPLACE FUNCTION public.validate_service_changes()
RETURNS trigger AS $$
BEGIN
  -- Validate price
  IF NEW.price < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative';
  END IF;

  -- Validate duration
  IF NEW.duration_minutes < 30 THEN
    RAISE EXCEPTION 'Duration must be at least 30 minutes';
  END IF;

  -- Set updated_at
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for service validation
DROP TRIGGER IF EXISTS validate_provider_service ON provider_services;
CREATE TRIGGER validate_provider_service
  BEFORE INSERT OR UPDATE ON provider_services
  FOR EACH ROW EXECUTE FUNCTION public.validate_service_changes();

-- Add updated_at to provider_services if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_services' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE provider_services 
    ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Update RLS policies
DROP POLICY IF EXISTS "Provider services are publicly readable" ON provider_services;
DROP POLICY IF EXISTS "Providers can manage their own services" ON provider_services;

CREATE POLICY "Provider services are publicly readable"
  ON provider_services
  FOR SELECT
  TO authenticated
  USING (is_active = true OR auth.uid() = provider_id);

CREATE POLICY "Providers can manage their own services"
  ON provider_services
  FOR ALL
  TO authenticated
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);