/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCuaderno } from '../../context/CuadernoContext';
import { GroupSelector } from './GroupSelector';
import {
  Settings,
  Server,
  User,
  ShieldCheck,
  RefreshCw,
  Folder,
  Layers,
  Database,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';

export const ConfiguracionView: React.FC = () => {
  const { user, getIdToken } = useAuth();
  const {
    grupos,
    selectedGrupoId,
    selectGrupo,
    isLoadingGrupos,
    refreshGrupos,
    cuadernoData,
    connectionInfo,
    checkServerConnection,
  } = useCuaderno();

  // Estado para la prueba de verificación de autenticación y Edge Functions en Supabase
  const [testResult, setTestResult] = useState<{
    httpStatus: number | null;
    statusText: string;
    isSuccess: boolean;
    data: any;
    errorMessage?: string;
    timestamp: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestSupabaseAuth = async () => {
    if (!user) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const token = await getIdToken(true);
      if (!token) {
        setTestResult({
          httpStatus: null,
          statusText: '',
          isSuccess: false,
          data: null,
          errorMessage: 'No se pudo obtener el ID token de Firebase.',
          timestamp: new Date().toLocaleTimeString(),
        });
        return;
      }

      const endpoint = 'https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1/firebase-auth-check';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      let responseBody: any;
      try {
        responseBody = await response.json();
      } catch {
        responseBody = { mensaje: 'La respuesta no devolvió un JSON.' };
      }

      setTestResult({
        httpStatus: response.status,
        statusText: response.statusText,
        isSuccess: response.ok,
        data: responseBody,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      setTestResult({
        httpStatus: null,
        statusText: '',
        isSuccess: false,
        data: null,
        errorMessage: err?.message || 'Error de red al conectar con Supabase.',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera de Configuración */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Configuración y Administración</h2>
            <p className="text-xs text-slate-500">
              Gestión de cursos, verificación del docente y diagnóstico de conexión con Supabase.
            </p>
          </div>
        </div>
      </div>

      {/* 1. Selector y Gestión de Grupos */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Gestión de Grupos y Cursos
            </h3>
          </div>
          <button
            type="button"
            onClick={() => refreshGrupos()}
            disabled={isLoadingGrupos}
            className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGrupos ? 'animate-spin' : ''}`} />
            <span>Recargar grupos</span>
          </button>
        </div>

        <GroupSelector
          grupos={grupos}
          selectedGrupoId={selectedGrupoId}
          onSelectGrupo={(id) => selectGrupo(id)}
          isLoading={isLoadingGrupos}
        />
      </div>

      {/* 2. Información del Docente y Sesión */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-600" />
            Cuenta del Docente
          </h3>
          <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1.5 font-mono">
            <p>
              <strong className="font-sans text-slate-500">Nombre:</strong>{' '}
              <span className="text-slate-900 font-bold">{user?.displayName || 'Docente'}</span>
            </p>
            <p>
              <strong className="font-sans text-slate-500">Correo:</strong>{' '}
              <span className="text-slate-900">{user?.email}</span>
            </p>
            <p>
              <strong className="font-sans text-slate-500">UID Firebase:</strong>{' '}
              <span className="text-slate-500 text-[11px]">{user?.uid}</span>
            </p>
          </div>
        </div>

        {/* 3. Diagnóstico de Conexión y Seguridad */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Estado de Conexión con Supabase
          </h3>
          <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Estado global:</span>
              <span className="font-bold text-slate-900">{connectionInfo.label}</span>
            </div>
            <p className="text-[11px] text-slate-500">{connectionInfo.details}</p>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => checkServerConnection()}
                className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Verificar ahora</span>
              </button>
              <button
                type="button"
                onClick={handleTestSupabaseAuth}
                disabled={isTesting}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md text-[11px] flex items-center gap-1 cursor-pointer"
              >
                {isTesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Server className="w-3 h-3" />}
                <span>Test Edge Function</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resultados de la prueba si se ejecutó */}
      {testResult && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">Resultado de la verificación Edge Function:</span>
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                testResult.isSuccess ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              HTTP {testResult.httpStatus || 'Error'} ({testResult.timestamp})
            </span>
          </div>
          {testResult.errorMessage && (
            <p className="text-rose-700">{testResult.errorMessage}</p>
          )}
          {testResult.data && (
            <pre className="p-2.5 bg-slate-900 text-slate-200 rounded text-[11px] overflow-x-auto font-mono">
              {JSON.stringify(testResult.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
