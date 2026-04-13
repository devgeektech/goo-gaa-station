import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearTokens, getAccessToken, setTokens } from '@/lib/authStorage';
import { getDriverIdFromAccessToken } from '@/lib/jwtDriverId';

type AuthContextValue = {
  accessToken: string | null;
  driverId: string | null;
  ready: boolean;
  setSession: (access: string, refresh: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAccessToken();
      if (!cancelled) {
        setAccessToken(t);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback(async (access: string, refresh: string) => {
    await setTokens(access, refresh);
    setAccessToken(access);
  }, []);

  const signOut = useCallback(async () => {
    await clearTokens();
    setAccessToken(null);
  }, []);

  const driverId = accessToken ? getDriverIdFromAccessToken(accessToken) : null;

  const value = useMemo(
    () => ({ accessToken, driverId, ready, setSession, signOut }),
    [accessToken, driverId, ready, setSession, signOut]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
