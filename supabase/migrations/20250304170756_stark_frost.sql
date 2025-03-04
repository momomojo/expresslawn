/*
  # Add date-specific availability support
  
  Adds support for:
  - Date-specific availability overrides
  - Recurring availability patterns
  - Blackout dates
*/

-- Create date override types
CREATE TYPE availability_override_type AS ENUM (
  'blackout',    -- Date is completely unavailable
  'custom',      -- Custom hours for specific date
  'vacation'     -- Provider is on vacation
);

-- Create date-specific availability overrides
CREATE TABLE service_availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  override_date date NOT NULL,
  override_type availability_override_type NOT NULL,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz DEFAULT now(),
  
  -- Ensure end time is after start time when times are provided
  CONSTRAINT valid_override_times CHECK (
    (start_time IS NULL AND end_time IS NULL) OR
    (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  ),
  
  -- Ensure date is not in the past
  CONSTRAINT future_date CHECK (override_date >= CURRENT_DATE),
  
  -- Unique constraint per provider per date
  UNIQUE(provider_id, override_date)
);

-- Enable RLS
ALTER TABLE service_availability_overrides ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Providers can manage their own overrides"
  ON service_availability_overrides
  FOR ALL
  TO authenticated
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Overrides are readable by all authenticated users"
  ON service_availability_overrides
  FOR SELECT
  TO authenticated
  USING (true);

-- Add function to check if a date is available
CREATE OR REPLACE FUNCTION is_date_available(
  provider_id uuid,
  check_date date
)
RETURNS boolean AS $$
BEGIN
  -- Check for blackout dates
  IF EXISTS (
    SELECT 1 FROM service_availability_overrides
    WHERE provider_id = $1
    AND override_date = $2
    AND override_type IN ('blackout', 'vacation')
  ) THEN
    RETURN false;
  END IF;

  -- Check if there's any availability for this day of week
  IF NOT EXISTS (
    SELECT 1 FROM service_availability
    WHERE provider_id = $1
    AND day_of_week = EXTRACT(DOW FROM $2)
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;