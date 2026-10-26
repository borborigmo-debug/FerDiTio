/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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
  Link2,
  Edit2,
  X,
  Share2,
  Sparkles,
  Info,
} from 'lucide-react';
import { useCuaderno } from '../../../context/CuadernoContext';
import { useAuth } from '../../../context/AuthContext';
import { GrupoDocente } from '../../../services/gruposService';
import { crearGrupo, eliminarGrupos } from '../../../services/gestionDatosService';
import {
  ClusterVinculacionRubricas,
  obtenerClustersVinculacion,
  guardarCluster,
  eliminarCluster,
  eliminarGrupoDeVinculaciones,
  obtenerGruposVinculadosCon,
} from '../../../services/vinculacionRubricasService';
import { getCursoColorTheme } from '../../../utils/cursoColorUtils';
import { generateUuid } from '../../../utils/rubricaUtils';

export const GestionCursos: React.FC = () => {
  const { user } = useAuth();
  const {
    grupos,
    selectedGrupoId,
    selectGrupo,
    isLoadingGrupos,
    refreshGrupos,
    refreshCuaderno,
  } = useCuaderno();

  const selectedGrupo = useMemo(
    () => grupos.find((g) => g.id === selectedGrupoId) || null,
    [grupos, selectedGrupoId]
  );

  const cursoTheme = useMemo(
    () => getCursoColorTheme(selectedGrupoId, selectedGrupo?.nombre),
    [selectedGrupoId, selectedGrupo]
  );

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

  // Estado para vinculación de rúbricas entre cursos
  const [clusters, setClusters] = useState<ClusterVinculacionRubricas[]>(() =>
    obtenerClustersVinculacion(user?.uid)
  );
  const [modalVinculacionOpen, setModalVinculacionOpen] = useState(false);
  const [clusterEditando, setClusterEditando] = useState<ClusterVinculacionRubricas | null>(null);
  const [nombreVinculo, setNombreVinculo] = useState('');
  const [gruposSeleccionadosParaVinculo, setGruposSeleccionadosParaVinculo] = useState<string[]>([]);
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null);

  useEffect(() => {
    setClusters(obtenerClustersVinculacion(user?.uid));
  }, [user?.uid]);

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
      // Limpiar vinculaciones de rúbricas para cursos eliminados
      eliminados.forEach((id) => eliminarGrupoDeVinculaciones(id, user?.uid));
      setClusters(obtenerClustersVinculacion(user?.uid));

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

  // Manejadores de Vinculación de Rúbricas
  const handleAbrirCrearVinculacion = () => {
    setClusterEditando(null);
    setNombreVinculo('');
    // Si hay un curso activo, sugerirlo inicialmente seleccionado
    setGruposSeleccionadosParaVinculo(selectedGrupoId ? [selectedGrupoId] : []);
    setErrorVinculo(null);
    setModalVinculacionOpen(true);
  };

  const handleAbrirEditarVinculacion = (cluster: ClusterVinculacionRubricas) => {
    setClusterEditando(cluster);
    setNombreVinculo(cluster.nombre);
    setGruposSeleccionadosParaVinculo(cluster.grupoIds);
    setErrorVinculo(null);
    setModalVinculacionOpen(true);
  };

  const handleToggleGrupoParaVinculo = (grupoId: string) => {
    setGruposSeleccionadosParaVinculo((prev) => {
      const exists = prev.includes(grupoId);
      const updated = exists ? prev.filter((id) => id !== grupoId) : [...prev, grupoId];

      // Si el nombre está vacío o fue generado automáticamente, sugerir un nombre amigable
      if (!nombreVinculo.trim() || nombreVinculo.startsWith('Cursos ')) {
        const nombres = updated
          .map((id) => grupos.find((g) => g.id === id)?.nombre)
          .filter(Boolean);
        if (nombres.length > 0) {
          setNombreVinculo(nombres.join(' y '));
        }
      }
      return updated;
    });
  };

  const handleGuardarVinculacion = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorVinculo(null);

    if (gruposSeleccionadosParaVinculo.length < 2) {
      setErrorVinculo('Debes seleccionar al menos 2 cursos para poder vincularlos entre sí.');
      return;
    }

    const cleanNombre =
      nombreVinculo.trim() ||
      gruposSeleccionadosParaVinculo
        .map((id) => grupos.find((g) => g.id === id)?.nombre)
        .filter(Boolean)
        .join(' y ') ||
      'Cursos vinculados';

    const nuevo: ClusterVinculacionRubricas = {
      id: clusterEditando?.id || generateUuid(),
      nombre: cleanNombre,
      grupoIds: gruposSeleccionadosParaVinculo,
      fechaCreacion: clusterEditando?.fechaCreacion || new Date().toISOString(),
    };

    const actualizados = guardarCluster(nuevo, user?.uid);
    setClusters(actualizados);
    setModalVinculacionOpen(false);
    setMensajeExito(`Vinculación «${cleanNombre}» guardada correctamente.`);
  };

  const handleEliminarVinculacion = (clusterId: string, nombre: string) => {
    const actualizados = eliminarCluster(clusterId, user?.uid);
    setClusters(actualizados);
    setMensajeExito(`Vinculación «${nombre}» eliminada.`);
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <Folder
                            className={`w-4 h-4 shrink-0 ${
                              isCurrent ? 'text-indigo-600' : 'text-slate-400'
                            }`}
                          />
                          <span className="font-bold text-slate-900">{grupo.nombre}</span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                              Seleccionado
                            </span>
                          )}
                          {(() => {
                            const vinculados = obtenerGruposVinculadosCon(grupo.id, user?.uid);
                            if (vinculados.length === 0) return null;
                            const nombresV = vinculados
                              .map((vid) => grupos.find((g) => g.id === vid)?.nombre)
                              .filter(Boolean);
                            return (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-semibold"
                                title={`Rúbricas vinculadas con: ${nombresV.join(', ')}`}
                              >
                                <Link2 className="w-2.5 h-2.5" />
                                <span>Vinculado ({vinculados.length})</span>
                              </span>
                            );
                          })()}
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

      {/* =========================================================================
          SECCIÓN: VINCULACIÓN DE RÚBRICAS ENTRE CURSOS
          Permite al docente vincular cursos paralelos (ej. 1º ESO A y 1º ESO B)
          para que las rúbricas y actividades creadas se repliquen automáticamente.
         ========================================================================= */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Link2 className="w-4 h-4 text-indigo-600" />
              <span>Vinculación entre Cursos (Rúbricas y Criterios)</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold normal-case">
                {clusters.length} {clusters.length === 1 ? 'grupo vinculado' : 'grupos vinculados'}
              </span>
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Vincula cursos paralelos (ej. 1º ESO A y 1º ESO B). Al introducir criterios, fijar ponderaciones o crear rúbricas en uno de ellos, se replicarán y sincronizarán automáticamente en los demás.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAbrirCrearVinculacion}
            disabled={grupos.length < 2}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
            title={grupos.length < 2 ? 'Necesitas al menos 2 cursos registrados para poder vincularlos' : 'Crear nueva vinculación de cursos'}
          >
            <Plus className="w-4 h-4" />
            <span>Vincular Cursos</span>
          </button>
        </div>

        {clusters.length === 0 ? (
          <div className="p-6 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-xl space-y-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Link2 className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-700">No hay vinculaciones configuradas todavía</p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
              Si impartes clase en varios cursos paralelos o grupos que comparten programación, vincúlalos para compartir y replicar automáticamente tus criterios de evaluación, ponderaciones y rúbricas.
            </p>
            {grupos.length >= 2 && (
              <button
                type="button"
                onClick={handleAbrirCrearVinculacion}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-indigo-200 hover:border-indigo-300 text-indigo-700 hover:text-indigo-900 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Crear primera vinculación</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clusters.map((cluster) => {
              const gruposEnCluster = cluster.grupoIds
                .map((id) => grupos.find((g) => g.id === id))
                .filter(Boolean) as GrupoDocente[];

              return (
                <div
                  key={cluster.id}
                  className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-2.5 hover:border-indigo-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        {cluster.nombre}
                      </span>
                      <p className="text-[11px] text-slate-500">
                        {gruposEnCluster.length} {gruposEnCluster.length === 1 ? 'curso conectado' : 'cursos conectados'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAbrirEditarVinculacion(cluster)}
                        className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                        title="Editar grupos de esta vinculación"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEliminarVinculacion(cluster.id, cluster.nombre)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                        title="Eliminar vinculación"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Cursos vinculados dentro de este grupo */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {gruposEnCluster.map((g) => {
                      const theme = getCursoColorTheme(g.id, g.nombre);
                      const isActivo = g.id === selectedGrupoId;
                      return (
                        <span
                          key={g.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border text-xs font-semibold shadow-2xs"
                          style={{
                            borderColor: isActivo ? theme.primary : '#e2e8f0',
                            color: isActivo ? theme.primary : '#334155',
                          }}
                        >
                          <Folder className="w-3 h-3" style={{ color: theme.primary }} />
                          <span>{g.nombre}</span>
                          {isActivo && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Curso actualmente seleccionado" />
                          )}
                        </span>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-slate-400 leading-tight">
                    Las rúbricas creadas en cualquiera de estos cursos ofrecerán la opción de replicarse mutuamente.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL: CREAR / EDITAR VINCULACIÓN DE RÚBRICAS
          ========================================================================= */}
      {modalVinculacionOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 space-y-0">
            {/* Borde superior temático del modal */}
            <div className="h-1.5 w-full" style={{ backgroundColor: cursoTheme.primary }} />

            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Link2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {clusterEditando ? 'Editar Vinculación de Cursos' : 'Nueva Vinculación de Rúbricas'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Selecciona los cursos que compartirán rúbricas
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalVinculacionOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {errorVinculo && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorVinculo}</span>
                </div>
              )}

              <form onSubmit={handleGuardarVinculacion} className="space-y-4">
                {/* Nombre de la vinculación */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Nombre o etiqueta de la vinculación
                  </label>
                  <input
                    type="text"
                    value={nombreVinculo}
                    onChange={(e) => setNombreVinculo(e.target.value)}
                    placeholder="Ej: 1º ESO A y B, Cursos de 3º ESO..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900"
                  />
                  <p className="text-[11px] text-slate-400">
                    Un nombre descriptivo para identificar los cursos enlazados.
                  </p>
                </div>

                {/* Selección de grupos a vincular */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Selecciona los cursos a vincular (mínimo 2):
                    </label>
                    <span className="text-[11px] font-semibold text-indigo-600">
                      {gruposSeleccionadosParaVinculo.length} seleccionados
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                    {grupos.map((grupo) => {
                      const isChecked = gruposSeleccionadosParaVinculo.includes(grupo.id);
                      const isCurrent = grupo.id === selectedGrupoId;
                      const theme = getCursoColorTheme(grupo.id, grupo.nombre);

                      return (
                        <label
                          key={grupo.id}
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-indigo-50/60 border-indigo-300 text-slate-900'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleGrupoParaVinculo(grupo.id)}
                              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <Folder className="w-4 h-4 shrink-0" style={{ color: theme.primary }} />
                            <span className="text-xs font-semibold">{grupo.nombre}</span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                Actual
                              </span>
                            )}
                          </div>
                          {isChecked && <Check className="w-4 h-4 text-indigo-600" />}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-start gap-2 text-xs text-indigo-900">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    Al crear una rúbrica en cualquiera de estos cursos, el sistema te ofrecerá la opción de replicarla directamente en los cursos vinculados seleccionados.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalVinculacionOpen(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={gruposSeleccionadosParaVinculo.length < 2}
                    className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Guardar Vinculación</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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
