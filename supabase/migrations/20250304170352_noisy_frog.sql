/*
  # Fix booking query format

  Updates the booking validation function to use proper SQL syntax for status filtering.
*/

-- Update the validate_booking_slot function with correct status filtering
CREATE OR REPLACE FUNCTION validate_booking_slot()
RETURNS trigger AS $$
BEGIN
  -- Check if provider is available at the requested time
  IF NOT EXISTS (
    SELECT 1 FROM service_availability
    WHERE provider_id = NEW.provider_id
    AND day_of_week = EXTRACT(DOW FROM NEW.scheduled_date)
    AND start_time <= NEW.start_time
    AND end_time >= NEW.end_time
  ) THEN
    RAISE EXCEPTION 'Provider is not available at the requested time';
  END IF;

  -- Check for booking conflicts using proper status filtering
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE provider_id = NEW.provider_id
    AND scheduled_date = NEW.scheduled_date
    AND status NOT IN ('cancelled', 'declined')
    AND (
      (start_time <= NEW.start_time AND end_time > NEW.start_time)
      OR
      (start_time < NEW.end_time AND end_time >= NEW.end_time)
      OR
      (start_time >= NEW.start_time AND end_time <= NEW.end_time)
    )
    AND id != NEW.id  -- Allow updating own booking
  ) THEN
    RAISE EXCEPTION 'Time slot is already booked';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;