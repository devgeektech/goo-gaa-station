import { apiClient } from '../src/api/client';

export interface CategoryItem {
  _id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
}

export interface CategoryGroup {
  type: string;
  categories: CategoryItem[];
}

// Return type changes from CategoryItem[] to CategoryGroup[]
export async function getCategories(): Promise<CategoryGroup[]> {
  const res = await apiClient.get<{ success: true; data: CategoryGroup[] }>('/vendor/categories');
  return res.data.data;
}

// Helper - flatten groups into a single array for Picker use
export function flattenCategories(groups: CategoryGroup[]): CategoryItem[] {
  return groups.flatMap((g) => g.categories);
}

