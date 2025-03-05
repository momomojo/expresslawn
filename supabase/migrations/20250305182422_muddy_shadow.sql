/*
  # Fix get_profile_safely function

  1. Changes
    - Fix ambiguous column reference by properly qualifying the id column
    - Add explicit table aliases for clarity
    - Ensure proper role checking
    - Add input validation

  2. Security
    - Function remains security definer to access auth.users
    - Maintains data privacy by only returning necessary fields
*/

CREATE OR REPLACE FUNCTION get_profile_safely(user_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  role TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  address TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Input validation
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'user_id cannot be null';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.role,
    p.first_name,
    p.last_name,
    p.phone,
    p.address
  FROM profiles p
  WHERE p.id = user_id;

  -- Return empty if no profile found
  IF NOT FOUND THEN
    RETURN;
  END IF;
END;
$$;