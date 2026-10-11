/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  NextOrObserver,
} from 'firebase/auth';
import { auth, isFirebaseConfigured, getFirebaseErrorMessage } from '../config/firebase';
import { AuthUser } from '../types';

/**
 * Proveedor oficial de Google configurado con parámetros estándar
 */
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Inicia sesión exclusivamente mediante Google utilizando Firebase Authentication.
 * No existen vías de acceso por contraseña ni usuarios simulados.
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  if (!auth || !isFirebaseConfigured) {
    throw new Error('Firebase Authentication no está configurado en las variables de entorno.');
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
  } catch (error: any) {
    const errorCode = error?.code || 'unknown';
    const readableMessage = getFirebaseErrorMessage(errorCode);
    const customError = new Error(readableMessage);
    (customError as any).code = errorCode;
    throw customError;
  }
}

/**
 * Cierre de sesión real de Firebase Authentication.
 */
export async function signOutUser(): Promise<void> {
  if (!auth) {
    return;
  }
  await signOut(auth);
}

/**
 * Obtiene el ID Token criptográfico vigente del usuario autenticado.
 * Esta función centralizada será utilizada para autorizar peticiones protegidas al backend.
 *
 * @param forceRefresh Fuerza la renovación del token si está próximo a expirar
 * @returns Token JWT de Firebase firmado por Google o null si no hay sesión
 */
export async function getCurrentIdToken(forceRefresh = false): Promise<string | null> {
  if (!auth || !auth.currentUser) {
    return null;
  }

  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch (error) {
    console.error('[AuthService] Error al obtener el ID Token de Firebase:', error);
    return null;
  }
}

/**
 * Suscribe un observador al cambio de estado de autenticación de Firebase.
 *
 * @returns Función para cancelar la suscripción
 */
export function subscribeToAuthChanges(callback: NextOrObserver<User>): () => void {
  if (!auth) {
    // Si no está configurado, invoca inmediatamente con null
    if (typeof callback === 'function') {
      callback(null);
    } else if (callback && typeof callback.next === 'function') {
      callback.next(null);
    }
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

/**
 * Mapea un User de Firebase al tipo de dominio AuthUser
 */
export function mapFirebaseUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}
