/*
  # Fix service images and references
  
  1. Changes
    - Add image_id to services table
    - Update existing services with correct image references
  
  2. Security
    - Maintain existing RLS policies
*/

-- Add image_id to services
ALTER TABLE services 
ADD COLUMN image_id uuid REFERENCES service_images(id);

-- Update existing services with correct image references
UPDATE services s
SET image_id = si.id
FROM service_images si
WHERE s.name ILIKE '%' || si.name || '%'
OR si.name ILIKE '%' || s.name || '%';

-- Create function to get service image URL
CREATE OR REPLACE FUNCTION get_service_image_url(service_row services)
RETURNS text AS $$
BEGIN
  RETURN (
    SELECT url 
    FROM service_images 
    WHERE id = service_row.image_id
  );
END;
$$ LANGUAGE plpgsql;

-- Add computed column for image_url
ALTER TABLE services
DROP COLUMN IF EXISTS image_url;

ALTER TABLE services
ADD COLUMN image_url text GENERATED ALWAYS AS (
  get_service_image_url(services.*)
) STORED;