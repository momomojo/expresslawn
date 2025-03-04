/*
  # Fix time slot validation

  1. Changes
    - Fix time slot validation function to properly handle overlaps
    - Add better error messages
    - Improve duration calculation
    - Fix JSON array handling

  2. Security
    - Maintain existing RLS policies
    - Keep validation constraints
*/

-- Drop and recreate the validate_time_slots function with fixed overlap checking
CREATE OR REPLACE FUNCTION validate_time_slots(slots jsonb)
RETURNS boolean AS $$
DECLARE
  slot jsonb;
  other_slot jsonb;
  start_time time;
  end_time time;
  duration_minutes integer;
  slot_index integer;
  other_index integer;
  slots_array jsonb[];
BEGIN
  -- Handle null case
  IF slots IS NULL OR jsonb_array_length(slots) = 0 THEN
    RETURN TRUE;
  END IF;

  -- Convert to array for easier indexing
  slots_array := ARRAY(
    SELECT value::jsonb
    FROM jsonb_array_elements(slots)
  );

  -- Validate each slot
  FOR slot_index IN 0..array_length(slots_array, 1)-1 LOOP
    slot := slots_array[slot_index + 1];

    -- Ensure required fields exist
    IF NOT (
      slot ? 'start_time' AND 
      slot ? 'end_time'
    ) THEN
      RAISE EXCEPTION 'Invalid time slot format';
    END IF;

    -- Parse times
    start_time := (slot->>'start_time')::time;
    end_time := (slot->>'end_time')::time;

    -- Calculate duration in minutes
    duration_minutes := EXTRACT(EPOCH FROM (end_time - start_time))/60;

    -- Check minimum duration (30 minutes)
    IF duration_minutes < 30 THEN
      RAISE EXCEPTION 'Time slot must be at least 30 minutes (got % minutes)', duration_minutes;
    END IF;

    -- Check for overlaps with other slots
    FOR other_index IN 0..array_length(slots_array, 1)-1 LOOP
      IF slot_index != other_index THEN
        other_slot := slots_array[other_index + 1];
        
        IF (
          start_time <= (other_slot->>'end_time')::time AND
          end_time >= (other_slot->>'start_time')::time
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

-- Add helper function to format time slot for error messages
CREATE OR REPLACE FUNCTION format_time_slot(
  start_time time,
  end_time time
) RETURNS text AS $$
BEGIN
  RETURN format('%s - %s', 
    to_char(start_time, 'HH12:MI AM'),
    to_char(end_time, 'HH12:MI AM')
  );
END;
$$ LANGUAGE plpgsql;