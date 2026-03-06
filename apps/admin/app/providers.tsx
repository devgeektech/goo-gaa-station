'use client';

import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { ThemeProvider } from 'next-themes';
import { store } from '@/store/store';
import { ToastProvider } from '@/components/ui/Toast';

export function Providers({ children }: PropsWithChildren) {
  return (
    <Provider store={store}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </Provider>
  );
}

