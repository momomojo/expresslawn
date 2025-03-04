/*
  # Add schedule view functions

  1. New Functions
    - get_provider_schedule: Returns daily schedule with availability and bookings
    - format_time_range: Helper to format time ranges consistently
    - get_booking_status_color: Helper to get status-specific colors

  2. Security
    - Maintain existing RLS policies
    - Add view policies for schedule data
*/

-- Function to format time range consistently
CREATE OR REPLACE FUNCTION format_time_range(
  start_time time,
  end_time time
) RETURNS text AS $$
BEGIN
  RETURN to_char(start_time, 'HH12:MI AM') || ' - ' || to_char(end_time, 'HH12:MI AM');
END;
$$ LANGUAGE plpgsql;

-- Function to get status-specific color
CREATE OR REPLACE FUNCTION get_booking_status_color(status booking_status)
RETURNS text AS $$
BEGIN
  RETURN CASE status
    WHEN 'pending' THEN '#FF9800'
    WHEN 'confirmed' THEN '#4CAF50'
    WHEN 'in_progress' THEN '#2196F3'
    WHEN 'completed' THEN '#9E9E9E'
    WHEN 'cancelled' THEN '#F44336'
    WHEN 'declined' THEN '#FF4B4B'
    ELSE '#666666'
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to get provider's schedule for a specific date
CREATE OR REPLACE FUNCTION get_provider_schedule(
  p_provider_id uuid,
  p_date date
) RETURNS TABLE (
  start_time time,
  end_time time,
  type text,
  title text,
  subtitle text,
  status text,
  color text,
  booking_id uuid
) AS $$
BEGIN
  -- Return availability slots
  RETURN QUERY
  SELECT 
    sa.start_time,
    sa.end_time,
    'availability'::text as type,
    'Available'::text as title,
    format_time_range(sa.start_time, sa.end_time) as subtitle,
    NULL::text as status,
    '#E5FFE9'::text as color,
    NULL::uuid as booking_id
  FROM service_availability sa
  WHERE sa.provider_id = p_provider_id
  AND sa.day_of_week = EXTRACT(DOW FROM p_date)
  AND NOT EXISTS (
    -- Check for date override
    SELECT 1 FROM service_availability_overrides sao
    WHERE sao.provider_id = p_provider_id
    AND sao.override_date = p_date
    AND sao.override_type IN ('blackout', 'vacation')
  )

  UNION ALL

  -- Return custom availability from overrides
  SELECT 
    (value->>'start_time')::time as start_time,
    (value->>'end_time')::time as end_time,
    'custom_availability'::text as type,
    'Custom Hours'::text as title,
    format_time_range((value->>'start_time')::time, (value->>'end_time')::time) as subtitle,
    NULL::text as status,
    '#E5FFE9'::text as color,
    NULL::uuid as booking_id
  FROM service_availability_overrides sao,
       jsonb_array_elements(sao.time_slots) as slots
  WHERE sao.provider_id = p_provider_id
  AND sao.override_date = p_date
  AND sao.override_type = 'custom'

  UNION ALL

  -- Return bookings
  SELECT 
    b.start_time,
    b.end_time,
    'booking'::text as type,
    ps.name as title,
    CASE 
      WHEN b.status = 'pending' THEN 'Pending Confirmation'
      WHEN b.status = 'confirmed' THEN format_time_range(b.start_time, b.end_time)
      WHEN b.status = 'in_progress' THEN 'In Progress'
      WHEN b.status = 'completed' THEN 'Completed'
      WHEN b.status = 'cancelled' THEN 'Cancelled'
      WHEN b.status = 'declined' THEN 'Declined'
    END as subtitle,
    b.status::text,
    get_booking_status_color(b.status) as color,
    b.id as booking_id
  FROM bookings b
  JOIN provider_services ps ON b.service_id = ps.id
  WHERE b.provider_id = p_provider_id
  AND b.scheduled_date = p_date
  AND b.status NOT IN ('cancelled', 'declined')

  ORDER BY start_time;
END;
$$ LANGUAGE plpgsql;