export const CATEGORY_TYPES = ['food', 'grocery', 'pharmacy', 'fashion', 'retail'] as const;

export type CategoryType = (typeof CATEGORY_TYPES)[number];

export function isCategoryType(value: string): value is CategoryType {
  return (CATEGORY_TYPES as readonly string[]).includes(value);
}

/** food → grocery → pharmacy → fashion → retail; unknown types appended last. */
export function orderedCategoryTypes(types: Iterable<string>): string[] {
  const set = new Set(types);
  const ordered = CATEGORY_TYPES.filter((t) => set.has(t));
  for (const t of set) {
    if (!isCategoryType(t)) ordered.push(t);
  }
  return ordered;
}
