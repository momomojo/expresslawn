# Express Lawn - Product Requirements Document

## Overview
Express Lawn is a mobile-first web application that connects homeowners with lawn care professionals. The app streamlines the process of booking and managing lawn care services.

## User Types & Access Levels

### Customer
- Books and manages services
- Views provider profiles
- Leaves reviews
- Manages payments

### Service Provider
- Manages service offerings
- Handles bookings
- Receives payments
- Views analytics

## Core Features Implementation Plan

### Phase 1: Authentication & User Management ✅
1. **Customer Authentication** ✅
   - [x] Email/password signup
   - [x] Profile management
   - [x] Address management

2. **Provider Authentication & Onboarding**
   - Provider registration flow
   - Business information collection
   - Service area definition
   - Document verification
   - Insurance proof upload

3. **Provider Dashboard Layout**
   ```
   app/(provider)/
   ├── (tabs)/
   │   ├── _layout.tsx         # Tab configuration
   │   ├── jobs/              # Jobs management
   │   │   ├── _layout.tsx    # Jobs stack layout
   │   │   ├── index.tsx      # Jobs dashboard
   │   │   ├── [id].tsx      # Individual job view
   │   │   └── history.tsx    # Completed jobs
   │   ├── schedule/         # Schedule management
   │   │   ├── _layout.tsx    # Schedule stack layout
   │   │   ├── index.tsx      # Calendar view
   │   │   └── availability.tsx # Set availability
   │   ├── earnings/         # Financial management
   │   │   ├── _layout.tsx    # Earnings stack layout
   │   │   ├── index.tsx      # Earnings dashboard
   │   │   └── payouts.tsx    # Payout history
   │   ├── messages/         # Client communication
   │   │   ├── _layout.tsx    # Messages stack layout
   │   │   ├── index.tsx      # Conversations list
   │   │   └── [id].tsx      # Individual chat
   │   └── settings/         # Account management
   │       ├── _layout.tsx    # Settings stack layout
   │       ├── index.tsx      # Settings menu
   │       ├── profile.tsx    # Profile settings
   │       ├── services.tsx   # Service management
   │       └── areas.tsx      # Service areas
   └── _layout.tsx           # Provider root layout

4. **Database Schema Updates**
```sql
provider_profiles
  - id uuid PRIMARY KEY
  - user_id uuid REFERENCES auth.users
  - business_name text
  - business_address text
  - service_radius integer
  - insurance_info jsonb
  - verification_status text
  - created_at timestamptz
  - updated_at timestamptz

provider_documents
  - id uuid PRIMARY KEY
  - provider_id uuid
  - document_type text
  - document_url text
  - verified boolean
  - uploaded_at timestamptz

service_areas
  - id uuid PRIMARY KEY
  - provider_id uuid
  - zip_code text
  - city text
  - state text
  - active boolean
```

5. **Provider Features**
   - Jobs Dashboard
     - Today's schedule
     - Upcoming jobs
     - Job requests
     - Quick actions
   
   - Schedule Management
     - Calendar view
     - Availability settings
     - Time blocking
     - Break scheduling
   
   - Earnings Tracking
     - Daily/weekly/monthly views
     - Payout history
     - Revenue analytics
     - Tax reporting
   
   - Service Management
     - Service offerings
     - Pricing configuration
     - Special packages
     - Seasonal services


### Phase 2: Service Catalog & Booking (Current)
1. **Service Management**
   - Define service types and pricing
   - Add service descriptions and images
   - Set availability windows

2. **Booking Flow**
   - Service selection interface
   - Date/time picker
   - Address confirmation
   - Payment integration (Stripe)
   - Booking confirmation

3. **Database Schema**
```sql
services
  - id
  - name
  - description
  - base_price
  - image_url
  - duration_minutes

bookings
  - id
  - customer_id
  - service_id
  - provider_id (nullable)
  - status
  - scheduled_for
  - address
  - total_price
  - created_at

service_availability
  - id
  - provider_id
  - day_of_week
  - start_time
  - end_time
```

### Phase 3: Provider Management
1. **Provider Onboarding**
   - Application form
   - Document upload
   - Service area definition
   - Service selection
   - Availability management

2. **Provider Dashboard**
   - Upcoming jobs view
   - Schedule management
   - Service area management
   - Earnings tracking

### Phase 4: Customer Experience
1. **Booking Management**
   - View upcoming/past bookings
   - Booking modification
   - Cancellation handling
   - Rebooking options

2. **Reviews & Ratings**
   - Post-service feedback
   - Provider ratings
   - Photo uploads

### Phase 5: Messaging & Notifications
1. **Chat System**
   - Real-time messaging
   - Image sharing
   - Automated notifications

2. **Push Notifications**
   - Booking confirmations
   - Reminder notifications
   - Status updates

### Phase 6: Payment Processing
1. **Payment Integration**
   - Secure payment processing
   - Multiple payment methods
   - Automatic receipts
   - Refund handling

2. **Provider Payments**
   - Automated payouts
   - Earnings dashboard
   - Tax documentation

## Technical Implementation Notes

### API Structure
- RESTful endpoints for CRUD operations
- WebSocket for real-time features
- Supabase for authentication and data storage

### Security Measures
- Row Level Security (RLS) policies
- Input validation
- Rate limiting
- Secure payment handling

### Performance Considerations
- Image optimization
- Lazy loading
- Caching strategies
- Offline support

## MVP Success Metrics
- User registration conversion rate > 30%
- Booking completion rate > 80%
- Provider acceptance rate > 90%
- Customer satisfaction > 4.5/5
- Average response time < 2 seconds

## Future Enhancements
- Recurring bookings
- Package deals
- Loyalty program
- Mobile apps (iOS/Android)
- Service provider mobile app
- Analytics dashboard
- Integration with lawn care equipment providers

## Development Priorities
1. 🔴 **High Priority**
   - Provider onboarding flow
   - Provider dashboard implementation
   - Job management system
   - Schedule management
   - Service area configuration

2. 🟡 **Medium Priority**
   - Provider analytics
   - Chat system
   - Payment processing
   - Review system

3. 🟢 **Low Priority**
   - Analytics
   - Advanced scheduling
   - Loyalty features