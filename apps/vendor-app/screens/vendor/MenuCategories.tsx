import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getVendorCategories, type CategoryGroup, type VendorCategory } from '../../src/api/vendorProducts';
import { useRequireApproved } from '../../src/hooks/useRequireApproved';
import Constants from 'expo-constants';

const API_BASE = (Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1').replace(/\/api\/v1\/?$/, '');

export default function MenuCategories() {
  const router = useRouter();
  const { approved, loading: guardLoading } = useRequireApproved();
  const [grouped, setGrouped] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const tileSize = (width - 48) / 2 - 8;

  useEffect(() => {
    if (!approved) return;
    getVendorCategories()
      .then(setGrouped)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load categories'))
      .finally(() => setLoading(false));
  }, [approved]);

  const renderCategoryTile = (cat: VendorCategory) => {
    const iconUri = cat.icon ? (cat.icon.startsWith('http') ? cat.icon : `${API_BASE}${cat.icon}`) : null;
    return (
      <TouchableOpacity
        key={cat._id}
        style={[styles.tile, { width: tileSize, height: tileSize }]}
        activeOpacity={0.8}
        onPress={() =>
          router.push({
            pathname: '/menu/product-list',
            params: { categoryId: cat._id, categoryName: cat.name },
          })
        }
      >
        <View style={styles.iconWrap}>
          {iconUri ? (
            <Image source={{ uri: iconUri }} style={styles.tileIcon} resizeMode="contain" />
          ) : (
            <Text style={styles.tileEmoji}>📂</Text>
          )}
        </View>
        <Text style={styles.tileName} numberOfLines={2}>{cat.name}</Text>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item: categories }: { item: VendorCategory[] }) => (
    <View style={[styles.gridRow, { flexWrap: 'wrap', gap: 16 }]}>
      {categories.map(renderCategoryTile)}
    </View>
  );

  const renderSectionHeader = ({ section }: { section: { type: string } }) => (
    <Text style={styles.sectionHeader}>{section.type.toUpperCase()}</Text>
  );

  const sections = grouped.map((g) => ({
    type: g.type,
    data: [g.categories],
  }));

  if (guardLoading || !approved) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(_, index) => grouped[index]?.type ?? `section-${index}`}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  muted: { fontSize: 14, color: '#94a3b8', marginTop: 8 },
  error: { fontSize: 16, color: '#dc2626', textAlign: 'center' },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 16,
  },
  listContent: { paddingBottom: 24 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 16 },
  tile: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  tileIcon: { width: 40, height: 40 },
  tileEmoji: { fontSize: 32 },
  tileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
  },
});
