/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Rubrica, Criterio, ActividadDetalle, Alumno, Calificacion } from '../../types';
import { RubricaDetalle } from './RubricaDetalle';
import { RubricaEvaluacionModal } from './RubricaEvaluacionModal';
import { normalizeRubrica } from '../../utils/rubricaUtils';
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
} from 'lucide-react';

interface RubricasViewProps {
  rubricas: Rubrica[];
  criterios: Criterio[];
  actividades: ActividadDetalle[];
  alumnos: Alumno[];
  calificaciones: Calificacion[];
  grupoId: string;
  initialRubricaId?: string | null;
  onUpdateCalificaciones?: (c: Calificacion[]) => void;
}

export const RubricasView: React.FC<RubricasViewProps> = ({
  rubricas,
  criterios,
  actividades,
  alumnos,
  calificaciones,
  grupoId,
  initialRubricaId = null,
  onUpdateCalificaciones,
}) => {
  // Rúbrica seleccionada actualmente para visualización detallada de la matriz
  const [selectedRubricaId, setSelectedRubricaId] = useState<string | null>(
    initialRubricaId || (rubricas.length === 1 ? rubricas[0].id : null)
  );

  // Rúbrica abierta actualmente en modo de evaluación consecutiva de alumnos (modal)
  const [rubricaEvaluando, setRubricaEvaluando] = useState<Rubrica | null>(null);

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

  // Si no hay rúbricas en el grupo
  if (!rubricas || rubricas.length === 0) {
    return (
      <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
        <Table className="w-10 h-10 text-slate-300 mx-auto mb-2" aria-hidden="true" />
        <h3 className="text-sm font-bold text-slate-800">
          No hay rúbricas registradas en este grupo
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          La tabla <code className="font-mono bg-slate-200/70 px-1 py-0.5 rounded text-[11px]">public.rubricas</code> no contiene registros vinculados al grupo actual.
        </p>
      </div>
    );
  }

  // Rúbrica seleccionada para ver su matriz completa
  const rubricaSeleccionada = selectedRubricaId
    ? rubricas.find((r) => r.id === selectedRubricaId)
    : null;

  return (
    <div className="space-y-6">
      {/* Selector superior de rúbricas cuando hay más de una */}
      {rubricas.length > 1 && (
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Rúbricas del Grupo ({rubricas.length})
              </span>
              {selectedRubricaId && (
                <button
                  type="button"
                  onClick={() => setSelectedRubricaId(null)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
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
              const acts = actividadesPorRubrica.get(r.id) || [];

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRubricaId(r.id)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border text-left shrink-0 transition-all flex items-center gap-2.5 ${
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

      {/* Si hay una rúbrica seleccionada: Mostrar la vista detallada de su matriz */}
      {rubricaSeleccionada ? (
        <RubricaDetalle
          rubricaRaw={rubricaSeleccionada}
          criterios={criterios}
          actividades={actividades}
          onBackToList={rubricas.length > 1 ? () => setSelectedRubricaId(null) : undefined}
          onIniciarEvaluacion={() => setRubricaEvaluando(rubricaSeleccionada)}
        />
      ) : (
        /* Catálogo general de rúbricas del grupo (Fiel a Fernanditio 2) */
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

                {/* Botones de acción directos (Idénticos a Fernanditio 2: Evaluar, Editar, Eliminar) */}
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

      {/* Modal de Evaluación Consecutiva de Alumnos (Fase 4: Réplica de Fernanditio 2) */}
      {rubricaEvaluando && (
        <RubricaEvaluacionModal
          rubrica={rubricaEvaluando}
          alumnos={alumnos}
          criterios={criterios}
          actividades={actividades}
          calificaciones={calificaciones}
          grupoId={grupoId}
          onClose={() => setRubricaEvaluando(null)}
          onUpdateCalificaciones={(nuevasCalifs) => {
            if (onUpdateCalificaciones) {
              onUpdateCalificaciones(nuevasCalifs);
            }
          }}
        />
      )}
    </div>
  );
};
