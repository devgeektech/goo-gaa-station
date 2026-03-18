import type { PropsWithChildren } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { VendorPendingProvider } from '@/lib/context/VendorPendingContext';

export default function DashboardLayout({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary>
      <VendorPendingProvider>
        <DashboardShell>{children}</DashboardShell>
      </VendorPendingProvider>
    </ErrorBoundary>
  );
}

