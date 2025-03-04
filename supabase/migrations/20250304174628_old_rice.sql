/*
  # Update availability overrides schema

  1. Changes
    - Add support for multiple time slots per override
    - Add validation for time slot overlaps
    - Add constraint for unique provider/date combinations
    - Add helper functions for time slot validation

  2. Security
    - Maintain existing RLS policies
    - Add validation functions
*/

-- Drop existing table and recreate with new structure
DROP TABLE IF EXISTS service_availability_overrides;

CREATE TABLE service_availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  override_date date NOT NULL,
  override_type availability_override_type NOT NULL,
  time_slots jsonb DEFAULT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  
  -- Ensure date is not in the past
  CONSTRAINT future_date CHECK (override_date >= CURRENT_DATE),
  -- Ensure unique provider/date combination
  CONSTRAINT unique_provider_date UNIQUE (provider_id, override_date)
);

-- Function to validate time slots
CREATE OR REPLACE FUNCTION validate_time_slots(slots jsonb)
RETURNS boolean AS $$
DECLARE
  slot record;
  other_slot record;
BEGIN
  -- Check if slots is null when it should be
  IF slots IS NULL AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(slots) 
  ) THEN
    RETURN TRUE;
  END IF;

  -- Validate each slot
  FOR slot IN SELECT * FROM jsonb_array_elements(slots)
  LOOP
    -- Ensure required fields exist
    IF NOT (
      slot.value ? 'start_time' AND 
      slot.value ? 'end_time'
    ) THEN
      RETURN FALSE;
    END IF;

    -- Validate time format and range
    IF NOT (
      slot.value->>'start_time' ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' AND
      slot.value->>'end_time' ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
    ) THEN
      RETURN FALSE;
    END IF;

    -- Ensure end time is after start time
    IF (slot.value->>'end_time')::time <= (slot.value->>'start_time')::time THEN
      RETURN FALSE;
    END IF;

    -- Check for overlaps with other slots
    FOR other_slot IN SELECT * FROM jsonb_array_elements(slots)
    LOOP
      IF slot.ordinality != other_slot.ordinality AND (
        ((slot.value->>'start_time')::time <= (other_slot.value->>'end_time')::time AND
         (slot.value->>'end_time')::time >= (other_slot.value->>'start_time')::time)
      ) THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add constraint using validation function
ALTER TABLE service_availability_overrides
ADD CONSTRAINT valid_time_slots
CHECK (
  (override_type = 'custom' AND time_slots IS NOT NULL AND validate_time_slots(time_slots))
  OR
  (override_type IN ('blackout', 'vacation') AND time_slots IS NULL)
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

-- Function to check if a time slot is available
CREATE OR REPLACE FUNCTION is_time_slot_available(
  provider_id uuid,
  check_date date,
  start_time time,
  end_time time
)
RETURNS boolean AS $$
DECLARE
  override_record RECORD;
  slot_record RECORD;
BEGIN
  -- Check for blackout dates or vacation
  IF EXISTS (
    SELECT 1 FROM service_availability_overrides
    WHERE provider_id = $1
    AND override_date = $2
    AND override_type IN ('blackout', 'vacation')
  ) THEN
    RETURN false;
  END IF;

  -- Check custom hours if they exist
  SELECT * INTO override_record
  FROM service_availability_overrides
  WHERE provider_id = $1
  AND override_date = $2
  AND override_type = 'custom';

  IF FOUND THEN
    -- Check if the time slot fits within any of the custom slots
    FOR slot_record IN 
      SELECT * FROM jsonb_array_elements(override_record.time_slots)
    LOOP
      IF start_time >= (slot_record.value->>'start_time')::time 
      AND end_time <= (slot_record.value->>'end_time')::time THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  END IF;

  -- If no override exists, check regular availability
  RETURN EXISTS (
    SELECT 1 FROM service_availability
    WHERE provider_id = $1
    AND day_of_week = EXTRACT(DOW FROM $2)
    AND start_time <= $3
    AND end_time >= $4
  );
END;
$$ LANGUAGE plpgsql;