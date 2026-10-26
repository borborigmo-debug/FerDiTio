/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  FolderTree,
  CornerDownRight,
  Folder,
} from 'lucide-react';
import { useCuaderno } from '../../../context/CuadernoContext';
import { Seccion } from '../../../types';
import {
  crearSeccion,
  actualizarSeccion,
  eliminarSecciones,
} from '../../../services/gestionDatosService';
import {
  organizarArbolSecciones,
  setSeccionParent,
  eliminarDeJerarquia,
  ArbolSeccionItem,
} from '../../../services/seccionesJerarquiaService';

const COLORES_PREDEFINIDOS = [
  '#4f46e5', // indigo
  '#2563eb', // blue
  '#0d9488', // teal
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // rose
  '#7c3aed', // violet
  '#db2777', // pink
];

export const GestionSecciones: React.FC = () => {
  const {
    cuadernoData,
    selectedGrupoId,
    refreshCuaderno,
    isLoadingCuaderno,
  } = useCuaderno();

  const secciones: Seccion[] = useMemo(() => {
    return cuadernoData?.secciones || [];
  }, [cuadernoData]);

  // Árbol jerárquico organizado de secciones principales y sus subsecciones
  const arbolSecciones: ArbolSeccionItem[] = useMemo(() => {
    if (!selectedGrupoId) return [];
    return organizarArbolSecciones(secciones, selectedGrupoId);
  }, [secciones, selectedGrupoId]);

  // Formulario de creación
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoColor, setNuevoColor] = useState(COLORES_PREDEFINIDOS[0]);
  const [esSubseccion, setEsSubseccion] = useState(false);
  const [seccionPadreId, setSeccionPadreId] = useState<string>('');
  const [isCreando, setIsCreando] = useState(false);

  // Edición rápida en fila
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditando, setNombreEditando] = useState('');
  const [colorEditando, setColorEditando] = useState(COLORES_PREDEFINIDOS[0]);
  const [isGuardandoEdicion, setIsGuardandoEdicion] = useState(false);

  // Selección múltiple
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

  // Abrir formulario rápido para añadir subsección a una sección concreta
  const handleAbrirCrearSubseccion = (padreId: string, colorPadre?: string | null) => {
    setEsSubseccion(true);
    setSeccionPadreId(padreId);
    if (colorPadre) setNuevoColor(colorPadre);
    setNuevoNombre('');
    // Scroll suave hacia el formulario
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrupoId) {
      setErrorOperacion('Por favor selecciona un curso antes de crear secciones.');
      return;
    }

    const clean = nuevoNombre.trim();
    if (!clean || clean.length < 2) {
      setErrorOperacion('El nombre debe tener al menos 2 caracteres.');
      return;
    }

    if (esSubseccion && !seccionPadreId) {
      setErrorOperacion('Debes seleccionar la sección principal a la que pertenecerá esta subsección.');
      return;
    }

    setIsCreando(true);
    clearMessages();

    try {
      const nueva = await crearSeccion(selectedGrupoId, clean, nuevoColor);

      // Si es subsección, registrar el vínculo con su padre
      if (esSubseccion && seccionPadreId) {
        setSeccionParent(selectedGrupoId, nueva.id, seccionPadreId);
      }

      setNuevoNombre('');
      setEsSubseccion(false);
      setSeccionPadreId('');
      setMensajeExito(
        esSubseccion
          ? `Subsección «${nueva.nombre}» añadida correctamente.`
          : `Sección «${nueva.nombre}» creada correctamente.`
      );
      await refreshCuaderno(true);
    } catch (err: any) {
      console.error('[GestionSecciones] Error al crear sección/subsección:', err);
      setErrorOperacion(err?.message || 'Error al guardar en Supabase.');
    } finally {
      setIsCreando(false);
    }
  };

  const handleIniciarEdicion = (sec: Seccion) => {
    setEditandoId(sec.id);
    setNombreEditando(sec.nombre);
    setColorEditando(sec.color || COLORES_PREDEFINIDOS[0]);
  };

  const handleGuardarEdicion = async (seccionId: string) => {
    if (!selectedGrupoId) return;

    const clean = nombreEditando.trim();
    if (!clean || clean.length < 2) {
      setErrorOperacion('El nombre no puede estar vacío.');
      return;
    }

    setIsGuardandoEdicion(true);
    clearMessages();

    try {
      const actualizada = await actualizarSeccion(
        selectedGrupoId,
        seccionId,
        clean,
        colorEditando
      );
      setEditandoId(null);
      setMensajeExito(`Elemento «${actualizada.nombre}» actualizado correctamente.`);
      await refreshCuaderno(true);
    } catch (err: any) {
      console.error('[GestionSecciones] Error al actualizar sección:', err);
      setErrorOperacion(err?.message || 'Error al guardar los cambios en Supabase.');
    } finally {
      setIsGuardandoEdicion(false);
    }
  };

  const handleToggleSeleccion = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSeleccionarTodas = () => {
    if (selectedIds.length === secciones.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(secciones.map((s) => s.id));
    }
  };

  const handleConfirmarEliminacion = async () => {
    if (!selectedGrupoId || selectedIds.length === 0) return;

    setIsDeleting(true);
    clearMessages();

    try {
      const { eliminadas } = await eliminarSecciones(selectedGrupoId, selectedIds);

      // Limpiar jerarquías
      for (const id of eliminadas) {
        eliminarDeJerarquia(selectedGrupoId, id);
      }

      setShowConfirmModal(false);
      setSelectedIds([]);
      setMensajeExito(
        `${eliminadas.length} ${eliminadas.length === 1 ? 'sección/subsección eliminada' : 'secciones/subsecciones eliminadas'} correctamente.`
      );
      await refreshCuaderno(true);
    } catch (err: any) {
      console.error('[GestionSecciones] Error al eliminar:', err);
      setErrorOperacion(err?.message || 'No se pudieron eliminar las secciones.');
      setShowConfirmModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!selectedGrupoId) {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-2">
        <Layers className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="text-xs font-semibold text-slate-600">Ningún curso seleccionado.</p>
        <p className="text-[11px] text-slate-400">
          Selecciona un curso para gestionar sus secciones y subsecciones.
        </p>
      </div>
    );
  }

  // Lista de secciones principales para el selector de padre
  const seccionesPrincipalesDisponibles = arbolSecciones.map((item) => item.seccion);

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

      {/* Formulario para añadir nueva sección o subsección */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-indigo-600" />
            <span>{esSubseccion ? 'Añadir Nueva Subsección' : 'Añadir Nueva Sección'}</span>
          </h4>

          {/* Selector de tipo (Sección principal vs Subsección) */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={esSubseccion}
                onChange={(e) => {
                  setEsSubseccion(e.target.checked);
                  if (e.target.checked && !seccionPadreId && seccionesPrincipalesDisponibles.length > 0) {
                    setSeccionPadreId(seccionesPrincipalesDisponibles[0].id);
                  }
                }}
                disabled={seccionesPrincipalesDisponibles.length === 0}
                className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
              />
              <span>Crear como subsección de otra</span>
            </label>
          </div>
        </div>

        <form onSubmit={handleCrear} className="space-y-3">
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            {/* Si es subsección, mostrar selector de sección padre */}
            {esSubseccion && (
              <div className="w-full sm:w-64">
                <select
                  value={seccionPadreId}
                  onChange={(e) => {
                    setSeccionPadreId(e.target.value);
                    const padre = secciones.find((s) => s.id === e.target.value);
                    if (padre?.color) setNuevoColor(padre.color);
                  }}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-900 cursor-pointer"
                >
                  <option value="">-- Elige sección padre --</option>
                  {seccionesPrincipalesDisponibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      📁 {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex-1 w-full">
              <input
                type="text"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder={
                  esSubseccion
                    ? 'Nombre de la subsección (ej: Ortografía, Figuras retóricas, Sintaxis...)'
                    : 'Nombre de la sección (ej: Expresión escrita, Comunicación oral, Literatura...)'
                }
                disabled={isCreando}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
              />
            </div>

            {/* Selector de color */}
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-300">
              {COLORES_PREDEFINIDOS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNuevoColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                    nuevoColor === c ? 'scale-125 ring-2 ring-indigo-500 ring-offset-1' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={isCreando || !nuevoNombre.trim()}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              {isCreando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{esSubseccion ? 'Añadir Subsección' : 'Añadir Sección'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Lista Jerárquica de Secciones y Subsecciones */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FolderTree className="w-4 h-4 text-indigo-600" />
              <span>
                Estructura de Secciones ({secciones.length} total, {arbolSecciones.length} principales)
              </span>
            </span>
            {isLoadingCuaderno && <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />}
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
              onClick={() => refreshCuaderno(true)}
              disabled={isLoadingCuaderno}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Refrescar secciones desde Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCuaderno ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {secciones.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-2">
            <Layers className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-600">No hay secciones en este curso.</p>
            <p className="text-[11px] text-slate-400">
              Las secciones y subsecciones permiten organizar actividades en bloques temáticos.
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
                      checked={secciones.length > 0 && selectedIds.length === secciones.length}
                      onChange={handleToggleSeleccionarTodas}
                      className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-3 w-12 text-center">Color</th>
                  <th className="p-3">Sección / Subsección</th>
                  <th className="p-3 w-36 text-center">Tipo</th>
                  <th className="p-3 w-40 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {arbolSecciones.map((item) => {
                  const padre = item.seccion;
                  const isPadreSelected = selectedIds.includes(padre.id);
                  const estaEditandoPadre = editandoId === padre.id;

                  return (
                    <React.Fragment key={padre.id}>
                      {/* Fila: Sección Principal */}
                      <tr
                        className={`transition-colors bg-white font-medium ${
                          isPadreSelected ? 'bg-indigo-50/40' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isPadreSelected}
                            onChange={() => handleToggleSeleccion(padre.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 text-center">
                          {estaEditandoPadre ? (
                            <input
                              type="color"
                              value={colorEditando}
                              onChange={(e) => setColorEditando(e.target.value)}
                              className="w-6 h-6 rounded border-0 cursor-pointer"
                            />
                          ) : (
                            <span
                              className="inline-block w-4 h-4 rounded-full shadow-2xs"
                              style={{ backgroundColor: padre.color || '#6366f1' }}
                            />
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          {estaEditandoPadre ? (
                            <input
                              type="text"
                              value={nombreEditando}
                              onChange={(e) => setNombreEditando(e.target.value)}
                              className="w-full max-w-sm px-2 py-1 text-xs border border-indigo-400 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <Folder className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>{padre.nombre}</span>
                              {item.subsecciones.length > 0 && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({item.subsecciones.length} {item.subsecciones.length === 1 ? 'subsección' : 'subsecciones'})
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Sección principal
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {estaEditandoPadre ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleGuardarEdicion(padre.id)}
                                  disabled={isGuardandoEdicion}
                                  className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md cursor-pointer"
                                  title="Guardar cambios"
                                >
                                  {isGuardandoEdicion ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
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
                                  onClick={() => handleAbrirCrearSubseccion(padre.id, padre.color)}
                                  className="px-2 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md flex items-center gap-1 cursor-pointer"
                                  title="Añadir una subsección dentro de esta sección"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Subsección</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleIniciarEdicion(padre)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedIds([padre.id]);
                                    setShowConfirmModal(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Filas anidadas: Subsecciones */}
                      {item.subsecciones.map((sub) => {
                        const isSubSelected = selectedIds.includes(sub.id);
                        const estaEditandoSub = editandoId === sub.id;

                        return (
                          <tr
                            key={sub.id}
                            className={`transition-colors bg-slate-50/50 ${
                              isSubSelected ? 'bg-indigo-50/40' : 'hover:bg-indigo-50/20'
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSubSelected}
                                onChange={() => handleToggleSeleccion(sub.id)}
                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 text-center">
                              {estaEditandoSub ? (
                                <input
                                  type="color"
                                  value={colorEditando}
                                  onChange={(e) => setColorEditando(e.target.value)}
                                  className="w-5 h-5 rounded border-0 cursor-pointer"
                                />
                              ) : (
                                <span
                                  className="inline-block w-3.5 h-3.5 rounded-full shadow-2xs opacity-80"
                                  style={{ backgroundColor: sub.color || padre.color || '#6366f1' }}
                                />
                              )}
                            </td>
                            <td className="p-3 pl-8 text-slate-800">
                              {estaEditandoSub ? (
                                <input
                                  type="text"
                                  value={nombreEditando}
                                  onChange={(e) => setNombreEditando(e.target.value)}
                                  className="w-full max-w-sm px-2 py-1 text-xs border border-indigo-400 rounded focus:outline-none"
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <CornerDownRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="font-semibold">{sub.nombre}</span>
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                Subsección
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {estaEditandoSub ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleGuardarEdicion(sub.id)}
                                      disabled={isGuardandoEdicion}
                                      className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md cursor-pointer"
                                      title="Guardar"
                                    >
                                      {isGuardandoEdicion ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
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
                                      onClick={() => handleIniciarEdicion(sub)}
                                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                                      title="Editar"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedIds([sub.id]);
                                        setShowConfirmModal(true);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                                      title="Eliminar"
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
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
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
                  ¿Eliminar {selectedIds.length} {selectedIds.length === 1 ? 'sección/subsección' : 'secciones/subsecciones'}?
                </h4>
                <p className="text-xs text-slate-600">
                  El servidor comprobará si contienen actividades asignadas. Si existen actividades vinculadas, la eliminación será bloqueada para evitar desvincular tareas involuntariamente.
                </p>
              </div>
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
                    <span>Eliminando...</span>
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
