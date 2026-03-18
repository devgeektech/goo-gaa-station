'use client';

import { createContext, useCallback, useContext, useState, type PropsWithChildren } from 'react';

type VendorPendingContextValue = {
  pendingCount: number;
  setPendingCount: (n: number) => void;
};

const VendorPendingContext = createContext<VendorPendingContextValue>({
  pendingCount: 0,
  setPendingCount: () => {},
});

export function VendorPendingProvider({ children }: PropsWithChildren) {
  const [pendingCount, setPendingCount] = useState(0);
  return (
    <VendorPendingContext.Provider value={{ pendingCount, setPendingCount }}>
      {children}
    </VendorPendingContext.Provider>
  );
}

export function useVendorPending(): VendorPendingContextValue {
  const ctx = useContext(VendorPendingContext);
  if (!ctx) throw new Error('useVendorPending must be used within VendorPendingProvider');
  return ctx;
}
