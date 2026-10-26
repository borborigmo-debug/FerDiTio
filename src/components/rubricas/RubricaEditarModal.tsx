/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Rubrica, ActividadDetalle } from '../../types';
import { actualizarRubricaTitulo } from '../../services/rubricasService';
import {
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Calendar,
  Layers,
  Loader2,
} from 'lucide-react';
import { getCursoColorTheme } from '../../utils/cursoColorUtils';

interface RubricaEditarModalProps {
  rubrica: Rubrica;
  actividades: ActividadDetalle[];
  grupoId: string;
  onClose: () => void;
  onSaveRubrica: (rubricaActualizada: Rubrica) => void;
  onEliminarActividad: (actividadId: string) => Promise<any>;
}

export const RubricaEditarModal: React.FC<RubricaEditarModalProps> = ({
  rubrica,
  actividades,
  grupoId,
  onClose,
  onSaveRubrica,
  onEliminarActividad,
}) => {
  const cursoTheme = React.useMemo(() => getCursoColorTheme(grupoId), [grupoId]);

  const [titulo, setTitulo] = useState(rubrica.titulo || '');
  const [isSavingTitulo, setIsSavingTitulo] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estado para la supresión de actividades individuales
  const [actividadAEliminar, setActividadAEliminar] = useState<ActividadDetalle | null>(null);
  const [isDeletingAct, setIsDeletingAct] = useState(false);

  // Lista de actividades vinculadas a esta rúbrica
  const actividadesVinculadas = actividades.filter((a) => a.rubrica_id === rubrica.id);

  const handleGuardarTitulo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitulo = titulo.trim();
    if (!cleanTitulo) {
      setFeedback({ type: 'error', message: 'El título de la rúbrica no puede estar vacío.' });
      return;
    }

    if (cleanTitulo === rubrica.titulo) {
      onClose();
      return;
    }

    setIsSavingTitulo(true);
    setFeedback(null);

    try {
      const rubricaActualizada = await actualizarRubricaTitulo(
        grupoId,
        rubrica.id,
        cleanTitulo,
        rubrica.items
      );
      onSaveRubrica(rubricaActualizada);
      setFeedback({ type: 'success', message: 'Título de la rúbrica actualizado correctamente.' });
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('[RubricaEditarModal] Error al actualizar título:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Error al actualizar el título en el servidor.',
      });
    } finally {
      setIsSavingTitulo(false);
    }
  };

  const handleConfirmarSuprimirActividad = async () => {
    if (!actividadAEliminar) return;

    setIsDeletingAct(true);
    setFeedback(null);

    try {
      await onEliminarActividad(actividadAEliminar.id);
      setFeedback({
        type: 'success',
        message: `Actividad "${actividadAEliminar.nombre}" suprimida correctamente de Supabase y del cuaderno.`,
      });
      setActividadAEliminar(null);
    } catch (err: any) {
      console.error('[RubricaEditarModal] Error al suprimir actividad:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Error al suprimir la actividad en el servidor.',
      });
    } finally {
      setIsDeletingAct(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-editar-rubrica-title"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-5 sm:p-6 space-y-5 animate-in zoom-in-95 duration-200 text-slate-800 my-8 overflow-hidden relative">
        {/* Borde superior del modal distintivo según el curso seleccionado */}
        <div
          className="h-2 w-full absolute top-0 left-0 right-0 transition-colors"
          style={{ backgroundColor: cursoTheme.primary }}
        />

        {/* Cabecera del modal */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3 id="modal-editar-rubrica-title" className="text-base sm:text-lg font-bold text-slate-900">
                Editar Rúbrica
              </h3>
              <p className="text-xs text-slate-500">
                Modifica el título de la rúbrica o suprime actividades asociadas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificaciones y avisos */}
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
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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

        {/* Sección 1: Editar título */}
        <form onSubmit={handleGuardarTitulo} className="space-y-2">
          <label htmlFor="rubrica-titulo-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Título de la Rúbrica
          </label>
          <div className="flex items-center gap-2">
            <input
              id="rubrica-titulo-input"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Expresión Oral y Debate"
              className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-slate-800 transition-all font-medium"
              disabled={isSavingTitulo}
              autoFocus
            />
            <button
              type="submit"
              disabled={isSavingTitulo || !titulo.trim() || titulo.trim() === rubrica.titulo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs shrink-0"
              title="Guardar el nuevo título"
            >
              {isSavingTitulo ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Guardar título</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Sección 2: Actividades asociadas y supresión */}
        <div className="space-y-3 pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-indigo-600" />
              <span>Actividades asociadas ({actividadesVinculadas.length})</span>
            </h4>
            <span className="text-[11px] text-slate-400">
              Suprime las actividades que desees
            </span>
          </div>

          {actividadesVinculadas.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center">
              <p className="text-xs text-slate-500">
                Esta rúbrica no tiene actividades vinculadas actualmente.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {actividadesVinculadas.map((act) => (
                <div
                  key={act.id}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition-colors flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 truncate max-w-[240px]">
                        {act.nombre}
                      </span>
                      {act.evaluacion_periodo && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800">
                          {act.evaluacion_periodo}
                        </span>
                      )}
                    </div>
                    {act.fecha && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{act.fecha}</span>
                      </p>
                    )}
                  </div>

                  {/* Botón para suprimir actividad */}
                  <button
                    type="button"
                    onClick={() => setActividadAEliminar(act)}
                    disabled={isDeletingAct}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                    title={`Suprimir actividad "${act.nombre}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Suprimir</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal interno de confirmación para suprimir actividad */}
        {actividadAEliminar && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/70 space-y-3 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-rose-900">
                <p className="font-bold">
                  ¿Confirmas que deseas suprimir la actividad "{actividadAEliminar.nombre}"?
                </p>
                <p className="text-rose-700 leading-relaxed">
                  Esta acción eliminará la actividad y todas sus calificaciones asociadas en Supabase y del cuaderno de forma permanente.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActividadAEliminar(null)}
                disabled={isDeletingAct}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarSuprimirActividad}
                disabled={isDeletingAct}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {isDeletingAct ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Suprimiendo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sí, suprimir actividad</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

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
