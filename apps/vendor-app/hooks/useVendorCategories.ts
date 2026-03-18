import { useEffect, useState } from 'react';
import { getCategories, type CategoryGroup, type CategoryItem, flattenCategories } from '../services/vendorApi';

export function useVendorCategories() {
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [flat, setFlat] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then((data) => {
        setGroups(data);
        setFlat(flattenCategories(data));
      })
      .catch(() => setError('Failed to load categories'))
      .finally(() => setLoading(false));
  }, []);

  return { groups, flat, loading, error };
  // groups - used by MenuCategories SectionList
  // flat   - used by AddProduct / EditProduct Picker
}

