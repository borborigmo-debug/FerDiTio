/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCuaderno, EvaluacionPeriodo, NavTab } from '../../context/CuadernoContext';
import { getCursoColorTheme } from '../../utils/cursoColorUtils';
import { FernanditioLogo } from '../common/FernanditioLogo';
import {
  BookOpen,
  LogOut,
  Layers,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  RefreshCw,
  FileText,
  Table,
  Filter,
  BarChart2,
  Settings,
  ChevronDown,
} from 'lucide-react';

export const Header: React.FC = () => {
  const { user, status, logout } = useAuth();
  const {
    grupos,
    selectedGrupoId,
    selectGrupo,
    isLoadingGrupos,
    selectedEvaluacion,
    setSelectedEvaluacion,
    activeTab,
    setActiveTab,
    connectionInfo,
    checkServerConnection,
    hasUnsavedChanges,
    setHasUnsavedChanges,
  } = useCuaderno();

  const selectedGrupo = useMemo(() => {
    return grupos.find((g) => g.id === selectedGrupoId) || null;
  }, [grupos, selectedGrupoId]);

  const cursoTheme = useMemo(() => {
    return getCursoColorTheme(selectedGrupoId, selectedGrupo?.nombre);
  }, [selectedGrupoId, selectedGrupo]);

  /**
   * Solicita confirmación si existen calificaciones o modificaciones pendientes en la rúbrica
   * antes de navegar, cambiar curso/evaluación o cerrar sesión.
   */
  const confirmarDescarteSiCambios = (accionTexto: string): boolean => {
    if (!hasUnsavedChanges) return true;
    const confirmado = window.confirm(
      `Tienes calificaciones o modificaciones sin guardar en la rúbrica. Si continúas, se perderán estos cambios.\n\n¿Deseas descartar las calificaciones pendientes y ${accionTexto}?`
    );
    if (!confirmado) return false;
    setHasUnsavedChanges(false);
    return true;
  };

  const handleGrupoChange = async (nuevoId: string) => {
    if (!nuevoId || nuevoId === selectedGrupoId) return;
    if (!confirmarDescarteSiCambios('cambiar de curso')) return;
    await selectGrupo(nuevoId, true);
  };

  const handleEvaluacionChange = (nuevaEval: EvaluacionPeriodo) => {
    if (nuevaEval === selectedEvaluacion) return;
    if (!confirmarDescarteSiCambios('cambiar de período de evaluación')) return;
    setSelectedEvaluacion(nuevaEval);
  };

  const handleLogout = async () => {
    if (!confirmarDescarteSiCambios('cerrar sesión')) return;
    await logout();
  };

  const handleTabChange = (tabId: NavTab) => {
    if (tabId === activeTab) return;
    if (!confirmarDescarteSiCambios('cambiar de pantalla')) return;
    setActiveTab(tabId);
  };

  const evaluacionOptions: EvaluacionPeriodo[] = ['1.º Ev', '2.º Ev', '3.º Ev', 'Global'];

  const navItems: Array<{
    id: NavTab;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    requiresGroup: boolean;
  }> = [
    { id: 'actividades', label: 'Actividades', shortLabel: 'Activ.', icon: FileText, requiresGroup: true },
    { id: 'rubricas', label: 'Rúbricas', shortLabel: 'Rúbricas', icon: Table, requiresGroup: true },
    { id: 'filtro', label: 'Filtro', shortLabel: 'Filtro', icon: Filter, requiresGroup: true },
    { id: 'resultados', label: 'Resultados', shortLabel: 'Result.', icon: BarChart2, requiresGroup: true },
    { id: 'configuracion', label: 'Configuración', shortLabel: 'Config.', icon: Settings, requiresGroup: false },
  ];

  // Helper para el indicador cuadrado compacto de estado de conexión
  const renderConnectionBadge = () => {
    switch (connectionInfo.status) {
      case 'connected':
        return (
          <button
            type="button"
            onClick={() => checkServerConnection()}
            className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title={`${connectionInfo.label}: ${connectionInfo.details} (Haz clic para verificar)`}
            aria-label={`Estado de conexión: ${connectionInfo.label}`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </button>
        );
      case 'firebase_only':
        return (
          <button
            type="button"
            onClick={() => checkServerConnection()}
            className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title={`${connectionInfo.label}: ${connectionInfo.details} (Haz clic para reintentar)`}
            aria-label={`Estado de conexión: ${connectionInfo.label}`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </button>
        );
      case 'offline':
        return (
          <button
            type="button"
            onClick={() => checkServerConnection()}
            className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title={`${connectionInfo.label}: ${connectionInfo.details}`}
            aria-label={`Estado de conexión: ${connectionInfo.label}`}
          >
            <WifiOff className="w-4 h-4 text-slate-500" />
          </button>
        );
      case 'checking':
        return (
          <div
            className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0 animate-pulse"
            title="Comprobando sincronización con Supabase..."
            aria-label="Comprobando conexión"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
          </div>
        );
      case 'error':
      default:
        return (
          <button
            type="button"
            onClick={() => checkServerConnection()}
            className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title={`${connectionInfo.label}: ${connectionInfo.details} (Haz clic para reintentar)`}
            aria-label={`Estado de conexión: ${connectionInfo.label}`}
          >
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </button>
        );
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Borde superior de la pantalla: cambia según el curso seleccionado */}
      <div
        className="h-1.5 w-full transition-colors duration-300 shadow-2xs"
        style={{ backgroundColor: cursoTheme.primary }}
        title={selectedGrupo ? `Curso activo: ${selectedGrupo.nombre}` : 'Fernanditio'}
      />

      {/* =========================================================================
          FILA 1: CABECERA GLOBAL
          (Logotipo, Selector de Curso, Selector de Evaluación, Conexión, Cerrar Sesión)
         ========================================================================= */}
      <div className="border-b border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          {/* 1. Logotipo oficial de Fernanditio en la esquina superior (oculto en versión móvil para priorizar botones e información importante) */}
          <div className="hidden sm:flex items-center gap-2.5 shrink-0 select-none">
            <FernanditioLogo variant="badge" size="sm" className="h-7 w-auto drop-shadow-2xs" />
            <FernanditioLogo variant="wordmark" className="text-base" />
          </div>

          {/* Si está autenticado, renderiza los controles de la Fila 1 */}
          {status === 'authenticated' && user ? (
            <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1 justify-end">
              {/* 2. Selector Desplegable de Curso / Grupo Activo */}
              <div className="relative min-w-0 max-w-[150px] sm:max-w-[240px]">
                <label htmlFor="selector-grupo-global" className="sr-only">
                  Seleccionar curso o grupo
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-2.5 pointer-events-none text-slate-400">
                    <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>
                  <select
                    id="selector-grupo-global"
                    value={selectedGrupoId || ''}
                    onChange={(e) => handleGrupoChange(e.target.value)}
                    disabled={isLoadingGrupos || grupos.length === 0}
                    className="w-full appearance-none pl-8 pr-7 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors truncate cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Seleccionar curso o grupo de evaluación"
                  >
                    {grupos.length === 0 ? (
                      <option value="">
                        {isLoadingGrupos ? 'Cargando grupos...' : 'Sin grupos'}
                      </option>
                    ) : (
                      grupos.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.nombre} {g.oculto ? '(Oculto)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="absolute right-2 pointer-events-none text-slate-400">
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>
                </div>
              </div>

              {/* 3. Selector Desplegable de Evaluación */}
              <div className="relative shrink-0 w-[84px] sm:w-[98px]">
                <label htmlFor="selector-evaluacion-global" className="sr-only">
                  Seleccionar período de evaluación
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-2 pointer-events-none text-slate-400">
                    <Calendar className="w-3 h-3" aria-hidden="true" />
                  </div>
                  <select
                    id="selector-evaluacion-global"
                    value={selectedEvaluacion}
                    onChange={(e) => handleEvaluacionChange(e.target.value as EvaluacionPeriodo)}
                    className="w-full appearance-none pl-6 pr-5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors cursor-pointer"
                    title="Seleccionar período de evaluación"
                  >
                    {evaluacionOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-1.5 pointer-events-none text-slate-400">
                    <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  </div>
                </div>
              </div>

              {/* 4. Indicador Cuadrado Compacto de Conexión */}
              {renderConnectionBadge()}

              {/* 5. Botón Cuadrado Compacto para Cerrar Sesión */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title={`Cerrar sesión de ${user.email || 'docente'}`}
                aria-label="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500 font-medium">
              Acceso Docente
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          FILA 2: BARRA DE NAVEGACIÓN PRINCIPAL
          (Actividades, Rúbricas, Filtro, Resultados, Configuración)
         ========================================================================= */}
      {status === 'authenticated' && user && (
        <div className="bg-slate-50/80 px-2 sm:px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between sm:justify-start gap-1 sm:gap-2 overflow-x-auto py-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isCurrent = activeTab === item.id;
              const isGroupDisabled = item.requiresGroup && !selectedGrupoId;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!isGroupDisabled) {
                      handleTabChange(item.id);
                    }
                  }}
                  disabled={isGroupDisabled}
                  className={`flex-1 sm:flex-none py-2 px-2.5 sm:px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                      : isGroupDisabled
                      ? 'text-slate-300 cursor-not-allowed hover:bg-transparent'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title={
                    isGroupDisabled
                      ? 'Selecciona un curso en la cabecera superior para activar esta opción'
                      : item.label
                  }
                  aria-label={item.label}
                  aria-current={isCurrent ? 'page' : undefined}
                >
                  <Icon className={`w-3.5 h-3.5 ${isCurrent ? 'text-white' : 'text-slate-500'}`} />
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="inline sm:hidden">{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
