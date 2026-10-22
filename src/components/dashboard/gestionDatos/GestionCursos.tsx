/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Folder,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  Check,
  Users,
} from 'lucide-react';
import { useCuaderno } from '../../../context/CuadernoContext';
import { GrupoDocente } from '../../../services/gruposService';
import { crearGrupo, eliminarGrupos } from '../../../services/gestionDatosService';

export const GestionCursos: React.FC = () => {
  const {
    grupos,
    selectedGrupoId,
    selectGrupo,
    isLoadingGrupos,
    refreshGrupos,
    refreshCuaderno,
  } = useCuaderno();

  // Estado para nuevo curso
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [isCreando, setIsCreando] = useState(false);

  // Selección múltiple para eliminación
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Estados de retroalimentación
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [errorOperacion, setErrorOperacion] = useState<string | null>(null);

  const clearMessages = () => {
    setMensajeExito(null);
    setErrorOperacion(null);
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = nuevoNombre.trim();
    if (!clean || clean.length < 2) {
      setErrorOperacion('El nombre del curso debe tener al menos 2 caracteres.');
      return;
    }

    setIsCreando(true);
    clearMessages();

    try {
      const nuevo = await crearGrupo(clean);
      setNuevoNombre('');
      setMensajeExito(`Curso «${nuevo.nombre}» creado correctamente en Supabase.`);
      await refreshGrupos();
      if (nuevo.id) {
        await selectGrupo(nuevo.id, true, true);
      }
    } catch (err: any) {
      console.error('[GestionCursos] Error al crear curso:', err);
      setErrorOperacion(err?.message || 'Error al guardar el nuevo curso en Supabase.');
    } finally {
      setIsCreando(false);
    }
  };

  const handleToggleSeleccion = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSeleccionarTodos = () => {
    if (selectedIds.length === grupos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(grupos.map((g) => g.id));
    }
  };

  const handleConfirmarEliminacion = async () => {
    if (selectedIds.length === 0) return;

    setIsDeleting(true);
    clearMessages();

    try {
      const { eliminados } = await eliminarGrupos(selectedIds);
      setShowConfirmModal(false);
      setSelectedIds([]);
      setMensajeExito(
        `${eliminados.length} ${eliminados.length === 1 ? 'curso eliminado' : 'cursos eliminados'} correctamente.`
      );
      await refreshGrupos();
      // Si el grupo activo fue eliminado, re-seleccionar
      if (selectedGrupoId && eliminados.includes(selectedGrupoId)) {
        const restantes = grupos.filter((g) => !eliminados.includes(g.id));
        if (restantes.length > 0) {
          await selectGrupo(restantes[0].id, true, true);
        }
      }
    } catch (err: any) {
      console.error('[GestionCursos] Error al eliminar cursos:', err);
      setErrorOperacion(err?.message || 'No se pudieron eliminar los cursos seleccionados.');
      setShowConfirmModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Mensajes de éxito / error */}
      {mensajeExito && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{mensajeExito}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensajeExito(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {errorOperacion && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start justify-between animate-in fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Error en la operación</p>
              <p>{errorOperacion}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorOperacion(null)}
            className="text-rose-700 hover:text-rose-900 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Formulario de creación de curso */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-indigo-600" />
          Añadir Nuevo Curso
        </h4>
        <form onSubmit={handleCrear} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Ej: 3º ESO A, 1º Bachillerato..."
            disabled={isCreando}
            className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900"
          />
          <button
            type="submit"
            disabled={isCreando || !nuevoNombre.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            {isCreando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Crear Curso</span>
          </button>
        </form>
      </div>

      {/* Lista de cursos con selección múltiple */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Cursos Registrados ({grupos.length})
            </span>
            {isLoadingGrupos && <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />}
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={isDeleting}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar ({selectedIds.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => refreshGrupos()}
              disabled={isLoadingGrupos}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Actualizar cursos desde Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGrupos ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {grupos.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-2">
            <Folder className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-600">No hay cursos registrados todavía.</p>
            <p className="text-[11px] text-slate-400">
              Utiliza el formulario superior para crear tu primer curso.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={grupos.length > 0 && selectedIds.length === grupos.length}
                      onChange={handleToggleSeleccionarTodos}
                      className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-3">Nombre del Curso</th>
                  <th className="p-3 w-32 text-center">Estado Activo</th>
                  <th className="p-3 w-28 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grupos.map((grupo) => {
                  const isSelected = selectedIds.includes(grupo.id);
                  const isCurrent = grupo.id === selectedGrupoId;

                  return (
                    <tr
                      key={grupo.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/40'
                          : isCurrent
                          ? 'bg-amber-50/30'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSeleccion(grupo.id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Folder
                            className={`w-4 h-4 ${
                              isCurrent ? 'text-indigo-600' : 'text-slate-400'
                            }`}
                          />
                          <span className="font-bold text-slate-900">{grupo.nombre}</span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                              Seleccionado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {isCurrent ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold text-[11px] inline-flex items-center gap-1">
                            <Check className="w-3 h-3" /> En uso
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => selectGrupo(grupo.id, true, true)}
                            className="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold underline cursor-pointer"
                          >
                            Activar
                          </button>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIds([grupo.id]);
                            setShowConfirmModal(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="Eliminar curso"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de confirmación de eliminación con advertencia de dependencias */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  ¿Eliminar {selectedIds.length} {selectedIds.length === 1 ? 'curso' : 'cursos'}?
                </h4>
                <p className="text-xs text-slate-600">
                  Antes de proceder, el servidor verificará que los cursos no contengan dependencias activas (alumnos, actividades o calificaciones registradas). Si existen datos asociados, la eliminación será bloqueada para evitar pérdidas accidentales.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Verificación estricta de dependencias:
              </p>
              <p className="text-[11px]">
                No se eliminará silenciosamente ninguna evidencia de evaluación ni datos de estudiantes.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isDeleting}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEliminacion}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Comprobando y eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar eliminación</span>
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
