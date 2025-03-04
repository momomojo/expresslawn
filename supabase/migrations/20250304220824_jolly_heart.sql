-- Add completed_at to bookings
ALTER TABLE bookings
ADD COLUMN completed_at timestamptz,
ADD COLUMN completion_notes text;

-- Create invoices table
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) NOT NULL,
  amount decimal(10,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  due_date timestamptz NOT NULL,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Invoices are readable by the customer and provider
CREATE POLICY "Invoices are readable by involved parties"
  ON invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_id
      AND (
        b.customer_id = auth.uid()
        OR
        b.provider_id = auth.uid()
      )
    )
  );

-- Only providers can create invoices
CREATE POLICY "Providers can create invoices"
  ON invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_id
      AND b.provider_id = auth.uid()
    )
  );

-- Function to handle invoice updates
CREATE OR REPLACE FUNCTION handle_invoice_update()
RETURNS trigger AS $$
BEGIN
  -- Set updated_at
  NEW.updated_at = now();
  
  -- If status changed to paid, set paid_at
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    NEW.paid_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for invoice updates
CREATE TRIGGER on_invoice_update
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION handle_invoice_update();

-- Function to get invoice status
CREATE OR REPLACE FUNCTION get_invoice_status(status text)
RETURNS jsonb AS $$
BEGIN
  RETURN jsonb_build_object(
    'label', 
    CASE status
      WHEN 'pending' THEN 'Payment Pending'
      WHEN 'paid' THEN 'Paid'
      WHEN 'cancelled' THEN 'Cancelled'
      ELSE status
    END,
    'color',
    CASE status
      WHEN 'pending' THEN '#FF9800'
      WHEN 'paid' THEN '#4CAF50'
      WHEN 'cancelled' THEN '#FF4B4B'
      ELSE '#666666'
    END
  );
END;
$$ LANGUAGE plpgsql;