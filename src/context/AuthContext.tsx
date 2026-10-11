/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { AuthUser, AuthStatus } from '../types';
import { checkFirebaseConfig } from '../config/firebase';
import {
  signInWithGoogle,
  signOutUser,
  getCurrentIdToken,
  subscribeToAuthChanges,
  mapFirebaseUser,
} from '../services/authService';

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  missingConfigKeys: string[];
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [missingConfigKeys, setMissingConfigKeys] = useState<string[]>([]);

  useEffect(() => {
    const config = checkFirebaseConfig();

    if (!config.isConfigured) {
      setMissingConfigKeys(config.missingKeys);
      setStatus('unconfigured');
      return;
    }

    // Suscribir al estado de autenticación real de Firebase
    const unsubscribe = subscribeToAuthChanges((firebaseUser) => {
      if (firebaseUser) {
        setUser(mapFirebaseUser(firebaseUser));
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const loggedUser = await signInWithGoogle();
      setUser(loggedUser);
      setStatus('authenticated');
    } catch (err: any) {
      console.error('[AuthContext] Error al iniciar sesión:', err);
      setError(err?.message || 'Error desconocido al iniciar sesión.');
      // No modificamos el status a authenticated en caso de fallo
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    try {
      await signOutUser();
      setUser(null);
      setStatus('unauthenticated');
    } catch (err: any) {
      console.error('[AuthContext] Error al cerrar sesión:', err);
      setError('Error al cerrar la sesión en Firebase.');
    }
  }, []);

  const getIdToken = useCallback(async (forceRefresh = false) => {
    return getCurrentIdToken(forceRefresh);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    error,
    missingConfigKeys,
    loginWithGoogle,
    logout,
    getIdToken,
    clearError,
  }), [user, status, error, missingConfigKeys, loginWithGoogle, logout, getIdToken, clearError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}
