import { useState, useEffect, useCallback } from 'react';
import { me, login, register, logout } from '../api/endpoints';
import type { PublicUser } from '@kitchen-rush/shared/api';

// SECURITY: username-only auth — anyone who knows your username can log in as you.
// See DECISIONS.md §7 and architecture.md §7.

interface AuthState {
  user: PublicUser | null;
  restaurantId: number | null;
  isAuthed: boolean;
  loading: boolean;
  error: string | null;
}

interface UseAuthResult extends AuthState {
  login: (username: string) => Promise<void>;
  register: (username: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [state, setState] = useState<AuthState>({
    user: null,
    restaurantId: null,
    isAuthed: false,
    loading: true,
    error: null,
  });

  // On mount: check if we already have a valid session cookie
  useEffect(() => {
    me()
      .then((res) => {
        if (res) {
          setState({
            user: res.user,
            restaurantId: res.restaurantId,
            isAuthed: true,
            loading: false,
            error: null,
          });
        } else {
          setState((s) => ({ ...s, loading: false }));
        }
      })
      .catch(() => {
        // 401 = not logged in; just clear loading
        setState({ user: null, restaurantId: null, isAuthed: false, loading: false, error: null });
      });
  }, []);

  const handleLogin = useCallback(async (username: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await login(username);
      if (res) {
        setState({
          user: res.user,
          restaurantId: res.restaurantId,
          isAuthed: true,
          loading: false,
          error: null,
        });
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      }));
      throw err;
    }
  }, []);

  const handleRegister = useCallback(async (username: string, displayName?: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await register(username, displayName ?? username);
      if (res) {
        setState({
          user: res.user,
          restaurantId: res.restaurantId,
          isAuthed: true,
          loading: false,
          error: null,
        });
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Register failed',
      }));
      throw err;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await logout().catch(() => {
      // ignore server errors on logout — clear client state regardless
    });
    setState({ user: null, restaurantId: null, isAuthed: false, loading: false, error: null });
  }, []);

  return {
    ...state,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
  };
}
