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
import { createVendorProduct } from '../../src/api/vendorProducts';
import { useRequireApproved } from '../../src/hooks/useRequireApproved';
import { useVendorCategories } from '../../hooks/useVendorCategories';
import type { CategoryItem } from '../../services/vendorApi';
import { CategoryPickerModal } from '../../components/vendor/CategoryPickerModal';

export default function AddProduct() {
  const { categoryId: initialCategoryId, categoryName: initialCategoryName } = useLocalSearchParams<{
    categoryId?: string;
    categoryName?: string;
  }>();
  const router = useRouter();
  const { approved, loading: guardLoading } = useRequireApproved();
  const { flat: categories, groups, loading: catLoading } = useVendorCategories();
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId ?? '');
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (categories.length === 0) return;

    if (selectedCategoryId && !selectedCategory) {
      const match = categories.find((c) => c._id === selectedCategoryId);
      if (match) setSelectedCategory(match);
    }

    if (!selectedCategoryId && initialCategoryId) {
      const match = categories.find((c) => c._id === initialCategoryId);
      if (match) {
        setSelectedCategoryId(match._id);
        setSelectedCategory(match);
      }
    }
  }, [categories, initialCategoryId, selectedCategory, selectedCategoryId]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to photos to add an image.');
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
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || saving) return;
    setSaving(true);
    setErrors({});
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('price', price.trim());
      form.append('category', selectedCategoryId);
      form.append('description', description.trim());
      if (imageUri) {
        const filename = imageUri.split('/').pop() ?? 'photo.jpg';
        const mime = 'image/jpeg';
        form.append('image', {
          uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
          type: mime,
          name: filename,
        } as unknown as Blob);
      }
      await createVendorProduct(form);
      setToast('Product saved!');
      setTimeout(() => {
        if (initialCategoryId && initialCategoryName) {
        router.replace({
          pathname: '/menu/product-list',
          params: { categoryId: initialCategoryId, categoryName: initialCategoryName },
        });
        } else {
          router.back();
        }
      }, 600);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: { en?: string } } } }).response?.data?.message?.en
        : err instanceof Error ? err.message : 'Failed to save';
      setErrors({ submit: msg ?? 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  if (guardLoading || !approved) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.photoBox} onPress={pickImage}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.photoPreview} resizeMode="cover" />
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
          <Text style={styles.categorySelectText}>
            {selectedCategory?.name ?? initialCategoryName ?? 'Select Category'}
          </Text>
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
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Save Product</Text>}
      </TouchableOpacity>

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoBox: {
    height: 160,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  photoIcon: { fontSize: 40, marginBottom: 8 },
  photoLabel: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  photoPreview: { width: '100%', height: '100%', borderRadius: 10 },
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
  errorText: { fontSize: 13, color: '#dc2626', marginTop: -12, marginBottom: 8 },
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
    backgroundColor: '#dc2626',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  toast: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  toastText: { color: '#fff', fontWeight: '600' },
});
