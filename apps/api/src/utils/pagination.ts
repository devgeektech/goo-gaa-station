/** Max allowed limit for list/paginated endpoints (production guard). */
export const MAX_PAGINATION_LIMIT = 100;

export function parsePagination(
  query: { page?: unknown; limit?: unknown },
  defaultLimit = 20
) {
  const page = Math.max(1, parseInt(String(query.page), 10) || 1);
  const rawLimit = parseInt(String(query.limit), 10) || defaultLimit;
  const limit = Math.min(MAX_PAGINATION_LIMIT, Math.max(1, rawLimit));
  return { page, limit };
}
