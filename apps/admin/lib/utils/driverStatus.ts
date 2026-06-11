/** Account lifecycle (active / blocked / deleted) — not the same as online for deliveries. */
export function accountStatusBadge(status?: string): { label: string; background: string } {
  if (status === 'blocked') return { label: 'Blocked', background: 'var(--danger-light)' };
  if (status === 'deleted') return { label: 'Deleted', background: 'var(--warning-light)' };
  return { label: 'Account active', background: 'var(--border-light)' };
}

/** Driver is online in the app (isOnline), separate from account status. */
export function onlineStatusBadge(isOnline?: boolean): { label: string; background: string } {
  return isOnline
    ? { label: 'Online', background: 'var(--success-light)' }
    : { label: 'Offline', background: 'var(--border-light)' };
}

export function approvalStatusBadge(approvalStatus?: string): { label: string; background: string } {
  if (approvalStatus === 'approved') return { label: 'Approved', background: 'var(--success-light)' };
  if (approvalStatus === 'rejected') return { label: 'Rejected', background: 'var(--danger-light)' };
  if (approvalStatus === 'pending') return { label: 'Pending', background: 'var(--warning-light)' };
  return { label: 'Pending', background: 'var(--warning-light)' };
}
