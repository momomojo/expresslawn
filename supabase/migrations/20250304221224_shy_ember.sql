-- Create a function to safely get customer bookings
CREATE OR REPLACE FUNCTION get_customer_bookings(p_customer_id uuid)
RETURNS TABLE (
  id uuid,
  status text,
  scheduled_date date,
  start_time time,
  end_time time,
  completed_at timestamptz,
  service_address text,
  total_price decimal,
  service jsonb,
  invoice jsonb
) AS $$
BEGIN
  -- Ensure profile exists first
  PERFORM get_profile_safely(p_customer_id);

  RETURN QUERY
  SELECT 
    b.id,
    b.status::text,
    b.scheduled_date,
    b.start_time,
    b.end_time,
    b.completed_at,
    b.service_address,
    b.total_price,
    jsonb_build_object(
      'name', ps.name,
      'provider_profile', jsonb_build_object(
        'business_name', pp.business_name
      )
    ) as service,
    CASE WHEN i.id IS NOT NULL THEN
      jsonb_build_object(
        'id', i.id,
        'status', i.status,
        'due_date', i.due_date
      )
    ELSE NULL END as invoice
  FROM bookings b
  JOIN provider_services ps ON b.service_id = ps.id
  JOIN provider_profiles pp ON ps.provider_id = pp.id
  LEFT JOIN invoices i ON b.id = i.booking_id
  WHERE b.customer_id = p_customer_id
  AND b.status NOT IN ('cancelled', 'declined')
  ORDER BY b.scheduled_date ASC, b.start_time ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;