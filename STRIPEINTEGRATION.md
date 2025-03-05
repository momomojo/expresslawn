# Stripe Integration Design

## Overview

The payment system will support:
1. One-time payments for individual services
2. Subscription-based recurring services
3. Automated scheduling for fixed-interval services
4. Secure payment processing and storage
5. Payment history and invoicing
6. Provider payouts and platform fees
7. Partial payments and deposits
8. Refund management

## Core Components

### Database Schema Extensions

```sql
-- Extend bookings table safely
ALTER TABLE bookings
ADD COLUMN payment_status text,
ADD COLUMN payment_required_at timestamptz,
ADD COLUMN deposit_amount decimal(10,2) CHECK (deposit_amount >= 0),
ADD COLUMN deposit_paid boolean DEFAULT false,
ADD COLUMN subscription_booking boolean DEFAULT false,
ADD COLUMN subscription_id uuid,
ADD COLUMN platform_fee decimal(10,2) CHECK (platform_fee >= 0),
ADD COLUMN provider_payout_amount decimal(10,2) CHECK (provider_payout_amount >= 0),
ADD COLUMN stripe_payment_intent_id text,
ADD CONSTRAINT valid_payment_status CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded')),
ADD CONSTRAINT valid_payment_timing CHECK (payment_required_at >= created_at);

-- Add indexes for payment-related queries
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX idx_bookings_payment_required_at ON bookings(payment_required_at);
CREATE INDEX idx_bookings_subscription_id ON bookings(subscription_id);
CREATE INDEX idx_bookings_stripe_payment_intent_id ON bookings(stripe_payment_intent_id);

-- Provider payouts
CREATE TABLE provider_payouts (
  id uuid PRIMARY KEY,
  provider_id uuid,
  amount decimal(10,2),
  status text,
  stripe_payout_id text,
  created_at timestamptz
);

-- Payment audit log
CREATE TABLE payment_audit_log (
  id uuid PRIMARY KEY,
  booking_id uuid,
  subscription_id uuid,
  event_type text,
  amount decimal(10,2),
  metadata jsonb
);

-- Add subscription plans table
CREATE TABLE subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  service_id uuid REFERENCES provider_services(id) NOT NULL,
  name text NOT NULL,
  description text,
  interval text NOT NULL CHECK (interval IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  price decimal(10,2) NOT NULL CHECK (price >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, service_id, interval)
);

-- Add migration procedure for existing bookings
CREATE OR REPLACE FUNCTION migrate_existing_bookings()
RETURNS void AS $$
BEGIN
  -- Set default values for existing bookings
  UPDATE bookings
  SET
    payment_status = CASE 
      WHEN status = 'completed' THEN 'paid'
      WHEN status = 'cancelled' THEN 'refunded'
      ELSE 'pending'
    END,
    payment_required_at = scheduled_date - interval '1 day',
    platform_fee = total_price * 0.10, -- Example: 10% platform fee
    provider_payout_amount = total_price * 0.90 -- Example: 90% provider payout
  WHERE payment_status IS NULL;
END;
$$ LANGUAGE plpgsql;
```

### Business Rules

1. Payment Timing:
   - Deposits due at booking
   - Full payment due before service
   - Subscription billing on fixed dates

2. Provider Payouts:
   - Automated weekly payouts
   - Minimum payout threshold
   - Hold period for disputes

3. Platform Fees:
   - Percentage-based fee structure
   - Volume-based tiers
   - Provider-specific rates

## Implementation Phases

### Phase 1: Core Payment Infrastructure

#### Payment Flow Handling

```sql
-- Payment attempts tracking
CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id),
  stripe_payment_intent_id text NOT NULL,
  amount decimal(10,2) NOT NULL,
  status text CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  failure_reason text,
  failure_code text,
  retry_count integer DEFAULT 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Refund tracking
CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id),
  payment_attempt_id uuid REFERENCES payment_attempts(id),
  stripe_refund_id text NOT NULL,
  amount decimal(10,2) NOT NULL,
  reason text,
  status text CHECK (status IN ('pending', 'succeeded', 'failed')),
  provider_payout_adjusted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Payment disputes
CREATE TABLE payment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id),
  payment_attempt_id uuid REFERENCES payment_attempts(id),
  stripe_dispute_id text NOT NULL,
  amount decimal(10,2) NOT NULL,
  status text CHECK (status IN ('warning_needs_response', 'warning_under_review', 'warning_closed', 'needs_response', 'under_review', 'won', 'lost')),
  reason text,
  evidence_due_by timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

1. Payment Processing:
   - Pre-authorization Flow:
     * Validate payment method
     * Check for sufficient funds
     * Create payment intent
   - Payment Execution:
     * Handle 3D Secure
     * Process payment
     * Update booking status
   - Post-payment Actions:
     * Generate receipt
     * Update provider balance
     * Trigger notifications

2. Failed Payment Recovery:
   - Retry Strategy:
     * Exponential backoff
     * Maximum retry attempts
     * Alternative payment methods
   - Customer Communication:
     * Payment failure notification
     * Update payment method
     * Manual payment option
   - Booking Protection:
     * Hold time slot
     * Grace period
     * Automatic cancellation rules

3. Refund Processing:
   - Full Refunds:
     * Cancel payment intent
     * Reverse provider payout
     * Update booking status
   - Partial Refunds:
     * Calculate refund amount
     * Adjust provider payout
     * Update platform fees
   - Refund Rules:
     * Time-based policies
     * Cancellation fees
     * Service-specific rules

4. Dispute Handling:
   - Initial Response:
     * Freeze provider payout
     * Collect evidence
     * Submit documentation
   - Resolution Process:
     * Provider communication
     * Customer mediation
     * Evidence submission
   - Outcome Handling:
     * Won: Release funds
     * Lost: Process chargeback
     * Update metrics

#### Database Migration Strategy

1. Pre-migration Checks:
   - Backup existing booking data
   - Verify data integrity
   - Schedule maintenance window

2. Migration Steps:
   - Add new columns with NULL constraint
   - Populate default values
   - Add constraints after data migration
   - Create necessary indexes

3. Validation:
   - Verify data consistency
   - Check constraint violations
   - Test new queries performance

1. Basic Setup:
   - Stripe account configuration
   - API key management
   - Webhook endpoints
   - Error handling

2. Customer Management:
   - Stripe customer creation
   - Payment method storage
   - Customer portal setup

3. One-time Payments:
   - Payment intent creation
   - Payment confirmation
   - Receipt generation

### Phase 2: Subscription System

#### Subscription Data Model

```sql
-- Subscription configuration
CREATE TABLE subscription_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  service_id uuid REFERENCES provider_services(id) NOT NULL,
  min_commitment_months integer DEFAULT 0,
  max_pause_days integer DEFAULT 0,
  cancellation_notice_days integer DEFAULT 30,
  allow_autopay boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, service_id)
);

-- Active subscriptions
CREATE TABLE customer_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) NOT NULL,
  plan_id uuid REFERENCES subscription_plans(id) NOT NULL,
  stripe_subscription_id text NOT NULL,
  status text CHECK (status IN ('active', 'paused', 'cancelled', 'past_due')),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  cancel_at timestamptz,
  canceled_at timestamptz,
  pause_collection jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Subscription schedule exceptions
CREATE TABLE subscription_schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES customer_subscriptions(id) NOT NULL,
  exception_date date NOT NULL,
  reason text NOT NULL,
  rescheduled_date date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(subscription_id, exception_date)
);
```

1. Subscription Plans:
   - Plan Types:
     * Fixed interval (weekly, monthly, etc.)
     * Custom interval with minimum frequency
     * Seasonal variations
   - Pricing Structure:
     * Base price with optional add-ons
     * Volume discounts
     * Seasonal adjustments
   - Billing Rules:
     * Prorated charges
     * Trial periods
     * Minimum commitments

2. Subscription Management:
   - Lifecycle Management:
     * Creation with initial payment
     * Plan upgrades/downgrades
     * Pause/resume functionality
     * Cancellation with notice period
   - Payment Handling:
     * Automatic payment collection
     * Failed payment recovery
     * Proration calculations
   - Schedule Management:
     * Recurring booking generation
     * Holiday/exception handling
     * Provider capacity management

3. Automated Scheduling:
   - Booking Generation:
     * Advance scheduling window
     * Conflict detection
     * Provider availability verification
   - Schedule Optimization:
     * Route optimization
     * Time slot allocation
     * Resource management
   - Exception Handling:
     * Weather-related rescheduling
     * Provider unavailability
     * Customer requests

#### Subscription Workflow

1. Creation Process:
   - Customer selects plan
   - Initial payment processed
   - Schedule preferences set
   - First booking created

2. Maintenance Flow:
   - Regular payment collection
   - Schedule generation
   - Exception handling
   - Communication triggers

3. Modification Handling:
   - Plan changes
   - Schedule adjustments
   - Pause/resume
   - Cancellation

### Phase 3: Advanced Features

1. Partial Payments:
   - Deposit system
   - Payment plans
   - Late payment handling

2. Provider Payouts:
   - Automated transfers
   - Fee calculation
   - Payout reporting

3. Refund System:
   - Full/partial refunds
   - Cancellation fees
   - Dispute handling

## Security & Compliance

### Data Integrity Measures

```sql
-- Transaction audit log
CREATE TABLE transaction_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  old_state jsonb,
  new_state jsonb,
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz DEFAULT now()
);

-- Platform fee configuration
CREATE TABLE platform_fee_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_type text NOT NULL CHECK (fee_type IN ('percentage', 'fixed', 'tiered')),
  fee_value jsonb NOT NULL,
  min_fee decimal(10,2) CHECK (min_fee >= 0),
  max_fee decimal(10,2) CHECK (max_fee >= min_fee),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_fee_period CHECK (effective_to IS NULL OR effective_to > effective_from)
);
```

#### Transaction Management

1. Payment Status Updates:
   - Atomic Operations:
     * Use database transactions
     * Maintain ACID properties
     * Handle concurrent updates
   - State Transitions:
     * Valid status flows only
     * Prevent invalid transitions
     * Maintain audit trail
   - Data Consistency:
     * Cross-table updates
     * Referential integrity
     * Constraint validation

2. Platform Fee Management:
   - Fee Calculation:
     * Time-based configuration
     * Multiple fee types
     * Minimum/maximum bounds
   - Fee Application:
     * Transaction-based
     * Volume-based tiers
     * Provider-specific rates
   - Fee Validation:
     * Non-negative amounts
     * Maximum limits
     * Currency precision

3. Audit Trail Implementation:
   - Transaction Logging:
     * Before/after states
     * User attribution
     * Timestamp tracking
   - Change Tracking:
     * Status changes
     * Amount modifications
     * Fee adjustments
   - Data Recovery:
     * State reconstruction
     * Rollback support
     * Dispute resolution

4. Data Validation Rules:
   - Amount Validation:
     * Non-negative checks
     * Currency precision
     * Total reconciliation
   - Status Validation:
     * Valid state transitions
     * Temporal constraints
     * Business rules
   - Relationship Validation:
     * Foreign key integrity
     * Logical dependencies
     * Temporal consistency

#### Database Triggers

```sql
-- Trigger function for payment status changes
CREATE OR REPLACE FUNCTION log_payment_status_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.payment_status != OLD.payment_status THEN
    INSERT INTO transaction_audit_log (
      entity_type,
      entity_id,
      action,
      old_state,
      new_state,
      performed_by
    ) VALUES (
      'payment',
      NEW.id,
      'status_change',
      jsonb_build_object('status', OLD.payment_status),
      jsonb_build_object('status', NEW.payment_status),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for platform fee validation
CREATE OR REPLACE FUNCTION validate_platform_fee()
RETURNS trigger AS $$
BEGIN
  -- Ensure platform fee is within configured bounds
  IF NEW.platform_fee < 0 THEN
    RAISE EXCEPTION 'Platform fee cannot be negative';
  END IF;

  -- Validate against current configuration
  IF NOT EXISTS (
    SELECT 1 FROM platform_fee_configurations
    WHERE effective_from <= now()
    AND (effective_to IS NULL OR effective_to > now())
    AND NEW.platform_fee <= max_fee
    AND NEW.platform_fee >= min_fee
  ) THEN
    RAISE EXCEPTION 'Platform fee outside allowed range';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### Subscription Security

1. Access Controls:
   - Role-based permissions
   - Provider isolation
   - Customer data protection

2. Payment Security:
   - Secure token storage
   - Encryption at rest
   - Audit trail maintenance

### Data Protection

1. Sensitive Data:
   - PCI compliance
   - Data encryption
   - Access controls

2. Authentication:
   - Strong customer authentication
   - 3D Secure support
   - Fraud prevention

### Error Handling

#### Payment Error Recovery

1. Transient Failures:
   - Network issues
   - Timeouts
   - Rate limits
   - Automatic retry logic

2. Permanent Failures:
   - Insufficient funds
   - Invalid card
   - Fraud detection
   - Manual intervention required

3. System Recovery:
   - Transaction rollback
   - State reconciliation
   - Data consistency checks
   - Automated healing

4. Notification System:
   - Customer alerts
   - Provider updates
   - Admin notifications
   - Escalation triggers

1. Payment Failures:
   - Retry logic
   - Customer notification
   - Alternative payment collection

2. System Failures:
   - Transaction rollback
   - Data consistency
   - Recovery procedures

## Monitoring & Analytics

### Key Metrics

1. Payment Success:
   - Conversion rates
   - Failure reasons
   - Processing times

2. Business Health:
   - Revenue tracking
   - Subscription analytics
   - Churn prediction

### Alerts & Notifications

1. Critical Events:
   - Payment failures
   - Subscription cancellations
   - Dispute filed

2. System Health:
   - API availability
   - Webhook delivery
   - Error rates

## Testing Strategy

### Test Environments

1. Development:
   - Stripe test mode
   - Mock webhooks
   - Test data

2. Staging:
   - Integration testing
   - Load testing
   - Security testing

### Test Cases

1. Payment Flows:
   - Card payments
   - Subscription billing
   - Refund processing

2. Error Scenarios:
   - Card declined
   - Network failures
   - Invalid data

## Deployment & Operations

### Release Process

1. Database Updates:
   - Schema migrations
   - Data backfills
   - Rollback procedures

2. Feature Deployment:
   - Phased rollout
   - Feature flags
   - Monitoring

### Maintenance

1. Regular Tasks:
   - Log rotation
   - Data cleanup
   - Performance tuning

2. Updates:
   - Stripe API versions
   - Security patches
   - Dependency updates

## Documentation

## Provider Payout System

### Provider Banking Information

```sql
-- Provider bank account information
CREATE TABLE provider_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  stripe_bank_account_id text NOT NULL,
  account_last4 text NOT NULL,
  bank_name text NOT NULL,
  account_holder_name text NOT NULL,
  account_holder_type text CHECK (account_holder_type IN ('individual', 'company')),
  currency text DEFAULT 'usd',
  is_default boolean DEFAULT false,
  verification_status text CHECK (verification_status IN ('pending', 'verified', 'failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, stripe_bank_account_id)
);

-- Provider payout preferences
CREATE TABLE provider_payout_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  payout_schedule text CHECK (payout_schedule IN ('daily', 'weekly', 'monthly')),
  minimum_payout_amount decimal(10,2) DEFAULT 0,
  hold_period_days integer DEFAULT 7,
  automatic_payouts boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id)
);

-- Payout batches
CREATE TABLE payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  status text CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_amount decimal(10,2) NOT NULL,
  booking_count integer NOT NULL,
  stripe_payout_id text,
  scheduled_for timestamptz NOT NULL,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Payout batch items
CREATE TABLE payout_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES payout_batches(id) NOT NULL,
  booking_id uuid REFERENCES bookings(id) NOT NULL,
  amount decimal(10,2) NOT NULL,
  platform_fee decimal(10,2) NOT NULL,
  status text CHECK (status IN ('pending', 'included', 'failed', 'held')),
  hold_reason text,
  created_at timestamptz DEFAULT now()
);
```

### Payout Processing

1. Payout Scheduling:
   - Schedule Configuration:
     * Provider preferences
     * Minimum amounts
     * Hold periods
   - Batch Creation:
     * Eligible bookings
     * Fee calculations
     * Currency handling
   - Timing Rules:
     * Payment clearance
     * Dispute windows
     * Bank processing

2. Fee Adjustments:
   - Platform Fee Types:
     * Percentage-based
     * Fixed amounts
     * Volume tiers
   - Fee Calculations:
     * Base calculation
     * Volume discounts
     * Special rates
   - Fee Updates:
     * Rate changes
     * Retroactive adjustments
     * Dispute handling

3. Refund Handling:
   - Refund Types:
     * Full refunds
     * Partial refunds
     * Service credits
   - Provider Impact:
     * Fee reversals
     * Balance adjustments
     * Future deductions
   - Documentation:
     * Refund records
     * Adjustment tracking
     * Provider notifications

4. Dispute Management:
   - Initial Response:
     * Hold funds
     * Gather evidence
     * Provider notification
   - Resolution Process:
     * Evidence collection
     * Response submission
     * Timeline tracking
   - Outcome Handling:
     * Won disputes
     * Lost disputes
     * Provider impact

### Payout Functions

```sql
-- Function to calculate provider payout amount
CREATE OR REPLACE FUNCTION calculate_provider_payout(
  p_booking_id uuid
)
RETURNS decimal(10,2) AS $$
DECLARE
  v_total_amount decimal(10,2);
  v_platform_fee decimal(10,2);
  v_refunded_amount decimal(10,2);
  v_disputed_amount decimal(10,2);
BEGIN
  -- Get booking amount and platform fee
  SELECT 
    total_price,
    platform_fee,
    COALESCE(
      (SELECT SUM(amount) FROM refunds WHERE booking_id = b.id),
      0
    ) as refunded,
    COALESCE(
      (SELECT SUM(amount) FROM payment_disputes WHERE booking_id = b.id AND status = 'lost'),
      0
    ) as disputed
  INTO v_total_amount, v_platform_fee, v_refunded_amount, v_disputed_amount
  FROM bookings b
  WHERE id = p_booking_id;

  -- Calculate final payout amount
  RETURN v_total_amount - v_platform_fee - v_refunded_amount - v_disputed_amount;
END;
$$ LANGUAGE plpgsql;

-- Function to create payout batch
CREATE OR REPLACE FUNCTION create_payout_batch(
  p_provider_id uuid,
  p_scheduled_date timestamptz
)
RETURNS uuid AS $$
DECLARE
  v_batch_id uuid;
  v_total_amount decimal(10,2);
  v_booking_count integer;
BEGIN
  -- Calculate batch totals
  SELECT 
    COUNT(*),
    COALESCE(SUM(calculate_provider_payout(id)), 0)
  INTO v_booking_count, v_total_amount
  FROM bookings
  WHERE provider_id = p_provider_id
  AND payment_status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM payout_batch_items
    WHERE booking_id = bookings.id
  );

  -- Create batch if there are eligible bookings
  IF v_booking_count > 0 THEN
    INSERT INTO payout_batches (
      provider_id,
      status,
      total_amount,
      booking_count,
      scheduled_for
    ) VALUES (
      p_provider_id,
      'pending',
      v_total_amount,
      v_booking_count,
      p_scheduled_date
    )
    RETURNING id INTO v_batch_id;

    -- Add batch items
    INSERT INTO payout_batch_items (
      batch_id,
      booking_id,
      amount,
      platform_fee,
      status
    )
    SELECT
      v_batch_id,
      id,
      calculate_provider_payout(id),
      platform_fee,
      'pending'
    FROM bookings
    WHERE provider_id = p_provider_id
    AND payment_status = 'paid'
    AND NOT EXISTS (
      SELECT 1 FROM payout_batch_items
      WHERE booking_id = bookings.id
    );
  END IF;

  RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql;
```

### Payout Policies

1. Eligibility Rules:
   - Payment clearance
   - Minimum amounts
   - Account status
   - Verification requirements

2. Hold Periods:
   - Standard holds
   - Risk-based holds
   - Dispute holds
   - Manual review holds

3. Payout Methods:
   - Bank transfers
   - Payment networks
   - Currency handling
   - International transfers

### Technical Specs

## Schema Design

### Core Payment Tables

```sql
-- Payment methods
CREATE TABLE payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) NOT NULL,
  stripe_payment_method_id text NOT NULL,
  type text NOT NULL,
  last4 text,
  exp_month integer,
  exp_year integer,
  card_brand text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(customer_id, stripe_payment_method_id)
);

-- Service pricing tiers
CREATE TABLE service_pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES provider_services(id) NOT NULL,
  name text NOT NULL,
  min_quantity integer NOT NULL,
  max_quantity integer,
  unit_price decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_quantity_range CHECK (
    max_quantity IS NULL OR max_quantity > min_quantity
  )
);

-- Platform fee configurations
CREATE TABLE platform_fee_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id),
  fee_type text NOT NULL CHECK (fee_type IN ('percentage', 'fixed', 'tiered')),
  fee_value jsonb NOT NULL,
  min_fee decimal(10,2) NOT NULL CHECK (min_fee >= 0),
  max_fee decimal(10,2) CHECK (max_fee >= min_fee),
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (
    end_date IS NULL OR end_date > start_date
  )
);
```

### Currency and Tax Handling

```sql
-- Currency configuration
CREATE TABLE currency_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code text NOT NULL,
  decimal_places integer NOT NULL DEFAULT 2,
  is_active boolean DEFAULT true,
  exchange_rate decimal(10,6),
  last_updated timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Tax rates
CREATE TABLE tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  rate decimal(5,2) NOT NULL CHECK (rate >= 0),
  is_inclusive boolean DEFAULT false,
  jurisdiction text,
  tax_type text CHECK (tax_type IN ('vat', 'sales', 'gst')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Service tax applications
CREATE TABLE service_tax_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES provider_services(id) NOT NULL,
  tax_rate_id uuid REFERENCES tax_rates(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(service_id, tax_rate_id)
);
```

### Payment Processing

```sql
-- Payment processing configurations
CREATE TABLE payment_processing_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id),
  retry_limit integer NOT NULL DEFAULT 3,
  retry_delay_minutes integer[] NOT NULL DEFAULT '{30,120,360}',
  auto_refund_window_hours integer DEFAULT 24,
  require_3ds boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id)
);

-- Payment retry tracking
CREATE TABLE payment_retries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_attempt_id uuid REFERENCES payment_attempts(id) NOT NULL,
  attempt_number integer NOT NULL,
  scheduled_for timestamptz NOT NULL,
  executed_at timestamptz,
  success boolean,
  error_code text,
  error_message text,
  created_at timestamptz DEFAULT now()
);
```

### Service Credits and Adjustments

```sql
-- Service credits
CREATE TABLE service_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) NOT NULL,
  amount decimal(10,2) NOT NULL CHECK (amount > 0),
  remaining_amount decimal(10,2) NOT NULL CHECK (remaining_amount >= 0),
  reason text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_amounts CHECK (remaining_amount <= amount)
);

-- Credit usage tracking
CREATE TABLE credit_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid REFERENCES service_credits(id) NOT NULL,
  booking_id uuid REFERENCES bookings(id) NOT NULL,
  amount_used decimal(10,2) NOT NULL CHECK (amount_used > 0),
  created_at timestamptz DEFAULT now()
);
```

### Data Retention and Archiving

```sql
-- Archived payment data
CREATE TABLE archived_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  payment_data jsonb NOT NULL,
  archived_at timestamptz DEFAULT now(),
  retention_end_date timestamptz NOT NULL,
  CONSTRAINT valid_retention_period CHECK (
    retention_end_date > archived_at
  )
);

-- Archive triggers
CREATE OR REPLACE FUNCTION archive_old_payment_data()
RETURNS trigger AS $$
BEGIN
  -- Archive payment data after 2 years
  INSERT INTO archived_payments (
    booking_id,
    payment_data,
    retention_end_date
  )
  SELECT
    id,
    jsonb_build_object(
      'amount', total_price,
      'status', payment_status,
      'created_at', created_at,
      'completed_at', completed_at
    ),
    created_at + interval '7 years'
  FROM bookings
  WHERE created_at < now() - interval '2 years'
  AND NOT EXISTS (
    SELECT 1 FROM archived_payments
    WHERE booking_id = bookings.id
  );

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

### Performance Optimization

```sql
-- Create indexes for common queries
CREATE INDEX idx_payment_methods_customer ON payment_methods(customer_id, is_default);
CREATE INDEX idx_service_pricing_tiers_service ON service_pricing_tiers(service_id, min_quantity);
CREATE INDEX idx_platform_fees_provider ON platform_fee_configurations(provider_id, start_date);
CREATE INDEX idx_payment_retries_scheduled ON payment_retries(scheduled_for) WHERE executed_at IS NULL;
CREATE INDEX idx_service_credits_customer ON service_credits(customer_id, remaining_amount) WHERE remaining_amount > 0;

-- Optimize for range queries
CREATE INDEX idx_bookings_payment_date ON bookings(created_at, payment_status);
CREATE INDEX idx_archived_payments_retention ON archived_payments(retention_end_date);
```

### Functions and Procedures

```sql
-- Calculate applicable tax
CREATE OR REPLACE FUNCTION calculate_tax_amount(
  p_service_id uuid,
  p_base_amount decimal(10,2)
)
RETURNS decimal(10,2) AS $$
DECLARE
  v_total_tax decimal(10,2) := 0;
  v_rate record;
BEGIN
  FOR v_rate IN
    SELECT tr.rate, tr.is_inclusive
    FROM service_tax_applications sta
    JOIN tax_rates tr ON tr.id = sta.tax_rate_id
    WHERE sta.service_id = p_service_id
  LOOP
    IF v_rate.is_inclusive THEN
      v_total_tax := v_total_tax + (p_base_amount - (p_base_amount / (1 + v_rate.rate)));
    ELSE
      v_total_tax := v_total_tax + (p_base_amount * v_rate.rate);
    END IF;
  END LOOP;

  RETURN v_total_tax;
END;
$$ LANGUAGE plpgsql;

-- Apply service credits
CREATE OR REPLACE FUNCTION apply_service_credits(
  p_booking_id uuid,
  p_customer_id uuid
)
RETURNS decimal(10,2) AS $$
DECLARE
  v_total_applied decimal(10,2) := 0;
  v_credit record;
  v_remaining decimal(10,2);
BEGIN
  -- Get booking amount
  SELECT total_price - COALESCE(
    (SELECT SUM(amount_used) FROM credit_usage WHERE booking_id = p_booking_id),
    0
  )
  INTO v_remaining
  FROM bookings
  WHERE id = p_booking_id;

  -- Apply available credits
  FOR v_credit IN
    SELECT id, remaining_amount
    FROM service_credits
    WHERE customer_id = p_customer_id
    AND remaining_amount > 0
    AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at
  LOOP
    IF v_remaining <= 0 THEN
      EXIT;
    END IF;

    -- Calculate amount to apply
    v_total_applied := LEAST(v_credit.remaining_amount, v_remaining);
    
    -- Record credit usage
    INSERT INTO credit_usage (
      credit_id,
      booking_id,
      amount_used
    ) VALUES (
      v_credit.id,
      p_booking_id,
      v_total_applied
    );

    -- Update remaining credit
    UPDATE service_credits
    SET remaining_amount = remaining_amount - v_total_applied,
        updated_at = now()
    WHERE id = v_credit.id;

    v_remaining := v_remaining - v_total_applied;
  END LOOP;

  RETURN v_total_applied;
END;
$$ LANGUAGE plpgsql;
```

These schema additions provide:
- Comprehensive payment method handling
- Flexible pricing tiers
- Tax calculation system
- Service credits management
- Data archiving strategy
- Performance optimizations
- Utility functions for common operations

## Webhook System

### Webhook Infrastructure

```sql
-- Webhook events table
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL,
  status text CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  processing_attempts integer DEFAULT 0,
  last_attempt_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  idempotency_key text UNIQUE
);

-- Webhook processing logs
CREATE TABLE webhook_processing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id uuid REFERENCES webhook_events(id),
  attempt_number integer NOT NULL,
  processing_status text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  error_details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for webhook tables
CREATE INDEX idx_webhook_events_status ON webhook_events(status, created_at);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_processing_logs_event ON webhook_processing_logs(webhook_event_id, attempt_number);
```

### Webhook Handler Functions

```sql
-- Function to record webhook event
CREATE OR REPLACE FUNCTION record_webhook_event(
  p_stripe_event_id text,
  p_event_type text,
  p_event_data jsonb,
  p_idempotency_key text
)
RETURNS uuid AS $$
DECLARE
  v_event_id uuid;
BEGIN
  -- Insert with idempotency check
  INSERT INTO webhook_events (
    stripe_event_id,
    event_type,
    event_data,
    status,
    idempotency_key
  )
  VALUES (
    p_stripe_event_id,
    p_event_type,
    p_event_data,
    'pending',
    p_idempotency_key
  )
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log webhook processing attempt
CREATE OR REPLACE FUNCTION log_webhook_processing(
  p_webhook_event_id uuid,
  p_attempt_number integer,
  p_status text,
  p_error_details jsonb DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO webhook_processing_logs (
    webhook_event_id,
    attempt_number,
    processing_status,
    started_at,
    completed_at,
    error_details
  )
  VALUES (
    p_webhook_event_id,
    p_attempt_number,
    p_status,
    CASE WHEN p_status = 'started' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'completed' THEN now() ELSE NULL END,
    p_error_details
  );
END;
$$ LANGUAGE plpgsql;
```

### Webhook Event Types

1. Payment Events:
   ```typescript
   type PaymentWebhookEvent = {
     type: 
       | 'payment_intent.succeeded'
       | 'payment_intent.payment_failed'
       | 'payment_intent.canceled'
       | 'payment_intent.processing';
     data: {
       object: {
         id: string;
         amount: number;
         status: string;
         payment_method: string;
         customer: string;
         metadata: {
           bookingId: string;
         };
       };
     };
   };
   ```

2. Subscription Events:
   ```typescript
   type SubscriptionWebhookEvent = {
     type:
       | 'customer.subscription.created'
       | 'customer.subscription.updated'
       | 'customer.subscription.deleted'
       | 'customer.subscription.trial_will_end';
     data: {
       object: {
         id: string;
         customer: string;
         status: string;
         current_period_end: number;
         cancel_at_period_end: boolean;
       };
     };
   };
   ```

3. Dispute Events:
   ```typescript
   type DisputeWebhookEvent = {
     type:
       | 'charge.dispute.created'
       | 'charge.dispute.updated'
       | 'charge.dispute.closed';
     data: {
       object: {
         id: string;
         amount: number;
         status: string;
         charge: string;
         evidence_details: {
           due_by: number;
         };
       };
     };
   };
   ```

### Webhook Processing Flow

1. Event Reception:
   ```typescript
   async function handleWebhook(
     signature: string,
     payload: Buffer,
     webhookSecret: string
   ) {
     try {
       // Verify webhook signature
       const event = stripe.webhooks.constructEvent(
         payload,
         signature,
         webhookSecret
       );

       // Record webhook event
       const eventId = await supabase.rpc('record_webhook_event', {
         p_stripe_event_id: event.id,
         p_event_type: event.type,
         p_event_data: event.data,
         p_idempotency_key: crypto.randomUUID()
       });

       // Process event
       await processWebhookEvent(eventId, event);

       return { statusCode: 200 };
     } catch (error) {
       console.error('Webhook Error:', error.message);
       return { 
         statusCode: 400,
         body: `Webhook Error: ${error.message}`
       };
     }
   }
   ```

2. Event Processing:
   ```typescript
   async function processWebhookEvent(eventId: string, event: any) {
     try {
       // Log processing start
       await supabase.rpc('log_webhook_processing', {
         p_webhook_event_id: eventId,
         p_attempt_number: 1,
         p_status: 'started'
       });

       // Handle different event types
       switch (event.type) {
         case 'payment_intent.succeeded':
           await handlePaymentSuccess(event.data.object);
           break;
         case 'customer.subscription.updated':
           await handleSubscriptionUpdate(event.data.object);
           break;
         case 'charge.dispute.created':
           await handleDisputeCreated(event.data.object);
           break;
         // Add other event handlers
       }

       // Log successful processing
       await supabase.rpc('log_webhook_processing', {
         p_webhook_event_id: eventId,
         p_attempt_number: 1,
         p_status: 'completed'
       });
     } catch (error) {
       // Log processing failure
       await supabase.rpc('log_webhook_processing', {
         p_webhook_event_id: eventId,
         p_attempt_number: 1,
         p_status: 'failed',
         p_error_details: { error: error.message }
       });

       // Handle retry logic
       await handleWebhookRetry(eventId, event);
     }
   }
   ```

3. Retry Logic:
   ```typescript
   async function handleWebhookRetry(eventId: string, event: any) {
     const maxRetries = 3;
     const retryDelays = [30, 60, 120]; // seconds

     // Get current attempt count
     const { data: webhookEvent } = await supabase
       .from('webhook_events')
       .select('processing_attempts')
       .eq('id', eventId)
       .single();

     if (webhookEvent.processing_attempts < maxRetries) {
       // Schedule retry
       const delaySeconds = retryDelays[webhookEvent.processing_attempts];
       setTimeout(async () => {
         await processWebhookEvent(eventId, event);
       }, delaySeconds * 1000);

       // Update retry count
       await supabase
         .from('webhook_events')
         .update({
           processing_attempts: webhookEvent.processing_attempts + 1,
           status: 'retrying',
           last_attempt_at: new Date().toISOString()
         })
         .eq('id', eventId);
     } else {
       // Mark as failed after max retries
       await supabase
         .from('webhook_events')
         .update({
           status: 'failed',
           last_attempt_at: new Date().toISOString()
         })
         .eq('id', eventId);

       // Notify admin of failed webhook
       await notifyWebhookFailure(eventId, event);
     }
   }
   ```

### Webhook Monitoring

1. Health Metrics:
   ```typescript
   type WebhookMetrics = {
     total_events: number;
     success_rate: number;
     average_processing_time: number;
     retry_rate: number;
     failure_rate: number;
   };

   async function getWebhookMetrics(
     startDate: Date,
     endDate: Date
   ): Promise<WebhookMetrics> {
     const { data } = await supabase
       .rpc('calculate_webhook_metrics', {
         p_start_date: startDate.toISOString(),
         p_end_date: endDate.toISOString()
       });

     return data;
   }
   ```

2. Alerting Rules:
   ```typescript
   const ALERT_THRESHOLDS = {
     failure_rate: 0.05, // 5% failure rate
     processing_time: 10000, // 10 seconds
     retry_rate: 0.10, // 10% retry rate
     queue_size: 100 // Max pending webhooks
   };

   async function checkWebhookAlerts() {
     const metrics = await getWebhookMetrics(
       new Date(Date.now() - 3600000), // Last hour
       new Date()
     );

     if (metrics.failure_rate > ALERT_THRESHOLDS.failure_rate) {
       await sendAlert('High webhook failure rate detected');
     }

     if (metrics.retry_rate > ALERT_THRESHOLDS.retry_rate) {
       await sendAlert('High webhook retry rate detected');
     }
   }
   ```

### Event Logging

```sql
-- Function to get webhook event history
CREATE OR REPLACE FUNCTION get_webhook_event_history(
  p_event_id uuid
)
RETURNS TABLE (
  attempt_number integer,
  processing_status text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  error_details jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wpl.attempt_number,
    wpl.processing_status,
    wpl.started_at,
    wpl.completed_at,
    EXTRACT(EPOCH FROM (wpl.completed_at - wpl.started_at)) * 1000 as duration_ms,
    wpl.error_details
  FROM webhook_processing_logs wpl
  WHERE wpl.webhook_event_id = p_event_id
  ORDER BY wpl.attempt_number;
END;
$$ LANGUAGE plpgsql;

-- Function to get webhook processing metrics
CREATE OR REPLACE FUNCTION calculate_webhook_metrics(
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS jsonb AS $$
DECLARE
  v_total_events integer;
  v_success_count integer;
  v_retry_count integer;
  v_failure_count integer;
  v_avg_duration decimal;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'retrying'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    AVG(
      EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000
    ) FILTER (WHERE processed_at IS NOT NULL)
  INTO
    v_total_events,
    v_success_count,
    v_retry_count,
    v_failure_count,
    v_avg_duration
  FROM webhook_events
  WHERE created_at BETWEEN p_start_date AND p_end_date;

  RETURN jsonb_build_object(
    'total_events', v_total_events,
    'success_rate', CASE WHEN v_total_events > 0 
      THEN v_success_count::float / v_total_events 
      ELSE 0 END,
    'retry_rate', CASE WHEN v_total_events > 0 
      THEN v_retry_count::float / v_total_events 
      ELSE 0 END,
    'failure_rate', CASE WHEN v_total_events > 0 
      THEN v_failure_count::float / v_total_events 
      ELSE 0 END,
    'average_processing_time', v_avg_duration
  );
END;
$$ LANGUAGE plpgsql;
```

### Security Considerations

1. Signature Verification:
   - Use Stripe's webhook signature verification
   - Store webhook signing secret securely
   - Validate timestamp to prevent replay attacks

2. Error Handling:
   - Log all verification failures
   - Monitor for unusual patterns
   - Rate limit webhook endpoints

3. Data Protection:
   - Sanitize logged event data
   - Encrypt sensitive information
   - Implement proper access controls

### Best Practices

1. Implementation Guidelines:
   - Use idempotency keys
   - Implement proper retries
   - Monitor webhook health
   - Set up alerting

2. Testing Strategy:
   - Use Stripe's test mode
   - Simulate various events
   - Test retry logic
   - Verify error handling

3. Maintenance Tasks:
   - Regular log rotation
   - Metric analysis
   - Performance tuning
   - Security updates



1. API Documentation:
   - Endpoints
   - Request/response formats
   - Error codes

2. Integration Guide:
   - Setup instructions
   - Best practices
   - Troubleshooting

## Customer Portal Integration

### Portal Configuration

```sql
-- Customer portal preferences
CREATE TABLE customer_portal_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) NOT NULL,
  default_payment_method_id uuid REFERENCES payment_methods(id),
  invoice_email_enabled boolean DEFAULT true,
  subscription_cancel_enabled boolean DEFAULT true,
  subscription_pause_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(customer_id)
);

-- Portal session tracking
CREATE TABLE customer_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) NOT NULL,
  stripe_session_id text NOT NULL,
  return_url text NOT NULL,
  status text CHECK (status IN ('active', 'expired', 'completed')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CONSTRAINT valid_session_period CHECK (expires_at > created_at)
);
```

### Portal Configuration Functions

```typescript
interface PortalConfiguration {
  business_profile: {
    headline: string;
    privacy_policy_url: string;
    terms_of_service_url: string;
  };
  features: {
    payment_methods: {
      enabled: boolean;
      types: string[];
    };
    subscriptions: {
      enabled: boolean;
      cancel: {
        enabled: boolean;
        mode: 'at_period_end' | 'immediately';
        proration_behavior: 'always_invoice' | 'create_prorations' | 'none';
      };
      pause: {
        enabled: boolean;
      };
    };
    invoices: {
      enabled: boolean;
    };
  };
}

async function configureCustomerPortal(): Promise<void> {
  const configuration: PortalConfiguration = {
    business_profile: {
      headline: 'Manage your lawn care services',
      privacy_policy_url: 'https://example.com/privacy',
      terms_of_service_url: 'https://example.com/terms'
    },
    features: {
      payment_methods: {
        enabled: true,
        types: ['card', 'us_bank_account']
      },
      subscriptions: {
        enabled: true,
        cancel: {
          enabled: true,
          mode: 'at_period_end',
          proration_behavior: 'create_prorations'
        },
        pause: {
          enabled: true
        }
      },
      invoices: {
        enabled: true
      }
    }
  };

  await stripe.billingPortal.configurations.create(configuration);
}
```

### Session Management

```typescript
interface CreatePortalSessionParams {
  customerId: string;
  returnUrl: string;
  configuration?: string;
}

async function createPortalSession({
  customerId,
  returnUrl,
  configuration
}: CreatePortalSessionParams) {
  try {
    // Get Stripe customer ID
    const { data: customer } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', customerId)
      .single();

    if (!customer?.stripe_customer_id) {
      throw new Error('Customer not found in Stripe');
    }

    // Create Stripe portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: returnUrl,
      configuration
    });

    // Record session in database
    const { data: portalSession, error } = await supabase
      .from('customer_portal_sessions')
      .insert({
        customer_id: customerId,
        stripe_session_id: session.id,
        return_url: returnUrl,
        status: 'active',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      })
      .select()
      .single();

    if (error) throw error;

    return {
      url: session.url,
      sessionId: portalSession.id
    };
  } catch (error) {
    console.error('Error creating portal session:', error);
    throw error;
  }
}
```

### Customer Actions

1. Payment Methods:
```typescript
interface PaymentMethodActions {
  add: boolean;
  remove: boolean;
  update: boolean;
  setDefault: boolean;
}

async function configurePaymentMethodActions(
  customerId: string,
  actions: PaymentMethodActions
) {
  const { error } = await supabase
    .from('customer_portal_preferences')
    .upsert({
      customer_id: customerId,
      payment_method_actions: actions
    });

  if (error) throw error;
}
```

2. Subscription Management:
```typescript
interface SubscriptionActions {
  cancel: {
    enabled: boolean;
    retentionStrategy: 'none' | 'discount' | 'pause';
  };
  pause: {
    enabled: boolean;
    maxDuration: number;
  };
  update: {
    enabled: boolean;
    allowedChanges: ('price' | 'quantity' | 'frequency')[];
  };
}

async function configureSubscriptionActions(
  customerId: string,
  actions: SubscriptionActions
) {
  const { error } = await supabase
    .from('customer_portal_preferences')
    .upsert({
      customer_id: customerId,
      subscription_actions: actions
    });

  if (error) throw error;
}
```

3. Invoice Management:
```typescript
interface InvoiceActions {
  view: boolean;
  pay: boolean;
  download: boolean;
}

async function configureInvoiceActions(
  customerId: string,
  actions: InvoiceActions
) {
  const { error } = await supabase
    .from('customer_portal_preferences')
    .upsert({
      customer_id: customerId,
      invoice_actions: actions
    });

  if (error) throw error;
}
```

### Portal Event Handling

```typescript
// Event types for portal actions
type PortalEvent = {
  type: 
    | 'customer_portal.subscription_cancelled'
    | 'customer_portal.subscription_updated'
    | 'customer_portal.payment_method_updated'
    | 'customer_portal.invoice_paid';
  data: {
    object: {
      id: string;
      customer: string;
      subscription?: string;
      payment_method?: string;
      invoice?: string;
    };
  };
};

async function handlePortalEvent(event: PortalEvent) {
  switch (event.type) {
    case 'customer_portal.subscription_cancelled':
      await handleSubscriptionCancellation(event.data.object);
      break;
    case 'customer_portal.subscription_updated':
      await handleSubscriptionUpdate(event.data.object);
      break;
    case 'customer_portal.payment_method_updated':
      await handlePaymentMethodUpdate(event.data.object);
      break;
    case 'customer_portal.invoice_paid':
      await handleInvoicePayment(event.data.object);
      break;
  }
}
```

### Security Considerations

1. Access Control:
   - Validate customer identity
   - Enforce session expiration
   - Rate limit portal access
   - Monitor suspicious activity

2. Data Protection:
   - Encrypt sensitive data
   - Mask payment details
   - Secure session tokens
   - Log access attempts

3. Compliance:
   - PCI compliance
   - GDPR requirements
   - Data retention policies
   - Audit trail maintenance

### Best Practices

1. User Experience:
   - Clear navigation
   - Intuitive actions
   - Helpful error messages
   - Mobile responsiveness

2. Performance:
   - Optimize load times
   - Cache static content
   - Minimize API calls
   - Handle timeouts gracefully

3. Monitoring:
   - Track usage metrics
   - Monitor errors
   - Analyze user behavior
   - Set up alerts

### Testing Strategy

1. Test Cases:
   - Session creation
   - Payment updates
   - Subscription changes
   - Invoice management

2. Error Scenarios:
   - Invalid sessions
   - Failed payments
   - Network issues
   - Access violations

3. Integration Tests:
   - End-to-end flows
   - API responses
   - Webhook handling
   - Error recovery

### Deployment Checklist

1. Configuration:
   - Portal settings
   - Branding options
   - Feature flags
   - Environment variables

2. Validation:
   - Test credentials
   - Webhook endpoints
   - Return URLs
   - Error handling

3. Documentation:
   - User guides
   - API references
   - Troubleshooting
   - Support contacts


### Business Processes

## Testing Infrastructure

### Test Mode Configuration

```typescript
// Test mode environment setup
const testConfig = {
  stripe: {
    secretKey: process.env.STRIPE_TEST_SECRET_KEY,
    publishableKey: process.env.STRIPE_TEST_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_TEST_WEBHOOK_SECRET
  },
  supabase: {
    url: process.env.SUPABASE_TEST_URL,
    anonKey: process.env.SUPABASE_TEST_ANON_KEY,
    serviceRole: process.env.SUPABASE_TEST_SERVICE_ROLE
  }
};

// Test client initialization
const stripeTest = new Stripe(testConfig.stripe.secretKey, {
  apiVersion: '2023-10-16',
  maxNetworkRetries: 2,
  timeout: 20000
});
```

### Test Data Generators

```typescript
interface TestCustomer {
  email: string;
  name: string;
  paymentMethod?: string;
}

interface TestSubscription {
  customer: string;
  price: string;
  quantity?: number;
  trialPeriodDays?: number;
}

class TestDataGenerator {
  // Generate test customer
  async createTestCustomer(data?: Partial<TestCustomer>) {
    const defaultData = {
      email: `test.${Date.now()}@example.com`,
      name: `Test Customer ${Date.now()}`
    };

    const customerData = { ...defaultData, ...data };
    const customer = await stripeTest.customers.create(customerData);

    if (data?.paymentMethod) {
      await stripeTest.paymentMethods.attach(data.paymentMethod, {
        customer: customer.id
      });
    }

    return customer;
  }

  // Generate test card token
  async createTestCardToken(card = 'tok_visa') {
    return await stripeTest.tokens.create({
      card: { token: card }
    });
  }

  // Generate test subscription
  async createTestSubscription(data: TestSubscription) {
    return await stripeTest.subscriptions.create({
      customer: data.customer,
      items: [{ price: data.price, quantity: data.quantity || 1 }],
      trial_period_days: data.trialPeriodDays,
      payment_behavior: 'error_if_incomplete'
    });
  }

  // Generate test invoice
  async createTestInvoice(customer: string) {
    return await stripeTest.invoices.create({
      customer,
      collection_method: 'charge_automatically',
      auto_advance: true
    });
  }

  // Clean up test data
  async cleanup() {
    const customers = await stripeTest.customers.list({ limit: 100 });
    for (const customer of customers.data) {
      if (customer.email?.includes('test.')) {
        await stripeTest.customers.del(customer.id);
      }
    }
  }
}
```

### Webhook Testing Tools

```typescript
interface WebhookTestEvent {
  type: string;
  data: object;
}

class WebhookTestHandler {
  private webhookSecret: string;

  constructor(secret: string) {
    this.webhookSecret = secret;
  }

  // Generate webhook signature
  generateSignature(payload: string, timestamp: number): string {
    const signedPayload = `${timestamp}.${payload}`;
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');
  }

  // Create test webhook event
  async createTestEvent(event: WebhookTestEvent) {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: `evt_test_${Date.now()}`,
      object: 'event',
      api_version: '2023-10-16',
      created: timestamp,
      data: {
        object: event.data
      },
      livemode: false,
      pending_webhooks: 0,
      request: {
        id: null,
        idempotency_key: null
      },
      type: event.type
    });

    const signature = this.generateSignature(payload, timestamp);

    return {
      payload,
      headers: {
        'stripe-signature': `t=${timestamp},v1=${signature}`
      }
    };
  }

  // Simulate webhook delivery
  async simulateWebhook(url: string, event: WebhookTestEvent) {
    const { payload, headers } = await this.createTestEvent(event);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: payload
    });

    return {
      status: response.status,
      body: await response.json()
    };
  }
}
```

### Integration Test Suites

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'vitest';

describe('Stripe Integration Tests', () => {
  const testData = new TestDataGenerator();
  const webhookHandler = new WebhookTestHandler(testConfig.stripe.webhookSecret);

  beforeAll(async () => {
    // Set up test environment
    process.env.STRIPE_KEY = testConfig.stripe.secretKey;
    process.env.SUPABASE_URL = testConfig.supabase.url;
    process.env.SUPABASE_ANON_KEY = testConfig.supabase.anonKey;
  });

  afterAll(async () => {
    // Clean up test data
    await testData.cleanup();
  });

  describe('Customer Management', () => {
    test('should create and sync customer', async () => {
      const customer = await testData.createTestCustomer();
      const event = {
        type: 'customer.created',
        data: customer
      };

      const result = await webhookHandler.simulateWebhook(
        '/api/webhooks/stripe',
        event
      );

      expect(result.status).toBe(200);
      // Add more assertions
    });
  });

  describe('Payment Processing', () => {
    test('should process payment successfully', async () => {
      const customer = await testData.createTestCustomer();
      const token = await testData.createTestCardToken();
      
      const paymentIntent = await stripeTest.paymentIntents.create({
        amount: 2000,
        currency: 'usd',
        customer: customer.id,
        payment_method_types: ['card'],
        payment_method_data: {
          type: 'card',
          card: { token: token.id }
        },
        confirm: true
      });

      expect(paymentIntent.status).toBe('succeeded');
      // Add more assertions
    });
  });

  describe('Subscription Management', () => {
    test('should handle subscription lifecycle', async () => {
      const customer = await testData.createTestCustomer();
      const subscription = await testData.createTestSubscription({
        customer: customer.id,
        price: 'price_test_123'
      });

      expect(subscription.status).toBe('active');

      // Test subscription update
      const updated = await stripeTest.subscriptions.update(subscription.id, {
        metadata: { test: 'true' }
      });

      expect(updated.metadata.test).toBe('true');
      // Add more assertions
    });
  });

  describe('Webhook Processing', () => {
    test('should handle webhook events correctly', async () => {
      const events = [
        'payment_intent.succeeded',
        'invoice.paid',
        'customer.subscription.updated'
      ];

      for (const eventType of events) {
        const result = await webhookHandler.simulateWebhook(
          '/api/webhooks/stripe',
          {
            type: eventType,
            data: { id: `test_${Date.now()}` }
          }
        );

        expect(result.status).toBe(200);
        // Add event-specific assertions
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle failed payments appropriately', async () => {
      const customer = await testData.createTestCustomer();
      
      try {
        await stripeTest.paymentIntents.create({
          amount: 2000,
          currency: 'usd',
          customer: customer.id,
          payment_method: 'pm_card_declined',
          confirm: true
        });
      } catch (error) {
        expect(error.type).toBe('StripeCardError');
        // Add more error handling assertions
      }
    });
  });
});
```

### Test Environment Setup

## Monitoring & Alerting

### Critical Metrics

```typescript
// Key metrics to track
const CRITICAL_METRICS = {
  // Payment metrics
  payments: {
    success_rate: {
      threshold: 95, // Minimum 95% success rate
      window: '1h',  // Rolling 1-hour window
      alert: 'HIGH'
    },
    processing_time: {
      threshold: 5000, // Max 5s processing time
      window: '5m',    // 5-minute average
      alert: 'MEDIUM'
    },
    volume: {
      threshold: -30, // Alert on 30% drop
      window: '1h',   // Compare to previous hour
      alert: 'HIGH'
    }
  },

  // Error rates
  errors: {
    payment_failures: {
      threshold: 5,   // Max 5% failure rate
      window: '15m',  // 15-minute window
      alert: 'HIGH'
    },
    webhook_failures: {
      threshold: 3,   // Max 3 consecutive failures
      window: '5m',   // Within 5 minutes
      alert: 'HIGH'
    },
    api_errors: {
      threshold: 10,  // Max 10 errors
      window: '5m',   // In 5 minutes
      alert: 'MEDIUM'
    }
  },

  // System health
  system: {
    api_latency: {
      threshold: 1000, // Max 1s response time
      window: '5m',    // 5-minute average
      alert: 'HIGH'
    },
    webhook_latency: {
      threshold: 3000, // Max 3s processing time
      window: '5m',    // 5-minute average
      alert: 'MEDIUM'
    }
  }
};
```

### Alert Thresholds

```typescript
// Alert configuration
interface AlertConfig {
  name: string;
  description: string;
  query: string;
  threshold: number;
  window: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  channels: string[];
  cooldown: number;
}

const alertConfigs: AlertConfig[] = [
  {
    name: 'High Payment Failure Rate',
    description: 'Payment failure rate exceeds threshold',
    query: `
      rate(stripe_payment_failures_total[15m])
      / 
      rate(stripe_payment_attempts_total[15m])
      * 100
    `,
    threshold: 5,
    window: '15m',
    severity: 'HIGH',
    channels: ['slack-urgent', 'pagerduty'],
    cooldown: 900 // 15 minutes
  },
  {
    name: 'Webhook Processing Delays',
    description: 'Webhook processing time exceeds threshold',
    query: `
      avg_over_time(stripe_webhook_processing_duration_seconds[5m])
      > 3
    `,
    threshold: 3,
    window: '5m',
    severity: 'MEDIUM',
    channels: ['slack-alerts'],
    cooldown: 300 // 5 minutes
  },
  {
    name: 'API Error Spike',
    description: 'Unusual spike in API errors',
    query: `
      sum(rate(stripe_api_errors_total[5m]))
      > 10
    `,
    threshold: 10,
    window: '5m',
    severity: 'HIGH',
    channels: ['slack-urgent', 'pagerduty'],
    cooldown: 300 // 5 minutes
  }
];
```

### Monitoring Dashboards

```typescript
// Dashboard configuration
interface DashboardPanel {
  title: string;
  description: string;
  query: string;
  type: 'graph' | 'gauge' | 'stat';
  unit?: string;
  thresholds?: {
    warning: number;
    critical: number;
  };
}

const dashboardPanels: DashboardPanel[] = [
  // Payment Overview
  {
    title: 'Payment Success Rate',
    description: 'Percentage of successful payments',
    query: `
      sum(rate(stripe_payment_success_total[1h]))
      /
      sum(rate(stripe_payment_attempts_total[1h]))
      * 100
    `,
    type: 'gauge',
    unit: '%',
    thresholds: {
      warning: 97,
      critical: 95
    }
  },
  {
    title: 'Payment Volume',
    description: 'Total payment volume over time',
    query: `
      sum(rate(stripe_payment_amount_total[5m]))
    `,
    type: 'graph',
    unit: 'USD'
  },
  
  // Error Tracking
  {
    title: 'Error Rate by Type',
    description: 'Error distribution by category',
    query: `
      sum by (error_type) (
        rate(stripe_errors_total[5m])
      )
    `,
    type: 'graph'
  },
  
  // System Health
  {
    title: 'API Latency',
    description: 'Average API response time',
    query: `
      avg(rate(stripe_api_duration_seconds_sum[5m])
      /
      rate(stripe_api_duration_seconds_count[5m]))
    `,
    type: 'graph',
    unit: 'seconds',
    thresholds: {
      warning: 0.5,
      critical: 1.0
    }
  }
];
```

### Error Tracking

```typescript
// Error tracking implementation
interface StripeError {
  type: string;
  code: string;
  message: string;
  decline_code?: string;
  param?: string;
}

class ErrorTracker {
  private static instance: ErrorTracker;
  private errorStore: Map<string, number>;
  private readonly flushInterval = 60000; // 1 minute

  private constructor() {
    this.errorStore = new Map();
    setInterval(() => this.flush(), this.flushInterval);
  }

  static getInstance(): ErrorTracker {
    if (!ErrorTracker.instance) {
      ErrorTracker.instance = new ErrorTracker();
    }
    return ErrorTracker.instance;
  }

  // Track Stripe errors
  trackStripeError(error: StripeError) {
    const errorKey = `stripe_error_${error.type}_${error.code}`;
    const currentCount = this.errorStore.get(errorKey) || 0;
    this.errorStore.set(errorKey, currentCount + 1);

    // Report to monitoring system
    this.reportMetric({
      name: 'stripe_errors_total',
      value: 1,
      labels: {
        type: error.type,
        code: error.code,
        decline_code: error.decline_code || 'none'
      }
    });

    // Check for critical errors
    if (this.isCriticalError(error)) {
      this.triggerAlert({
        name: 'critical_stripe_error',
        error,
        count: currentCount + 1
      });
    }
  }

  // Track webhook errors
  trackWebhookError(event: string, error: Error) {
    const errorKey = `webhook_error_${event}`;
    const currentCount = this.errorStore.get(errorKey) || 0;
    this.errorStore.set(errorKey, currentCount + 1);

    this.reportMetric({
      name: 'stripe_webhook_errors_total',
      value: 1,
      labels: {
        event,
        error: error.message
      }
    });
  }

  // Check if error is critical
  private isCriticalError(error: StripeError): boolean {
    const criticalTypes = [
      'authentication_error',
      'api_connection_error',
      'rate_limit_error'
    ];

    return criticalTypes.includes(error.type) ||
           error.code === 'lock_timeout' ||
           error.code === 'idempotency_error';
  }

  // Report metrics to monitoring system
  private reportMetric(metric: {
    name: string;
    value: number;
    labels: Record<string, string>;
  }) {
    // Implementation depends on monitoring system
    // Example using Prometheus
    if (typeof window === 'undefined') {
      const { register } = require('prom-client');
      const counter = register.getSingleMetric(metric.name) ||
        new register.Counter({
          name: metric.name,
          help: `Counter for ${metric.name}`,
          labelNames: Object.keys(metric.labels)
        });

      counter.inc(metric.labels, metric.value);
    }
  }

  // Trigger alerts
  private triggerAlert(alert: {
    name: string;
    error: StripeError;
    count: number;
  }) {
    // Implementation depends on alerting system
    // Example using webhook
    fetch('/api/alerts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: alert.name,
        error: alert.error,
        count: alert.count,
        timestamp: new Date().toISOString()
      })
    }).catch(console.error);
  }

  // Flush metrics to persistent storage
  private async flush() {
    const metrics = Array.from(this.errorStore.entries())
      .map(([key, value]) => ({
        name: key,
        count: value,
        timestamp: new Date().toISOString()
      }));

    try {
      await fetch('/api/metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metrics)
      });

      this.errorStore.clear();
    } catch (error) {
      console.error('Failed to flush metrics:', error);
    }
  }
}

// Usage example
const errorTracker = ErrorTracker.getInstance();

try {
  // Stripe operation
} catch (error) {
  errorTracker.trackStripeError(error);
}
```

1. Create test configuration file:
```bash
# .env.test
STRIPE_TEST_SECRET_KEY=sk_test_...
STRIPE_TEST_PUBLISHABLE_KEY=pk_test_...
STRIPE_TEST_WEBHOOK_SECRET=whsec_test_...

SUPABASE_TEST_URL=https://your-test-project.supabase.co
SUPABASE_TEST_ANON_KEY=your-test-anon-key
SUPABASE_TEST_SERVICE_ROLE=your-test-service-role-key
```

2. Configure test runner:
```typescript
// vitest.config.ts
export default {
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/global-setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['test/**/*', 'node_modules/**/*']
    }
  }
};
```

3. Create test utilities:
```typescript
// test/setup.ts
import { beforeAll, afterAll } from 'vitest';
import { loadEnvConfig } from '@next/env';

beforeAll(async () => {
  // Load test environment variables
  loadEnvConfig(process.cwd(), true);
});

afterAll(async () => {
  // Clean up test resources
});
```

1. Payment Flows:
   - Customer journey
   - Provider experience
   - Admin controls

2. Operational Procedures:
   - Issue resolution
   - Refund policy
   - Support escalation

# Stripe Integration Design

## Overview

The payment system will support:
1. One-time payments for individual services
2. Subscription-based recurring services
3. Automated scheduling for fixed-interval services
4. Secure payment processing and storage
5. Payment history and invoicing
6. Provider payouts and platform fees
7. Partial payments and deposits
8. Refund management

## Core Components

### Database Schema Extensions

```sql
-- Extend bookings table safely
ALTER TABLE bookings
ADD COLUMN payment_status text,
ADD COLUMN payment_required_at timestamptz,
ADD COLUMN deposit_amount decimal(10,2) CHECK (deposit_amount >= 0),
ADD COLUMN deposit_paid boolean DEFAULT false,
ADD COLUMN subscription_booking boolean DEFAULT false,
ADD COLUMN subscription_id uuid,
ADD COLUMN platform_fee decimal(10,2) CHECK (platform_fee >= 0),
ADD COLUMN provider_payout_amount decimal(10,2) CHECK (provider_payout_amount >= 0),
ADD COLUMN stripe_payment_intent_id text,
ADD CONSTRAINT valid_payment_status CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded')),
ADD CONSTRAINT valid_payment_timing CHECK (payment_required_at >= created_at);

-- Add indexes for payment-related queries
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX idx_bookings_payment_required_at ON bookings(payment_required_at);
CREATE INDEX idx_bookings_subscription_id ON bookings(subscription_id);
CREATE INDEX idx_bookings_stripe_payment_intent_id ON bookings(stripe_payment_intent_id);

-- Provider payouts
CREATE TABLE provider_payouts (
  id uuid PRIMARY KEY,
  provider_id uuid,
  amount decimal(10,2),
  status text,
  stripe_payout_id text,
  created_at timestamptz
);

-- Payment audit log
CREATE TABLE payment_audit_log (
  id uuid PRIMARY KEY,
  booking_id uuid,
  subscription_id uuid,
  event_type text,
  amount decimal(10,2),
  metadata jsonb
);

-- Add subscription plans table
CREATE TABLE subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  service_id uuid REFERENCES provider_services(id) NOT NULL,
  name text NOT NULL,
  description text,
  interval text NOT NULL CHECK (interval IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  price decimal(10,2) NOT NULL CHECK (price >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, service_id, interval)
);

-- Add migration procedure for existing bookings
CREATE OR REPLACE FUNCTION migrate_existing_bookings()
RETURNS void AS $$
BEGIN
  -- Set default values for existing bookings
  UPDATE bookings
  SET
    payment_status = CASE 
      WHEN status = 'completed' THEN 'paid'
      WHEN status = 'cancelled' THEN 'refunded'
      ELSE 'pending'
    END,
    payment_required_at = scheduled_date - interval '1 day',
    platform_fee = total_price * 0.10, -- Example: 10% platform fee
    provider_payout_amount = total_price * 0.90 -- Example: 90% provider payout
  WHERE payment_status IS NULL;
END;
$$ LANGUAGE plpgsql;
```

[... rest of the original content remains the same ...]

## Reporting System

### Financial Reports

```typescript
// Report types and interfaces
type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
type ReportFormat = 'csv' | 'pdf' | 'json';

interface ReportConfig {
  period: ReportPeriod;
  startDate: Date;
  endDate: Date;
  format: ReportFormat;
  filters?: {
    serviceTypes?: string[];
    providers?: string[];
    status?: string[];
  };
}

class FinancialReportGenerator {
  // Generate comprehensive financial report
  async generateReport(config: ReportConfig) {
    const data = await this.gatherReportData(config);
    const report = this.processReportData(data);
    return this.formatReport(report, config.format);
  }

  // Gather financial data from Stripe
  private async gatherReportData(config: ReportConfig) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Fetch payments
    const payments = await stripe.paymentIntents.list({
      created: {
        gte: Math.floor(config.startDate.getTime() / 1000),
        lte: Math.floor(config.endDate.getTime() / 1000)
      },
      limit: 100
    });

    // Fetch refunds
    const refunds = await stripe.refunds.list({
      created: {
        gte: Math.floor(config.startDate.getTime() / 1000),
        lte: Math.floor(config.endDate.getTime() / 1000)
      },
      limit: 100
    });

    // Fetch disputes
    const disputes = await stripe.disputes.list({
      created: {
        gte: Math.floor(config.startDate.getTime() / 1000),
        lte: Math.floor(config.endDate.getTime() / 1000)
      },
      limit: 100
    });

    return { payments, refunds, disputes };
  }

  // Process and analyze financial data
  private processReportData(data: any) {
    return {
      summary: this.generateSummary(data),
      transactions: this.processTransactions(data),
      metrics: this.calculateMetrics(data)
    };
  }

  // Generate financial summary
  private generateSummary(data: any) {
    const { payments, refunds, disputes } = data;
    
    return {
      totalRevenue: this.calculateTotalRevenue(payments),
      netRevenue: this.calculateNetRevenue(payments, refunds),
      refundRate: this.calculateRefundRate(payments, refunds),
      disputeRate: this.calculateDisputeRate(payments, disputes),
      averageTransactionValue: this.calculateAverageTransactionValue(payments)
    };
  }

  // Format report based on requested format
  private formatReport(report: any, format: ReportFormat) {
    switch (format) {
      case 'csv':
        return this.generateCSV(report);
      case 'pdf':
        return this.generatePDF(report);
      case 'json':
        return JSON.stringify(report, null, 2);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}
```

# Stripe Integration Design

## Overview

The payment system will support:
1. One-time payments for individual services
2. Subscription-based recurring services
3. Automated scheduling for fixed-interval services
4. Secure payment processing and storage
5. Payment history and invoicing
6. Provider payouts and platform fees
7. Partial payments and deposits
8. Refund management

## Core Components

### Database Schema Extensions

```sql
-- Extend bookings table safely
ALTER TABLE bookings
ADD COLUMN payment_status text,
ADD COLUMN payment_required_at timestamptz,
ADD COLUMN deposit_amount decimal(10,2) CHECK (deposit_amount >= 0),
ADD COLUMN deposit_paid boolean DEFAULT false,
ADD COLUMN subscription_booking boolean DEFAULT false,
ADD COLUMN subscription_id uuid,
ADD COLUMN platform_fee decimal(10,2) CHECK (platform_fee >= 0),
ADD COLUMN provider_payout_amount decimal(10,2) CHECK (provider_payout_amount >= 0),
ADD COLUMN stripe_payment_intent_id text,
ADD CONSTRAINT valid_payment_status CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded')),
ADD CONSTRAINT valid_payment_timing CHECK (payment_required_at >= created_at);

-- Add indexes for payment-related queries
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX idx_bookings_payment_required_at ON bookings(payment_required_at);
CREATE INDEX idx_bookings_subscription_id ON bookings(subscription_id);
CREATE INDEX idx_bookings_stripe_payment_intent_id ON bookings(stripe_payment_intent_id);

-- Provider payouts
CREATE TABLE provider_payouts (
  id uuid PRIMARY KEY,
  provider_id uuid,
  amount decimal(10,2),
  status text,
  stripe_payout_id text,
  created_at timestamptz
);

-- Payment audit log
CREATE TABLE payment_audit_log (
  id uuid PRIMARY KEY,
  booking_id uuid,
  subscription_id uuid,
  event_type text,
  amount decimal(10,2),
  metadata jsonb
);

-- Add subscription plans table
CREATE TABLE subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  service_id uuid REFERENCES provider_services(id) NOT NULL,
  name text NOT NULL,
  description text,
  interval text NOT NULL CHECK (interval IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  price decimal(10,2) NOT NULL CHECK (price >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, service_id, interval)
);

-- Add migration procedure for existing bookings
CREATE OR REPLACE FUNCTION migrate_existing_bookings()
RETURNS void AS $$
BEGIN
  -- Set default values for existing bookings
  UPDATE bookings
  SET
    payment_status = CASE 
      WHEN status = 'completed' THEN 'paid'
      WHEN status = 'cancelled' THEN 'refunded'
      ELSE 'pending'
    END,
    payment_required_at = scheduled_date - interval '1 day',
    platform_fee = total_price * 0.10, -- Example: 10% platform fee
    provider_payout_amount = total_price * 0.90 -- Example: 90% provider payout
  WHERE payment_status IS NULL;
END;
$$ LANGUAGE plpgsql;
```

[... rest of the original content remains the same ...]

## Reporting System

### Financial Reports

```typescript
// Report types and interfaces
type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
type ReportFormat = 'csv' | 'pdf' | 'json';

interface ReportConfig {
  period: ReportPeriod;
  startDate: Date;
  endDate: Date;
  format: ReportFormat;
  filters?: {
    serviceTypes?: string[];
    providers?: string[];
    status?: string[];
  };
}

class FinancialReportGenerator {
  // Generate comprehensive financial report
  async generateReport(config: ReportConfig) {
    const data = await this.gatherReportData(config);
    const report = this.processReportData(data);
    return this.formatReport(report, config.format);
  }

  // Gather financial data from Stripe
  private async gatherReportData(config: ReportConfig) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Fetch payments
    const payments = await stripe.paymentIntents.list({
      created: {
        gte: Math.floor(config.startDate.getTime() / 1000),
        lte: Math.floor(config.endDate.getTime() / 1000)
      },
      limit: 100
    });

    // Fetch refunds
    const refunds = await stripe.refunds.list({
      created: {
        gte: Math.floor(config.startDate.getTime() / 1000),
        lte: Math.floor(config.endDate.getTime() / 1000)
      },
      limit: 100
    });

    // Fetch disputes
    const disputes = await stripe.disputes.list({
      created: {
        gte: Math.floor(config.startDate.getTime() / 1000),
        lte: Math.floor(config.endDate.getTime() / 1000)
      },
      limit: 100
    });

    return { payments, refunds, disputes };
  }

  // Process and analyze financial data
  private processReportData(data: any) {
    return {
      summary: this.generateSummary(data),
      transactions: this.processTransactions(data),
      metrics: this.calculateMetrics(data)
    };
  }

  // Generate financial summary
  private generateSummary(data: any) {
    const { payments, refunds, disputes } = data;
    
    return {
      totalRevenue: this.calculateTotalRevenue(payments),
      netRevenue: this.calculateNetRevenue(payments, refunds),
      refundRate: this.calculateRefundRate(payments, refunds),
      disputeRate: this.calculateDisputeRate(payments, disputes),
      averageTransactionValue: this.calculateAverageTransactionValue(payments)
    };
  }

  // Format report based on requested format
  private formatReport(report: any, format: ReportFormat) {
    switch (format) {
      case 'csv':
        return this.generateCSV(report);
      case 'pdf':
        return this.generatePDF(report);
      case 'json':
        return JSON.stringify(report, null, 2);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}
```

## Dispute Management UI

### Dispute Interface Components

```typescript
// Types for dispute management
interface DisputeEvidence {
  id: string;
  disputeId: string;
  type: 'receipt' | 'service_documentation' | 'customer_communication' | 'refund_policy' | 'service_description' | 'other';
  fileUrl: string;
  uploadedAt: Date;
  metadata: {
    fileName: string;
    fileSize: number;
    mimeType: string;
  };
}

interface DisputeDetails {
  id: string;
  amount: number;
  currency: string;
  status: 'needs_response' | 'under_review' | 'won' | 'lost';
  reason: 'service_not_provided' | 'duplicate' | 'fraudulent' | 'other';
  evidence_details: {
    due_by: Date;
    has_evidence: boolean;
    past_due: boolean;
  };
  metadata: Record<string, any>;
}

// Dispute management interface
class DisputeManagementUI {
  // Initialize dispute handling interface
  constructor(private stripe: Stripe) {}

  // Render dispute dashboard
  async renderDashboard() {
    const disputes = await this.fetchDisputes();
    return {
      activeDisputes: this.filterActiveDisputes(disputes),
      pastDisputes: this.filterPastDisputes(disputes),
      metrics: this.calculateDisputeMetrics(disputes)
    };
  }

  // Handle new dispute
  async handleNewDispute(disputeId: string) {
    const dispute = await this.stripe.disputes.retrieve(disputeId);
    await this.notifyRelevantParties(dispute);
    return this.createDisputeResponse(dispute);
  }

  // Generate dispute response template
  private createDisputeResponse(dispute: DisputeDetails) {
    return {
      evidenceRequired: this.determineRequiredEvidence(dispute),
      responseTemplate: this.generateResponseTemplate(dispute),
      deadlines: this.calculateDeadlines(dispute)
    };
  }
}
```

### Evidence Upload System

```typescript
// Evidence upload handler
class DisputeEvidenceUploader {
  private readonly ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // Handle file upload
  async uploadEvidence(disputeId: string, file: File): Promise<DisputeEvidence> {
    this.validateFile(file);
    
    // Generate secure upload URL
    const uploadUrl = await this.getSecureUploadUrl(disputeId, file.name);
    
    // Upload file
    const fileUrl = await this.uploadFileToStorage(uploadUrl, file);
    
    // Create evidence record
    return this.createEvidenceRecord(disputeId, fileUrl, file);
  }

  // Validate file before upload
  private validateFile(file: File) {
    if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
      throw new Error('Invalid file type');
    }
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error('File too large');
    }
  }

  // Upload file to secure storage
  private async uploadFileToStorage(uploadUrl: string, file: File): Promise<string> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type
      }
    });

    if (!response.ok) {
      throw new Error('Failed to upload file');
    }

    return uploadUrl.split('?')[0]; // Return clean URL without query params
  }
}
```

### Dispute Response Workflow

```typescript
// Dispute response workflow manager
class DisputeResponseWorkflow {
  // Initialize workflow
  constructor(
    private disputeId: string,
    private stripe: Stripe,
    private evidenceUploader: DisputeEvidenceUploader
  ) {}

  // Start dispute response process
  async startResponseProcess() {
    const dispute = await this.stripe.disputes.retrieve(this.disputeId);
    return this.createWorkflowSteps(dispute);
  }

  // Create workflow steps
  private createWorkflowSteps(dispute: DisputeDetails) {
    return [
      {
        id: 'gather_evidence',
        title: 'Gather Evidence',
        required: true,
        status: 'pending',
        action: () => this.gatherEvidence(dispute)
      },
      {
        id: 'prepare_response',
        title: 'Prepare Response',
        required: true,
        status: 'pending',
        action: () => this.prepareResponse(dispute)
      },
      {
        id: 'submit_response',
        title: 'Submit Response',
        required: true,
        status: 'pending',
        action: () => this.submitResponse(dispute)
      }
    ];
  }

  // Submit dispute response
  private async submitResponse(dispute: DisputeDetails) {
    const evidence = await this.collectEvidence(dispute.id);
    const response = await this.formatResponse(evidence);
    
    return this.stripe.disputes.update(dispute.id, {
      evidence: response
    });
  }
}
```

### Dispute Tracking System

```typescript
// Dispute tracking system
class DisputeTracker {
  // Initialize tracker
  constructor(private stripe: Stripe) {}

  // Track dispute status
  async trackDispute(disputeId: string) {
    const dispute = await this.stripe.disputes.retrieve(disputeId);
    return this.createTrackingRecord(dispute);
  }

  // Create tracking record
  private createTrackingRecord(dispute: DisputeDetails) {
    return {
      id: dispute.id,
      status: dispute.status,
      amount: dispute.amount,
      currency: dispute.currency,
      dueDate: dispute.evidence_details.due_by,
      timeRemaining: this.calculateTimeRemaining(dispute.evidence_details.due_by),
      evidenceSubmitted: dispute.evidence_details.has_evidence,
      isPastDue: dispute.evidence_details.past_due
    };
  }

  // Calculate time remaining
  private calculateTimeRemaining(dueDate: Date): string {
    const now = new Date();
    const timeLeft = dueDate.getTime() - now.getTime();
    
    if (timeLeft <= 0) {
      return 'Past Due';
    }
    
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days}d ${hours}h remaining`;
  }

  // Get dispute analytics
  async getDisputeAnalytics() {
    const disputes = await this.stripe.disputes.list();
    
    return {
      total: disputes.data.length,
      activeDisputes: disputes.data.filter(d => d.status === 'needs_response').length,
      wonDisputes: disputes.data.filter(d => d.status === 'won').length,
      lostDisputes: disputes.data.filter(d => d.status === 'lost').length,
      disputeRate: this.calculateDisputeRate(disputes.data),
      averageResponseTime: this.calculateAverageResponseTime(disputes.data)
    };
  }
}

# Stripe Integration Design

## Overview

The payment system will support:
1. One-time payments for individual services
2. Subscription-based recurring services
3. Automated scheduling for fixed-interval services
4. Secure payment processing and storage
5. Payment history and invoicing
6. Provider payouts and platform fees
7. Partial payments and deposits
8. Refund management

## Core Components

### Database Schema Extensions

```sql
-- Extend bookings table safely
ALTER TABLE bookings
ADD COLUMN payment_status text,
ADD COLUMN payment_required_at timestamptz,
ADD COLUMN deposit_amount decimal(10,2) CHECK (deposit_amount >= 0),
ADD COLUMN deposit_paid boolean DEFAULT false,
ADD COLUMN subscription_booking boolean DEFAULT false,
ADD COLUMN subscription_id uuid,
ADD COLUMN platform_fee decimal(10,2) CHECK (platform_fee >= 0),
ADD COLUMN provider_payout_amount decimal(10,2) CHECK (provider_payout_amount >= 0),
ADD COLUMN stripe_payment_intent_id text,
ADD CONSTRAINT valid_payment_status CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded')),
ADD CONSTRAINT valid_payment_timing CHECK (payment_required_at >= created_at);

-- Add indexes for payment-related queries
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX idx_bookings_payment_required_at ON bookings(payment_required_at);
CREATE INDEX idx_bookings_subscription_id ON bookings(subscription_id);
CREATE INDEX idx_bookings_stripe_payment_intent_id ON bookings(stripe_payment_intent_id);

-- Provider payouts
CREATE TABLE provider_payouts (
  id uuid PRIMARY KEY,
  provider_id uuid,
  amount decimal(10,2),
  status text,
  stripe_payout_id text,
  created_at timestamptz
);

-- Payment audit log
CREATE TABLE payment_audit_log (
  id uuid PRIMARY KEY,
  booking_id uuid,
  subscription_id uuid,
  event_type text,
  amount decimal(10,2),
  metadata jsonb
);

-- Add subscription plans table
CREATE TABLE subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) NOT NULL,
  service_id uuid REFERENCES provider_services(id) NOT NULL,
  name text NOT NULL,
  description text,
  interval text NOT NULL CHECK (interval IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  price decimal(10,2) NOT NULL CHECK (price >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, service_id, interval)
);

-- Add migration procedure for existing bookings
CREATE OR REPLACE FUNCTION migrate_existing_bookings()
RETURNS void AS $$
BEGIN
  -- Set default values for existing bookings
  UPDATE bookings
  SET
    payment_status = CASE 
      WHEN status = 'completed' THEN 'paid'
      WHEN status = 'cancelled' THEN 'refunded'
      ELSE 'pending'
    END,
    payment_required_at = scheduled_date - interval '1 day',
    platform_fee = total_price * 0.10, -- Example: 10% platform fee
    provider_payout_amount = total_price * 0.90 -- Example: 90% provider payout
  WHERE payment_status IS NULL;
END;
$$ LANGUAGE plpgsql;
```

[... rest of the original content remains the same ...]

## Reporting System

### Financial Reports

```typescript
// Report types and interfaces
type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
type ReportFormat = 'csv' | 'pdf' | 'json';

interface ReportConfig {
  period: ReportPeriod;
  startDate: Date;
  endDate: Date;
  format: ReportFormat;
  filters?: {
    serviceTypes?: string[];
    providers?: string[];
    status?: string[];
  };
}

class FinancialReportGenerator {
  // Generate comprehensive financial report
  async generateReport(config: ReportConfig) {
    const data = await this.gatherReportData(config);
    const report = this.processReportData(data);
    return this.formatReport(report, config.format);
  }

  // Gather financial data from Stripe
  private async gatherReportData(config: ReportConfig) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Fetch payments
    const payments = await stripe.paymentIntents.list({
      created: {
        gte: Math.floor(config.startDate.getTime() / 1000),
        lte: Math.floor(config.endDate.getTime() / 1000)
      },
      limit: 100
    });

    // Fetch refunds
    const refunds = await stripe.refunds.list({
      created: {
        gte: Math.floor(config.startDate.getTime() / 1000),
        lte: Math.floor(config.endDate.getTime() / 1000)
      },
      limit: 100
    });

    // Fetch disputes
    const disputes = await stripe.disputes.list({
      created: {
        gte: Math.floor(config.startDate.getTime() / 1000),
        lte: Math.floor(config.endDate.getTime() / 1000)
      },
      limit: 100
    });

    return { payments, refunds, disputes };
  }

  // Process and analyze financial data
  private processReportData(data: any) {
    return {
      summary: this.generateSummary(data),
      transactions: this.processTransactions(data),
      metrics: this.calculateMetrics(data)
    };
  }

  // Generate financial summary
  private generateSummary(data: any) {
    const { payments, refunds, disputes } = data;
    
    return {
      totalRevenue: this.calculateTotalRevenue(payments),
      netRevenue: this.calculateNetRevenue(payments, refunds),
      refundRate: this.calculateRefundRate(payments, refunds),
      disputeRate: this.calculateDisputeRate(payments, disputes),
      averageTransactionValue: this.calculateAverageTransactionValue(payments)
    };
  }

  // Format report based on requested format
  private formatReport(report: any, format: ReportFormat) {
    switch (format) {
      case 'csv':
        return this.generateCSV(report);
      case 'pdf':
        return this.generatePDF(report);
      case 'json':
        return JSON.stringify(report, null, 2);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}
```

## Dispute Management UI

### Dispute Interface Components

```typescript
// Types for dispute management
interface DisputeEvidence {
  id: string;
  disputeId: string;
  type: 'receipt' | 'service_documentation' | 'customer_communication' | 'refund_policy' | 'service_description' | 'other';
  fileUrl: string;
  uploadedAt: Date;
  metadata: {
    fileName: string;
    fileSize: number;
    mimeType: string;
  };
}

interface DisputeDetails {
  id: string;
  amount: number;
  currency: string;
  status: 'needs_response' | 'under_review' | 'won' | 'lost';
  reason: 'service_not_provided' | 'duplicate' | 'fraudulent' | 'other';
  evidence_details: {
    due_by: Date;
    has_evidence: boolean;
    past_due: boolean;
  };
  metadata: Record<string, any>;
}

// Dispute management interface
class DisputeManagementUI {
  // Initialize dispute handling interface
  constructor(private stripe: Stripe) {}

  // Render dispute dashboard
  async renderDashboard() {
    const disputes = await this.fetchDisputes();
    return {
      activeDisputes: this.filterActiveDisputes(disputes),
      pastDisputes: this.filterPastDisputes(disputes),
      metrics: this.calculateDisputeMetrics(disputes)
    };
  }

  // Handle new dispute
  async handleNewDispute(disputeId: string) {
    const dispute = await this.stripe.disputes.retrieve(disputeId);
    await this.notifyRelevantParties(dispute);
    return this.createDisputeResponse(dispute);
  }

  // Generate dispute response template
  private createDisputeResponse(dispute: DisputeDetails) {
    return {
      evidenceRequired: this.determineRequiredEvidence(dispute),
      responseTemplate: this.generateResponseTemplate(dispute),
      deadlines: this.calculateDeadlines(dispute)
    };
  }
}
```

### Evidence Upload System

```typescript
// Evidence upload handler
class DisputeEvidenceUploader {
  private readonly ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // Handle file upload
  async uploadEvidence(disputeId: string, file: File): Promise<DisputeEvidence> {
    this.validateFile(file);
    
    // Generate secure upload URL
    const uploadUrl = await this.getSecureUploadUrl(disputeId, file.name);
    
    // Upload file
    const fileUrl = await this.uploadFileToStorage(uploadUrl, file);
    
    // Create evidence record
    return this.createEvidenceRecord(disputeId, fileUrl, file);
  }

  // Validate file before upload
  private validateFile(file: File) {
    if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
      throw new Error('Invalid file type');
    }
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error('File too large');
    }
  }

  // Upload file to secure storage
  private async uploadFileToStorage(uploadUrl: string, file: File): Promise<string> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type
      }
    });

    if (!response.ok) {
      throw new Error('Failed to upload file');
    }

    return uploadUrl.split('?')[0]; // Return clean URL without query params
  }
}
```

### Dispute Response Workflow

```typescript
// Dispute response workflow manager
class DisputeResponseWorkflow {
  // Initialize workflow
  constructor(
    private disputeId: string,
    private stripe: Stripe,
    private evidenceUploader: DisputeEvidenceUploader
  ) {}

  // Start dispute response process
  async startResponseProcess() {
    const dispute = await this.stripe.disputes.retrieve(this.disputeId);
    return this.createWorkflowSteps(dispute);
  }

  // Create workflow steps
  private createWorkflowSteps(dispute: DisputeDetails) {
    return [
      {
        id: 'gather_evidence',
        title: 'Gather Evidence',
        required: true,
        status: 'pending',
        action: () => this.gatherEvidence(dispute)
      },
      {
        id: 'prepare_response',
        title: 'Prepare Response',
        required: true,
        status: 'pending',
        action: () => this.prepareResponse(dispute)
      },
      {
        id: 'submit_response',
        title: 'Submit Response',
        required: true,
        status: 'pending',
        action: () => this.submitResponse(dispute)
      }
    ];
  }

  // Submit dispute response
  private async submitResponse(dispute: DisputeDetails) {
    const evidence = await this.collectEvidence(dispute.id);
    const response = await this.formatResponse(evidence);
    
    return this.stripe.disputes.update(dispute.id, {
      evidence: response
    });
  }
}
```

### Dispute Tracking System

```typescript
// Dispute tracking system
class DisputeTracker {
  // Initialize tracker
  constructor(private stripe: Stripe) {}

  // Track dispute status
  async trackDispute(disputeId: string) {
    const dispute = await this.stripe.disputes.retrieve(disputeId);
    return this.createTrackingRecord(dispute);
  }

  // Create tracking record
  private createTrackingRecord(dispute: DisputeDetails) {
    return {
      id: dispute.id,
      status: dispute.status,
      amount: dispute.amount,
      currency: dispute.currency,
      dueDate: dispute.evidence_details.due_by,
      timeRemaining: this.calculateTimeRemaining(dispute.evidence_details.due_by),
      evidenceSubmitted: dispute.evidence_details.has_evidence,
      isPastDue: dispute.evidence_details.past_due
    };
  }

  // Calculate time remaining
  private calculateTimeRemaining(dueDate: Date): string {
    const now = new Date();
    const timeLeft = dueDate.getTime() - now.getTime();
    
    if (timeLeft <= 0) {
      return 'Past Due';
    }
    
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days}d ${hours}h remaining`;
  }

  // Get dispute analytics
  async getDisputeAnalytics() {
    const disputes = await this.stripe.disputes.list();
    
    return {
      total: disputes.data.length,
      activeDisputes: disputes.data.filter(d => d.status === 'needs_response').length,
      wonDisputes: disputes.data.filter(d => d.status === 'won').length,
      lostDisputes: disputes.data.filter(d => d.status === 'lost').length,
      disputeRate: this.calculateDisputeRate(disputes.data),
      averageResponseTime: this.calculateAverageResponseTime(disputes.data)
    };
  }
}
```

## Provider Dashboard Enhancements

### Payout Reports

```typescript
// Payout report generator
class PayoutReportGenerator {
  constructor(private stripe: Stripe) {}

  // Generate comprehensive payout report
  async generatePayoutReport(providerId: string, dateRange: DateRange) {
    const payouts = await this.fetchPayoutData(providerId, dateRange);
    return {
      summary: this.generatePayoutSummary(payouts),
      details: this.generatePayoutDetails(payouts),
      trends: this.analyzePayoutTrends(payouts)
    };
  }

  // Generate detailed payout summary
  private generatePayoutSummary(payouts: any[]) {
    return {
      totalPaidOut: this.calculateTotalPayouts(payouts),
      pendingPayouts: this.calculatePendingPayouts(payouts),
      nextPayoutEstimate: this.estimateNextPayout(payouts),
      payoutFrequency: this.determinePayoutFrequency(payouts),
      averagePayoutAmount: this.calculateAveragePayoutAmount(payouts)
    };
  }

  // Generate payout details with transaction breakdown
  private generatePayoutDetails(payouts: any[]) {
    return payouts.map(payout => ({
      id: payout.id,
      amount: payout.amount,
      status: payout.status,
      arrivalDate: payout.arrival_date,
      transactions: this.getPayoutTransactions(payout.id),
      fees: this.calculatePayoutFees(payout),
      metadata: payout.metadata
    }));
  }
}

### Earnings Analytics

```typescript
// Earnings analytics system
class EarningsAnalytics {
  constructor(private stripe: Stripe) {}

  // Generate earnings analytics
  async generateEarningsAnalytics(providerId: string, period: string) {
    const earnings = await this.fetchEarningsData(providerId, period);
    
    return {
      overview: this.generateEarningsOverview(earnings),
      trends: this.analyzeEarningsTrends(earnings),
      projections: this.generateEarningsProjections(earnings),
      comparisons: this.generatePeriodComparisons(earnings)
    };
  }

  // Generate earnings overview
  private generateEarningsOverview(earnings: any) {
    return {
      totalEarnings: this.calculateTotalEarnings(earnings),
      netEarnings: this.calculateNetEarnings(earnings),
      averagePerService: this.calculateAveragePerService(earnings),
      topServices: this.identifyTopServices(earnings),
      peakEarningPeriods: this.identifyPeakPeriods(earnings)
    };
  }

  // Analyze earnings trends
  private analyzeEarningsTrends(earnings: any) {
    return {
      dailyTrends: this.analyzeDailyTrends(earnings),
      weeklyTrends: this.analyzeWeeklyTrends(earnings),
      monthlyTrends: this.analyzeMonthlyTrends(earnings),
      seasonalTrends: this.analyzeSeasonalTrends(earnings),
      yearOverYear: this.analyzeYearOverYear(earnings)
    };
  }
}

### Fee Breakdown

```typescript
// Fee breakdown analyzer
class FeeBreakdownAnalyzer {
  constructor(private stripe: Stripe) {}

  // Generate fee breakdown
  async generateFeeBreakdown(providerId: string, period: string) {
    const transactions = await this.fetchTransactions(providerId, period);
    
    return {
      summary: this.generateFeeSummary(transactions),
      breakdown: this.generateDetailedBreakdown(transactions),
      optimization: this.generateFeeOptimizationTips(transactions)
    };
  }

  // Generate detailed fee breakdown
  private generateDetailedBreakdown(transactions: any) {
    return {
      platformFees: this.calculatePlatformFees(transactions),
      stripeFees: this.calculateStripeFees(transactions),
      processingFees: this.calculateProcessingFees(transactions),
      disputeFees: this.calculateDisputeFees(transactions),
      refundFees: this.calculateRefundFees(transactions),
      otherFees: this.calculateOtherFees(transactions)
    };
  }

  // Generate fee optimization suggestions
  private generateFeeOptimizationTips(transactions: any) {
    return {
      potentialSavings: this.calculatePotentialSavings(transactions),
      recommendations: this.generateRecommendations(transactions),
      bestPractices: this.compileBestPractices(transactions)
    };
  }
}

### Transaction History

```typescript
// Transaction history manager
class TransactionHistoryManager {
  constructor(private stripe: Stripe) {}

  // Get transaction history
  async getTransactionHistory(providerId: string, filters: TransactionFilters) {
    const transactions = await this.fetchTransactions(providerId, filters);
    
    return {
      transactions: this.formatTransactions(transactions),
      summary: this.generateTransactionSummary(transactions),
      analytics: this.generateTransactionAnalytics(transactions)
    };
  }

  // Format transactions for display
  private formatTransactions(transactions: any[]) {
    return transactions.map(transaction => ({
      id: transaction.id,
      type: this.determineTransactionType(transaction),
      amount: transaction.amount,
      status: transaction.status,
      customer: this.getCustomerDetails(transaction),
      service: this.getServiceDetails(transaction),
      fees: this.calculateTransactionFees(transaction),
      metadata: transaction.metadata,
      created: transaction.created,
      updated: transaction.updated
    }));
  }

  // Generate transaction analytics
  private generateTransactionAnalytics(transactions: any[]) {
    return {
      volumeMetrics: this.calculateVolumeMetrics(transactions),
      successRates: this.calculateSuccessRates(transactions),
      averageValues: this.calculateAverageValues(transactions),
      trends: this.analyzeTransactionTrends(transactions)
    };
  }
}
```