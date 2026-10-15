/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useCuaderno } from '../../context/CuadernoContext';
import {
  BarChart2,
  Hash,
  Users,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Search,
} from 'lucide-react';
import {
  compararRespaldoConRemoto,
  limpiarRespaldoCalificaciones,
  DiagnosticoRespaldo,
} from '../../services/calificacionesService';

export const ResultadosView: React.FC = () => {
  const { cuadernoData, selectedGrupo, updateCalificaciones } = useCuaderno();
  const [searchTerm, setSearchTerm] = useState('');
  const [mostrarDetallesRespaldo, setMostrarDetallesRespaldo] = useState(false);

  const grupo = cuadernoData?.grupo;
  const alumnos = useMemo(() => cuadernoData?.alumnos || [], [cuadernoData?.alumnos]);
  const actividades = useMemo(() => cuadernoData?.actividades || [], [cuadernoData?.actividades]);
  const criterios = useMemo(() => cuadernoData?.criterios || [], [cuadernoData?.criterios]);
  const calificaciones = useMemo(() => cuadernoData?.calificaciones || [], [cuadernoData?.calificaciones]);
  const calificacionesApartados = useMemo(
    () => cuadernoData?.calificacionesApartados || [],
    [cuadernoData?.calificacionesApartados]
  );

  const alumnosMap = useMemo(() => {
    return new Map(alumnos.filter((a) => Boolean(a && a.id)).map((a) => [a.id, a]));
  }, [alumnos]);

  const actividadesMap = useMemo(() => {
    return new Map(actividades.filter((act) => Boolean(act && act.id)).map((act) => [act.id, act]));
  }, [actividades]);

  // Diagnóstico seguro de respaldo local
  const diagnosticoRespaldo = useMemo<DiagnosticoRespaldo | null>(() => {
    if (!grupo?.id || !Array.isArray(calificaciones)) return null;
    const diag = compararRespaldoConRemoto(grupo.id, calificaciones);
    return diag.hayDiferencias ? diag : null;
  }, [grupo?.id, calificaciones]);

  const handleCargarBorradorLocal = () => {
    if (!diagnosticoRespaldo?.calificacionesLocales) return;
    updateCalificaciones(diagnosticoRespaldo.calificacionesLocales);
    window.alert(
      "Se ha cargado el borrador local en la memoria de la sesión. Puedes comprobar las calificaciones en pantalla."
    );
  };

  const handleDescartarRespaldoLocal = () => {
    if (!grupo?.id) return;
    const confirmacion = window.confirm(
      "¿Estás seguro de que deseas descartar el respaldo local de este navegador? Se mantendrán exclusivamente las calificaciones de Supabase."
    );
    if (!confirmacion) return;
    limpiarRespaldoCalificaciones(grupo.id);
    setMostrarDetallesRespaldo(false);
  };

  // Filtrado de alumnos para la tabla resumen
  const alumnosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return alumnos;
    const term = searchTerm.toLowerCase();
    return alumnos.filter((a) => a.nombre.toLowerCase().includes(term));
  }, [alumnos, searchTerm]);

  if (!selectedGrupo) {
    return (
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-8 text-center max-w-2xl mx-auto">
        <BarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">Ningún curso seleccionado</h3>
        <p className="text-xs text-slate-500 mt-1">
          Selecciona un curso en la cabecera superior para consultar sus resultados y calificaciones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Aviso de Calificaciones Locales Pendientes si existen */}
      {diagnosticoRespaldo && diagnosticoRespaldo.hayDiferencias && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5 text-xs text-amber-950 space-y-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-amber-900">
                  Calificaciones locales sin sincronizar detectadas ({diagnosticoRespaldo.totalDiferencias})
                </p>
                <p className="text-amber-800 mt-0.5 leading-relaxed">
                  Existen {diagnosticoRespaldo.totalDiferencias} calificación(es) guardadas en este dispositivo que difieren de Supabase.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                type="button"
                onClick={() => setMostrarDetallesRespaldo(!mostrarDetallesRespaldo)}
                className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 font-semibold text-amber-900 transition-colors shadow-2xs cursor-pointer"
              >
                {mostrarDetallesRespaldo ? 'Ocultar diferencias' : `Ver diferencias (${diagnosticoRespaldo.totalDiferencias})`}
              </button>
              <button
                type="button"
                onClick={handleCargarBorradorLocal}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Cargar borrador</span>
              </button>
              <button
                type="button"
                onClick={handleDescartarRespaldoLocal}
                className="px-3 py-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Descartar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tarjetas de Métricas de Calificaciones */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs text-center">
          <Hash className="w-5 h-5 text-indigo-600 mx-auto mb-1.5" />
          <p className="text-xl font-bold text-slate-900">{calificaciones.length}</p>
          <p className="text-xs text-slate-500 font-medium">Calificaciones globales</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs text-center">
          <BarChart2 className="w-5 h-5 text-emerald-600 mx-auto mb-1.5" />
          <p className="text-xl font-bold text-slate-900">{calificacionesApartados.length}</p>
          <p className="text-xs text-slate-500 font-medium">Notas de apartados rúbrica</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs text-center">
          <Users className="w-5 h-5 text-sky-600 mx-auto mb-1.5" />
          <p className="text-xl font-bold text-slate-900">{alumnos.length}</p>
          <p className="text-xs text-slate-500 font-medium">Alumnos en el curso</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs text-center">
          <CheckCircle2 className="w-5 h-5 text-purple-600 mx-auto mb-1.5" />
          <p className="text-xl font-bold text-slate-900">{criterios.length}</p>
          <p className="text-xs text-slate-500 font-medium">Criterios del curso</p>
        </div>
      </div>

      {/* Nota normativa sobre el modelo de evaluación */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs text-xs text-slate-600 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Modelo de evaluación de Fernanditio:</strong> La ausencia de calificación indica <span className="font-semibold text-slate-800">«pendiente de evaluar»</span> y nunca se computa como un cero. La nota 0.00 es una calificación real explícita.
        </p>
      </div>

      {/* Tabla de Calificaciones Registradas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-indigo-600" />
              Calificaciones Registradas en Supabase ({calificaciones.length})
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Fuente de persistencia oficial: tabla <code className="font-mono bg-slate-200 px-1 py-0.2 rounded text-[10px]">public.calificaciones</code>
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar alumno..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {calificaciones.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Hash className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No hay calificaciones guardadas</p>
            <p className="text-xs text-slate-500 mt-1">
              Las actividades aún no disponen de calificaciones en este curso.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Alumno</th>
                  <th className="py-2.5 px-4">Actividad</th>
                  <th className="py-2.5 px-4 text-right">Nota Oficial</th>
                  <th className="py-2.5 px-4 text-right hidden sm:table-cell text-slate-400">Actualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calificaciones
                  .filter((cal) => {
                    if (!searchTerm.trim()) return true;
                    const alumno = alumnosMap.get(cal.alumno_id);
                    return (
                      alumno?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      cal.alumno_id.includes(searchTerm)
                    );
                  })
                  .map((cal) => {
                    const alumno = alumnosMap.get(cal.alumno_id);
                    const actividad = actividadesMap.get(cal.actividad_id);

                    return (
                      <tr key={cal.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {alumno?.nombre || cal.alumno_id}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
                          {actividad?.nombre || cal.actividad_id}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono">
                          {cal.nota !== null && cal.nota !== undefined ? (
                            <span className="font-bold text-slate-900 px-2 py-0.5 rounded bg-slate-100">
                              {Number(cal.nota).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Pendiente (null)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-400 font-mono text-[11px] hidden sm:table-cell">
                          {cal.updated_at ? new Date(cal.updated_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
