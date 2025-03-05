# Invoice Management System

## Overview

The invoice system will:
1. Store invoices in our database
2. Display them in the customer portal
3. Send email notifications (optional)
4. Allow downloading/printing

## Database Schema

```sql
-- Invoices table
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) NOT NULL,
  customer_id uuid REFERENCES profiles(id) NOT NULL,
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  amount decimal(10,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  due_date timestamptz NOT NULL,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Invoice items table for line items
CREATE TABLE invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) NOT NULL,
  description text NOT NULL,
  amount decimal(10,2) NOT NULL,
  quantity integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);
```

## Customer Portal Integration

The customer portal will have an "Invoices" tab showing:
- List of all invoices
- Status indicators (Pending, Paid, etc.)
- Due dates
- Payment buttons for pending invoices
- Download/print options

## Invoice Creation Flow

1. When provider completes job:
   - Create invoice record
   - Generate Stripe invoice
   - Store Stripe invoice ID
   - Set due date (typically 7 days)

2. Customer notification options:
   - Email notification (optional)
   - In-app notification
   - Badge on Invoices tab

3. Payment processing:
   - Customer can pay through portal
   - Updates invoice status
   - Records payment date
   - Triggers provider payout process

## Invoice Display UI

The invoice list view will show:
- Invoice number
- Service date
- Amount
- Status
- Due date
- Action buttons (Pay, Download, etc.)

Individual invoice view will show:
- Full invoice details
- Line items
- Payment history
- Provider details
- Service details

## Email Integration (Optional)

Can optionally enable email notifications for:
- New invoice created
- Payment reminder
- Payment received
- Past due notice