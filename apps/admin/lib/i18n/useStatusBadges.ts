'use client';

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useTranslations } from './useTranslations';

/** Driver account / online / approval badges with locale-aware labels. */
export function useDriverStatusBadges() {
  const t = useTranslations();
  return useMemo(
    () => ({
      accountStatusBadge(status?: string): { label: string; background: string } {
        if (status === 'blocked') return { label: t.status.account.blocked, background: 'var(--danger-light)' };
        if (status === 'deleted') return { label: t.status.account.deleted, background: 'var(--warning-light)' };
        return { label: t.status.account.active, background: 'var(--border-light)' };
      },
      onlineStatusBadge(isOnline?: boolean): { label: string; background: string } {
        return isOnline
          ? { label: t.status.online.online, background: 'var(--success-light)' }
          : { label: t.status.online.offline, background: 'var(--border-light)' };
      },
      approvalStatusBadge(approvalStatus?: string): { label: string; background: string } {
        if (approvalStatus === 'approved') return { label: t.status.approval.approved, background: 'var(--success-light)' };
        if (approvalStatus === 'rejected') return { label: t.status.approval.rejected, background: 'var(--danger-light)' };
        return { label: t.status.approval.pending, background: 'var(--warning-light)' };
      },
    }),
    [t]
  );
}

/** Vendor approval and availability badges with locale-aware labels. */
export function useVendorStatusBadges() {
  const t = useTranslations();
  return useMemo(
    () => ({
      approvalStatusBadge(status?: string | null): { label: string; style: CSSProperties } {
        switch (status) {
          case 'pending':
            return { label: t.status.approval.pendingReview, style: { background: 'rgba(249, 115, 22, 0.2)', color: '#ea580c' } };
          case 'approved':
            return { label: t.status.approval.approved, style: { background: 'var(--success-light)', color: 'var(--success)' } };
          case 'rejected':
            return { label: t.status.approval.rejected, style: { background: 'var(--danger-light)', color: 'var(--danger)' } };
          case 'none':
          default:
            return { label: t.status.approval.incomplete, style: { background: 'var(--border-light)', color: 'var(--text-secondary)' } };
        }
      },
      availabilityBadge(vendor: {
        isAvailableNow?: boolean;
        isOpen?: boolean;
        withinOperatingHours?: boolean;
      }): { label: string; background: string; hint?: string } {
        if (vendor.isAvailableNow === true) {
          return { label: t.status.online.online, background: 'var(--success-light)' };
        }
        let hint: string = t.status.online.offline;
        if (vendor.isOpen !== true) {
          hint = t.vendors.availHintAppOffline;
        } else if (vendor.withinOperatingHours === false) {
          hint = t.vendors.availHintOutsideHours;
        }
        return { label: t.status.online.offline, background: 'var(--border-light)', hint };
      },
    }),
    [t]
  );
}
