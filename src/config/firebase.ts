/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, browserLocalPersistence, setPersistence } from 'firebase/auth';

/**
 * Variables requeridas para el cliente web de Firebase.
 * Todas deben llevar el prefijo VITE_ para estar disponibles en el navegador.
 */
export const REQUIRED_FIREBASE_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export interface FirebaseConfigStatus {
  isConfigured: boolean;
  missingKeys: string[];
}

/**
 * Comprueba si las variables de entorno de Firebase están presentes y tienen valores válidos (no ejemplos por defecto).
 */
export function checkFirebaseConfig(): FirebaseConfigStatus {
  const missingKeys: string[] = [];

  for (const key of REQUIRED_FIREBASE_ENV_VARS) {
    const value = import.meta.env[key];
    if (!value || typeof value !== 'string' || value.trim() === '' || value.includes('tu-proyecto') || value.includes('Example')) {
      missingKeys.push(key);
    }
  }

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
  };
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

const configStatus = checkFirebaseConfig();

if (configStatus.isConfigured) {
  try {
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);

    // Asegurar persistencia local segura para evitar cierres de sesión inesperados al recargar
    setPersistence(firebaseAuth, browserLocalPersistence).catch((err) => {
      console.warn('[Firebase] Advertencia al configurar persistencia local:', err);
    });
  } catch (error) {
    console.error('[Firebase] Error durante la inicialización:', error);
    firebaseApp = null;
    firebaseAuth = null;
  }
}

/**
 * Instancia de autenticación de Firebase (null si no está configurada).
 */
export const auth = firebaseAuth;
export const app = firebaseApp;
export const isFirebaseConfigured = Boolean(firebaseAuth);

/**
 * Traducción de códigos de error habituales de Firebase Auth a mensajes comprensibles para el docente.
 */
export function getFirebaseErrorMessage(code: string): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'La ventana de inicio de sesión de Google fue cerrada antes de completar el acceso.';
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana emergente de Google. Por favor, permite las ventanas emergentes para este sitio.';
    case 'auth/cancelled-popup-request':
      return 'Se inició otra solicitud de acceso antes de completar la anterior.';
    case 'auth/network-request-failed':
      return 'Error de conexión de red. Comprueba tu conexión a Internet y vuelve a intentarlo.';
    case 'auth/unauthorized-domain':
      return 'Este dominio web no está autorizado en la consola de Firebase. Añade el dominio en Authentication > Settings > Authorized domains.';
    case 'auth/operation-not-allowed':
      return 'El proveedor de Google no está habilitado en la consola de Firebase de este proyecto.';
    case 'auth/user-disabled':
      return 'Esta cuenta de usuario ha sido inhabilitada.';
    default:
      return 'No se pudo completar el inicio de sesión con Google. Por favor, inténtalo de nuevo.';
  }
}
