/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Upload,
  Search,
  Edit2,
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useCuaderno } from '../../../context/CuadernoContext';
import { Alumno } from '../../../types';
import {
  crearAlumno,
  actualizarAlumno,
  eliminarAlumnos,
} from '../../../services/gestionDatosService';
import { ImportarAlumnosModal } from './ImportarAlumnosModal';

export const GestionAlumnos: React.FC = () => {
  const {
    cuadernoData,
    selectedGrupo,
    selectedGrupoId,
    refreshCuaderno,
    isLoadingCuaderno,
  } = useCuaderno();

  const alumnos: Alumno[] = useMemo(() => {
    return cuadernoData?.alumnos || [];
  }, [cuadernoData]);

  // Búsqueda / filtro
  const [busqueda, setBusqueda] = useState('');

  // Nuevo alumno
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoOrden, setNuevoOrden] = useState<string>('');
  const [isCreando, setIsCreando] = useState(false);

  // Edición rápida en fila
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditando, setNombreEditando] = useState('');
  const [ordenEditando, setOrdenEditando] = useState<string>('');
  const [isGuardandoEdicion, setIsGuardandoEdicion] = useState(false);

  // Selección múltiple para eliminación
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Modal de importación de archivos Word/Excel
  const [showImportModal, setShowImportModal] = useState(false);

  // Estados de retroalimentación
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [errorOperacion, setErrorOperacion] = useState<string | null>(null);

  const clearMessages = () => {
    setMensajeExito(null);
    setErrorOperacion(null);
  };

  // Selección automática de todo el contenido al recibir foco o clic para permitir sobreescribir sin borrar
  const handleAutoSelect = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement> | React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const target = e.currentTarget;
    setTimeout(() => {
      if (target && typeof target.select === 'function') {
        target.select();
      }
    }, 0);
  };

  const alumnosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return alumnos;
    const q = busqueda.toLowerCase().trim();
    return alumnos.filter((a) => a.nombre.toLowerCase().includes(q));
  }, [alumnos, busqueda]);

  // Añadir alumno
  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrupoId) {
      setErrorOperacion('Por favor selecciona un curso antes de añadir alumnos.');
      return;
    }

    const clean = nuevoNombre.trim();
    if (!clean || clean.length < 2) {
      setErrorOperacion('El nombre del alumno debe tener al menos 2 caracteres.');
      return;
    }

    const ord = nuevoOrden.trim() !== '' ? parseInt(nuevoOrden, 10) : undefined;

    setIsCreando(true);
    clearMessages();

    try {
      const nuevo = await crearAlumno(selectedGrupoId, clean, ord);
      setNuevoNombre('');
      setNuevoOrden('');
      setMensajeExito(`Alumno «${nuevo.nombre}» añadido correctamente.`);
      await refreshCuaderno(true);
    } catch (err: any) {
      console.error('[GestionAlumnos] Error al crear alumno:', err);
      setErrorOperacion(err?.message || 'Error al guardar el alumno en Supabase.');
    } finally {
      setIsCreando(false);
    }
  };

  // Iniciar edición
  const handleIniciarEdicion = (alumno: Alumno) => {
    setEditandoId(alumno.id);
    setNombreEditando(alumno.nombre);
    setOrdenEditando(alumno.orden !== undefined && alumno.orden !== null ? String(alumno.orden) : '');
  };

  // Guardar edición
  const handleGuardarEdicion = async (alumnoId: string) => {
    if (!selectedGrupoId) return;
    const clean = nombreEditando.trim();
    if (!clean || clean.length < 2) {
      setErrorOperacion('El nombre no puede estar vacío.');
      return;
    }

    const ord = ordenEditando.trim() !== '' ? parseInt(ordenEditando, 10) : undefined;

    setIsGuardandoEdicion(true);
    clearMessages();

    try {
      const actualizado = await actualizarAlumno(selectedGrupoId, alumnoId, clean, ord);
      setEditandoId(null);
      setMensajeExito(`Alumno «${actualizado.nombre}» actualizado correctamente.`);
      await refreshCuaderno(true);
    } catch (err: any) {
      console.error('[GestionAlumnos] Error al actualizar alumno:', err);
      setErrorOperacion(err?.message || 'Error al guardar los cambios en Supabase.');
    } finally {
      setIsGuardandoEdicion(false);
    }
  };

  // Selección múltiple
  const handleToggleSeleccion = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSeleccionarTodos = () => {
    if (alumnosFiltrados.every((a) => selectedIds.includes(a.id))) {
      const visiblesSet = new Set(alumnosFiltrados.map((a) => a.id));
      setSelectedIds((prev) => prev.filter((id) => !visiblesSet.has(id)));
    } else {
      const visiblesIds = alumnosFiltrados.map((a) => a.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visiblesIds])));
    }
  };

  // Eliminación con comprobación de dependencias
  const handleConfirmarEliminacion = async () => {
    if (!selectedGrupoId || selectedIds.length === 0) return;

    setIsDeleting(true);
    clearMessages();

    try {
      const { eliminados } = await eliminarAlumnos(selectedGrupoId, selectedIds);
      setShowConfirmModal(false);
      setSelectedIds([]);
      setMensajeExito(
        `${eliminados.length} ${eliminados.length === 1 ? 'alumno eliminado' : 'alumnos eliminados'} correctamente.`
      );
      await refreshCuaderno(true);
    } catch (err: any) {
      console.error('[GestionAlumnos] Error al eliminar alumnos:', err);
      setErrorOperacion(err?.message || 'No se pudieron eliminar los alumnos seleccionados.');
      setShowConfirmModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!selectedGrupoId) {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-2">
        <Users className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="text-xs font-semibold text-slate-600">Ningún curso seleccionado.</p>
        <p className="text-[11px] text-slate-400">
          Selecciona un curso en la cabecera para gestionar su lista de alumnos.
        </p>
      </div>
    );
  }

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
              <p className="font-bold">Aviso del servidor</p>
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

      {/* Barra de acciones: Añadir manual + Importar archivo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Formulario rápido para añadir */}
        <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-indigo-600" />
            Añadir Alumno al Curso
          </h4>
          <form onSubmit={handleCrear} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onFocus={handleAutoSelect}
              onClick={handleAutoSelect}
              placeholder="Apellidos, Nombre (ej: García López, Laura)"
              disabled={isCreando}
              className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
            />
            <input
              type="number"
              min="1"
              value={nuevoOrden}
              onChange={(e) => setNuevoOrden(e.target.value)}
              onFocus={handleAutoSelect}
              onClick={handleAutoSelect}
              placeholder="N.º (opc.)"
              disabled={isCreando}
              className="w-20 px-2 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 text-center"
            />
            <button
              type="submit"
              disabled={isCreando || !nuevoNombre.trim()}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              {isCreando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Añadir</span>
            </button>
          </form>
        </div>

        {/* Tarjeta de Importación desde Word/Excel */}
        <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-100 flex flex-col justify-between space-y-2">
          <div>
            <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-indigo-600" />
              Importación Masiva
            </h4>
            <p className="text-[11px] text-indigo-700/80 mt-1">
              Importa desde Word (.docx) o Excel (.xlsx) con vista previa y validación previa.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Importar Alumnos</span>
          </button>
        </div>
      </div>

      {/* Lista de Alumnos */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Alumnos Registrados ({alumnos.length})
            </span>
            {isLoadingCuaderno && <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Buscador */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar alumno..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
              />
            </div>

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
              onClick={() => refreshCuaderno(true)}
              disabled={isLoadingCuaderno}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Refrescar lista desde Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCuaderno ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {alumnosFiltrados.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-600">
              {alumnos.length === 0 ? 'No hay alumnos en este curso.' : 'No se encontraron alumnos con ese filtro.'}
            </p>
            <p className="text-[11px] text-slate-400">
              {alumnos.length === 0
                ? 'Puedes añadirlos individualmente o importarlos desde un archivo Word o Excel.'
                : 'Prueba con otro término de búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          alumnosFiltrados.length > 0 &&
                          alumnosFiltrados.every((a) => selectedIds.includes(a.id))
                        }
                        onChange={handleToggleSeleccionarTodos}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-3 w-16 text-center">N.º</th>
                    <th className="p-3">Nombre del Alumno</th>
                    <th className="p-3 w-28 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alumnosFiltrados.map((alumno, idx) => {
                    const isSelected = selectedIds.includes(alumno.id);
                    const estaEditando = editandoId === alumno.id;

                    return (
                      <tr
                        key={alumno.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-indigo-50/40' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSeleccion(alumno.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 text-center font-mono text-slate-500 font-semibold">
                          {estaEditando ? (
                            <input
                              type="number"
                              min="1"
                              value={ordenEditando}
                              onChange={(e) => setOrdenEditando(e.target.value)}
                              onFocus={handleAutoSelect}
                              onClick={handleAutoSelect}
                              className="w-12 px-1 py-0.5 text-xs text-center border border-indigo-400 rounded focus:outline-none"
                            />
                          ) : (
                            alumno.orden ?? idx + 1
                          )}
                        </td>
                        <td className="p-3 font-semibold text-slate-900">
                          {estaEditando ? (
                            <input
                              type="text"
                              value={nombreEditando}
                              onChange={(e) => setNombreEditando(e.target.value)}
                              onFocus={handleAutoSelect}
                              onClick={handleAutoSelect}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleGuardarEdicion(alumno.id);
                                }
                              }}
                              className="w-full max-w-md px-2 py-1 text-xs border border-indigo-400 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            alumno.nombre
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {estaEditando ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleGuardarEdicion(alumno.id)}
                                  disabled={isGuardandoEdicion}
                                  className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md cursor-pointer"
                                  title="Guardar cambios"
                                >
                                  {isGuardandoEdicion ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditandoId(null)}
                                  disabled={isGuardandoEdicion}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                                  title="Cancelar"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleIniciarEdicion(alumno)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                                  title="Editar nombre"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedIds([alumno.id]);
                                    setShowConfirmModal(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                                  title="Eliminar alumno"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
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

      {/* Modal de confirmación de eliminación */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  ¿Eliminar {selectedIds.length} {selectedIds.length === 1 ? 'alumno' : 'alumnos'}?
                </h4>
                <p className="text-xs text-slate-600">
                  El servidor comprobará si los alumnos seleccionados tienen calificaciones o evidencias evaluadas asociadas. Si existen notas vinculadas, la operación será bloqueada para proteger los registros de evaluación.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-800">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Protección del expediente académico:
              </p>
              <p className="text-[11px] mt-0.5">
                Evita la pérdida accidental de calificaciones y garantiza un entorno seguro.
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
                    <span>Verificando y eliminando...</span>
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

      {/* Modal de importación de archivos */}
      {showImportModal && selectedGrupoId && (
        <ImportarAlumnosModal
          grupoId={selectedGrupoId}
          grupoNombre={selectedGrupo?.nombre || 'Curso actual'}
          alumnosExistentes={alumnos}
          onClose={() => setShowImportModal(false)}
          onSuccess={(count) => {
            setMensajeExito(`Se han importado ${count} alumnos con éxito.`);
            refreshCuaderno(true);
          }}
        />
      )}
    </div>
  );
};
