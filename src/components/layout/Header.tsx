/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { BookOpen, LogOut, User } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, status, logout } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Marca y Subtítulo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <BookOpen className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-slate-900 tracking-tight">Fernanditio</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                Fase 2
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Evaluación por Criterios · Lengua Castellana y Literatura
            </p>
          </div>
        </div>

        {/* Zona de usuario / Cierre de sesión */}
        {status === 'authenticated' && user && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 text-right">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Avatar del profesor'}
                  className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                  <User className="w-4 h-4" aria-hidden="true" />
                </div>
              )}
              <div className="hidden md:block text-left">
                <p className="text-xs font-medium text-slate-900 leading-tight">
                  {user.displayName || 'Docente'}
                </p>
                <p className="text-xs text-slate-500 leading-tight">{user.email}</p>
              </div>
            </div>

            <button
              onClick={() => logout()}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-red-700 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-md transition-colors"
              title="Cerrar sesión en Firebase"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
