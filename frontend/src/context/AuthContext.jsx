/**
 * context/AuthContext.jsx — Global Authentication State
 * =======================================================
 * Provides authentication state and actions to the entire app via Context API.
 *
 * State stored:
 *   - token     : JWT string (persisted to localStorage)
 *   - user      : { user_id, role, name } (persisted to localStorage)
 *
 * Provides:
 *   - login(tokenResponse)  → store token + user, redirect
 *   - logout()              → clear state + redirect to /login
 *   - isAuthenticated        → boolean
 *   - isTeacher              → boolean
 *   - isStudent              → boolean
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const AuthContext = createContext(null);

// Storage keys
const TOKEN_KEY = 'snap_token';
const USER_KEY  = 'snap_user';

export function AuthProvider({ children }) {
  // ── Initialise from localStorage so refresh doesn't log the user out ────
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user,  setUser]  = useState(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // ── Log state changes for debugging ──────────────────────────────────────
  useEffect(() => {
    if (user) {
      console.log(`[AuthContext] Active session: user_id=${user.user_id}, role=${user.role}`);
    } else {
      console.log('[AuthContext] No active session.');
    }
  }, [user]);

  /**
   * Called after a successful login API response.
   * @param {{ access_token, role, user_id, name }} tokenResponse
   */
  const login = useCallback((tokenResponse) => {
    const { access_token, role, user_id, name } = tokenResponse;
    console.log(`[AuthContext] login() called: user_id=${user_id}, role=${role}`);

    localStorage.setItem(TOKEN_KEY, access_token);
    const userData = { user_id, role, name };
    localStorage.setItem(USER_KEY, JSON.stringify(userData));

    setToken(access_token);
    setUser(userData);
  }, []);

  /**
   * Clears all auth state and redirects to login page.
   */
  const logout = useCallback(() => {
    console.log('[AuthContext] logout() called — clearing session.');
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    // Hard redirect to ensure all component state is cleared
    window.location.href = '/login';
  }, []);

  const value = {
    token,
    user,
    login,
    logout,
    isAuthenticated: Boolean(token && user),
    isTeacher: user?.role === 'teacher',
    isStudent:  user?.role === 'student',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Custom hook for consuming auth context.
 * Usage: const { user, isAuthenticated, logout } = useAuth();
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth() must be used inside <AuthProvider>');
  }
  return context;
}
