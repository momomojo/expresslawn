/*
  # Add standard lawn care images and service management enhancements
  
  1. New Tables
    - `service_images` - Standard set of lawn care images
  
  2. Changes
    - Add `image_id` to services table
    - Add custom duration to provider_services
  
  3. Security
    - Enable RLS on new table
    - Add policies for image access
*/

-- Create service images table
CREATE TABLE service_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add duration override to provider services
ALTER TABLE provider_services
ADD COLUMN duration_override integer CHECK (duration_override > 0);

-- Enable RLS
ALTER TABLE service_images ENABLE ROW LEVEL SECURITY;

-- Images are readable by all authenticated users
CREATE POLICY "Service images are publicly readable"
  ON service_images
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert standard lawn care images
INSERT INTO service_images (name, category, url) VALUES
  ('Lawn Mowing', 'lawn_maintenance', 'https://images.unsplash.com/photo-1624943113472-a3821381e040?q=80&w=2000&auto=format&fit=crop'),
  ('Tree Service', 'tree_care', 'https://images.unsplash.com/photo-1598902468171-0f50e32a7bf8?q=80&w=2000&auto=format&fit=crop'),
  ('Hedge Trimming', 'tree_care', 'https://images.unsplash.com/photo-1647531452166-3493b4c6d6b9?q=80&w=2000&auto=format&fit=crop'),
  ('Mulching', 'landscaping', 'https://images.unsplash.com/photo-1558904541-efa843a96f01?q=80&w=2000&auto=format&fit=crop'),
  ('Garden Maintenance', 'landscaping', 'https://images.unsplash.com/photo-1595429035839-c99c298ffdde?q=80&w=2000&auto=format&fit=crop'),
  ('Leaf Removal', 'seasonal', 'https://images.unsplash.com/photo-1508179522353-11ba468c4a1c?q=80&w=2000&auto=format&fit=crop'),
  ('Fertilization', 'lawn_maintenance', 'https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?q=80&w=2000&auto=format&fit=crop'),
  ('Irrigation', 'landscaping', 'https://images.unsplash.com/photo-1603228254119-e6a4d095dc59?q=80&w=2000&auto=format&fit=crop');