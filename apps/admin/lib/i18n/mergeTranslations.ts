/** Deep-merge `so` over `en` so missing Somali keys fall back to English. */
export function mergeWithEnglishFallback<T extends Record<string, unknown>>(
  en: T,
  so: Record<string, unknown>
): T {
  const result = { ...en };
  for (const key of Object.keys(so)) {
    const soVal = so[key];
    const enVal = en[key as keyof T];
    if (
      soVal != null &&
      typeof soVal === 'object' &&
      !Array.isArray(soVal) &&
      enVal != null &&
      typeof enVal === 'object' &&
      !Array.isArray(enVal)
    ) {
      result[key as keyof T] = mergeWithEnglishFallback(
        enVal as Record<string, unknown>,
        soVal as Record<string, unknown>
      ) as T[keyof T];
    } else if (soVal !== undefined) {
      result[key as keyof T] = soVal as T[keyof T];
    }
  }
  return result;
}
