/*
  # Fix time slot validation

  1. Changes
    - Fix minimum duration validation for time slots
    - Improve time slot validation function
    - Add better error messages

  2. Security
    - Maintain existing RLS policies
    - Keep validation constraints
*/

-- Drop and recreate the validate_time_slots function with better duration check
CREATE OR REPLACE FUNCTION validate_time_slots(slots jsonb)
RETURNS boolean AS $$
DECLARE
  slot record;
  other_slot record;
  start_time time;
  end_time time;
  duration_minutes integer;
BEGIN
  -- Handle null case
  IF slots IS NULL THEN
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
      RAISE EXCEPTION 'Invalid time slot format';
    END IF;

    -- Parse times
    start_time := (slot.value->>'start_time')::time;
    end_time := (slot.value->>'end_time')::time;

    -- Calculate duration in minutes
    duration_minutes := EXTRACT(EPOCH FROM (end_time - start_time))/60;

    -- Check minimum duration (30 minutes)
    IF duration_minutes < 30 THEN
      RAISE EXCEPTION 'Time slot must be at least 30 minutes (got % minutes)', duration_minutes;
    END IF;

    -- Check for overlaps with other slots
    FOR other_slot IN SELECT * FROM jsonb_array_elements(slots)
    LOOP
      IF slot.ordinality != other_slot.ordinality THEN
        IF (
          start_time <= (other_slot.value->>'end_time')::time AND
          end_time >= (other_slot.value->>'start_time')::time
        ) THEN
          RAISE EXCEPTION 'Time slots cannot overlap';
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Update the constraint to use the improved function
ALTER TABLE service_availability_overrides
DROP CONSTRAINT IF EXISTS valid_time_slots;

ALTER TABLE service_availability_overrides
ADD CONSTRAINT valid_time_slots
CHECK (
  (override_type = 'custom' AND time_slots IS NOT NULL AND validate_time_slots(time_slots))
  OR
  (override_type IN ('blackout', 'vacation') AND time_slots IS NULL)
);

-- Add helper function to format duration error message
CREATE OR REPLACE FUNCTION format_duration_error(
  start_time time,
  end_time time
) RETURNS text AS $$
DECLARE
  duration_minutes integer;
BEGIN
  duration_minutes := EXTRACT(EPOCH FROM (end_time - start_time))/60;
  RETURN format('Time slot must be at least 30 minutes (got %s minutes)', duration_minutes);
END;
$$ LANGUAGE plpgsql;