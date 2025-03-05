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

### Business Processes

1. Payment Flows:
   - Customer journey
   - Provider experience
   - Admin controls

2. Operational Procedures:
   - Issue resolution
   - Refund policy
   - Support escalation