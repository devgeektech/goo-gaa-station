import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SectionList,
  SafeAreaView,
} from 'react-native';
import type { CategoryGroup, CategoryItem } from '../../services/vendorApi';

type Props = {
  groups: CategoryGroup[];
  selectedId: string | null;
  onSelect: (item: CategoryItem) => void;
  visible: boolean;
  onClose: () => void;
};

export function CategoryPickerModal({ groups, selectedId, onSelect, visible, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const sections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groups
      .map((g) => ({
        title: String(g.type || '').toUpperCase(),
        data: g.categories ?? [],
      }))
      .map((s) => ({
        ...s,
        data: q ? s.data.filter((c) => c.name.toLowerCase().includes(q)) : s.data,
      }))
      .filter((s) => s.data.length > 0);
  }, [groups, searchQuery]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Category</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search categories..."
            placeholderTextColor="#94a3b8"
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const selected = item._id === selectedId;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={styles.rowText}>{item.name}</Text>
                {selected ? <Text style={styles.check}>✓</Text> : null}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  search: {
    height: 44,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  listContent: { paddingBottom: 96 },
  row: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  rowText: { flex: 1, fontSize: 16, color: '#0f172a' },
  check: { fontSize: 18, fontWeight: '800', color: '#0ea5e9' },
  sep: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 16 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  cancelBtn: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  cancelText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
});

