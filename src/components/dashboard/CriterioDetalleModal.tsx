/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Alumno, Criterio, Calificacion, CalificacionApartado } from '../../types';
import { EvidenciaItem } from './ActividadesView';
import {
  guardarCalificacionesEvaluacion,
  guardarCalificacionesApartados,
} from '../../services/calificacionesService';
import {
  X,
  Target,
  Trash2,
  Check,
  AlertTriangle,
  Loader2,
  Calendar,
  FileCheck,
  Sparkles,
  Info,
  Edit2,
  Save,
} from 'lucide-react';
import { getCursoColorTheme } from '../../utils/cursoColorUtils';

interface CriterioDetalleModalProps {
  alumno: Alumno;
  criterio: Criterio;
  evidenciasIniciales: EvidenciaItem[];
  grupoId: string;
  calificaciones: Calificacion[];
  calificacionesApartados: CalificacionApartado[];
  onClose: () => void;
  onUpdateCalificaciones: (nuevas: Calificacion[]) => void;
  onUpdateCalificacionesApartados: (nuevas: CalificacionApartado[]) => void;
  onEliminarActividad: (actividadId: string) => Promise<any>;
}

export const CriterioDetalleModal: React.FC<CriterioDetalleModalProps> = ({
  alumno,
  criterio,
  evidenciasIniciales,
  grupoId,
  calificaciones,
  calificacionesApartados,
  onClose,
  onUpdateCalificaciones,
  onUpdateCalificacionesApartados,
  onEliminarActividad,
}) => {
  const cursoTheme = useMemo(() => getCursoColorTheme(grupoId), [grupoId]);

  // Lista local de evidencias para actualización reactiva en el modal
  const [evidencias, setEvidencias] = useState<EvidenciaItem[]>(evidenciasIniciales);

  // Estados locales para la edición de notas
  const [notasEditadas, setNotasEditadas] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const ev of evidenciasIniciales) {
      const key = `${ev.actividadId}_${ev.apartadoId || 'direct'}`;
      map[key] = typeof ev.nota === 'number' && !isNaN(ev.nota) ? String(ev.nota) : '';
    }
    return map;
  });

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estado para confirmación de eliminación de actividad
  const [actividadAEliminar, setActividadAEliminar] = useState<EvidenciaItem | null>(null);
  const [isDeletingAct, setIsDeletingAct] = useState(false);

  // Cálculo en tiempo real de la nota media del criterio
  const mediaCalculada = useMemo(() => {
    if (evidencias.length === 0) return null;
    const notasValidas = evidencias
      .map((e) => e.nota)
      .filter((n) => typeof n === 'number' && !isNaN(n));
    if (notasValidas.length === 0) return null;
    const suma = notasValidas.reduce((acc, val) => acc + val, 0);
    return Number((suma / notasValidas.length).toFixed(2));
  }, [evidencias]);

  const handleNotaChange = (key: string, valor: string) => {
    setNotasEditadas((prev) => ({
      ...prev,
      [key]: valor,
    }));
  };

  const handleGuardarNota = async (ev: EvidenciaItem) => {
    const key = `${ev.actividadId}_${ev.apartadoId || 'direct'}`;
    const rawVal = (notasEditadas[key] ?? '').trim().replace(',', '.');

    if (!rawVal) {
      setFeedback({ type: 'error', message: 'Escribe una calificación numérica entre 0 y 10.' });
      return;
    }

    const notaNum = parseFloat(rawVal);
    if (isNaN(notaNum) || notaNum < 0 || notaNum > 10) {
      setFeedback({ type: 'error', message: 'La calificación debe ser un número válido entre 0.00 y 10.00.' });
      return;
    }

    setSavingKey(key);
    setFeedback(null);

    try {
      if (ev.isApartado && ev.apartadoId && ev.rubricaId) {
        // Guardar calificación de apartado de rúbrica
        const res = await guardarCalificacionesApartados(grupoId, calificacionesApartados, [
          {
            alumnoId: alumno.id,
            apartadoId: ev.apartadoId,
            rubricaId: ev.rubricaId,
            actividadId: ev.actividadId !== ev.rubricaId ? ev.actividadId : null,
            nota: notaNum,
          },
        ]);
        onUpdateCalificacionesApartados(res.calificacionesApartados);
      } else {
        // Guardar calificación estándar de actividad directa
        const res = await guardarCalificacionesEvaluacion(grupoId, calificaciones, [
          {
            alumnoId: alumno.id,
            actividadId: ev.actividadId,
            nota: notaNum,
          },
        ]);
        onUpdateCalificaciones(res.calificaciones);
      }

      // Actualizar estado local de la evidencia para reflejar la nueva media
      setEvidencias((prev) =>
        prev.map((item) => {
          const itemKey = `${item.actividadId}_${item.apartadoId || 'direct'}`;
          return itemKey === key ? { ...item, nota: notaNum } : item;
        })
      );

      setFeedback({
        type: 'success',
        message: `Calificación actualizada a ${notaNum.toFixed(2)} en "${ev.actividadNombre}".`,
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      console.error('[CriterioDetalleModal] Error al guardar calificación:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Error al persistir la calificación en el servidor.',
      });
    } finally {
      setSavingKey(null);
    }
  };

  const handleConfirmarEliminarActividad = async () => {
    if (!actividadAEliminar) return;

    setIsDeletingAct(true);
    setFeedback(null);

    try {
      await onEliminarActividad(actividadAEliminar.actividadId);

      // Eliminar del listado local en el modal
      setEvidencias((prev) => prev.filter((it) => it.actividadId !== actividadAEliminar.actividadId));

      setFeedback({
        type: 'success',
        message: `Actividad "${actividadAEliminar.actividadNombre}" eliminada correctamente en Supabase y Fernanditio.`,
      });
      setActividadAEliminar(null);
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      console.error('[CriterioDetalleModal] Error al eliminar actividad:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Error al eliminar la actividad en el servidor.',
      });
    } finally {
      setIsDeletingAct(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-criterio-detalle-title"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-5 sm:p-6 space-y-5 animate-in zoom-in-95 duration-200 text-slate-800 my-8 overflow-hidden relative">
        {/* Borde superior del modal distintivo según el curso seleccionado */}
        <div
          className="h-2 w-full absolute top-0 left-0 right-0 transition-colors"
          style={{ backgroundColor: cursoTheme.primary }}
        />

        {/* Cabecera del modal */}
        <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs font-bold text-sm">
              <Target className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 font-mono">
                  Criterio {criterio.codigo}
                </span>
                <h3 id="modal-criterio-detalle-title" className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {alumno.nombre}
                </h3>
              </div>
              {criterio.descripcion && (
                <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                  {criterio.descripcion}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen de Nota Media */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Nota media del criterio
            </span>
            <span className="text-xs text-slate-600">
              Calculada a partir de {evidencias.length} {evidencias.length === 1 ? 'actividad' : 'actividades'} evaluadas
            </span>
          </div>

          <div className="flex items-center gap-2">
            {mediaCalculada !== null ? (
              <span
                className={`text-base sm:text-lg font-bold px-3 py-1 rounded-xl font-mono shadow-2xs ${
                  mediaCalculada >= 7
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : mediaCalculada >= 5
                    ? 'bg-sky-100 text-sky-800 border border-sky-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                {mediaCalculada.toFixed(2)}
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1 rounded-lg">
                Sin calificar
              </span>
            )}
          </div>
        </div>

        {/* Notificaciones y avisos de éxito o error */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs animate-in fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 font-bold p-0.5 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal interno de confirmación para eliminar actividad */}
        {actividadAEliminar && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 space-y-3 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-rose-900">
                <p className="font-bold">
                  ¿Confirmas que deseas eliminar la actividad "{actividadAEliminar.actividadNombre}"?
                </p>
                <p className="text-rose-700 leading-relaxed">
                  Esta acción eliminará de forma permanente la actividad y sus calificaciones vinculadas tanto en Supabase como en el cuaderno.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActividadAEliminar(null)}
                disabled={isDeletingAct}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEliminarActividad}
                disabled={isDeletingAct}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {isDeletingAct ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sí, eliminar actividad</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Lista de actividades evaluadas */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-indigo-600" />
              <span>Actividades asociadas ({evidencias.length})</span>
            </h4>
            <span className="text-[11px] text-slate-400">
              Modifica la nota o elimina la actividad
            </span>
          </div>

          {evidencias.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center space-y-1">
              <p className="text-xs font-semibold text-slate-600">
                No hay actividades vinculadas a este criterio para {alumno.nombre}.
              </p>
              <p className="text-[11px] text-slate-400">
                Las actividades creadas para este criterio aparecerán aquí cuando sean evaluadas.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {evidencias.map((ev) => {
                const key = `${ev.actividadId}_${ev.apartadoId || 'direct'}`;
                const notaActual = notasEditadas[key] ?? String(ev.nota);
                const isSavingThis = savingKey === key;
                const haCambiado = (notasEditadas[key] ?? '') !== String(ev.nota);

                return (
                  <div
                    key={key}
                    className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs"
                  >
                    {/* Información de la actividad */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 truncate max-w-[280px]">
                          {ev.actividadNombre}
                        </span>
                        {ev.tipoActividad && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                            {ev.tipoActividad}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                        {ev.instrumento && (
                          <span className="truncate max-w-[240px] text-slate-600 font-medium">
                            {ev.instrumento}
                          </span>
                        )}
                        {ev.fechaEvaluacion && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Calendar className="w-3 h-3" />
                            <span>{ev.fechaEvaluacion}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Acciones: Editar nota y Eliminar actividad */}
                    <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                      {/* Input de modificación de nota */}
                      <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <label htmlFor={`nota-input-${key}`} className="text-[10px] font-bold text-slate-500 uppercase px-1">
                          Nota:
                        </label>
                        <input
                          id={`nota-input-${key}`}
                          type="number"
                          step="0.05"
                          min="0"
                          max="10"
                          value={notaActual}
                          onChange={(e) => handleNotaChange(key, e.target.value)}
                          className="w-16 px-1.5 py-1 text-xs font-bold text-center bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                          disabled={isSavingThis}
                        />
                        <button
                          type="button"
                          onClick={() => handleGuardarNota(ev)}
                          disabled={isSavingThis || !haCambiado}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-300 rounded transition-colors cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                          title="Guardar cambio de nota"
                        >
                          {isSavingThis ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3" />
                          )}
                          <span className="hidden sm:inline">Guardar</span>
                        </button>
                      </div>

                      {/* Botón para eliminar actividad */}
                      <button
                        type="button"
                        onClick={() => setActividadAEliminar(ev)}
                        disabled={isDeletingAct}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
                        title={`Eliminar actividad "${ev.actividadNombre}"`}
                        aria-label={`Eliminar actividad "${ev.actividadNombre}"`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pie del modal */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
