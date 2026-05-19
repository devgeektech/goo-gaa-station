/** Display average driver rating from delivered order ratings. */
export function formatDriverRating(
  rating?: number | null,
  ratingCount?: number
): { value: string; subtitle: string } {
  const count = ratingCount ?? 0;
  if (count <= 0 || rating == null) {
    return { value: '—', subtitle: 'No ratings yet' };
  }
  const subtitle = count === 1 ? '1 delivery rating' : `${count} delivery ratings`;
  return { value: Number(rating).toFixed(1), subtitle };
}
