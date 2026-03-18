import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';

const SOCKET_URL = Constants.expoConfig?.extra?.socketUrl ?? process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:5000';

export type VendorSocketEvents = {
  onApproved: () => void;
  onRejected: () => void;
};

/**
 * Connect to Socket.IO and listen for vendor:approved and vendor:rejected.
 * Call connect() with accessToken so the server can identify the vendor room if needed.
 * The backend currently emits to 'admin' room; vendor-specific room can be added later.
 * For now we rely on polling; this hook sets up listeners when vendor joins a vendor room.
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

    socket.on('vendor:approved', () => {
      handlersRef.current.onApproved();
    });
    socket.on('vendor:rejected', () => {
      handlersRef.current.onRejected();
    });

    socketRef.current = socket;
    return () => {
      disconnect();
    };
  }, [accessToken, disconnect]);

  return { disconnect };
}
