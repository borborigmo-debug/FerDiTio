/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/layout/Header';
import { LoginView } from './components/auth/LoginView';
import { WelcomeView } from './components/dashboard/WelcomeView';
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

  // 2. Estado Autenticado: Muestra la vista del docente
  if (status === 'authenticated') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <main className="flex-1 py-6">
          <WelcomeView />
        </main>
      </div>
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
