/*
  # Update availability schema

  1. Changes
    - Add validation for time slots
    - Add constraints for overlapping slots
    - Add helper functions for availability checks

  2. Security
    - Maintain existing RLS policies
    - Add validation functions
*/

-- Add function to check for overlapping time slots
CREATE OR REPLACE FUNCTION check_time_slot_overlap(
  p_provider_id uuid,
  p_day_of_week integer,
  p_start_time time,
  p_end_time time,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM service_availability
    WHERE provider_id = p_provider_id
    AND day_of_week = p_day_of_week
    AND id != COALESCE(p_exclude_id, id)
    AND (
      (start_time <= p_start_time AND end_time > p_start_time)
      OR (start_time < p_end_time AND end_time >= p_end_time)
      OR (start_time >= p_start_time AND end_time <= p_end_time)
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Add trigger to prevent overlapping slots
CREATE OR REPLACE FUNCTION prevent_overlapping_slots()
RETURNS trigger AS $$
BEGIN
  IF check_time_slot_overlap(
    NEW.provider_id,
    NEW.day_of_week,
    NEW.start_time,
    NEW.end_time,
    NEW.id
  ) THEN
    RAISE EXCEPTION 'Time slot overlaps with existing slot';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to service_availability
DROP TRIGGER IF EXISTS check_slot_overlap ON service_availability;
CREATE TRIGGER check_slot_overlap
  BEFORE INSERT OR UPDATE ON service_availability
  FOR EACH ROW
  EXECUTE FUNCTION prevent_overlapping_slots();

-- Add minimum duration constraint
ALTER TABLE service_availability
ADD CONSTRAINT minimum_duration 
CHECK (
  EXTRACT(EPOCH FROM end_time - start_time) >= 1800
);

-- Add function to get available slots for a date
CREATE OR REPLACE FUNCTION get_available_slots(
  p_provider_id uuid,
  p_date date,
  p_duration_minutes integer
)
RETURNS TABLE (
  start_time time,
  end_time time
) AS $$
DECLARE
  slot_duration interval;
  override record;
BEGIN
  slot_duration := (p_duration_minutes || ' minutes')::interval;

  -- Check for date override
  SELECT * INTO override
  FROM service_availability_overrides
  WHERE provider_id = p_provider_id
  AND override_date = p_date;

  -- If blackout or vacation day, return no slots
  IF override.override_type IN ('blackout', 'vacation') THEN
    RETURN;
  END IF;

  -- If custom hours override
  IF override.override_type = 'custom' THEN
    FOR slot IN 
      SELECT 
        (value->>'start_time')::time as slot_start,
        (value->>'end_time')::time as slot_end
      FROM jsonb_array_elements(override.time_slots)
    LOOP
      RETURN QUERY
      WITH RECURSIVE slots AS (
        SELECT slot.slot_start as start_time,
               slot.slot_start + slot_duration as end_time
        WHERE slot.slot_start + slot_duration <= slot.slot_end
        UNION ALL
        SELECT start_time + '30 minutes'::interval,
               (start_time + '30 minutes'::interval) + slot_duration
        FROM slots
        WHERE start_time + '30 minutes'::interval + slot_duration <= slot.slot_end
      )
      SELECT s.start_time, s.end_time
      FROM slots s
      WHERE NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.provider_id = p_provider_id
        AND b.scheduled_date = p_date
        AND b.status NOT IN ('cancelled', 'declined')
        AND (
          (b.start_time <= s.start_time AND b.end_time > s.start_time)
          OR (b.start_time < s.end_time AND b.end_time >= s.end_time)
          OR (b.start_time >= s.start_time AND b.end_time <= s.end_time)
        )
      );
    END LOOP;
  ELSE
    -- Regular availability
    FOR slot IN 
      SELECT start_time, end_time 
      FROM service_availability
      WHERE provider_id = p_provider_id
      AND day_of_week = EXTRACT(DOW FROM p_date)
    LOOP
      RETURN QUERY
      WITH RECURSIVE slots AS (
        SELECT slot.start_time,
               slot.start_time + slot_duration as end_time
        WHERE slot.start_time + slot_duration <= slot.end_time
        UNION ALL
        SELECT start_time + '30 minutes'::interval,
               (start_time + '30 minutes'::interval) + slot_duration
        FROM slots
        WHERE start_time + '30 minutes'::interval + slot_duration <= slot.end_time
      )
      SELECT s.start_time, s.end_time
      FROM slots s
      WHERE NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.provider_id = p_provider_id
        AND b.scheduled_date = p_date
        AND b.status NOT IN ('cancelled', 'declined')
        AND (
          (b.start_time <= s.start_time AND b.end_time > s.start_time)
          OR (b.start_time < s.end_time AND b.end_time >= s.end_time)
          OR (b.start_time >= s.start_time AND b.end_time <= s.end_time)
        )
      );
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;