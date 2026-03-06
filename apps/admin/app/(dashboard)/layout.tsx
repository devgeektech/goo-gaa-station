import type { PropsWithChildren } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function DashboardLayout({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary>
      <DashboardShell>{children}</DashboardShell>
    </ErrorBoundary>
  );
}

