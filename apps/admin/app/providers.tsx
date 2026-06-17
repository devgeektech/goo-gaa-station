'use client';

import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { ThemeProvider } from 'next-themes';
import { store } from '@/store/store';
import { ToastProvider } from '@/components/ui/Toast';
import { ProductSocketListener } from '@/components/ProductSocketListener';
import { LocaleProvider } from '@/lib/i18n/LocaleContext';

export function Providers({ children }: PropsWithChildren) {
  return (
    <Provider store={store}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <LocaleProvider>
          <ToastProvider>
            <ProductSocketListener />
            {children}
          </ToastProvider>
        </LocaleProvider>
      </ThemeProvider>
    </Provider>
  );
}

