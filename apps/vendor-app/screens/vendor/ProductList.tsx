import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  getVendorProducts,
  toggleVendorProduct,
  deleteVendorProduct,
  type VendorProduct,
} from '../../src/api/vendorProducts';
import { useRequireApproved } from '../../src/hooks/useRequireApproved';
import Constants from 'expo-constants';
import { useVendorCategories } from '../../hooks/useVendorCategories';

const API_BASE = (Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1').replace(/\/api\/v1\/?$/, '');

const THUMB_SIZE = 80;
const NEW_BADGE_MS = 24 * 60 * 60 * 1000;

function isNew(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < NEW_BADGE_MS;
}

function imageUri(product: VendorProduct): string | null {
  if (!product.image) return null;
  return product.image.startsWith('http') ? product.image : `${API_BASE}${product.image}`;
}

export default function ProductList() {
  const { categoryId: initialCategoryId, categoryName } = useLocalSearchParams<{ categoryId?: string; categoryName?: string }>();
  const router = useRouter();
  const { approved, loading: guardLoading } = useRequireApproved();
  const { flat: categories } = useVendorCategories();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(initialCategoryId ?? '');
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [filtered, setFiltered] = useState<VendorProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchProducts = useCallback(() => {
    setLoading(true);
    getVendorProducts({ category: selectedCategoryId || undefined })
      .then((res) => {
        setProducts(res.products);
        setFiltered(res.products);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load products'))
      .finally(() => setLoading(false));
  }, [selectedCategoryId]);

  useFocusEffect(
    useCallback(() => {
      if (approved) fetchProducts();
    }, [approved, fetchProducts])
  );

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFiltered(products);
      return;
    }
    setFiltered(products.filter((p) => p.name.toLowerCase().includes(q)));
  }, [search, products]);

  const handleToggle = useCallback(
    async (item: VendorProduct) => {
      setTogglingId(item._id);
      try {
        const updated = await toggleVendorProduct(item._id);
        setProducts((prev) => prev.map((p) => (p._id === item._id ? { ...p, isAvailable: updated.isAvailable } : p)));
        setFiltered((prev) => prev.map((p) => (p._id === item._id ? { ...p, isAvailable: updated.isAvailable } : p)));
      } finally {
        setTogglingId(null);
      }
    },
    []
  );

  const handleDelete = useCallback(
    (item: VendorProduct) => {
      Alert.alert('Delete Product', `Delete "${item.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVendorProduct(item._id);
              setProducts((prev) => prev.filter((p) => p._id !== item._id));
              setFiltered((prev) => prev.filter((p) => p._id !== item._id));
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed');
            }
          },
        },
      ]);
    },
    []
  );

  if (guardLoading || !approved) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          <TouchableOpacity
            style={[styles.filterPill, !selectedCategoryId && styles.filterPillActive]}
            onPress={() => setSelectedCategoryId('')}
          >
            <Text style={[styles.filterPillText, !selectedCategoryId && styles.filterPillTextActive]}>All</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c._id}
              style={[styles.filterPill, selectedCategoryId === c._id && styles.filterPillActive]}
              onPress={() => setSelectedCategoryId(c._id)}
            >
              <Text style={[styles.filterPillText, selectedCategoryId === c._id && styles.filterPillTextActive]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0ea5e9" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {imageUri(item) ? (
                <Image source={{ uri: imageUri(item)! }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Text style={styles.thumbPlaceholderText}>📷</Text>
                </View>
              )}
              <View style={styles.rowBody}>
                <View style={styles.rowTitleRow}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  {isNew(item.createdAt) && (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>New</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.rowDesc} numberOfLines={2}>{item.description || '—'}</Text>
                <Text style={styles.rowPrice}>${Number(item.price).toFixed(2)}</Text>
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/menu/edit-product', params: { productId: item._id } })}
                  hitSlop={12}
                >
                  <Text style={styles.actionIcon}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={12}>
                  <Text style={styles.actionIcon}>🗑️</Text>
                </TouchableOpacity>
                <Switch
                  value={item.isAvailable}
                  onValueChange={() => handleToggle(item)}
                  disabled={togglingId === item._id}
                />
              </View>
            </View>
          )}
        />
      )}
      <TouchableOpacity
        style={styles.fab}
        onPress={() =>
          router.push({
            pathname: '/menu/add-product',
            params: { categoryId: selectedCategoryId || initialCategoryId || '', categoryName: categoryName || '' },
          })
        }
      >
        <Text style={styles.fabText}>Add Product</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  error: { fontSize: 16, color: '#dc2626' },
  searchRow: { paddingHorizontal: 16, paddingVertical: 8 },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#f8fafc',
  },
  filterRow: { paddingHorizontal: 16, paddingBottom: 8 },
  filterContent: { paddingVertical: 4 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    marginRight: 8,
  },
  filterPillActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  filterPillText: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  filterPillTextActive: { color: '#fff' },
  listContent: { padding: 16, paddingBottom: 88 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  thumbPlaceholderText: { fontSize: 28 },
  rowBody: { flex: 1, marginLeft: 12 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  newBadge: { backgroundColor: '#22c55e', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  newBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  rowDesc: { fontSize: 13, color: '#64748b', marginTop: 4 },
  rowPrice: { fontSize: 15, fontWeight: '600', color: '#0ea5e9', marginTop: 4 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 8 },
  actionIcon: { fontSize: 20 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
