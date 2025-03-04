/*
  # Fix booking filters and improve slot availability

  1. Changes
    - Fix booking status filter syntax
    - Add function to get available slots with proper status filtering
    - Add helper functions for time slot validation

  2. Security
    - Maintain existing RLS policies
    - Add input validation
*/

-- Function to get available slots with proper status filtering
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
  -- Validate inputs
  IF p_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot check availability for past dates';
  END IF;

  IF p_duration_minutes < 30 THEN
    RAISE EXCEPTION 'Duration must be at least 30 minutes';
  END IF;

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