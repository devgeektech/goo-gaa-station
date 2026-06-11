import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';

const SOCKET_URL = Constants.expoConfig?.extra?.socketUrl ?? process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:5000';

export type VendorSocketEvents = {
  vendorId?: string | null;
  onApproved: () => void;
  onRejected: () => void;
  onNewOrder?: (order: {
    orderId: string;
    orderNumber: string;
    items: Array<{ name: string; qty: number; unitPrice: number; subtotal: number; itemId?: string | null }>;
    totalAmount: number;
    paymentMethod: string;
    vendorResponseDeadline: string;
    remainingSeconds: number;
  }) => void;
};

/**
 * Connect to Socket.IO, join vendor room with JWT, and listen for vendor events.
 * Server sets isOpen true on join and isOpen false on disconnect/logout.
 */
export function useVendorSocket(accessToken: string | null, handlers: VendorSocketEvents) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      const vendorId = handlersRef.current.vendorId;
      socket.emit('vendor:join', {
        accessToken,
        ...(vendorId ? { vendorId } : {}),
      });
    });

    socket.on('vendor:approved', () => {
      handlersRef.current.onApproved();
    });
    socket.on('vendor:rejected', () => {
      handlersRef.current.onRejected();
    });
    socket.on('order:new', (order) => {
      handlersRef.current.onNewOrder?.(order);
    });

    socketRef.current = socket;
    return () => {
      disconnect();
    };
  }, [accessToken, disconnect]);

  return { disconnect };
}
