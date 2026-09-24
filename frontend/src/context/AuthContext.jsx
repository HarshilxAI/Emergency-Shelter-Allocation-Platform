import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { authApi, setToken, getToken, onSessionExpired } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `initialising` covers the first token check on page load, so protected
  // routes wait instead of bouncing an authenticated user to the login page.
  const [initialising, setInitialising] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [adminPasskeyEnabled, setAdminPasskeyEnabled] = useState(false);

  const [googleClientId, setGoogleClientId] = useState(null);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Ask the API which optional providers are actually configured
      try {
        const cfg = await authApi.config();
        if (!cancelled) {
          setGoogleEnabled(Boolean(cfg?.googleAuthEnabled));
          setGoogleClientId(cfg?.googleClientId || null);
          setAdminPasskeyEnabled(Boolean(cfg?.adminPasskeyEnabled));
        }
      } catch {
        if (!cancelled) setGoogleEnabled(false);
      }

      if (!getToken()) {
        if (!cancelled) setInitialising(false);
        return;
      }
      try {
        const data = await authApi.me();
        if (!cancelled) setUser(data.user);
      } catch {
        setToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setInitialising(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // A rejected token anywhere in the app ends the session immediately.
  useEffect(() => onSessionExpired(signOut), [signOut]);

  const signIn = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const signInWithGoogle = useCallback(async ({ credential, role, adminPasskey }) => {
    const data = await authApi.google({ credential, role, adminPasskey });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (details) => {
    const data = await authApi.register(details);
    setToken(data.token);
    setUser(data.user);
    return { user: data.user, adminRequestDenied: data.adminRequestDenied || null };
  }, []);

  const value = useMemo(
    () => ({
      user,
      initialising,
      googleEnabled,
      googleClientId,
      adminPasskeyEnabled,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      signIn,
      signInWithGoogle,
      register,
      signOut,
      setUser
    }),
    [user, initialising, googleEnabled, googleClientId, adminPasskeyEnabled, signIn, signInWithGoogle, register, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
