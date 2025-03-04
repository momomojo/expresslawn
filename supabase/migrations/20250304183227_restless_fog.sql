-- Drop existing function
DROP FUNCTION IF EXISTS get_available_slots(uuid, date, integer);

-- Create improved function with proper column aliasing
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
  IF p_provider_id IS NULL THEN
    RAISE EXCEPTION 'Provider ID is required';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Date is required';
  END IF;

  IF p_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot check availability for past dates';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 30 THEN
    RAISE EXCEPTION 'Duration must be at least 30 minutes';
  END IF;

  -- Convert duration to interval
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
  IF FOUND AND override_record.override_type = 'custom' AND 
     override_record.time_slots IS NOT NULL AND 
     jsonb_array_length(override_record.time_slots) > 0 THEN
    
    FOR slot_record IN 
      SELECT 
        (value->>'start_time')::time as slot_start,
        (value->>'end_time')::time as slot_end
      FROM jsonb_array_elements(override_record.time_slots)
      ORDER BY (value->>'start_time')::time
    LOOP
      -- Only process if slot is long enough for the service
      IF slot_record.slot_end - slot_record.slot_start >= slot_duration THEN
        t_start := slot_record.slot_start;
        
        -- Generate 30-minute intervals within the slot
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
            RETURN QUERY 
            SELECT t_start::time as start_time, 
                   t_end::time as end_time;
          END IF;
          
          t_start := t_start + '30 minutes'::interval;
        END LOOP;
      END IF;
    END LOOP;
  ELSE
    -- Regular availability
    FOR slot_record IN 
      SELECT 
        sa.start_time as slot_start,
        sa.end_time as slot_end
      FROM service_availability sa
      WHERE sa.provider_id = p_provider_id
      AND sa.day_of_week = EXTRACT(DOW FROM p_date)
      ORDER BY sa.start_time
    LOOP
      -- Only process if slot is long enough for the service
      IF slot_record.slot_end - slot_record.slot_start >= slot_duration THEN
        t_start := slot_record.slot_start;
        
        -- Generate 30-minute intervals within the slot
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
            RETURN QUERY 
            SELECT t_start::time as start_time, 
                   t_end::time as end_time;
          END IF;
          
          t_start := t_start + '30 minutes'::interval;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;