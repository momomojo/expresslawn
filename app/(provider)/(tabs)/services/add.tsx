import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Camera, Clock, DollarSign, Upload, X } from 'lucide-react-native';

type ServiceImage = {
  id: string;
  name: string;
  category: string;
  url: string;
};

export default function AddServiceScreen() {
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    duration: '',
    category: 'lawn_maintenance',
    imageId: null as string | null,
    customImageUrl: null as string | null,
  });
  const [images, setImages] = useState<ServiceImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    try {
      const { data, error } = await supabase
        .from('service_images') 
        .select('*')
        .or(`is_default.eq.true,provider_id.eq.${(await supabase.auth.getUser()).data.user?.id}`)
        .order('category', { ascending: true });

      if (error) throw error;
      setImages(data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleImageUpload = async () => {
    try {
      setUploading(true);
      setError(null);
      // Create file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      
      // Handle file selection
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Not authenticated');
          
          // Upload image to storage
          const fileExt = file.name.split('.').pop();
          const filePath = `${user.id}/${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('service-images')
            .upload(filePath, file);

          if (uploadError) throw uploadError;
          
          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('service-images')
            .getPublicUrl(filePath);

          // Create service image record
          const { data: imageData, error: insertError } = await supabase
            .from('service_images')
            .insert({
              provider_id: user.id,
              name: form.name || 'Custom Image',
              category: form.category,
              url: publicUrl,
              is_default: false
            })
            .select()
            .single();

          if (insertError) {
            throw insertError;
          }
          // Update form and reload images
          setForm(prev => ({ ...prev, imageId: imageData.id }));
          loadImages();
        } catch (err: any) {
          setError(err.message);
        } finally {
          setUploading(false);
          input.value = '';
        }
      };

      input.click();
    } catch (err: any) {
      setError(err.message);
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!form.name || !form.description || !form.price || !form.duration || !form.imageId) {
        throw new Error('Please fill in all fields');
      }

      const price = parseFloat(form.price);
      const duration = parseInt(form.duration);

      if (isNaN(price) || price < 0) {
        throw new Error('Please enter a valid price');
      }

      if (isNaN(duration) || duration < 1) {
        throw new Error('Please enter a valid duration');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: insertError } = await supabase
        .from('provider_services') 
        .insert({
          provider_id: user.id,
          name: form.name,
          description: form.description,
          price: price,
          duration_minutes: duration,
          category: form.category,
          image_id: form.imageId,
          is_active: true,
        }); 

      if (insertError) throw insertError;

      router.back();
      return;
    } catch (err: any) {
      setError(err.message);
      setForm({ name: '', description: '', price: '', duration: '', category: 'lawn_maintenance', imageId: null, customImageUrl: null });
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { value: 'lawn_maintenance', label: 'Lawn Maintenance' },
    { value: 'tree_care', label: 'Tree Care' },
    { value: 'landscaping', label: 'Landscaping' },
    { value: 'pest_control', label: 'Pest Control' },
    { value: 'seasonal', label: 'Seasonal' },
  ];

  const groupedImages = images.reduce((acc, image) => {
    const category = image.category.split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(image);
    return acc;
  }, {} as Record<string, ServiceImage[]>);

  return ( 
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Add New Service</Text>
      </View> 

      <ScrollView style={styles.content}>
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <View style={styles.form}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Service Name</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(text) => setForm(prev => ({ ...prev, name: text.trim() }))}
              placeholder="Enter service name"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.pickerContainer}>
              <select 
                value={form.category}
                onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                style={{
                  width: '100%',
                  height: 50,
                  padding: 12,
                  fontSize: 16,
                  fontFamily: 'Inter',
                  color: '#1B1B1B',
                  backgroundColor: '#F9F9F9',
                  border: 'none',
                  outline: 'none',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                }}
              >
                {categories.map(cat => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Price</Text>
            <View style={styles.inputContainer}>
              <DollarSign size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={form.price}
                onChangeText={(text) => setForm(prev => ({ ...prev, price: text.replace(/[^0-9.]/g, '') }))}
                keyboardType="decimal-pad"
                placeholder="Enter price"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Duration (minutes)</Text>
            <View style={styles.inputContainer}>
              <Clock size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={form.duration}
                onChangeText={(text) => setForm(prev => ({ ...prev, duration: text.replace(/[^0-9]/g, '') }))}
                keyboardType="number-pad"
                placeholder="Enter duration in minutes"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.description}
              onChangeText={(text) => setForm(prev => ({ ...prev, description: text.trim() }))}
              placeholder="Enter service description"
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Service Image</Text>
            <View style={styles.selectedImagePreview}>
              {form.imageId && (
                <Image
                  source={{ uri: images.find(img => img.id === form.imageId)?.url }}
                  style={styles.previewImage}
                />
              )}
              <TouchableOpacity
                style={styles.selectImageButton}
                onPress={() => setShowImagePicker(true)}
              >
                <Camera size={24} color="#2B5F21" />
                <Text style={styles.selectImageText}>
                  {form.imageId ? 'Change Image' : 'Select Image'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.uploadButton}
              onPress={handleImageUpload}
              disabled={uploading}
            >
              <Upload size={24} color="#2B5F21" />
              <Text style={styles.uploadText(uploading)}>
                {uploading ? 'Uploading...' : 'Upload Custom Image'}
              </Text>
            </TouchableOpacity>

            {showImagePicker && (
              <View style={styles.modalOverlay}>
                <View style={styles.imagePickerModal}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select Image</Text>
                    <TouchableOpacity
                      onPress={() => setShowImagePicker(false)}
                      style={styles.closeButton}
                    >
                      <X size={24} color="#666" />
                    </TouchableOpacity>
                  </View>
                  
                  <ScrollView style={styles.modalContent}>
              {Object.entries(groupedImages).map(([category, categoryImages]) => (
                <View key={category} style={styles.imageCategory}>
                  <Text style={styles.imageCategoryTitle}>{category}</Text>
                  <View style={styles.imageGrid}>
                    {categoryImages.map((image) => (
                      <TouchableOpacity
                        key={image.id}
                        style={[ 
                          styles.imageOption,
                          form.imageId === image.id && styles.imageSelected
                        ]}
                        onPress={() => {
                          setForm(prev => ({ ...prev, imageId: image.id }));
                          setShowImagePicker(false);
                        }}
                      >
                        <Image
                          source={{ uri: image.url }}
                          style={styles.imagePreview} 
                        />
                        {form.imageId === image.id && (
                          <View style={styles.imageSelectedOverlay}>
                            <Camera size={24} color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
                  </ScrollView>
                </View>
              </View>
            )}
          </View>
          
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? 'Creating Service...' : 'Create Service'}
            </Text> 
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#2B5F21',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontFamily: 'InterBold',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 16,
    gap: 20,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
    flex: 1,
    paddingVertical: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F9F9F9',
    gap: 8,
  },
  textArea: {
    height: 120,
    padding: 12,
    paddingTop: 12,
    textAlignVertical: 'top',
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    backgroundColor: '#F9F9F9',
    overflow: 'hidden',
  },
  imageScroll: {
    maxHeight: 240,
  },
  selectedImagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#F9F9F9',
  },
  selectImageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#2B5F21',
    borderRadius: 8,
  },
  selectImageText: {
    fontSize: 14,
    fontFamily: 'InterSemiBold',
    color: '#2B5F21',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  imagePickerModal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 24,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F9F9F9',
  },
  modalContent: {
    padding: 20,
    flex: 1,
  },
  imageCategory: {
    marginBottom: 24,
  },
  imageCategoryTitle: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 16,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  imageOption: {
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#F9F9F9',
  },
  imageSelected: {
    borderColor: '#2B5F21',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F9F9F9',
  },
  imageSelectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(43, 95, 33, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: '#2B5F21',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#2B5F21',
    borderRadius: 8,
    marginBottom: 16,
  },
  uploadText: (uploading: boolean) => ({
    fontSize: 14,
    fontFamily: 'InterSemiBold',
    color: uploading ? '#666' : '#2B5F21'
  }),
  errorText: {
    color: '#FF4B4B',
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    marginVertical: 16,
    paddingHorizontal: 16,
  },
});