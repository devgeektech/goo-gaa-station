'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useToast } from '@/components/ui/Toast';
import { store } from '@/store/store';
import { api } from '@/store/api';

const SOCKET_PATH = '/socket.io';

function getSocketUrl(): string {
  if (typeof window === 'undefined') return '';
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  return base.replace(/\/api\/v1\/?$/, '');
}

export function ProductSocketListener() {
  const toast = useToast();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const url = getSocketUrl();
    if (!url) return;

    const socket = io(url, {
      path: SOCKET_PATH,
      withCredentials: true,
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('admin:join');
    });

    socket.on('product:created', (payload: { productId: string; productName: string; vendorId: string; vendorName: string; categoryName?: string; price?: number; createdAt?: string }) => {
      const price = payload.price != null ? `$${Number(payload.price).toFixed(2)}` : '';
      toast.push({
        title: `New product by ${payload.vendorName}: ${payload.productName}${price ? ` — ${price}` : ''}`,
        variant: 'success',
      });
      store.dispatch(api.util.invalidateTags([{ type: 'VendorProducts', id: String(payload.vendorId) }]));
    });

    socket.on('product:toggled', (payload: { productId: string; productName: string; vendorId: string; vendorName: string; isAvailable: boolean }) => {
      if (payload.isAvailable === false) {
        toast.push({
          title: `${payload.vendorName} marked "${payload.productName}" out of stock`,
          variant: 'info',
        });
      }
      store.dispatch(api.util.invalidateTags([{ type: 'VendorProducts', id: String(payload.vendorId) }]));
    });

    socket.on('product:deleted', (payload: { productId: string; productName: string; vendorId: string; vendorName: string }) => {
      toast.push({
        title: `${payload.vendorName} deleted product "${payload.productName}"`,
        variant: 'warning',
      });
      store.dispatch(api.util.invalidateTags([{ type: 'VendorProducts', id: String(payload.vendorId) }]));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [toast]);

  return null;
}
