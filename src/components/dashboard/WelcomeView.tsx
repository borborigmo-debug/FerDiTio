/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  Clock,
  Layers,
  Database,
  Camera,
  LogOut,
  User,
  AlertCircle,
  Server,
  ArrowRight,
  Folder,
  FolderCheck,
  RefreshCw,
  Users,
  BookOpen,
} from 'lucide-react';
import {
  fetchGruposDocente,
  fetchCuadernoGrupo,
  GrupoDocente,
} from '../../services/gruposService';
import { CuadernoGrupoData } from '../../types';
import { GroupSelector } from './GroupSelector';
import { CuadernoView } from './CuadernoView';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ErrorBoundary } from '../common/ErrorBoundary';

export const WelcomeView: React.FC = () => {
  const { user, logout, getIdToken } = useAuth();
  const [tokenInfo, setTokenInfo] = useState<{
    length: number;
    timestamp: string;
    status: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);

  // Estado para la prueba temporal Firebase -> Supabase Edge Function
  const [supabaseTestResult, setSupabaseTestResult] = useState<{
    httpStatus: number | null;
    statusText: string;
    isSuccess: boolean;
    data: any;
    errorMessage?: string;
    timestamp: string;
  } | null>(null);
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);

  // Estado para la consulta segura de grupos en Supabase
  const [grupos, setGrupos] = useState<GrupoDocente[] | null>(null);
  const [docenteRegistrado, setDocenteRegistrado] = useState<{
    id?: string;
    nombre?: string;
    email?: string;
    registrado?: boolean;
  } | null>(null);
  const [isLoadingGrupos, setIsLoadingGrupos] = useState(false);
  const [gruposError, setGruposError] = useState<string | null>(null);
  const [gruposConsultados, setGruposConsultados] = useState(false);

  // Estado para la Fase 2: Cuaderno del grupo seleccionado
  const [selectedGrupoId, setSelectedGrupoId] = useState<string | null>(null);
  const [cuadernoData, setCuadernoData] = useState<CuadernoGrupoData | null>(null);
  const [isLoadingCuaderno, setIsLoadingCuaderno] = useState(false);
  const [cuadernoError, setCuadernoError] = useState<string | null>(null);

  // Referencias para control de concurrencia y prevención de condiciones de carrera
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestGrupoIdRef = useRef<string | null>(null);

  // Carga inicial automática de grupos al autenticar
  useEffect(() => {
    if (user && !gruposConsultados && !isLoadingGrupos) {
      handleCargarGrupos();
    }
  }, [user]);

  const handleCargarGrupos = async () => {
    setIsLoadingGrupos(true);
    setGruposError(null);

    try {
      const respuesta = await fetchGruposDocente();
      const listadoGrupos = respuesta.groups || [];
      setGrupos(listadoGrupos);
      setDocenteRegistrado(respuesta.docente || null);
      setGruposConsultados(true);

      // Si el grupo previamente seleccionado ya no existe en la lista devuelta, deseleccionar
      if (selectedGrupoId && !listadoGrupos.some((g) => g.id === selectedGrupoId)) {
        setSelectedGrupoId(null);
        setCuadernoData(null);
      }
    } catch (err: any) {
      console.error('[WelcomeView] Error al cargar grupos:', err);
      setGruposError(err?.message || 'Error desconocido al consultar grupos en Supabase.');
      setGruposConsultados(true);
    } finally {
      setIsLoadingGrupos(false);
    }
  };

  /**
   * Manejador de selección de grupo:
   * 1. Cancela peticiones anteriores en vuelo (AbortController).
   * 2. Limpia inmediatamente los datos del grupo previo de la interfaz.
   * 3. Registra el grupo activo solicitado para evitar que respuestas lentas desfasadas sobrescriban la vista.
   */
  const handleSelectGrupo = async (grupoId: string) => {
    if (!grupoId) return;

    // 1. Cancelar petición previa si estuviera en curso
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 2. Limpieza inmediata del estado anterior
    setSelectedGrupoId(grupoId);
    setCuadernoData(null);
    setCuadernoError(null);
    setIsLoadingCuaderno(true);

    // 3. Crear nuevo controlador y registrar el ID objetivo actual
    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeRequestGrupoIdRef.current = grupoId;

    try {
      const data = await fetchCuadernoGrupo(grupoId, controller.signal);

      // 4. Verificación de seguridad concurrente: Solo aplicar si el ID solicitado sigue siendo el activo
      if (activeRequestGrupoIdRef.current === grupoId) {
        setCuadernoData(data);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Petición cancelada intencionalmente por cambio de grupo rápido: ignorar silenciosamente
        return;
      }

      if (activeRequestGrupoIdRef.current === grupoId) {
        console.error('[WelcomeView] Error al consultar cuaderno del grupo:', err);
        setCuadernoError(
          err?.message || 'No se pudieron recuperar los registros del grupo seleccionado.'
        );
      }
    } finally {
      if (activeRequestGrupoIdRef.current === grupoId) {
        setIsLoadingCuaderno(false);
      }
    }
  };

  const handleTestSupabaseAuth = async () => {
    if (!user) {
      setSupabaseTestResult({
        httpStatus: null,
        statusText: '',
        isSuccess: false,
        data: null,
        errorMessage: 'No existe una sesión autenticada activa en Firebase.',
        timestamp: new Date().toLocaleTimeString(),
      });
      return;
    }

    setIsTestingSupabase(true);
    setSupabaseTestResult(null);

    try {
      // 1. Obtener ID token renovado sin registrarlo ni mostrarlo
      const token = await getIdToken(true);
      if (!token) {
        setSupabaseTestResult({
          httpStatus: null,
          statusText: '',
          isSuccess: false,
          data: null,
          errorMessage: 'No se pudo obtener el ID token de Firebase para el usuario actual.',
          timestamp: new Date().toLocaleTimeString(),
        });
        return;
      }

      // 2. Petición POST a la Edge Function de Supabase
      const endpoint = 'https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1/firebase-auth-check';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      // 3. Procesar respuesta sin revelar el token
      let responseBody: any;
      try {
        responseBody = await response.json();
      } catch {
        responseBody = { mensaje: 'La respuesta no devolvió un JSON válido o vino vacía.' };
      }

      setSupabaseTestResult({
        httpStatus: response.status,
        statusText: response.statusText,
        isSuccess: response.ok,
        data: responseBody,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      let friendlyError = 'Error inesperado al conectar con Supabase.';
      if (err instanceof TypeError || err?.message?.includes('fetch') || err?.message?.includes('Network')) {
        friendlyError = 'Error de red o restricción CORS: No se pudo conectar con el endpoint de Supabase. Compruebe la conexión a Internet o que la Edge Function admita peticiones CORS desde este origen.';
      } else if (err?.message) {
        friendlyError = err.message;
      }

      setSupabaseTestResult({
        httpStatus: null,
        statusText: '',
        isSuccess: false,
        data: null,
        errorMessage: friendlyError,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsTestingSupabase(false);
    }
  };

  const handleVerifyToken = async () => {
    setIsVerifyingToken(true);
    try {
      const token = await getIdToken(true); // Forzar renovación para verificar conectividad con Firebase
      if (token) {
        setTokenInfo({
          length: token.length,
          timestamp: new Date().toLocaleTimeString(),
          status: 'success',
          message: 'ID Token obtenido y verificado criptográficamente por Firebase.',
        });
      } else {
        setTokenInfo({
          length: 0,
          timestamp: new Date().toLocaleTimeString(),
          status: 'error',
          message: 'No se pudo obtener el ID Token del usuario activo.',
        });
      }
    } catch (err: any) {
      setTokenInfo({
        length: 0,
        timestamp: new Date().toLocaleTimeString(),
        status: 'error',
        message: err?.message || 'Error al solicitar el ID Token.',
      });
    } finally {
      setIsVerifyingToken(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Tarjeta de Identidad del Docente Autenticado */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Avatar del profesor'}
                className="w-14 h-14 rounded-full border-2 border-indigo-100 object-cover shadow-sm"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                <User className="w-7 h-7" aria-hidden="true" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  {user?.displayName || 'Docente de Lengua y Literatura'}
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  Google Autenticado
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{user?.email}</p>
              <p className="text-xs text-slate-400 mt-1 font-mono">UID Firebase: {user?.uid}</p>
            </div>
          </div>

          <button
            onClick={() => logout()}
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 hover:text-red-700 bg-slate-50 hover:bg-red-50 border border-slate-300 hover:border-red-300 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Comprobación de la Función Centralizada de ID Token (Requisito 4.10) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">
              Verificación del ID Token Criptográfico
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Comprueba que la función centralizada <code className="px-1 py-0.5 bg-slate-100 rounded text-indigo-600 font-mono">getCurrentIdToken()</code> obtiene el token firmado por Google para autorizar peticiones al futuro backend Express.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={handleVerifyToken}
                disabled={isVerifyingToken}
                type="button"
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-colors disabled:opacity-60"
              >
                {isVerifyingToken ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Solicitando token...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Comprobar obtención de ID Token</span>
                  </>
                )}
              </button>
            </div>

            {tokenInfo && (
              <div
                className={`mt-4 p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                  tokenInfo.status === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {tokenInfo.status === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">{tokenInfo.message}</p>
                  {tokenInfo.status === 'success' && (
                    <div className="mt-1 space-y-0.5 text-[11px] text-emerald-800 font-mono">
                      <p>Longitud del token: {tokenInfo.length} caracteres</p>
                      <p>Hora de expedición: {tokenInfo.timestamp}</p>
                      <p className="text-[10px] text-emerald-700 mt-1">
                        (El valor privado del token no se muestra en pantalla por seguridad).
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tarjeta de Prueba Temporal: Autenticación Firebase -> Supabase Edge Function */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Prueba temporal: Autenticación Firebase → Supabase
                </h2>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Temporal
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Envía el ID token vigente de Firebase a la Edge Function de Supabase <code className="px-1 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-[11px]">firebase-auth-check</code> para comprobar que Supabase lo valida correctamente.
              </p>
              <div className="mt-2 text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                <span>POST</span>
                <span className="text-slate-600 truncate">https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1/firebase-auth-check</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handleTestSupabaseAuth}
            disabled={isTestingSupabase}
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isTestingSupabase ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Verificando con Supabase...</span>
              </>
            ) : (
              <>
                <Server className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Probar autenticación Firebase → Supabase</span>
              </>
            )}
          </button>
        </div>

        {/* Resultado devuelto por la Edge Function */}
        {supabaseTestResult && (
          <div className="mt-5 space-y-3">
            <div
              className={`p-4 rounded-lg border text-xs ${
                supabaseTestResult.isSuccess
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : 'bg-amber-50/70 border-amber-200 text-amber-950'
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200/50 pb-2 mb-2">
                <div className="flex items-center gap-2">
                  {supabaseTestResult.isSuccess ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">
                      <CheckCircle2 className="w-3 h-3" />
                      HTTP {supabaseTestResult.httpStatus} {supabaseTestResult.statusText || 'OK'}
                    </span>
                  ) : supabaseTestResult.httpStatus ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-600 text-white">
                      <AlertCircle className="w-3 h-3" />
                      HTTP {supabaseTestResult.httpStatus} {supabaseTestResult.statusText || 'Error'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-red-600 text-white">
                      <AlertCircle className="w-3 h-3" />
                      Error de Conexión
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500">
                    Hora: {supabaseTestResult.timestamp}
                  </span>
                </div>
              </div>

              {supabaseTestResult.errorMessage && (
                <div className="p-2.5 rounded bg-red-100/70 border border-red-200 text-red-900 text-xs mb-2">
                  <p className="font-semibold">Detalle del error:</p>
                  <p className="mt-0.5">{supabaseTestResult.errorMessage}</p>
                </div>
              )}

              {supabaseTestResult.data && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-700 mb-1">
                    Respuesta devuelta por la Edge Function:
                  </p>
                  <pre className="p-3 rounded-lg bg-slate-900 text-emerald-300 text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800 max-h-64">
                    {JSON.stringify(supabaseTestResult.data, null, 2)}
                  </pre>
                </div>
              )}

              <p className="mt-2 text-[10px] text-slate-500">
                Seguridad garantizada: El ID token viaja exclusivamente en la cabecera Bearer y no se muestra ni almacena en la interfaz ni en logs.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tarjeta de Lectura Segura de Grupos en Supabase (Fase 2: Selector y Lectura del Cuaderno) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Folder className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Grupos del Docente y Lectura del Cuaderno
                </h2>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Fase 2: Solo Lectura
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Selecciona uno de tus grupos para consultar en tiempo real sus alumnos, criterios de evaluación, actividades, secciones, rúbricas y calificaciones en Supabase con verificación estricta de propiedad en el servidor.
              </p>
            </div>
          </div>

          <button
            onClick={handleCargarGrupos}
            disabled={isLoadingGrupos}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-indigo-700 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg transition-colors shrink-0 disabled:opacity-60"
            title="Recargar lista de grupos desde Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGrupos ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">Actualizar grupos</span>
          </button>
        </div>

        {/* Mensaje de error al consultar grupos */}
        {gruposError && (
          <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">No se pudieron recuperar los grupos:</p>
              <p className="mt-0.5 text-red-700">{gruposError}</p>
            </div>
          </div>
        )}

        {/* Información del docente resuelto en public.profesores */}
        {docenteRegistrado && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-500" />
              <span className="font-medium text-slate-800">
                Docente verificado en Supabase:
              </span>
              <span className="text-slate-600">
                {docenteRegistrado.nombre || docenteRegistrado.email}
              </span>
            </div>
            {docenteRegistrado.id && (
              <span className="text-[11px] font-mono text-slate-400">
                ID Profesor: {docenteRegistrado.id}
              </span>
            )}
          </div>
        )}

        {/* Componente Selector de Grupo */}
        {grupos && (
          <GroupSelector
            grupos={grupos}
            selectedGrupoId={selectedGrupoId}
            onSelectGrupo={handleSelectGrupo}
            isLoading={isLoadingCuaderno}
          />
        )}
      </div>

      {/* Estado de Carga del Cuaderno del Grupo Seleccionado */}
      {isLoadingCuaderno && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <LoadingSpinner
            message="Consultando alumnos, criterios, actividades y rúbricas del grupo en Supabase..."
            size="md"
          />
        </div>
      )}

      {/* Error al consultar el cuaderno del grupo seleccionado */}
      {cuadernoError && !isLoadingCuaderno && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-red-900">
                Error al cargar el cuaderno del grupo
              </h3>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                {cuadernoError}
              </p>
              {selectedGrupoId && (
                <button
                  onClick={() => handleSelectGrupo(selectedGrupoId)}
                  type="button"
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reintentar consulta
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Vista Completa del Cuaderno del Grupo Seleccionado (Fase 2) */}
      {cuadernoData && !isLoadingCuaderno && (
        <ErrorBoundary
          fallbackTitle="Error al visualizar el cuaderno del grupo"
          onReset={() => setCuadernoData(null)}
        >
          <CuadernoView data={cuadernoData} />
        </ErrorBoundary>
      )}

      {/* Estado del Proyecto y Preparación para Siguientes Fases */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600" aria-hidden="true" />
          Hoja de Ruta de Fernanditio — Fase 2: Lectura del Cuaderno
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          La base de la aplicación está lista. En las siguientes fases se integrarán los módulos de backend y persistencia:
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/70">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Fase 2: Backend Express
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Validación de tokens con Firebase Admin y control estricto de propiedad por profesor.
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/70">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1">
              <Database className="w-4 h-4 text-indigo-600" />
              Fase 3: Supabase
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Sincronización segura de grupos, alumnos, criterios oficiales LOMLOE y calificaciones.
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/70">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1">
              <Camera className="w-4 h-4 text-indigo-600" />
              Fase 4: Rúbricas Gemini
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Análisis multimodal de fotos de rúbricas con revisión humana previa al guardado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
