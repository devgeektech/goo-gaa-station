import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearTokens, getAccessToken, setTokens } from '../lib/authStorage';
import { getVendorIdFromAccessToken } from '../lib/jwtVendorId';
import { setVendorAccessToken } from '../api/client';

type AuthContextValue = {
  accessToken: string | null;
  vendorId: string | null;
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
        setVendorAccessToken(t);
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
    setVendorAccessToken(access);
    setAccessToken(access);
  }, []);

  const signOut = useCallback(async () => {
    await clearTokens();
    setVendorAccessToken(null);
    setAccessToken(null);
  }, []);

  const vendorId = accessToken ? getVendorIdFromAccessToken(accessToken) : null;

  const value = useMemo(
    () => ({ accessToken, vendorId, ready, setSession, signOut }),
    [accessToken, vendorId, ready, setSession, signOut]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
