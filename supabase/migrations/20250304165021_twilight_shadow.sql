/*
  # Booking System Implementation

  1. New Tables
    - `bookings`
      - Core booking information
      - Status tracking
      - Payment details
      - Customer and provider references
    
    - `booking_status_history`
      - Audit trail for booking status changes
      - Supports customer notifications
      - Enables analytics

  2. Security
    - RLS policies for bookings
    - Customer access controls
    - Provider access controls

  3. Status Management
    - Defined booking states
    - Status change validation
    - History tracking
*/

-- Create booking status enum
CREATE TYPE booking_status AS ENUM (
  'pending',      -- Initial state when booking is created
  'confirmed',    -- Provider has accepted the booking
  'in_progress',  -- Service is currently being performed
  'completed',    -- Service has been completed
  'cancelled',    -- Booking was cancelled
  'declined'      -- Provider declined the booking
);

-- Create bookings table
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) NOT NULL,
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  service_id uuid REFERENCES provider_services(id) NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending',
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  service_address text NOT NULL,
  special_instructions text,
  total_price decimal(10,2) NOT NULL,
  stripe_payment_intent_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure end time is after start time
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  -- Ensure scheduled date is not in the past
  CONSTRAINT future_date CHECK (scheduled_date >= CURRENT_DATE)
);

-- Create booking status history table
CREATE TABLE booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) NOT NULL,
  status booking_status NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) NOT NULL
);

-- Enable RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_status_history ENABLE ROW LEVEL SECURITY;

-- Booking policies
CREATE POLICY "Customers can view their own bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = customer_id
    OR 
    auth.uid() = provider_id
  );

CREATE POLICY "Customers can create bookings"
  ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update their pending bookings"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = customer_id 
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = customer_id
    AND status = 'pending'
  );

CREATE POLICY "Providers can update bookings they received"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = provider_id
    AND status IN ('pending', 'confirmed', 'in_progress')
  )
  WITH CHECK (
    auth.uid() = provider_id
    AND status IN ('confirmed', 'in_progress', 'completed', 'declined')
  );

-- Status history policies
CREATE POLICY "Users can view status history for their bookings"
  ON booking_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = booking_id
      AND (
        bookings.customer_id = auth.uid()
        OR
        bookings.provider_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can add status history entries"
  ON booking_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = booking_id
      AND (
        bookings.customer_id = auth.uid()
        OR
        bookings.provider_id = auth.uid()
      )
    )
  );

-- Create updated_at trigger
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to validate booking time slots
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

  -- Check for booking conflicts
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
  ) THEN
    RAISE EXCEPTION 'Time slot is already booked';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for booking validation
CREATE TRIGGER validate_booking_slot_trigger
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION validate_booking_slot();