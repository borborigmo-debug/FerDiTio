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
  const { updateRubrica, addRubricaYActividad, selectedEvaluacion } = useCuaderno();

  // Rúbrica seleccionada actualmente para visualización detallada de la matriz
  const [selectedRubricaId, setSelectedRubricaId] = useState<string | null>(
    initialRubricaId || (rubricas.length === 1 ? rubricas[0].id : null)
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

  // Rúbricas filtradas por el buscador
  const rubricasFiltradas = useMemo(() => {
    if (!searchRubricaQuery.trim()) return normalizedRubricas;
    const q = searchRubricaQuery.trim().toLowerCase();
    return normalizedRubricas.filter((r) => {
      const matchTitulo = r.titulo.toLowerCase().includes(q);
      const matchDesc = r.descripcion?.toLowerCase().includes(q) ?? false;
      const matchCriterio = r.criteriosUnicos.some((c) => c.toLowerCase().includes(q));
      const matchTipo = r.tipo.toLowerCase().includes(q);
      return matchTitulo || matchDesc || matchCriterio || matchTipo;
    });
  }, [normalizedRubricas, searchRubricaQuery]);

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
              onClick={() => handleOpenCrear('ACTIVIDAD', 'foto')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-900 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-300 rounded-lg shadow-2xs transition-all cursor-pointer"
              title="Fotografiar o subir imagen de la rúbrica para estructurarla con Gemini"
            >
              <Camera className="w-4 h-4 text-indigo-600" />
              <span>Desde Foto</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenCrear('ACTIVIDAD', 'word')}
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
              onClick={() => handleOpenCrear('ACTIVIDAD', 'foto')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-300 rounded-lg shadow-2xs transition-all cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-indigo-600" />
              <span>Con Foto (Gemini)</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenCrear('ACTIVIDAD', 'word')}
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
            />
          ) : (
            /* Catálogo general de rúbricas del grupo */
            <div className="space-y-3">
              {rubricasFiltradas.map((rub) => {
                const acts = actividadesPorRubrica.get(rub.id) || [];

                return (
                  <div
                    key={rub.id}
                    className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div
                      onClick={() => setSelectedRubricaId(rub.id)}
                      className="space-y-1.5 flex-1 cursor-pointer"
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

                    {/* Botones de acción directos: Evaluar y Ver matriz */}
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
                    </div>
                  </div>
                );
              })}
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
    </div>
  );
};
