/*
  # Custom Service Management

  1. New Tables
    - `provider_services`
      - `id` (uuid, primary key)
      - `provider_id` (uuid, references provider_profiles)
      - `name` (text)
      - `description` (text)
      - `price` (decimal)
      - `duration_minutes` (integer)
      - `category` (service_category)
      - `image_id` (uuid, references service_images)
      - `is_active` (boolean)
      - Timestamps (created_at, updated_at)

  2. Changes
    - Drop old services and provider_services tables
    - Add more standard service images
    
  3. Security
    - Enable RLS
    - Add policies for provider access
*/

-- Drop old tables
DROP TABLE IF EXISTS provider_services CASCADE;
DROP TABLE IF EXISTS services CASCADE;

-- Create new provider services table
CREATE TABLE provider_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES provider_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price decimal(10,2) NOT NULL CHECK (price >= 0),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  category service_category NOT NULL,
  image_id uuid REFERENCES service_images(id),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE provider_services ENABLE ROW LEVEL SECURITY;

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

-- Add more standard service images
INSERT INTO service_images (name, category, url) VALUES
  ('Lawn Aeration', 'lawn_maintenance', 'https://images.unsplash.com/photo-1635326444826-06c9f785b2b9?q=80&w=2000&auto=format&fit=crop'),
  ('Flower Planting', 'landscaping', 'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?q=80&w=2000&auto=format&fit=crop'),
  ('Snow Removal', 'seasonal', 'https://images.unsplash.com/photo-1609639643505-3c158a56de42?q=80&w=2000&auto=format&fit=crop'),
  ('Pressure Washing', 'maintenance', 'https://images.unsplash.com/photo-1610443130319-c3c17c61e6b6?q=80&w=2000&auto=format&fit=crop');

-- Create updated_at trigger
CREATE TRIGGER update_provider_services_updated_at
  BEFORE UPDATE ON provider_services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();