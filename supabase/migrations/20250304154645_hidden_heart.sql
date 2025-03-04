/*
  # Service Management Schema

  1. New Tables
    - `services`: Core service definitions
      - Base services with standard pricing and durations
      - Categories for service organization
    - `provider_services`: Provider-specific service customizations
      - Custom pricing overrides
      - Provider-specific descriptions
      - Service availability control
    - `service_availability`: Provider schedule management
      - Weekly schedule configuration
      - Time slot management

  2. Security
    - Enable RLS on all tables
    - Public read access to services
    - Provider-specific access controls
    - Availability management restrictions
*/

-- Create enum for service categories
CREATE TYPE service_category AS ENUM (
  'lawn_maintenance',
  'tree_care',
  'landscaping',
  'pest_control',
  'seasonal'
);

-- Core services table
CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  base_price decimal(10,2) NOT NULL CHECK (base_price >= 0),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  category service_category NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Provider service customizations
CREATE TABLE provider_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  price_override decimal(10,2) CHECK (price_override >= 0),
  custom_description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, service_id)
);

-- Provider availability schedule
CREATE TABLE service_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  created_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, day_of_week, start_time, end_time)
);

-- Enable RLS
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_availability ENABLE ROW LEVEL SECURITY;

-- Services policies
CREATE POLICY "Services are publicly readable"
  ON services
  FOR SELECT
  TO authenticated
  USING (true);

-- Provider services policies
CREATE POLICY "Provider services are publicly readable"
  ON provider_services
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Providers can manage their own services"
  ON provider_services
  FOR ALL
  TO authenticated
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

-- Availability policies
CREATE POLICY "Provider availability is publicly readable"
  ON service_availability
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Providers can manage their own availability"
  ON service_availability
  FOR ALL
  TO authenticated
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

-- Insert default services
INSERT INTO services (name, description, base_price, duration_minutes, category, image_url) VALUES
  (
    'Basic Lawn Mowing',
    'Professional cutting of your lawn including edging and cleanup',
    45.00,
    60,
    'lawn_maintenance',
    'https://images.unsplash.com/photo-1624943113472-a3821381e040?q=80&w=2000&auto=format&fit=crop'
  ),
  (
    'Tree Trimming',
    'Careful trimming and shaping of trees to maintain health and appearance',
    120.00,
    120,
    'tree_care',
    'https://images.unsplash.com/photo-1598902468171-0f50e32a7bf8?q=80&w=2000&auto=format&fit=crop'
  ),
  (
    'Garden Bed Maintenance',
    'Weeding, mulching, and maintaining garden beds',
    75.00,
    90,
    'landscaping',
    'https://images.unsplash.com/photo-1647531452166-3493b4c6d6b9?q=80&w=2000&auto=format&fit=crop'
  ),
  (
    'Seasonal Cleanup',
    'Comprehensive yard cleanup including leaves and debris removal',
    95.00,
    120,
    'seasonal',
    'https://images.unsplash.com/photo-1558904541-efa843a96f01?q=80&w=2000&auto=format&fit=crop'
  ),
  (
    'Pest Control Treatment',
    'Treatment to control common lawn pests and prevent infestations',
    85.00,
    60,
    'pest_control',
    'https://images.unsplash.com/photo-1595429035839-c99c298ffdde?q=80&w=2000&auto=format&fit=crop'
  );

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_services_updated_at
  BEFORE UPDATE ON provider_services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();