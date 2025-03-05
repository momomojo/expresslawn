# Stripe Integration Guide

This guide provides a comprehensive, step-by-step approach to integrating Stripe into your platform. It combines all provided documentation into a single, cohesive resource, ensuring consistency and clarity. The integration supports a complete payment system, including core features like one-time payments, subscriptions, and provider payouts, as well as additional features such as partial payments and customer portals. Below, each section outlines the necessary steps, with core components forming the foundation and additional features enhancing functionality where specified.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Setup and Configuration](#2-setup-and-configuration)
3. [Payment Processing](#3-payment-processing)
4. [Subscription Management](#4-subscription-management)
5. [Provider Payouts](#5-provider-payouts)
6. [Advanced Payment Features](#6-advanced-payment-features)
7. [Security and Compliance](#7-security-and-compliance)
8. [Webhooks and Event Handling](#8-webhooks-and-event-handling)
9. [Customer Portal](#9-customer-portal)
10. [Monitoring and Analytics](#10-monitoring-and-analytics)
11. [Testing](#11-testing)
12. [Deployment and Maintenance](#12-deployment-and-maintenance)
13. [Reporting and Analytics](#13-reporting-and-analytics)
14. [Documentation](#14-documentation)

---

## 1. Introduction

### Overview of the Payment System

The Stripe integration supports a robust payment ecosystem with the following features:

1. One-time payments for individual services
2. Subscription-based recurring services
3. Automated scheduling for fixed-interval services
4. Secure payment processing and storage
5. Payment history and invoicing
6. Provider payouts and platform fees
7. Partial payments and deposits
8. Refund management

**Core vs. Additional Features:**
- **Core Features:** One-time payments, subscriptions, provider payouts, secure processing, and refund management are essential for basic functionality.
- **Additional Features:** Partial payments, deposits, automated scheduling, and enhanced customer portal capabilities extend the system for specific use cases.

This guide ensures all features are implemented cohesively to achieve a complete integration.

---

## 2. Setup and Configuration

This section outlines the initial setup required for Stripe integration.

### Prerequisites
- A Stripe account with API keys
- Database access with permissions to modify schemas
- Basic knowledge of SQL and Stripe APIs

### Database Schema Extensions

Extend your database to support payment-related data:

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

**Steps:**
1. Apply the schema changes to extend the `bookings` table and create new tables.
2. Execute the migration function to populate existing bookings with payment data.

### Basic Stripe Setup

Configure your Stripe account and integrate it with your system:

1. **Stripe Account Configuration:**
   - Set up your Stripe account and obtain API keys (secret and publishable).
2. **API Key Management:**
   - Securely store keys in your environment variables.
3. **Webhook Endpoints:**
   - Configure webhook endpoints in Stripe to receive events (detailed in Section 8).
4. **Error Handling:**
   - Set up basic error logging and retry mechanisms.

### Customer Management

Set up customer records in Stripe:

1. **Stripe Customer Creation:**
   - Use the Stripe API to create customer objects linked to your users.
2. **Payment Method Storage:**
   - Store payment methods securely using Stripe’s payment method APIs.

---

## 3. Payment Processing

Handle one-time payments and related processes (core feature).

### One-time Payments

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
```

1. **Payment Intent Creation:** Create a payment intent with the required amount.
2. **Payment Confirmation:** Confirm the payment using the client-side SDK.
3. **Receipt Generation:** Generate and send a receipt post-payment.

### Payment Flow Handling

1. **Pre-authorization Flow:**
   - Validate payment method.
   - Check for sufficient funds.
   - Create payment intent.
2. **Payment Execution:**
   - Handle 3D Secure authentication.
   - Process the payment.
   - Update booking status.
3. **Post-payment Actions:**
   - Generate receipt.
   - Update provider balance.
   - Trigger notifications.

### Failed Payment Recovery

1. **Retry Strategy:**
   - Implement exponential backoff with maximum retry attempts.
   - Offer alternative payment methods.
2. **Customer Communication:**
   - Send payment failure notifications.
   - Provide options to update payment methods.
3. **Booking Protection:**
   - Hold time slots during retries.
   - Define grace periods and cancellation rules.

### Refund Processing

```sql
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
```

1. **Full Refunds:**
   - Cancel payment intent.
   - Reverse provider payout.
   - Update booking status.
2. **Partial Refunds:**
   - Calculate refund amount.
   - Adjust provider payout and platform fees.
3. **Refund Rules:**
   - Apply time-based policies and cancellation fees.

### Dispute Handling

```sql
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

1. **Initial Response:**
   - Freeze provider payout.
   - Collect evidence.
   - Submit documentation.
2. **Resolution Process:**
   - Communicate with provider and customer.
   - Submit evidence to Stripe.
3. **Outcome Handling:**
   - Release funds if won; process chargeback if lost.

---

## 4. Subscription Management

Implement recurring payments and scheduling (core feature).

### Subscription Data Model

```sql
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

### Subscription Plans

1. **Plan Types:**
   - Fixed intervals (e.g., weekly, monthly).
   - Custom intervals with minimum frequency.
2. **Pricing Structure:**
   - Base price with optional add-ons.
   - Volume discounts.
3. **Billing Rules:**
   - Prorated charges and trial periods.

### Subscription Management

1. **Lifecycle Management:**
   - Create subscriptions with initial payment.
   - Handle upgrades/downgrades and cancellations.
2. **Payment Handling:**
   - Automate payment collection and recovery.
3. **Schedule Management:**
   - Generate recurring bookings with exception handling.

### Automated Scheduling

1. **Booking Generation:**
   - Schedule bookings in advance with conflict detection.
2. **Schedule Optimization:**
   - Optimize routes and time slots.
3. **Exception Handling:**
   - Manage rescheduling due to weather or unavailability.

### Subscription Workflow

1. **Creation Process:**
   - Customer selects plan, processes payment, and sets schedule.
2. **Maintenance Flow:**
   - Collect payments and generate schedules.
3. **Modification Handling:**
   - Adjust plans, schedules, or pause/resume subscriptions.

---

## 5. Provider Payouts

Manage payouts to service providers (core feature).

### Provider Banking Information

```sql
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

1. **Payout Scheduling:**
   - Configure schedules and minimum amounts.
   - Create payout batches with eligible bookings.
2. **Timing Rules:**
   - Account for payment clearance and dispute windows.

### Fee Adjustments

1. **Platform Fee Types:**
   - Percentage-based or fixed fees.
2. **Fee Calculations:**
   - Apply volume discounts or special rates.

### Refund Handling for Payouts

1. **Refund Types:**
   - Process full or partial refunds.
2. **Provider Impact:**
   - Adjust balances and future payouts.

### Dispute Management for Payouts

1. **Initial Response:**
   - Hold funds and notify providers.
2. **Resolution Process:**
   - Collect and submit evidence.

---

## 6. Advanced Payment Features

Enhance the payment system with additional capabilities.

### Partial Payments

1. **Deposit System:**
   - Require deposits at booking.
2. **Payment Plans:**
   - Offer structured payment options.
3. **Late Payment Handling:**
   - Define retry and cancellation policies.

### Service Credits

```sql
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

CREATE TABLE credit_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid REFERENCES service_credits(id) NOT NULL,
  booking_id uuid REFERENCES bookings(id) NOT NULL,
  amount_used decimal(10,2) NOT NULL CHECK (amount_used > 0),
  created_at timestamptz DEFAULT now()
);
```

1. **Credit Management:**
   - Issue and track service credits.
2. **Usage Tracking:**
   - Apply credits to bookings automatically.

---

## 7. Security and Compliance

Ensure the system meets security and compliance standards.

### Data Integrity Measures

```sql
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

### Transaction Management

1. **Payment Status Updates:**
   - Use atomic operations within transactions.
2. **State Transitions:**
   - Enforce valid status flows.

### Audit Trail Implementation

1. **Transaction Logging:**
   - Log before/after states and user actions.

### Data Validation Rules

1. **Amount Validation:**
   - Ensure non-negative amounts and currency precision.

### Database Triggers

```sql
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

CREATE OR REPLACE FUNCTION validate_platform_fee()
RETURNS trigger AS $$
BEGIN
  IF NEW.platform_fee < 0 THEN
    RAISE EXCEPTION 'Platform fee cannot be negative';
  END IF;
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

### Subscription Security

1. **Access Controls:**
   - Implement role-based permissions.
2. **Payment Security:**
   - Encrypt sensitive data at rest.

### Data Protection

1. **Sensitive Data:**
   - Ensure PCI compliance and encrypt data.
2. **Authentication:**
   - Support 3D Secure and fraud prevention.

---

## 8. Webhooks and Event Handling

Handle asynchronous Stripe events (core feature).

### Webhook Infrastructure

```sql
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
```

### Webhook Handler Functions

```sql
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

1. **Payment Events:**
   - `payment_intent.succeeded`, `payment_intent.payment_failed`, etc.
2. **Subscription Events:**
   - `customer.subscription.created`, `customer.subscription.updated`, etc.
3. **Dispute Events:**
   - `charge.dispute.created`, `charge.dispute.updated`, etc.

### Webhook Processing Flow

```typescript
async function handleWebhook(signature: string, payload: Buffer, webhookSecret: string) {
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    const eventId = await supabase.rpc('record_webhook_event', {
      p_stripe_event_id: event.id,
      p_event_type: event.type,
      p_event_data: event.data,
      p_idempotency_key: crypto.randomUUID()
    });
    await processWebhookEvent(eventId, event);
    return { statusCode: 200 };
  } catch (error) {
    console.error('Webhook Error:', error.message);
    return { statusCode: 400, body: `Webhook Error: ${error.message}` };
  }
}

async function processWebhookEvent(eventId: string, event: any) {
  try {
    await supabase.rpc('log_webhook_processing', {
      p_webhook_event_id: eventId,
      p_attempt_number: 1,
      p_status: 'started'
    });
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
    }
    await supabase.rpc('log_webhook_processing', {
      p_webhook_event_id: eventId,
      p_attempt_number: 1,
      p_status: 'completed'
    });
  } catch (error) {
    await supabase.rpc('log_webhook_processing', {
      p_webhook_event_id: eventId,
      p_attempt_number: 1,
      p_status: 'failed',
      p_error_details: { error: error.message }
    });
    await handleWebhookRetry(eventId, event);
  }
}

async function handleWebhookRetry(eventId: string, event: any) {
  const maxRetries = 3;
  const retryDelays = [30, 60, 120];
  const { data: webhookEvent } = await supabase.from('webhook_events').select('processing_attempts').eq('id', eventId).single();
  if (webhookEvent.processing_attempts < maxRetries) {
    const delaySeconds = retryDelays[webhookEvent.processing_attempts];
    setTimeout(async () => {
      await processWebhookEvent(eventId, event);
    }, delaySeconds * 1000);
    await supabase.from('webhook_events').update({
      processing_attempts: webhookEvent.processing_attempts + 1,
      status: 'retrying',
      last_attempt_at: new Date().toISOString()
    }).eq('id', eventId);
  } else {
    await supabase.from('webhook_events').update({
      status: 'failed',
      last_attempt_at: new Date().toISOString()
    }).eq('id', eventId);
    await notifyWebhookFailure(eventId, event);
  }
}
```

---

## 9. Customer Portal

Provide a self-service portal for customers (additional feature).

### Portal Configuration

```sql
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

```typescript
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
async function createPortalSession({ customerId, returnUrl, configuration }: CreatePortalSessionParams) {
  try {
    const { data: customer } = await supabase.from('profiles').select('stripe_customer_id').eq('id', customerId).single();
    if (!customer?.stripe_customer_id) throw new Error('Customer not found in Stripe');
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: returnUrl,
      configuration
    });
    const { data: portalSession } = await supabase.from('customer_portal_sessions').insert({
      customer_id: customerId,
      stripe_session_id: session.id,
      return_url: returnUrl,
      status: 'active',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }).select().single();
    return { url: session.url, sessionId: portalSession.id };
  } catch (error) {
    console.error('Error creating portal session:', error);
    throw error;
  }
}
```

### Customer Actions

1. **Payment Methods:** Add, remove, or update payment methods.
2. **Subscription Management:** Cancel, pause, or update subscriptions.
3. **Invoice Management:** View, pay, or download invoices.

---

## 10. Monitoring and Analytics

Track system performance and health.

### Key Metrics

1. **Payment Success:**
   - Monitor conversion rates and failure reasons.
2. **Business Health:**
   - Track revenue and subscription analytics.

### Alerts and Notifications

```typescript
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
    cooldown: 900
  }
];
```

---

## 11. Testing

Validate the integration thoroughly.

### Test Environments

1. **Development:** Use Stripe test mode and mock webhooks.
2. **Staging:** Conduct integration and load testing.

### Test Cases

1. **Payment Flows:** Test card payments and refunds.
2. **Error Scenarios:** Simulate declines and network failures.

### Integration Test Suites

```typescript
describe('Stripe Integration Tests', () => {
  test('should process payment successfully', async () => {
    const customer = await testData.createTestCustomer();
    const token = await testData.createTestCardToken();
    const paymentIntent = await stripeTest.paymentIntents.create({
      amount: 2000,
      currency: 'usd',
      customer: customer.id,
      payment_method_types: ['card'],
      payment_method_data: { type: 'card', card: { token: token.id } },
      confirm: true
    });
    expect(paymentIntent.status).toBe('succeeded');
  });
});
```

---

## 12. Deployment and Maintenance

Deploy and maintain the integration.

### Release Process

1. **Database Updates:** Apply schema migrations.
2. **Feature Deployment:** Use phased rollouts.

### Maintenance

1. **Regular Tasks:** Rotate logs and tune performance.
2. **Updates:** Manage Stripe API versions and security patches.

---

## 13. Reporting and Analytics

Provide financial insights and dispute management.

### Financial Reports

```typescript
class FinancialReportGenerator {
  async generateReport(config: ReportConfig) {
    const data = await this.gatherReportData(config);
    const report = this.processReportData(data);
    return this.formatReport(report, config.format);
  }
}
```

### Dispute Management UI

```typescript
class DisputeManagementUI {
  async renderDashboard() {
    const disputes = await this.fetchDisputes();
    return {
      activeDisputes: this.filterActiveDisputes(disputes),
      pastDisputes: this.filterPastDisputes(disputes),
      metrics: this.calculateDisputeMetrics(disputes)
    };
  }
}
```

### Provider Dashboard Enhancements

1. **Payout Reports:** Generate detailed payout summaries.
2. **Earnings Analytics:** Analyze trends and projections.
3. **Fee Breakdown:** Detail platform and processing fees.
4. **Transaction History:** Display formatted transaction records.

---

## 14. Documentation

Provide resources for users and developers.

1. **API Documentation:** Detail endpoints and error codes.
2. **Integration Guide:** Offer setup instructions and troubleshooting.
3. **Business Processes:** Document payment flows and operational procedures.

---

This guide organizes the Stripe integration into a logical, step-by-step format, ensuring a complete and functional payment system. Core features are foundational, while additional features like partial payments and the customer portal enhance the system for broader use cases.