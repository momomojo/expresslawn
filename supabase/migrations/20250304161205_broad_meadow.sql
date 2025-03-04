/*
  # Fix service images and provider services

  1. Changes
    - Add image upload support to service_images table
    - Add provider_id to service_images for custom images
    - Update RLS policies to allow providers to manage their images
    - Add is_default flag to distinguish between system and custom images

  2. Security
    - Enable RLS on service_images
    - Add policies for image management
*/

-- Add provider_id and is_default to service_images
ALTER TABLE service_images
ADD COLUMN provider_id uuid REFERENCES provider_profiles(id),
ADD COLUMN is_default boolean DEFAULT false;

-- Update existing images to be default
UPDATE service_images
SET is_default = true;

-- Add RLS policies for service_images
CREATE POLICY "Providers can insert their own images"
  ON service_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = provider_id
    AND NOT is_default
  );

CREATE POLICY "Providers can update their own images"
  ON service_images
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = provider_id
    AND NOT is_default
  );

CREATE POLICY "Providers can delete their own images"
  ON service_images
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = provider_id
    AND NOT is_default
  );

-- Add more default images
INSERT INTO service_images (name, category, url, is_default) VALUES
  ('Spring Cleanup', 'seasonal', 'https://images.unsplash.com/photo-1621271030046-194f8b65d13a?q=80&w=2000&auto=format&fit=crop', true),
  ('Garden Design', 'landscaping', 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?q=80&w=2000&auto=format&fit=crop', true),
  ('Weed Control', 'lawn_maintenance', 'https://images.unsplash.com/photo-1562935067-f46d08366fd5?q=80&w=2000&auto=format&fit=crop', true),
  ('Shrub Pruning', 'tree_care', 'https://images.unsplash.com/photo-1598902468171-0f50e32a7bf8?q=80&w=2000&auto=format&fit=crop', true);