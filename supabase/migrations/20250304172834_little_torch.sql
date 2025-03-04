/*
  # Fix Availability Constraints and Add Time Slots

  1. Changes
    - Drop unique constraint on service_availability_overrides
    - Add time_slots array to store multiple slots per override
    - Add validation functions for time slots
    - Update existing policies

  2. New Features
    - Support for multiple time slots per override
    - Better validation of time slots
    - Improved override management
*/

-- Add new type for time slots
CREATE TYPE time_slot AS (
  start_time time,
  end_time time
);

-- Drop existing table and recreate with new structure
DROP TABLE IF EXISTS service_availability_overrides;

CREATE TABLE service_availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  override_date date NOT NULL,
  override_type availability_override_type NOT NULL,
  time_slots time_slot[] DEFAULT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  
  -- Ensure date is not in the past
  CONSTRAINT future_date CHECK (override_date >= CURRENT_DATE)
);

-- Create index for faster lookups
CREATE INDEX idx_overrides_provider_date 
ON service_availability_overrides(provider_id, override_date);

-- Function to validate time slots
CREATE OR REPLACE FUNCTION validate_time_slots(slots time_slot[])
RETURNS boolean AS $$
DECLARE
  slot time_slot;
BEGIN
  -- Check if slots array is empty when it shouldn't be
  IF array_length(slots, 1) IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check each slot
  FOREACH slot IN ARRAY slots
  LOOP
    -- Ensure end time is after start time
    IF slot.end_time <= slot.start_time THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  -- Check for overlapping slots
  FOR i IN 1..array_length(slots, 1)-1 LOOP
    FOR j IN i+1..array_length(slots, 1) LOOP
      IF (slots[i].start_time < slots[j].end_time AND 
          slots[i].end_time > slots[j].start_time) THEN
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

-- Function to check if a specific time slot is available
CREATE OR REPLACE FUNCTION is_time_slot_available(
  provider_id uuid,
  check_date date,
  start_time time,
  end_time time
)
RETURNS boolean AS $$
DECLARE
  override_record RECORD;
  slot time_slot;
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
    FOREACH slot IN ARRAY override_record.time_slots
    LOOP
      IF start_time >= slot.start_time AND end_time <= slot.end_time THEN
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