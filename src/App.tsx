/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CuadernoProvider } from './context/CuadernoContext';
import { Header } from './components/layout/Header';
import { LoginView } from './components/auth/LoginView';
import { MainContent } from './components/dashboard/MainContent';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorBoundary } from './components/common/ErrorBoundary';

const AppContent: React.FC = () => {
  const { status } = useAuth();

  // 1. Estado de Inicialización: No se renderiza ninguna pantalla protegida hasta resolver Firebase
  if (status === 'initializing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner
          message="Iniciando Fernanditio y verificando sesión..."
          size="lg"
        />
      </div>
    );
  }

  // 2. Estado Autenticado: Muestra la cabecera global de dos filas y el contenido del cuaderno
  if (status === 'authenticated') {
    return (
      <CuadernoProvider>
        <div className="min-h-screen bg-slate-50 flex flex-col">
          <Header />
          <main className="flex-1 py-5 px-3 sm:px-6 max-w-7xl w-full mx-auto">
            <MainContent />
          </main>
        </div>
      </CuadernoProvider>
    );
  }

  // 3. Estados No Autenticado o Sin Configurar: Muestra la vista de acceso
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <main className="flex-1">
        <LoginView />
      </main>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="Error inesperado en Fernanditio">
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
