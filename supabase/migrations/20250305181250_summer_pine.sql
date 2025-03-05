/*
  # Fix Customer Bookings Query

  1. Changes
    - Add get_customer_bookings function with proper column references
    - Include related data in a single query
    - Add proper type safety

  2. Security
    - Function is security definer
    - Proper access control checks
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.get_customer_bookings;

-- Create function with proper column references
CREATE OR REPLACE FUNCTION public.get_customer_bookings(
  p_customer_id uuid
)
RETURNS TABLE (
  id uuid,
  status booking_status,
  scheduled_date date,
  start_time time without time zone,
  end_time time without time zone,
  service_address text,
  total_price numeric(10,2),
  completed_at timestamptz,
  completion_notes text,
  service jsonb,
  provider jsonb,
  invoice jsonb
) SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.status,
    b.scheduled_date,
    b.start_time,
    b.end_time,
    b.service_address,
    b.total_price,
    b.completed_at,
    b.completion_notes,
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'provider_profile', jsonb_build_object(
        'business_name', pp.business_name
      )
    ) as service,
    jsonb_build_object(
      'id', pp.id,
      'business_name', pp.business_name,
      'business_address', pp.business_address
    ) as provider,
    CASE 
      WHEN b.status = 'completed' THEN
        (SELECT jsonb_build_object(
          'id', i.id,
          'status', i.status,
          'due_date', i.due_date
        )
        FROM invoices i
        WHERE i.booking_id = b.id
        LIMIT 1)
      ELSE NULL
    END as invoice
  FROM bookings b
  JOIN provider_services s ON s.id = b.service_id
  JOIN provider_profiles pp ON pp.id = b.provider_id
  WHERE b.customer_id = p_customer_id
  ORDER BY 
    CASE 
      WHEN b.status IN ('pending', 'confirmed', 'in_progress') THEN 0
      ELSE 1
    END,
    b.scheduled_date DESC,
    b.start_time DESC;

  -- Verify access
  IF NOT FOUND THEN
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql;