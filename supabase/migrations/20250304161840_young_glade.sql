/*
  # Create service images storage bucket

  1. Storage
    - Create 'service-images' bucket for storing service-related images
    - Set public access for reading images
    - Restrict uploads to authenticated users
  
  2. Security
    - Enable RLS for bucket
    - Add policies for:
      - Public read access
      - Provider-only write access
*/

-- Create the service-images bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-images', 'service-images', true);

-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow public access to read images
CREATE POLICY "Service images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'service-images');

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload service images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'service-images'
  AND owner = auth.uid()
);

-- Allow users to update their own images
CREATE POLICY "Users can update own images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'service-images' AND owner = auth.uid())
WITH CHECK (bucket_id = 'service-images' AND owner = auth.uid());

-- Allow users to delete their own images
CREATE POLICY "Users can delete own images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'service-images' AND owner = auth.uid());