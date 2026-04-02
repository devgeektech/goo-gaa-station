import { View, Text, Pressable, StyleSheet, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { io, type Socket } from 'socket.io-client';
import { useEffect, useRef } from 'react';
import { SOCKET_URL } from '@/lib/config';

export default function DriverHomeScreen() {
  const router = useRouter();
  const { accessToken, driverId, signOut } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!accessToken || !driverId) return;

    const s = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = s;

    s.on('connect', () => {
      s.emit('driver:join', { driverId, accessToken });
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, driverId]);

  useEffect(() => {
    if (!driverId) return;

    const LOCATION_EMIT_MS = 15_000;

    const stop = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };

    const tick = async () => {
      if (inFlightRef.current) return;
      const s = socketRef.current;
      if (!s || !s.connected) return;

      try {
        inFlightRef.current = true;
        if (!navigator?.geolocation?.getCurrentPosition) return;

        const pos = await new Promise<any>((resolve, reject) => {
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
      // Emit immediately, then every 15s while foreground.
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
      <Text style={styles.muted}>You are on the main home screen. Hook tabs / orders here (Phase 8+).</Text>
      <Pressable
        style={styles.secondary}
        onPress={async () => {
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
  secondary: {
    marginTop: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { fontWeight: '600' },
});
