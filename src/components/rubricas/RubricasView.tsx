/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Rubrica, Criterio, ActividadDetalle, Alumno, Calificacion, CalificacionApartado } from '../../types';
import { RubricaDetalle } from './RubricaDetalle';
import { RubricaEvaluacionModal } from './RubricaEvaluacionModal';
import { RubricaCrearModal, TipoRubricaCrear } from './RubricaCrearModal';
import { normalizeRubrica } from '../../utils/rubricaUtils';
import { useCuaderno } from '../../context/CuadernoContext';
import {
  Table,
  Search,
  Target,
  FileText,
  Layers,
  ChevronRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Trash2,
  Play,
  FileCheck,
  FolderGit2,
  GraduationCap,
  Plus,
  Camera,
  Sparkles,
} from 'lucide-react';

interface RubricasViewProps {
  rubricas: Rubrica[];
  criterios: Criterio[];
  actividades: ActividadDetalle[];
  alumnos: Alumno[];
  calificaciones: Calificacion[];
  calificacionesApartados?: CalificacionApartado[];
  grupoId: string;
  initialRubricaId?: string | null;
  onUpdateCalificaciones?: (c: Calificacion[]) => void;
  onUpdateCalificacionesApartados?: (ca: CalificacionApartado[]) => void;
}

export const RubricasView: React.FC<RubricasViewProps> = ({
  rubricas,
  criterios,
  actividades,
  alumnos,
  calificaciones,
  calificacionesApartados = [],
  grupoId,
  initialRubricaId = null,
  onUpdateCalificaciones,
  onUpdateCalificacionesApartados,
}) => {
  const { updateRubrica, addRubricaYActividad, selectedEvaluacion, eliminarRubricas } = useCuaderno();

  // Rúbrica seleccionada actualmente para visualización detallada de la matriz
  const [selectedRubricaId, setSelectedRubricaId] = useState<string | null>(
    initialRubricaId || null
  );

  // Rúbrica abierta actualmente en modo de evaluación consecutiva de alumnos (modal)
  const [rubricaEvaluando, setRubricaEvaluando] = useState<Rubrica | null>(null);

  // Modal de creación de rúbrica (tipo seleccionado para crear: ACTIVIDAD | TRABAJO | EXAMEN)
  const [tipoModalCrear, setTipoModalCrear] = useState<TipoRubricaCrear | null>(null);
  const [origenModalCrear, setOrigenModalCrear] = useState<'foto' | 'word' | null>(null);

  const handleOpenCrear = (tipo: TipoRubricaCrear, origen?: 'foto' | 'word') => {
    setTipoModalCrear(tipo);
    setOrigenModalCrear(origen || null);
  };

  // Filtro de búsqueda entre las rúbricas del grupo
  const [searchRubricaQuery, setSearchRubricaQuery] = useState('');

  // Selección múltiple para eliminar rúbricas del catálogo
  const [rubricasSeleccionadas, setRubricasSeleccionadas] = useState<Set<string>>(new Set());
  const [confirmandoEliminarRubs, setConfirmandoEliminarRubs] = useState(false);
  const [isDeletingRubs, setIsDeletingRubs] = useState(false);
  const [deleteRubsFeedback, setDeleteRubsFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const handleToggleRubrica = (rubId: string) => {
    setRubricasSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(rubId)) {
        next.delete(rubId);
      } else {
        next.add(rubId);
      }
      return next;
    });
  };

  const handleToggleSeleccionarTodasRubs = () => {
    if (rubricasSeleccionadas.size === rubricasFiltradas.length && rubricasFiltradas.length > 0) {
      setRubricasSeleccionadas(new Set());
    } else {
      setRubricasSeleccionadas(new Set(rubricasFiltradas.map((r) => r.id)));
    }
  };

  const handleEjecutarEliminarRubs = async () => {
    if (rubricasSeleccionadas.size === 0) return;
    setIsDeletingRubs(true);
    setDeleteRubsFeedback(null);
    try {
      const ids = Array.from(rubricasSeleccionadas);
      const res = await eliminarRubricas(ids);
      setRubricasSeleccionadas(new Set());
      setConfirmandoEliminarRubs(false);
      if (selectedRubricaId && res.eliminadas.includes(selectedRubricaId)) {
        setSelectedRubricaId(null);
      }
      const cantActs = res.actividadesEliminadas?.length || 0;
      setDeleteRubsFeedback({
        type: 'success',
        message: `Se han eliminado correctamente ${res.eliminadas.length} rúbrica(s)${cantActs > 0 ? ` y ${cantActs} actividad(es) asociada(s)` : ''} en Supabase y Fernanditio.`,
      });
      setTimeout(() => setDeleteRubsFeedback(null), 5000);
    } catch (err: any) {
      console.error('[RubricasView] Error al eliminar rúbricas:', err);
      setDeleteRubsFeedback({
        type: 'error',
        message: err?.message || 'Error al eliminar rúbricas en el servidor.',
      });
    } finally {
      setIsDeletingRubs(false);
    }
  };

  // Actualizar si cambia initialRubricaId desde props externas
  useEffect(() => {
    if (initialRubricaId) {
      setSelectedRubricaId(initialRubricaId);
    }
  }, [initialRubricaId]);

  // Mapa de rúbricas normalizadas para acceso rápido y listado
  const normalizedRubricas = useMemo(() => {
    return (rubricas || []).map((r) => normalizeRubrica(r));
  }, [rubricas]);

  // Mapa de actividades asociadas por ID de rúbrica
  const actividadesPorRubrica = useMemo(() => {
    const map = new Map<string, ActividadDetalle[]>();
    for (const act of actividades || []) {
      if (act.rubrica_id) {
        const list = map.get(act.rubrica_id) || [];
        list.push(act);
        map.set(act.rubrica_id, list);
      }
    }
    return map;
  }, [actividades]);

  // Rúbricas filtradas por el buscador (orden cronológico: más reciente primero)
  const rubricasFiltradas = useMemo(() => {
    let list = normalizedRubricas;
    if (searchRubricaQuery.trim()) {
      const q = searchRubricaQuery.trim().toLowerCase();
      list = normalizedRubricas.filter((r) => {
        const matchTitulo = r.titulo.toLowerCase().includes(q);
        const matchDesc = r.descripcion?.toLowerCase().includes(q) ?? false;
        const matchCriterio = r.criteriosUnicos.some((c) => c.toLowerCase().includes(q));
        const matchTipo = r.tipo.toLowerCase().includes(q);
        return matchTitulo || matchDesc || matchCriterio || matchTipo;
      });
    }

    return list.slice().sort((a, b) => {
      const parseTime = (dateVal: any): number => {
        if (!dateVal) return 0;
        const parsed = new Date(dateVal).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };

      const timeA = parseTime((a.raw as any)?.created_at) || parseTime((a.raw as any)?.fecha) || parseTime(a.created_at);
      const timeB = parseTime((b.raw as any)?.created_at) || parseTime((b.raw as any)?.fecha) || parseTime(b.created_at);

      const actsA = actividadesPorRubrica.get(a.id) || [];
      const actsB = actividadesPorRubrica.get(b.id) || [];
      const actTimeA = actsA.reduce((max, act) => {
        const t = parseTime(act.created_at) || parseTime(act.fecha);
        return Math.max(max, t);
      }, 0);
      const actTimeB = actsB.reduce((max, act) => {
        const t = parseTime(act.created_at) || parseTime(act.fecha);
        return Math.max(max, t);
      }, 0);

      const effectiveA = Math.max(timeA, actTimeA);
      const effectiveB = Math.max(timeB, actTimeB);

      if (effectiveA !== effectiveB) {
        return effectiveB - effectiveA; // Más reciente primero
      }

      return 0;
    });
  }, [normalizedRubricas, searchRubricaQuery, actividadesPorRubrica]);

  // Rúbrica seleccionada para ver su matriz completa
  const rubricaSeleccionada = selectedRubricaId
    ? rubricas.find((r) => r.id === selectedRubricaId)
    : null;

  return (
    <div className="space-y-6">
      {/* ========================================================
          1. BARRA PRINCIPAL DE ACCIONES Y CREACIÓN DE RÚBRICAS
          Visible SIEMPRE (tanto con catálogo vacío como con rúbricas)
          ======================================================== */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <Table className="w-5 h-5 text-indigo-600" />
                <span>Rúbricas de Evaluación</span>
              </h2>
              {rubricas.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {rubricas.length} {rubricas.length === 1 ? 'rúbrica' : 'rúbricas'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              La creación y diseño competencial en Fernanditio se organiza desde Rúbricas, vinculando cada matriz con su actividad evaluable.
            </p>
          </div>

          {/* Los tres botones de creación de rúbricas obligatorios + Asistente Gemini */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
            <button
              type="button"
              onClick={() => handleOpenCrear('ACTIVIDAD')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-300 rounded-lg shadow-2xs transition-all cursor-pointer"
              title="Crear nueva rúbrica para una actividad cotidiana o tarea evaluable"
            >
              <FileCheck className="w-4 h-4 text-emerald-600" />
              <span>Crear rúbrica de Actividad</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenCrear('TRABAJO')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 active:bg-sky-200 border border-sky-300 rounded-lg shadow-2xs transition-all cursor-pointer"
              title="Crear nueva rúbrica para un trabajo, proyecto monográfico o producción escrita"
            >
              <FolderGit2 className="w-4 h-4 text-sky-600" />
              <span>Crear rúbrica de Trabajo</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenCrear('EXAMEN')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 active:bg-purple-200 border border-purple-300 rounded-lg shadow-2xs transition-all cursor-pointer"
              title="Crear nueva rúbrica para una prueba escrita o examen"
            >
              <GraduationCap className="w-4 h-4 text-purple-600" />
              <span>Crear rúbrica de Examen</span>
            </button>

            {/* Separador sutil */}
            <div className="h-6 w-[1px] bg-slate-300 hidden sm:block mx-0.5" />

            {/* Accesos directos a Gemini (Foto y Word) */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleOpenCrear('ACTIVIDAD', 'foto');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-900 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-300 rounded-lg shadow-2xs transition-all cursor-pointer"
              title="Fotografiar o subir imagen de la rúbrica para estructurarla con Gemini"
            >
              <Camera className="w-4 h-4 text-indigo-600" />
              <span>Desde Foto</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleOpenCrear('ACTIVIDAD', 'word');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-900 bg-gradient-to-r from-indigo-50 to-sky-50 hover:from-indigo-100 hover:to-sky-100 border border-indigo-300 rounded-lg shadow-2xs transition-all cursor-pointer"
              title="Importar documento Word (.docx) para estructurarlo con Gemini"
            >
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Desde Word (.docx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          2. ESTADO VACÍO (Si aún no hay rúbricas en el grupo)
          ======================================================== */}
      {(!rubricas || rubricas.length === 0) ? (
        <div className="text-center py-10 px-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 space-y-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
            <Table className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">
              No hay rúbricas registradas en este grupo
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Crea tu primera rúbrica manualmente o utiliza el asistente con Gemini para importar una rúbrica desde fotografía o archivo Word.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleOpenCrear('ACTIVIDAD')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-2xs transition-all cursor-pointer"
            >
              <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Actividad</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenCrear('TRABAJO')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded-lg shadow-2xs transition-all cursor-pointer"
            >
              <FolderGit2 className="w-3.5 h-3.5 text-sky-600" />
              <span>Trabajo</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenCrear('EXAMEN')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-lg shadow-2xs transition-all cursor-pointer"
            >
              <GraduationCap className="w-3.5 h-3.5 text-purple-600" />
              <span>Examen</span>
            </button>
            <div className="h-5 w-[1px] bg-slate-300 hidden sm:block mx-1" />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleOpenCrear('ACTIVIDAD', 'foto');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-300 rounded-lg shadow-2xs transition-all cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-indigo-600" />
              <span>Con Foto (Gemini)</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleOpenCrear('ACTIVIDAD', 'word');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-300 rounded-lg shadow-2xs transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>Con Word (Gemini)</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ========================================================
              3. SELECTOR SUPERIOR Y BUSCADOR CUANDO HAY MÁS DE UNA
              ======================================================== */}
          {rubricas.length > 1 && (
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Catálogo de Rúbricas ({rubricas.length})
                  </span>
                  {selectedRubricaId && (
                    <button
                      type="button"
                      onClick={() => setSelectedRubricaId(null)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                    >
                      · Ver catálogo completo
                    </button>
                  )}
                </div>

                {/* Buscador de rúbricas */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="text"
                    value={searchRubricaQuery}
                    onChange={(e) => setSearchRubricaQuery(e.target.value)}
                    placeholder="Filtrar por título o criterio..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 placeholder:text-slate-400 transition-all"
                  />
                </div>
              </div>

              {/* Carrusel / Barra de pestañas de rúbricas disponibles */}
              <div className="flex space-x-2 overflow-x-auto pb-1" aria-label="Lista de rúbricas">
                {rubricasFiltradas.map((r) => {
                  const isSelected = selectedRubricaId === r.id;

                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRubricaId(r.id)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border text-left shrink-0 transition-all flex items-center gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-2xs font-semibold'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Table className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span className="truncate max-w-[180px]">{r.titulo}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                        {r.items.length} ítems
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================
              4. VISTA DE MATRIZ DETALLADA O CATÁLOGO
              ======================================================== */}
          {rubricaSeleccionada ? (
            <RubricaDetalle
              rubricaRaw={rubricaSeleccionada}
              criterios={criterios}
              actividades={actividades}
              onBackToList={rubricas.length > 1 ? () => setSelectedRubricaId(null) : undefined}
              onIniciarEvaluacion={() => setRubricaEvaluando(rubricaSeleccionada)}
              onEliminarRubrica={() => {
                setRubricasSeleccionadas(new Set([rubricaSeleccionada.id]));
                setConfirmandoEliminarRubs(true);
              }}
            />
          ) : (
            /* Catálogo general de rúbricas del grupo */
            <div className="space-y-4">
              {/* Mensaje de feedback si hubo eliminación */}
              {deleteRubsFeedback && (
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs animate-in fade-in ${
                    deleteRubsFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {deleteRubsFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span className="font-medium">{deleteRubsFeedback.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteRubsFeedback(null)}
                    className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Barra de utilidades y selección múltiple del catálogo de rúbricas */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-slate-800">
                    Catálogo: Mostrando {rubricasFiltradas.length} de {rubricas.length} rúbricas
                  </span>

                  {/* Casilla de selección general: Seleccionar todas */}
                  {rubricasFiltradas.length > 0 && (
                    <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer select-none text-[11px] font-semibold text-slate-700 transition-colors">
                      <input
                        type="checkbox"
                        checked={
                          rubricasFiltradas.length > 0 &&
                          rubricasSeleccionadas.size === rubricasFiltradas.length
                        }
                        onChange={handleToggleSeleccionarTodasRubs}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>
                        {rubricasSeleccionadas.size === rubricasFiltradas.length
                          ? 'Deseleccionar todas'
                          : `Seleccionar todas (${rubricasFiltradas.length})`}
                      </span>
                    </label>
                  )}

                  {/* Botón de acción para eliminar seleccionadas */}
                  {rubricasSeleccionadas.size > 0 && (
                    <div className="flex items-center gap-2 animate-in fade-in">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold text-[11px]">
                        {rubricasSeleccionadas.size} seleccionada{rubricasSeleccionadas.size > 1 ? 's' : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmandoEliminarRubs(true)}
                        disabled={isDeletingRubs}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                        title="Eliminar las rúbricas seleccionadas del catálogo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar seleccionadas ({rubricasSeleccionadas.size})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRubricasSeleccionadas(new Set())}
                        className="text-[11px] text-slate-500 hover:text-slate-700 font-medium cursor-pointer underline"
                      >
                        Cancelar selección
                      </button>
                    </div>
                  )}
                </div>

                {/* Si solo hay 1 rúbrica o para búsqueda directa */}
                {rubricas.length <= 1 && (
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      type="text"
                      value={searchRubricaQuery}
                      onChange={(e) => setSearchRubricaQuery(e.target.value)}
                      placeholder="Filtrar rúbricas..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 placeholder:text-slate-400 transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Lista de rúbricas con casillas de selección individual */}
              <div className="space-y-3">
                {rubricasFiltradas.map((rub) => {
                  const acts = actividadesPorRubrica.get(rub.id) || [];
                  const isSelected = rubricasSeleccionadas.has(rub.id);

                  return (
                    <div
                      key={rub.id}
                      className={`p-4 sm:p-5 rounded-xl border transition-all shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        isSelected
                          ? 'border-indigo-400 bg-indigo-50/40 ring-1 ring-indigo-400'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Casilla de selección individual */}
                        <div
                          className="pt-0.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label
                            className="flex items-center cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"
                            title={`Seleccionar rúbrica ${rub.titulo}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleToggleRubrica(rub.id);
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              aria-label={`Seleccionar rúbrica ${rub.titulo}`}
                            />
                          </label>
                        </div>

                        <div
                          onClick={() => setSelectedRubricaId(rub.id)}
                          className="space-y-1.5 flex-1 cursor-pointer min-w-0"
                        >
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-xs font-mono text-slate-400">
                              ID: {rub.id}
                            </span>
                            <h3 className="text-base font-bold text-slate-900 hover:text-indigo-600 transition-colors">
                              {rub.titulo}
                            </h3>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                              {rub.tipo || 'ACTIVIDAD'}
                            </span>
                          </div>

                          {rub.descripcion && (
                            <p className="text-xs text-slate-500 line-clamp-1 leading-relaxed">
                              {rub.descripcion}
                            </p>
                          )}

                          <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                            <span>
                              Apartados: <strong className="text-slate-800">{rub.items.length}</strong>
                            </span>
                            <span>·</span>
                            <span>
                              Escala: <strong className="text-slate-800">{rub.niveles.length} niveles</strong>
                            </span>
                            {acts.length > 0 && (
                              <>
                                <span>·</span>
                                <span>
                                  Actividades vinculadas: <strong className="text-slate-800">{acts.length}</strong>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Botones de acción directos: Evaluar, Ver matriz y Eliminar individual */}
                      <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRubricaEvaluando(rub.raw);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1d4ed8] active:bg-[#1e3a8a] rounded-lg shadow-2xs transition-colors cursor-pointer"
                          title={`Evaluar alumnos con ${rub.titulo}`}
                        >
                          <span>📊</span>
                          <span>Evaluar</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRubricaId(rub.id);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                          title="Ver matriz y detalles de la rúbrica"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-500" />
                          <span>Ver matriz</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRubricasSeleccionadas(new Set([rub.id]));
                            setConfirmandoEliminarRubs(true);
                          }}
                          className="inline-flex items-center justify-center p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title={`Eliminar rúbrica "${rub.titulo}"`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================
          5. MODAL DE CREACIÓN DE RÚBRICA Y ACTIVIDAD VINCULADA
          ======================================================== */}
      {tipoModalCrear && (
        <RubricaCrearModal
          grupoId={grupoId}
          tipoInicial={tipoModalCrear}
          origenInicial={origenModalCrear}
          periodoInicial={selectedEvaluacion || '1.º Ev'}
          criterios={criterios}
          onClose={() => {
            setTipoModalCrear(null);
            setOrigenModalCrear(null);
          }}
          onSuccess={(nuevaRubrica, nuevaActividad) => {
            if (addRubricaYActividad) {
              addRubricaYActividad(nuevaRubrica, nuevaActividad);
            }
            setSelectedRubricaId(nuevaRubrica.id);
            setTipoModalCrear(null);
            setOrigenModalCrear(null);
          }}
        />
      )}

      {/* ========================================================
          6. MODAL DE EVALUACIÓN CONSECUTIVA DE ALUMNOS
          ======================================================== */}
      {rubricaEvaluando && (
        <RubricaEvaluacionModal
          rubrica={rubricaEvaluando}
          alumnos={alumnos}
          criterios={criterios}
          actividades={actividades}
          calificaciones={calificaciones}
          calificacionesApartados={calificacionesApartados}
          grupoId={grupoId}
          onClose={() => setRubricaEvaluando(null)}
          onUpdateRubrica={(rubricaActualizada) => {
            setRubricaEvaluando(rubricaActualizada);
            if (updateRubrica) {
              updateRubrica(rubricaActualizada);
            }
          }}
          onUpdateCalificaciones={(nuevasCalifs) => {
            if (onUpdateCalificaciones) {
              onUpdateCalificaciones(nuevasCalifs);
            }
          }}
          onUpdateCalificacionesApartados={(nuevasApartados) => {
            if (onUpdateCalificacionesApartados) {
              onUpdateCalificacionesApartados(nuevasApartados);
            }
          }}
        />
      )}

      {/* ========================================================
          7. MODAL DE CONFIRMACIÓN PARA ELIMINAR RÚBRICAS SELECCIONADAS
          ======================================================== */}
      {confirmandoEliminarRubs && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150 text-slate-800">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  ¿Eliminar {rubricasSeleccionadas.size} rúbrica{rubricasSeleccionadas.size > 1 ? 's' : ''}?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Esta acción eliminará de forma permanente las <strong>{rubricasSeleccionadas.size}</strong> rúbricas seleccionadas del cuaderno docente y <strong>todas las actividades y calificaciones asociadas</strong>, tanto en Fernanditio como en la base de datos de Supabase.
                </p>
                <p className="text-[11px] text-rose-600 font-semibold">
                  ⚠️ Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setConfirmandoEliminarRubs(false)}
                disabled={isDeletingRubs}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEjecutarEliminarRubs}
                disabled={isDeletingRubs}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isDeletingRubs ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sí, eliminar {rubricasSeleccionadas.size} rúbrica{rubricasSeleccionadas.size > 1 ? 's' : ''}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
