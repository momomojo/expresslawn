/*
  # Fix service images and references
  
  1. Changes
    - Add image_id to services table
    - Create function to get service image URL
    - Update existing services with correct image references
  
  2. Security
    - Maintain existing RLS policies
*/

-- Add image_id to services
ALTER TABLE services 
ADD COLUMN image_id uuid REFERENCES service_images(id);

-- Create function to get service image URL
CREATE OR REPLACE FUNCTION get_service_image_url(service_id uuid)
RETURNS text AS $$
BEGIN
  RETURN (
    SELECT si.url 
    FROM services s
    JOIN service_images si ON s.image_id = si.id
    WHERE s.id = service_id
  );
END;
$$ LANGUAGE plpgsql;

-- Update existing services with correct image references
UPDATE services s
SET image_id = si.id
FROM service_images si
WHERE s.name ILIKE '%' || si.name || '%'
OR si.name ILIKE '%' || s.name || '%';

-- Add trigger to update image_url when image_id changes
CREATE OR REPLACE FUNCTION update_service_image_url()
RETURNS TRIGGER AS $$
BEGIN
  NEW.image_url = get_service_image_url(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_service_image_url_trigger
  BEFORE INSERT OR UPDATE OF image_id
  ON services
  FOR EACH ROW
  EXECUTE FUNCTION update_service_image_url();