/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useCuaderno } from '../../context/CuadernoContext';
import {
  Filter,
  Search,
  Target,
  FileText,
  Info,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { compararCriterios } from '../../utils/rubricaUtils';

export const FiltroView: React.FC = () => {
  const { cuadernoData, selectedEvaluacion, selectedGrupo } = useCuaderno();
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoElemento, setTipoElemento] = useState<'todos' | 'criterios' | 'actividades'>('todos');

  const criterios = useMemo(() => {
    const list = cuadernoData?.criterios || [];
    return list.slice().sort(compararCriterios);
  }, [cuadernoData?.criterios]);
  const actividades = useMemo(() => cuadernoData?.actividades || [], [cuadernoData?.actividades]);

  // Criterios filtrados
  const criteriosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return criterios;
    const term = searchTerm.toLowerCase();
    return criterios.filter(
      (c) =>
        c.codigo.toLowerCase().includes(term) ||
        c.descripcion.toLowerCase().includes(term)
    );
  }, [criterios, searchTerm]);

  // Actividades filtradas
  const actividadesFiltradas = useMemo(() => {
    if (!searchTerm.trim()) return actividades;
    const term = searchTerm.toLowerCase();
    return actividades.filter(
      (a) =>
        a.nombre.toLowerCase().includes(term) ||
        (a.criteriosCodigos && a.criteriosCodigos.some((cod) => cod.toLowerCase().includes(term))) ||
        (a.evaluacion_periodo && a.evaluacion_periodo.toLowerCase().includes(term))
    );
  }, [actividades, searchTerm]);

  if (!selectedGrupo) {
    return (
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-8 text-center max-w-2xl mx-auto">
        <Filter className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">Ningún curso seleccionado</h3>
        <p className="text-xs text-slate-500 mt-1">
          Selecciona un curso en la cabecera superior para activar los filtros de criterios y actividades.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Panel informativo normativo */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <Filter className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Filtro y Exploración Curricular: {selectedGrupo.nombre}
            </h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Herramienta de consulta y segmentación para explorar criterios de evaluación LOMLOE y actividades del cuaderno. Los filtros actúan como una lente analítica de solo consulta y nunca alteran ni recalculan las notas de los alumnos en la base de datos.
            </p>
          </div>
        </div>

        {/* Buscador y selectores de ámbito */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código de criterio (ej. 1.1, 2.3) o nombre de actividad..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
            />
          </div>

          <div>
            <select
              value={tipoElemento}
              onChange={(e) => setTipoElemento(e.target.value as any)}
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
            >
              <option value="todos">Todos los elementos</option>
              <option value="criterios">Solo Criterios de evaluación</option>
              <option value="actividades">Solo Actividades</option>
            </select>
          </div>
        </div>
      </div>

      {/* Estadísticas de coincidencias */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs text-center">
          <Target className="w-4 h-4 text-indigo-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">{criteriosFiltrados.length}</p>
          <p className="text-[11px] text-slate-500 font-medium">Criterios coincidentes</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs text-center">
          <FileText className="w-4 h-4 text-sky-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">{actividadesFiltradas.length}</p>
          <p className="text-[11px] text-slate-500 font-medium">Actividades coincidentes</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs text-center">
          <Calendar className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">{selectedEvaluacion}</p>
          <p className="text-[11px] text-slate-500 font-medium">Período activo en cabecera</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs text-center">
          <Layers className="w-4 h-4 text-amber-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">{cuadernoData?.secciones?.length || 0}</p>
          <p className="text-[11px] text-slate-500 font-medium">Secciones del grupo</p>
        </div>
      </div>

      {/* Resultados de Criterios */}
      {(tipoElemento === 'todos' || tipoElemento === 'criterios') && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Target className="w-4 h-4 text-indigo-600" />
              Criterios de Evaluación ({criteriosFiltrados.length})
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">Castilla y León · LOMLOE</span>
          </div>

          {criteriosFiltrados.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No se encontraron criterios que coincidan con la búsqueda.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {criteriosFiltrados.map((crit) => (
                <div key={crit.id} className="p-3 hover:bg-slate-50/60 transition-colors flex items-start gap-3">
                  <span className="px-2 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-bold text-xs shrink-0">
                    {crit.codigo}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-800 leading-relaxed">{crit.descripcion}</p>
                    {crit.ponderacion !== null && crit.ponderacion !== undefined && (
                      <p className="text-[11px] text-slate-500 mt-1 font-mono">
                        Ponderación global: <span className="font-bold text-slate-700">{crit.ponderacion}%</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resultados de Actividades */}
      {(tipoElemento === 'todos' || tipoElemento === 'actividades') && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-sky-600" />
              Actividades del Grupo ({actividadesFiltradas.length})
            </h3>
          </div>

          {actividadesFiltradas.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No se encontraron actividades que coincidan con la búsqueda.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {actividadesFiltradas.map((act) => (
                <div key={act.id} className="p-3 hover:bg-slate-50/60 transition-colors flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{act.nombre}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      {act.evaluacion_periodo && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
                          {act.evaluacion_periodo}
                        </span>
                      )}
                      {act.criteriosCodigos && act.criteriosCodigos.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-slate-400">Criterios:</span>
                          <span className="text-[11px] font-mono text-indigo-600 font-semibold">
                            {act.criteriosCodigos.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">ID: {act.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
