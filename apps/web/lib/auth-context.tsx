'use client';

import type { PublicUser } from '@raptor/shared';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, getMe, logout as apiLogout } from './api';

interface AuthState {
  user: PublicUser | null;
  // True when there IS a valid session but MustResetPasswordGuard is
  // rejecting every route except /auth/set-password (an admin-created
  // staff account's first login, apps/api/src/auth/guards/
  // must-reset-password.guard.ts). GET /auth/me itself is one of the
  // routes it blocks, so a 403 with this code means "logged in, not
  // 'logged out'" — collapsing it to user: null would make the
  // set-password page itself redirect back to /login.
  mustResetPassword: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [mustResetPassword, setMustResetPassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me);
      setMustResetPassword(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MUST_RESET_PASSWORD') {
        setMustResetPassword(true);
      } else {
        setUser(null);
        setMustResetPassword(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setMustResetPassword(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, mustResetPassword, loading, refresh, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// The session cookie itself is HttpOnly — this is the only way the
// frontend can know who (if anyone) is logged in (see GET /auth/me,
// apps/api/src/auth/auth.controller.ts:83).
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
