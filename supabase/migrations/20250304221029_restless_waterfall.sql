-- Remove notes column reference from provider jobs query
CREATE OR REPLACE FUNCTION get_provider_schedule(
  p_provider_id uuid,
  p_date date,
  p_include_bookings boolean DEFAULT true
)
RETURNS TABLE (
  start_time time,
  end_time time,
  type text,
  title text,
  subtitle text,
  status text,
  color text,
  customer jsonb,
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
    NULL::jsonb as customer,
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
    NULL::jsonb as customer,
    NULL::uuid as booking_id
  FROM service_availability_overrides sao,
       jsonb_array_elements(sao.time_slots) as slots
  WHERE sao.provider_id = p_provider_id
  AND sao.override_date = p_date
  AND sao.override_type = 'custom'

  UNION ALL

  -- Return bookings if requested
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
    get_booking_status_color(b.status::booking_status) as color,
    jsonb_build_object(
      'first_name', p.first_name,
      'last_name', p.last_name,
      'address', b.service_address
    ) as customer,
    b.id as booking_id
  FROM bookings b
  JOIN provider_services ps ON b.service_id = ps.id
  JOIN profiles p ON b.customer_id = p.id
  WHERE b.provider_id = p_provider_id
  AND b.scheduled_date = p_date
  AND b.status NOT IN ('cancelled', 'declined')
  AND p_include_bookings = true

  ORDER BY start_time;
END;
$$ LANGUAGE plpgsql;