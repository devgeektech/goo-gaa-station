import { View, Text, Pressable, StyleSheet, AppState, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { io, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SOCKET_URL } from '@/lib/config';
import { patchDriverPresenceStatus } from '@/lib/driverProfileApi';
import { fetchDriverActiveOrders, fetchDriverNewOrders, type DriverNewOrderCard } from '@/lib/driverOrdersApi';

function orderKey(o: DriverNewOrderCard): string {
  return String(o.orderId ?? o.orderNumber ?? '');
}

function isDeliveryActiveError(e: unknown): boolean {
  const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
  return code === 'DELIVERY_ACTIVE';
}

export default function DriverHomeScreen() {
  const router = useRouter();
  const { accessToken, driverId, signOut } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const wentOnlineRef = useRef(false);
  const hasActiveDeliveryRef = useRef(false);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const [isOnline, setIsOnline] = useState(false);
  const [hasActiveDelivery, setHasActiveDelivery] = useState(false);
  const [newOrders, setNewOrders] = useState<DriverNewOrderCard[]>([]);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const refreshActiveDeliveryFlag = useCallback(async (token: string): Promise<boolean> => {
    try {
      const active = await fetchDriverActiveOrders(token, { limit: 1 });
      const hasActive = active.length > 0;
      hasActiveDeliveryRef.current = hasActive;
      setHasActiveDelivery(hasActive);
      return hasActive;
    } catch {
      return hasActiveDeliveryRef.current;
    }
  }, []);

  const refreshNewOrders = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token || !wentOnlineRef.current) return;
    setOrdersLoading(true);
    try {
      const cards = await fetchDriverNewOrders(token);
      setNewOrders(cards);
      await refreshActiveDeliveryFlag(token);
    } catch {
      // Keep last snapshot on transient errors.
    } finally {
      setOrdersLoading(false);
    }
  }, [refreshActiveDeliveryFlag]);

  const goOnline = useCallback(async (token: string) => {
    await patchDriverPresenceStatus(token, 'online');
    wentOnlineRef.current = true;
    setIsOnline(true);
  }, []);

  const goOfflineBestEffort = useCallback(async (token: string) => {
    if (hasActiveDeliveryRef.current) return;
    try {
      await patchDriverPresenceStatus(token, 'offline');
    } catch (e: unknown) {
      if (isDeliveryActiveError(e)) return;
      // ignore other errors on teardown
    }
  }, []);

  const bootstrapPresence = useCallback(
    async (token: string, cancelled: () => boolean) => {
      setOnlineError(null);
      setIsOnline(false);

      const hasActive = await refreshActiveDeliveryFlag(token);
      if (cancelled()) return;

      try {
        if (hasActive) {
          await goOnline(token);
          if (cancelled()) return;
          return;
        }

        await goOnline(token);
        if (cancelled()) return;
        await refreshNewOrders();
      } catch (e: unknown) {
        if (cancelled()) return;
        wentOnlineRef.current = false;
        setIsOnline(false);
        const msg =
          (e as { response?: { data?: { message?: { en?: string } } } })?.response?.data?.message?.en ??
          (e instanceof Error ? e.message : 'Could not go online');
        setOnlineError(msg);
      }
    },
    [goOnline, refreshActiveDeliveryFlag, refreshNewOrders]
  );

  useEffect(() => {
    if (!accessToken || !driverId) return;

    let cancelled = false;
    const isCancelled = () => cancelled;

    void bootstrapPresence(accessToken, isCancelled);

    const appSub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next !== 'active') return;
      const token = accessTokenRef.current;
      if (!token) return;
      void (async () => {
        const hasActive = await refreshActiveDeliveryFlag(token);
        if (!hasActive) return;
        try {
          if (!wentOnlineRef.current) {
            await goOnline(token);
          } else {
            await patchDriverPresenceStatus(token, 'online');
            setIsOnline(true);
          }
        } catch {
          // Presence restore is best-effort on resume.
        }
      })();
    });

    return () => {
      cancelled = true;
      appSub.remove();
      if (wentOnlineRef.current) {
        wentOnlineRef.current = false;
        setIsOnline(false);
        void goOfflineBestEffort(accessToken);
      }
    };
  }, [accessToken, driverId, bootstrapPresence, goOfflineBestEffort, goOnline, refreshActiveDeliveryFlag]);

  useEffect(() => {
    if (!accessToken || !driverId) return;

    const s = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = s;

    s.on('connect', () => {
      s.emit('driver:join', { driverId, accessToken });
    });

    s.on('driver:session_revoked', async () => {
      if (accessToken && wentOnlineRef.current) {
        wentOnlineRef.current = false;
        setIsOnline(false);
        await goOfflineBestEffort(accessToken);
      }
      await signOut();
      router.replace('/login');
    });

    s.on('driver:location_update', (payload: { success?: boolean }) => {
      if (payload?.success !== true) return;
      void refreshNewOrders();
    });

    s.on('order:driver_request', () => {
      void refreshNewOrders();
    });

    s.on('driver:orders:new_snapshot', (payload: { data?: DriverNewOrderCard[] }) => {
      if (Array.isArray(payload?.data)) {
        setNewOrders(payload.data);
      }
    });

    s.on('driver:orders:active_snapshot', (payload: { data?: DriverNewOrderCard[] }) => {
      if (Array.isArray(payload?.data)) {
        const hasActive = payload.data.length > 0;
        hasActiveDeliveryRef.current = hasActive;
        setHasActiveDelivery(hasActive);
        if (payload.data.length > 0 && accessTokenRef.current) {
          void (async () => {
            try {
              if (!wentOnlineRef.current) {
                await goOnline(accessTokenRef.current!);
              } else {
                await patchDriverPresenceStatus(accessTokenRef.current!, 'online');
                setIsOnline(true);
              }
            } catch {
              // best effort
            }
          })();
        }
      }
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, driverId, signOut, router, refreshNewOrders, goOfflineBestEffort, goOnline]);

  useEffect(() => {
    if (!driverId) return;

    const LOCATION_EMIT_MS = 15_000;

    const stop = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };

    const tick = async () => {
      if (inFlightRef.current || !wentOnlineRef.current) return;
      const s = socketRef.current;
      if (!s || !s.connected) return;

      try {
        inFlightRef.current = true;
        if (!navigator?.geolocation?.getCurrentPosition) return;

        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p),
            (e) => reject(e),
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
          );
        });

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        s.emit('driver:location_update', { driverId, lat, lng });
      } catch {
        // Best-effort location update; ignore permission/timeouts.
      } finally {
        inFlightRef.current = false;
      }
    };

    const start = () => {
      if (intervalRef.current) return;
      void tick();
      intervalRef.current = setInterval(() => {
        void tick();
      }, LOCATION_EMIT_MS);
    };

    if (appStateRef.current === 'active') start();

    const sub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next === 'active') start();
      else stop();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [driverId]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Driver dashboard</Text>
      {onlineError ? (
        <Text style={styles.error}>Online failed: {onlineError}</Text>
      ) : (
        <Text style={styles.muted}>
          {isOnline
            ? hasActiveDelivery
              ? 'You are online — active delivery in progress.'
              : 'You are online — new delivery requests appear below.'
            : 'Going online…'}
        </Text>
      )}

      <View style={styles.ordersHeader}>
        <Text style={styles.ordersTitle}>New orders</Text>
        {ordersLoading ? <ActivityIndicator size="small" /> : null}
      </View>

      <ScrollView style={styles.ordersList} contentContainerStyle={styles.ordersListContent}>
        {newOrders.length === 0 ? (
          <Text style={styles.muted}>No new orders right now. Stay online near restaurants during the 2-minute window.</Text>
        ) : (
          newOrders.map((o) => (
            <View key={orderKey(o)} style={styles.orderCard}>
              <Text style={styles.orderNumber}>{o.orderNumber ?? o.orderId}</Text>
              <Text style={styles.orderVendor}>{o.vendor?.name ?? 'Vendor'}</Text>
              {o.vendor?.address ? <Text style={styles.orderMuted}>{o.vendor.address}</Text> : null}
              <Text style={styles.orderPayout}>
                Payout: {typeof o.estimatedPayout === 'number' ? o.estimatedPayout : '—'}
                {o.distance != null ? ` · ${o.distance} km` : ''}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <Pressable
        style={styles.secondary}
        onPress={async () => {
          if (accessToken && wentOnlineRef.current) {
            wentOnlineRef.current = false;
            setIsOnline(false);
            await goOfflineBestEffort(accessToken);
          }
          await signOut();
          router.replace('/login');
        }}
      >
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: '800' },
  muted: { color: '#666', marginTop: 8, lineHeight: 20 },
  error: { color: '#b42318', marginTop: 8, lineHeight: 20, fontWeight: '600' },
  ordersHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  ordersTitle: { fontSize: 17, fontWeight: '700' },
  ordersList: { flex: 1, marginTop: 8 },
  ordersListContent: { paddingBottom: 16, gap: 10 },
  orderCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    backgroundColor: '#fafafa',
  },
  orderNumber: { fontWeight: '800', fontSize: 15 },
  orderVendor: { marginTop: 4, fontWeight: '600' },
  orderMuted: { color: '#666', fontSize: 12, marginTop: 2 },
  orderPayout: { marginTop: 6, fontWeight: '600', color: '#0a6b3a' },
  secondary: {
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { fontWeight: '600' },
});
