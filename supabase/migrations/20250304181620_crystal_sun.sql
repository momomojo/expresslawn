/*
  # Fix Service Availability Constraints

  1. Changes
    - Remove existing minimum_duration constraint
    - Add new minimum_duration constraint with proper checks
    - Update overlapping slots prevention
    - Add improved time slot validation

  2. Functions
    - Improved check_time_slot_overlap function
    - Enhanced prevent_overlapping_slots trigger
    - Updated get_available_slots function
*/

-- Drop existing minimum duration constraint if it exists
DO $$ BEGIN
  ALTER TABLE service_availability DROP CONSTRAINT IF EXISTS minimum_duration;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

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
DECLARE
  duration_minutes integer;
BEGIN
  -- Check minimum duration (30 minutes)
  duration_minutes := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))/60;
  IF duration_minutes < 30 THEN
    RAISE EXCEPTION 'Time slot must be at least 30 minutes (got % minutes)', duration_minutes;
  END IF;

  -- Check for overlaps
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
  override_record RECORD;
  slot_record RECORD;
  t_start time;
  t_end time;
BEGIN
  slot_duration := (p_duration_minutes || ' minutes')::interval;

  -- Check for date override
  SELECT * INTO override_record
  FROM service_availability_overrides
  WHERE provider_id = p_provider_id
  AND override_date = p_date;

  -- If blackout or vacation day, return no slots
  IF FOUND AND override_record.override_type IN ('blackout', 'vacation') THEN
    RETURN;
  END IF;

  -- If custom hours override
  IF FOUND AND override_record.override_type = 'custom' THEN
    FOR slot_record IN 
      SELECT (value->>'start_time')::time as slot_start,
             (value->>'end_time')::time as slot_end
      FROM jsonb_array_elements(override_record.time_slots)
    LOOP
      t_start := slot_record.slot_start;
      
      WHILE t_start + slot_duration <= slot_record.slot_end LOOP
        t_end := t_start + slot_duration;
        
        -- Check if slot is available (not booked)
        IF NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.provider_id = p_provider_id
          AND b.scheduled_date = p_date
          AND b.status NOT IN ('cancelled', 'declined')
          AND (
            (b.start_time <= t_start AND b.end_time > t_start)
            OR (b.start_time < t_end AND b.end_time >= t_end)
            OR (b.start_time >= t_start AND b.end_time <= t_end)
          )
        ) THEN
          RETURN QUERY SELECT t_start, t_end;
        END IF;
        
        t_start := t_start + '30 minutes'::interval;
      END LOOP;
    END LOOP;
  ELSE
    -- Regular availability
    FOR slot_record IN 
      SELECT start_time, end_time 
      FROM service_availability
      WHERE provider_id = p_provider_id
      AND day_of_week = EXTRACT(DOW FROM p_date)
    LOOP
      t_start := slot_record.start_time;
      
      WHILE t_start + slot_duration <= slot_record.end_time LOOP
        t_end := t_start + slot_duration;
        
        -- Check if slot is available (not booked)
        IF NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.provider_id = p_provider_id
          AND b.scheduled_date = p_date
          AND b.status NOT IN ('cancelled', 'declined')
          AND (
            (b.start_time <= t_start AND b.end_time > t_start)
            OR (b.start_time < t_end AND b.end_time >= t_end)
            OR (b.start_time >= t_start AND b.end_time <= t_end)
          )
        ) THEN
          RETURN QUERY SELECT t_start, t_end;
        END IF;
        
        t_start := t_start + '30 minutes'::interval;
      END LOOP;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;