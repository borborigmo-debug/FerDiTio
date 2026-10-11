/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CuadernoGrupoData } from '../../types';
import {
  Users,
  Target,
  FileText,
  FolderTree,
  Table,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Hash,
  Eye,
  Info,
} from 'lucide-react';

interface CuadernoViewProps {
  data: CuadernoGrupoData;
}

type TabKey = 'resumen' | 'alumnos' | 'criterios' | 'actividades' | 'secciones' | 'rubricas' | 'calificaciones';

export const CuadernoView: React.FC<CuadernoViewProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('resumen');

  const grupo = data?.grupo;
  const alumnos = Array.isArray(data?.alumnos) ? data.alumnos : [];
  const criterios = Array.isArray(data?.criterios) ? data.criterios : [];
  const actividades = Array.isArray(data?.actividades) ? data.actividades : [];
  const secciones = Array.isArray(data?.secciones) ? data.secciones : [];
  const rubricas = Array.isArray(data?.rubricas) ? data.rubricas : [];
  const calificaciones = Array.isArray(data?.calificaciones) ? data.calificaciones : [];
  const estadisticas = data?.estadisticas ?? {
    totalAlumnos: alumnos.length,
    totalCriterios: criterios.length,
    totalActividades: actividades.length,
    totalRubricas: rubricas.length,
    totalSecciones: secciones.length,
    totalCalificaciones: calificaciones.length,
  };

  // Mapa rápido de secciones para mostrar nombres legibles en actividades
  const seccionesMap = React.useMemo(() => {
    return new Map(secciones.filter((s) => Boolean(s && s.id)).map((s) => [s.id, s]));
  }, [secciones]);

  // Mapa rápido de alumnos y actividades para la vista de calificaciones
  const alumnosMap = React.useMemo(() => {
    return new Map(alumnos.filter((a) => Boolean(a && a.id)).map((a) => [a.id, a]));
  }, [alumnos]);

  const actividadesMap = React.useMemo(() => {
    return new Map(actividades.filter((act) => Boolean(act && act.id)).map((act) => [act.id, act]));
  }, [actividades]);

  if (!data || !grupo) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <h3 className="text-sm font-bold text-slate-800">
          Información del grupo no disponible
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          No se recibieron los datos del grupo desde el servidor de Supabase.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Cabecera del Grupo Activo con estadísticas principales */}
      <div className="p-5 sm:p-6 bg-slate-900 text-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-semibold uppercase tracking-wider">
                Grupo Activo
              </span>
              {grupo.oculto && (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-medium">
                  Archivado / Oculto
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mt-1.5 text-white tracking-tight">
              {grupo.nombre}
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Identificador único: {grupo.id}
            </p>
          </div>

          <div className="inline-flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 self-start md:self-auto">
            <Info className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" />
            <span>Fase 2: Modo estricto de solo lectura</span>
          </div>
        </div>

        {/* Tarjetas de Métricas Clave */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-6">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 text-center">
            <Users className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{estadisticas.totalAlumnos}</p>
            <p className="text-[11px] text-slate-400 font-medium">Alumnos</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 text-center">
            <Target className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{estadisticas.totalCriterios}</p>
            <p className="text-[11px] text-slate-400 font-medium">Criterios</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 text-center">
            <FileText className="w-4 h-4 text-sky-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{estadisticas.totalActividades}</p>
            <p className="text-[11px] text-slate-400 font-medium">Actividades</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 text-center">
            <Table className="w-4 h-4 text-purple-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{estadisticas.totalRubricas}</p>
            <p className="text-[11px] text-slate-400 font-medium">Rúbricas</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 text-center">
            <FolderTree className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{estadisticas.totalSecciones}</p>
            <p className="text-[11px] text-slate-400 font-medium">Secciones</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 text-center">
            <Hash className="w-4 h-4 text-teal-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{estadisticas.totalCalificaciones}</p>
            <p className="text-[11px] text-slate-400 font-medium">Calificaciones</p>
          </div>
        </div>
      </div>

      {/* Navegación por Pestañas del Cuaderno */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 sm:px-6 overflow-x-auto">
        <nav className="flex space-x-1 sm:space-x-4 min-w-max" aria-label="Pestañas de datos">
          {[
            { key: 'resumen', label: 'Resumen y Diagnóstico', icon: Info, count: null },
            { key: 'alumnos', label: 'Alumnos', icon: Users, count: estadisticas.totalAlumnos },
            { key: 'criterios', label: 'Criterios', icon: Target, count: estadisticas.totalCriterios },
            { key: 'actividades', label: 'Actividades', icon: FileText, count: estadisticas.totalActividades },
            { key: 'secciones', label: 'Secciones', icon: FolderTree, count: estadisticas.totalSecciones },
            { key: 'rubricas', label: 'Rúbricas', icon: Table, count: estadisticas.totalRubricas },
            { key: 'calificaciones', label: 'Calificaciones', icon: Hash, count: estadisticas.totalCalificaciones },
          ].map((tab) => {
            const Icon = tab.icon;
            const isCurrent = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabKey)}
                type="button"
                className={`py-3.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                  isCurrent
                    ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isCurrent
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Contenido de la Pestaña Activa */}
      <div className="p-5 sm:p-6">
        {/* PESTAÑA: RESUMEN Y DIAGNÓSTICO */}
        {activeTab === 'resumen' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Estado de la Lectura en Supabase
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Todos los registros visualizados proceden en tiempo real de las tablas relacionales vinculadas exclusivamente al identificador del grupo <code className="px-1 py-0.5 bg-slate-200/70 rounded font-mono text-[11px]">{grupo.id}</code>.
                </p>
                <ul className="mt-3 text-xs text-slate-600 space-y-1.5 font-mono">
                  <li>• Alumnos recuperados: {alumnos.length}</li>
                  <li>• Criterios de evaluación: {criterios.length}</li>
                  <li>• Actividades registradas: {actividades.length}</li>
                  <li>• Rúbricas configuradas: {rubricas.length}</li>
                  <li>• Secciones organizativas: {secciones.length}</li>
                  <li>• Calificaciones guardadas: {calificaciones.length}</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60">
                <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Diagnóstico de Vínculos con Criterios
                </h3>
                <p className="text-xs text-amber-800 mt-2 leading-relaxed">
                  De acuerdo con las reglas de Fernanditio, no se inventan relaciones entre actividades y criterios.
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="p-2.5 rounded bg-white/80 border border-amber-200/60">
                    <span className="font-semibold text-slate-800">
                      Actividades con rúbrica vinculada:
                    </span>
                    <span className="ml-1 text-slate-600 font-mono">
                      {actividades.filter((a) => a && a.estadoVinculacion === 'rubrica_confirmada').length}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Los criterios se extraen de los apartados declarados en la rúbrica.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-white/80 border border-amber-200/60">
                    <span className="font-semibold text-slate-800">
                      Actividades sin rúbrica o pendientes:
                    </span>
                    <span className="ml-1 text-amber-700 font-mono">
                      {actividades.filter((a) => !a || a.estadoVinculacion !== 'rubrica_confirmada').length}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Permanecen marcadas como «Vinculación con criterios pendiente de verificar» sin asignar criterios ficticios.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Información sobre secciones organizativas:</span>
              <p className="mt-1 leading-relaxed">
                Las {secciones.length} secciones detectadas en este grupo actúan únicamente como agrupadores visuales. La columna histórica <code className="font-mono bg-slate-200 px-1 py-0.5 rounded">ponderacion</code> no se aplica a los cálculos de notas.
              </p>
            </div>
          </div>
        )}

        {/* PESTAÑA: ALUMNOS */}
        {activeTab === 'alumnos' && (
          <div>
            {alumnos.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No hay alumnos en este grupo</p>
                <p className="text-xs text-slate-500 mt-1">La tabla public.alumnos no contiene registros para este grupo.</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4 w-16">Nº</th>
                      <th className="py-3 px-4">Nombre y Apellidos</th>
                      <th className="py-3 px-4 hidden sm:table-cell text-slate-400">Identificador</th>
                      <th className="py-3 px-4 text-right">Calificaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {alumnos.map((alumno) => {
                      const numNotas = calificaciones.filter((c) => c.alumno_id === alumno.id).length;
                      return (
                        <tr key={alumno.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-500">
                            {alumno.orden ?? '—'}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {alumno.nombre}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400 hidden sm:table-cell">
                            {alumno.id}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                              {numNotas} {numNotas === 1 ? 'nota' : 'notas'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA: CRITERIOS */}
        {activeTab === 'criterios' && (
          <div>
            {criterios.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
                <Target className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No hay criterios de evaluación registrados</p>
                <p className="text-xs text-slate-500 mt-1">
                  La tabla public.criterios no contiene criterios para este grupo.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4 w-28">Código</th>
                      <th className="py-3 px-4">Descripción del Criterio</th>
                      <th className="py-3 px-4 w-28 text-right">Ponderación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {criterios.map((criterio) => (
                      <tr key={criterio.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-indigo-700 bg-indigo-50/30">
                          {criterio.codigo}
                        </td>
                        <td className="py-3.5 px-4 text-slate-800 leading-relaxed">
                          {criterio.descripcion}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                          {criterio.ponderacion !== null && criterio.ponderacion !== undefined ? (
                            <span className="font-semibold text-slate-800">
                              {criterio.ponderacion}%
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Sin peso</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA: ACTIVIDADES */}
        {activeTab === 'actividades' && (
          <div>
            {actividades.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No hay actividades en este grupo</p>
                <p className="text-xs text-slate-500 mt-1">La tabla public.actividades no contiene registros.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {actividades.map((act) => {
                  const seccion = act.seccion_id ? seccionesMap.get(act.seccion_id) : null;
                  const esConfirmada = act.estadoVinculacion === 'rubrica_confirmada';

                  return (
                    <div
                      key={act.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{act.nombre}</h4>
                          {act.tipo && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                              {act.tipo}
                            </span>
                          )}
                          {act.evaluacion_periodo && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {act.evaluacion_periodo}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          {seccion && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                              <FolderTree className="w-3 h-3 text-slate-400" />
                              {seccion.nombre}
                            </span>
                          )}
                          <span className="text-[11px] font-mono text-slate-400">ID: {act.id}</span>
                        </div>
                      </div>

                      {/* Estado del Vínculo con Criterios */}
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {esConfirmada ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Rúbrica verificada
                            </span>
                          ) : act.rubrica_id ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Rúbrica no resuelta
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                              Sin rúbrica
                            </span>
                          )}

                          {Array.isArray(act.criteriosCodigos) && act.criteriosCodigos.length > 0 ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-500">Criterios:</span>
                              <div className="flex flex-wrap gap-1">
                                {act.criteriosCodigos.map((cod) => (
                                  <span
                                    key={cod}
                                    className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-mono text-[11px] font-semibold border border-indigo-200"
                                  >
                                    {cod}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-700 italic">
                              {act.advertenciaRubrica || 'Vinculación con criterios pendiente de verificar'}
                            </span>
                          )}
                        </div>

                        {act.metodo && (
                          <span className="text-[11px] text-slate-500 font-mono">
                            Método: <span className="font-semibold text-slate-700">{act.metodo}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA: SECCIONES */}
        {activeTab === 'secciones' && (
          <div>
            {secciones.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
                <FolderTree className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No hay secciones en este grupo</p>
                <p className="text-xs text-slate-500 mt-1">La tabla public.secciones no contiene registros.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg text-xs text-indigo-900 flex items-start gap-2">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <p>
                    <strong>Aviso normativo de Fernanditio:</strong> Las secciones tienen un fin estrictamente organizativo para agrupar actividades. No intervienen en la ponderación ni en el cálculo de las notas de los criterios.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {secciones.map((sec) => (
                    <div
                      key={sec.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                            style={{ backgroundColor: sec.color || '#6366f1' }}
                          />
                          <h4 className="text-sm font-bold text-slate-900">{sec.nombre}</h4>
                        </div>
                        {sec.oculto && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                            Oculta
                          </span>
                        )}
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <span>ID: {sec.id}</span>
                        {sec.ponderacion !== null && sec.ponderacion !== undefined && (
                          <span className="text-slate-400 line-through" title="Ponderación inactiva para el cálculo">
                            {sec.ponderacion}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA: RÚBRICAS */}
        {activeTab === 'rubricas' && (
          <div>
            {rubricas.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
                <Table className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No hay rúbricas en este grupo</p>
                <p className="text-xs text-slate-500 mt-1">La tabla public.rubricas no contiene registros para este grupo.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rubricas.map((rub) => {
                  const itemsCount = Array.isArray(rub.items) ? rub.items.length : 0;
                  const actividadesAsociadas = actividades.filter((a) => a.rubrica_id === rub.id);

                  // Extraer criterios únicos mencionados en los items
                  const criteriosMencionados = new Set<string>();
                  if (Array.isArray(rub.items)) {
                    for (const it of rub.items) {
                      if (it && typeof it === 'object') {
                        if (typeof it.criterio === 'string' && it.criterio.trim()) {
                          criteriosMencionados.add(it.criterio.trim());
                        }
                        if (Array.isArray(it.criterios)) {
                          it.criterios.forEach((c: any) => {
                            if (typeof c === 'string' && c.trim()) criteriosMencionados.add(c.trim());
                          });
                        }
                      }
                    }
                  }

                  return (
                    <div
                      key={rub.id}
                      className="p-5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-bold text-slate-900">{rub.titulo}</h4>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 uppercase">
                              {rub.tipo || 'Rúbrica'}
                            </span>
                          </div>
                          {rub.descripcion && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {rub.descripcion}
                            </p>
                          )}
                        </div>

                        <span className="text-xs font-mono text-slate-400 shrink-0">
                          ID: {rub.id}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-4">
                          <span className="text-slate-600">
                            Apartados declarados: <strong className="text-slate-900">{itemsCount}</strong>
                          </span>
                          <span className="text-slate-600">
                            Actividades vinculadas: <strong className="text-slate-900">{actividadesAsociadas.length}</strong>
                          </span>
                        </div>

                        {criteriosMencionados.size > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500 text-[11px]">Criterios en items:</span>
                            <div className="flex flex-wrap gap-1">
                              {Array.from(criteriosMencionados).map((cod) => (
                                <span
                                  key={cod}
                                  className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-mono text-[11px] font-bold border border-indigo-200"
                                >
                                  {cod}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA: CALIFICACIONES (DIAGNÓSTICO DE SOLO LECTURA) */}
        {activeTab === 'calificaciones' && (
          <div>
            {calificaciones.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
                <Hash className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No hay calificaciones guardadas</p>
                <p className="text-xs text-slate-500 mt-1">
                  La tabla public.calificaciones no contiene notas para este grupo.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p>
                    <strong>Vista diagnóstica de solo lectura:</strong> Se muestran las calificaciones reales almacenadas en <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">public.calificaciones</code>. En esta fase no se calculan medias ni se modifican los registros.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4">Alumno</th>
                        <th className="py-3 px-4">Actividad</th>
                        <th className="py-3 px-4 text-right">Nota Guardada</th>
                        <th className="py-3 px-4 text-right hidden sm:table-cell text-slate-400">Actualizado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {calificaciones.map((cal) => {
                        const alumno = alumnosMap.get(cal.alumno_id);
                        const actividad = actividadesMap.get(cal.actividad_id);

                        return (
                          <tr key={cal.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-medium text-slate-900">
                              {alumno?.nombre || cal.alumno_id}
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {actividad?.nombre || cal.actividad_id}
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              {cal.nota !== null && cal.nota !== undefined ? (
                                <span className="font-bold text-slate-900 px-2 py-0.5 rounded bg-slate-100">
                                  {Number(cal.nota).toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Pendiente (null)</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px] hidden sm:table-cell">
                              {cal.updated_at ? new Date(cal.updated_at).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
