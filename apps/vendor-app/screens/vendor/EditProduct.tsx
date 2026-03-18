import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  getVendorProduct,
  updateVendorProduct,
  deleteVendorProduct,
  type VendorProduct,
} from '../../src/api/vendorProducts';
import { useRequireApproved } from '../../src/hooks/useRequireApproved';
import Constants from 'expo-constants';
import { useVendorCategories } from '../../hooks/useVendorCategories';
import type { CategoryItem } from '../../services/vendorApi';
import { CategoryPickerModal } from '../../components/vendor/CategoryPickerModal';

const API_BASE = (Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1').replace(/\/api\/v1\/?$/, '');

export default function EditProduct() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();
  const { approved, loading: guardLoading } = useRequireApproved();
  const [product, setProduct] = useState<VendorProduct | null>(null);
  const { flat: categories, groups, loading: catLoading } = useVendorCategories();
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!approved || !productId) return;
    getVendorProduct(productId)
      .then((p) => {
        setProduct(p);
        setName(p.name);
        setPrice(String(p.price));
        setDescription(p.description ?? '');
        if (p.image) {
          const uri = p.image.startsWith('http') ? p.image : `${API_BASE}${p.image}`;
          setImageUri(uri);
        }
      })
      .catch(() => setErrors({ fetch: 'Failed to load product' }))
      .finally(() => setLoading(false));
  }, [approved, productId]);

  // Pre-select the existing category once categories are loaded
  useEffect(() => {
    if (categories.length > 0 && product?.category) {
      const existingId =
        typeof product.category === 'object' && (product.category as { _id?: string })._id
          ? (product.category as { _id: string })._id
          : String(product.category);
      const match = categories.find((c) => c._id === existingId);
      if (match) {
        setSelectedCategoryId(match._id);
        setSelectedCategory(match);
      }
    }
  }, [categories, product]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to photos to change image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Product name is required';
    const p = parseFloat(price);
    if (price === '' || Number.isNaN(p) || p < 0) e.price = 'Valid price is required';
    if (!selectedCategoryId) e.category = 'Please select a category';
    setErrors((prev) => ({ ...prev, ...e }));
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!productId || !validate() || saving) return;
    setSaving(true);
    setErrors((prev) => ({ ...prev, submit: '' }));
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('price', price.trim());
      form.append('category', selectedCategoryId);
      form.append('description', description.trim());
      if (imageUri && (imageUri.startsWith('file://') || imageUri.startsWith('content://'))) {
        const filename = imageUri.split('/').pop() ?? 'photo.jpg';
        form.append('image', {
          uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
          type: 'image/jpeg',
          name: filename,
        } as unknown as Blob);
      }
      await updateVendorProduct(productId, form);
      router.back();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: { en?: string } } } }).response?.data?.message?.en
          : err instanceof Error ? err.message : 'Failed to update';
      setErrors((prev) => ({ ...prev, submit: msg ?? 'Failed to update' }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Product', 'Are you sure you want to delete this product?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!productId) return;
          setDeleting(true);
          try {
            await deleteVendorProduct(productId);
            router.back();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (guardLoading || !approved) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  if (loading && !product) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  if (errors.fetch || (!loading && !product)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errors.fetch ?? 'Product not found'}</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.photoBox} onPress={pickImage}>
        {imageUri ? (
          <>
            <Image source={{ uri: imageUri }} style={styles.photoPreview} resizeMode="cover" />
            <View style={styles.editOverlay}>
              <Text style={styles.editOverlayIcon}>✏️</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.photoIcon}>📷</Text>
            <Text style={styles.photoLabel}>ADD PHOTO</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Product Name *</Text>
      <TextInput
        style={[styles.input, errors.name && styles.inputError]}
        value={name}
        onChangeText={setName}
        placeholder="Product name"
        placeholderTextColor="#94a3b8"
      />
      {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

      <Text style={styles.label}>Price *</Text>
      <TextInput
        style={[styles.input, errors.price && styles.inputError]}
        value={price}
        onChangeText={setPrice}
        placeholder="0.00"
        placeholderTextColor="#94a3b8"
        keyboardType="decimal-pad"
      />
      {errors.price ? <Text style={styles.errorText}>{errors.price}</Text> : null}

      <Text style={styles.label}>Category *</Text>
      {catLoading ? (
        <View style={styles.categoryLoading}>
          <ActivityIndicator color="#0ea5e9" />
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.categorySelect, errors.category && styles.inputError]}
          onPress={() => setCategoryModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.categorySelectText}>{selectedCategory?.name ?? 'Select Category'}</Text>
          <Text style={styles.categorySelectChevron}>▾</Text>
        </TouchableOpacity>
      )}
      {errors.category ? <Text style={styles.errorText}>{errors.category}</Text> : null}

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Description (optional)"
        placeholderTextColor="#94a3b8"
        multiline
        numberOfLines={4}
      />

      {errors.submit ? <Text style={styles.errorText}>{errors.submit}</Text> : null}

      <TouchableOpacity
        style={[styles.submitBtn, saving && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Update Product</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
        {deleting ? <ActivityIndicator color="#dc2626" size="small" /> : <Text style={styles.deleteText}>Delete Product</Text>}
      </TouchableOpacity>

      <CategoryPickerModal
        groups={groups}
        selectedId={selectedCategoryId || null}
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
        onSelect={(item) => {
          setSelectedCategoryId(item._id);
          setSelectedCategory(item);
          setErrors((prev) => ({ ...prev, category: '' }));
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 13, color: '#dc2626', marginBottom: 8 },
  link: { color: '#0ea5e9', fontSize: 16 },
  photoBox: {
    height: 160,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    position: 'relative',
  },
  photoIcon: { fontSize: 40, marginBottom: 8 },
  photoLabel: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  photoPreview: { width: '100%', height: '100%', borderRadius: 10 },
  editOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editOverlayIcon: { fontSize: 18 },
  label: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  inputError: { borderColor: '#dc2626' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  categoryLoading: {
    height: 48,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  categorySelect: {
    height: 48,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  categorySelectText: { flex: 1, fontSize: 16, color: '#0f172a' },
  categorySelectChevron: { fontSize: 18, fontWeight: '700', color: '#64748b' },
  submitBtn: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  deleteText: { color: '#dc2626', fontWeight: '600', fontSize: 16 },
});
