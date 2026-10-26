/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Award,
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
  Info,
  Scale,
  Link2,
  CheckCheck,
  ArrowRight,
} from 'lucide-react';
import { useCuaderno } from '../../../context/CuadernoContext';
import { useAuth } from '../../../context/AuthContext';
import { Criterio } from '../../../types';
import {
  crearCriterio,
  actualizarCriterio,
  actualizarPonderacionCriterio,
  eliminarCriterios,
} from '../../../services/gestionDatosService';
import {
  obtenerGruposVinculadosCon,
  sincronizarCriteriosConGruposVinculados,
  replicarPonderacionEnGruposVinculados,
  replicarCriterioEnGruposVinculados,
  ResultadoSincronizacionGrupo,
} from '../../../services/vinculacionCriteriosService';
import { compararCriterios } from '../../../utils/rubricaUtils';
import { ImportarCriteriosModal } from './ImportarCriteriosModal';

export const GestionCriterios: React.FC = () => {
  const { user } = useAuth();
  const {
    cuadernoData,
    grupos,
    selectedGrupo,
    selectedGrupoId,
    refreshCuaderno,
    isLoadingCuaderno,
    updateCriterioPonderacion,
  } = useCuaderno();

  // Grupos vinculados con el curso seleccionado
  const gruposVinculadosIds = useMemo(() => {
    if (!selectedGrupoId) return [];
    return obtenerGruposVinculadosCon(selectedGrupoId, user?.uid);
  }, [selectedGrupoId, user?.uid]);

  const gruposVinculados = useMemo(() => {
    return grupos.filter((g) => gruposVinculadosIds.includes(g.id));
  }, [grupos, gruposVinculadosIds]);

  // Toggle para aplicar cambios automáticamente en grupos vinculados
  const [aplicarEnVinculados, setAplicarEnVinculados] = useState<boolean>(true);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);
  const [syncResultados, setSyncResultados] = useState<ResultadoSincronizacionGrupo[] | null>(null);

  // Lista ordenada de criterios garantizando 10.1 y 10.2 en último lugar
  const criterios: Criterio[] = useMemo(() => {
    const list = cuadernoData?.criterios || [];
    return list.slice().sort(compararCriterios);
  }, [cuadernoData]);

  // Búsqueda
  const [busqueda, setBusqueda] = useState('');

  // Nuevo criterio
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [nuevaPonderacion, setNuevaPonderacion] = useState<string>('');
  const [isCreando, setIsCreando] = useState(false);

  // Edición completa en modal/fila
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [codigoEditando, setCodigoEditando] = useState('');
  const [descEditando, setDescEditando] = useState('');
  const [pondEditando, setPondEditando] = useState<string>('');
  const [isGuardandoEdicion, setIsGuardandoEdicion] = useState(false);

  // Edición inline rápida de ponderaciones individuales y guardado en lote
  const [savingPonderacionId, setSavingPonderacionId] = useState<number | null>(null);
  const [inlinePonderaciones, setInlinePonderaciones] = useState<Record<number, string>>({});
  const [isGuardandoLotePond, setIsGuardandoLotePond] = useState(false);

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Modal importación
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

  // Si un campo numérico contiene un cero por defecto y se escribe un valor nuevo, eliminar el 0 inicial (ej: '05' -> '5')
  const limpiarCeroInicial = (val: string): string => {
    if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.') && !val.startsWith('0,')) {
      return val.replace(/^0+/, '');
    }
    return val;
  };

  const criteriosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return criterios;
    const q = busqueda.toLowerCase().trim();
    return criterios.filter(
      (c) =>
        c.codigo.toLowerCase().includes(q) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(q))
    );
  }, [criterios, busqueda]);

  // Manejar creación
  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrupoId) {
      setErrorOperacion('Por favor selecciona un curso antes de añadir criterios.');
      return;
    }

    const cleanCod = nuevoCodigo.trim();
    const cleanDesc = nuevaDescripcion.trim();

    if (!cleanCod) {
      setErrorOperacion('El código del criterio es obligatorio (ej: 1.1, 2.3).');
      return;
    }
    if (!cleanDesc) {
      setErrorOperacion('La descripción del criterio es obligatoria.');
      return;
    }

    let pondVal: number | null = null;
    if (nuevaPonderacion.trim() !== '') {
      const parsed = parseFloat(nuevaPonderacion.replace(',', '.'));
      if (isNaN(parsed) || parsed < 0) {
        setErrorOperacion('La ponderación debe ser un número mayor o igual a 0.');
        return;
      }
      pondVal = parsed;
    }

    setIsCreando(true);
    clearMessages();

    try {
      const nuevo = await crearCriterio(selectedGrupoId, cleanCod, cleanDesc, pondVal);
      setNuevoCodigo('');
      setNuevaDescripcion('');
      setNuevaPonderacion('');

      let msg = `Criterio «${nuevo.codigo}» creado correctamente en Supabase.`;
      if (aplicarEnVinculados && gruposVinculados.length > 0) {
        try {
          const resVinc = await replicarCriterioEnGruposVinculados(
            cleanCod,
            cleanDesc,
            pondVal,
            gruposVinculados
          );
          const okCount = resVinc.reduce((acc, r) => acc + (r.success ? 1 : 0), 0);
          if (okCount > 0) {
            msg += ` Replicado en ${okCount} ${okCount === 1 ? 'curso vinculado' : 'cursos vinculados'}.`;
          }
        } catch (vErr) {
          console.warn('[GestionCriterios] Error al replicar en cursos vinculados:', vErr);
        }
      }

      setMensajeExito(msg);
      await refreshCuaderno(true);
    } catch (err: any) {
      console.error('[GestionCriterios] Error al crear criterio:', err);
      setErrorOperacion(err?.message || 'Error al guardar el criterio en Supabase.');
    } finally {
      setIsCreando(false);
    }
  };

  // Iniciar edición completa
  const handleIniciarEdicion = (c: Criterio) => {
    setEditandoId(c.id);
    setCodigoEditando(c.codigo);
    setDescEditando(c.descripcion || '');
    setPondEditando(c.ponderacion !== null && c.ponderacion !== undefined ? String(c.ponderacion) : '');
  };

  // Guardar edición completa
  const handleGuardarEdicion = async (criterioId: number) => {
    if (!selectedGrupoId) return;

    const cleanCod = codigoEditando.trim();
    const cleanDesc = descEditando.trim();

    if (!cleanCod) {
      setErrorOperacion('El código no puede estar vacío.');
      return;
    }
    if (!cleanDesc) {
      setErrorOperacion('La descripción no puede estar vacía.');
      return;
    }

    let pondVal: number | null = null;
    if (pondEditando.trim() !== '') {
      const parsed = parseFloat(pondEditando.replace(',', '.'));
      if (isNaN(parsed) || parsed < 0) {
        setErrorOperacion('La ponderación no puede ser negativa.');
        return;
      }
      pondVal = parsed;
    }

    setIsGuardandoEdicion(true);
    clearMessages();

    try {
      const actualizado = await actualizarCriterio(
        selectedGrupoId,
        criterioId,
        cleanCod,
        cleanDesc,
        pondVal
      );
      setEditandoId(null);

      let msg = `Criterio «${actualizado.codigo}» actualizado correctamente.`;
      if (aplicarEnVinculados && gruposVinculados.length > 0) {
        try {
          const resVinc = await replicarCriterioEnGruposVinculados(
            cleanCod,
            cleanDesc,
            pondVal,
            gruposVinculados
          );
          const okCount = resVinc.reduce((acc, r) => acc + (r.success ? 1 : 0), 0);
          if (okCount > 0) {
            msg += ` Sincronizado en ${okCount} ${okCount === 1 ? 'curso vinculado' : 'cursos vinculados'}.`;
          }
        } catch (vErr) {
          console.warn('[GestionCriterios] Error al replicar en cursos vinculados:', vErr);
        }
      }

      setMensajeExito(msg);
      await refreshCuaderno(true);
    } catch (err: any) {
      console.error('[GestionCriterios] Error al actualizar criterio:', err);
      setErrorOperacion(err?.message || 'Error al guardar los cambios en Supabase.');
    } finally {
      setIsGuardandoEdicion(false);
    }
  };

  // Guardar cambio rápido de ponderación directamente desde la casilla de la tabla
  const handleGuardarPonderacionInline = async (criterioId: number, valorRaw: string) => {
    if (!selectedGrupoId) return;
    const clean = valorRaw.trim();
    let pondVal: number | null = null;

    if (clean !== '') {
      const parsed = parseFloat(clean.replace(',', '.'));
      if (isNaN(parsed) || parsed < 0) {
        setErrorOperacion('La ponderación debe ser un número no negativo.');
        return;
      }
      pondVal = parsed;
    }

    const criterio = criterios.find((c) => c.id === criterioId);

    setSavingPonderacionId(criterioId);
    clearMessages();

    // Actualización optimista inmediata en memoria para no perder foco ni valor
    updateCriterioPonderacion(criterioId, pondVal);

    try {
      await actualizarPonderacionCriterio(
        selectedGrupoId,
        criterioId,
        pondVal,
        criterio?.codigo,
        criterio?.descripcion
      );

      // Limpiar del estado local de borradores
      setInlinePonderaciones((prev) => {
        const copy = { ...prev };
        delete copy[criterioId];
        return copy;
      });

      let msg = `Ponderación guardada correctamente.`;

      // Replicar en cursos vinculados si la opción está activa
      if (aplicarEnVinculados && gruposVinculados.length > 0 && criterio?.codigo) {
        try {
          const resVinc = await replicarPonderacionEnGruposVinculados(
            criterio.codigo,
            pondVal,
            gruposVinculados
          );
          const okCount = resVinc.reduce((acc, r) => acc + (r.success ? 1 : 0), 0);
          if (okCount > 0) {
            msg = `Ponderación guardada y replicada en ${okCount} ${okCount === 1 ? 'curso vinculado' : 'cursos vinculados'}.`;
          }
        } catch (vErr) {
          console.warn('[GestionCriterios] Error al replicar ponderación en vinculados:', vErr);
        }
      }

      setMensajeExito(msg);
    } catch (err: any) {
      console.error('[GestionCriterios] Error al guardar ponderación:', err);
      setErrorOperacion(err?.message || 'Error al persistir la ponderación.');
    } finally {
      setSavingPonderacionId(null);
    }
  };

  // Guardar todas las ponderaciones que han sido editadas en lote
  const handleGuardarTodasPonderaciones = async () => {
    if (!selectedGrupoId) return;
    const idsModificados = Object.keys(inlinePonderaciones).map(Number);
    if (idsModificados.length === 0) return;

    setIsGuardandoLotePond(true);
    clearMessages();

    let guardados = 0;
    try {
      for (const id of idsModificados) {
        const raw = inlinePonderaciones[id];
        const criterio = criterios.find((c) => c.id === id);
        let pondVal: number | null = null;
        if (raw && raw.trim() !== '') {
          const parsed = parseFloat(raw.trim().replace(',', '.'));
          if (!isNaN(parsed) && parsed >= 0) pondVal = parsed;
        }

        // Actualizar optimista
        updateCriterioPonderacion(id, pondVal);

        await actualizarPonderacionCriterio(
          selectedGrupoId,
          id,
          pondVal,
          criterio?.codigo,
          criterio?.descripcion
        );

        if (aplicarEnVinculados && gruposVinculados.length > 0 && criterio?.codigo) {
          await replicarPonderacionEnGruposVinculados(
            criterio.codigo,
            pondVal,
            gruposVinculados
          );
        }
        guardados++;
      }

      setInlinePonderaciones({});
      setMensajeExito(
        `Se han guardado correctamente ${guardados} ${guardados === 1 ? 'ponderación' : 'ponderaciones'}${
          aplicarEnVinculados && gruposVinculados.length > 0
            ? ` y sincronizado con ${gruposVinculados.map((g) => g.nombre).join(', ')}`
            : ''
        }.`
      );
    } catch (err: any) {
      console.error('[GestionCriterios] Error guardando lote de ponderaciones:', err);
      setErrorOperacion(err?.message || 'Error al persistir algunas ponderaciones.');
    } finally {
      setIsGuardandoLotePond(false);
    }
  };

  // Sincronizar todos los criterios del curso actual con los cursos vinculados
  const handleSincronizarTodosConVinculados = async () => {
    if (!selectedGrupoId || gruposVinculados.length === 0 || criterios.length === 0) return;

    setIsSyncingAll(true);
    clearMessages();

    try {
      const resultados = await sincronizarCriteriosConGruposVinculados(
        selectedGrupoId,
        criterios,
        gruposVinculados,
        {
          actualizarPonderacion: true,
          actualizarDescripcion: true,
          crearFaltantes: true,
        }
      );
      setSyncResultados(resultados);
      setShowSyncModal(true);
    } catch (err: any) {
      console.error('[GestionCriterios] Error al sincronizar con grupos vinculados:', err);
      setErrorOperacion(err?.message || 'Error al sincronizar criterios con los cursos vinculados.');
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Selección múltiple
  const handleToggleSeleccion = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSeleccionarTodos = () => {
    if (criteriosFiltrados.every((c) => selectedIds.includes(c.id))) {
      const visiblesSet = new Set(criteriosFiltrados.map((c) => c.id));
      setSelectedIds((prev) => prev.filter((id) => !visiblesSet.has(id)));
    } else {
      const visiblesIds = criteriosFiltrados.map((c) => c.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visiblesIds])));
    }
  };

  // Eliminación con verificación de dependencias
  const handleConfirmarEliminacion = async () => {
    if (!selectedGrupoId || selectedIds.length === 0) return;

    setIsDeleting(true);
    clearMessages();

    try {
      const { eliminados } = await eliminarCriterios(selectedGrupoId, selectedIds);
      setShowConfirmModal(false);
      setSelectedIds([]);
      setMensajeExito(
        `${eliminados.length} ${eliminados.length === 1 ? 'criterio eliminado' : 'criterios eliminados'} correctamente.`
      );
      await refreshCuaderno(true);
    } catch (err: any) {
      console.error('[GestionCriterios] Error al eliminar criterios:', err);
      setErrorOperacion(err?.message || 'No se pudieron eliminar los criterios.');
      setShowConfirmModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!selectedGrupoId) {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-2">
        <Award className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="text-xs font-semibold text-slate-600">Ningún curso seleccionado.</p>
        <p className="text-[11px] text-slate-400">
          Selecciona un curso para gestionar sus criterios de evaluación y ponderaciones.
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

      {/* Reglas de Ponderación Fernanditio */}
      <div className="bg-amber-50/70 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-900 space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-amber-950">
          <Scale className="w-4 h-4 text-amber-700 shrink-0" />
          <span>Reglas de ponderación de criterios en Fernanditio</span>
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800/90 pl-1">
          <li>
            <strong>Sin ponderación:</strong> Si no se definen pesos específicos, todos los criterios evaluados se promedian por igual.
          </li>
          <li>
            <strong>Con ponderación:</strong> Los pesos se aplican exclusivamente a los criterios con calificación registrada y se normalizan proporcionalmente entre ellos.
          </li>
          <li>
            <strong>Pendientes:</strong> Un criterio sin nota permanece pendiente; nunca computa como cero.
          </li>
          <li>
            La ponderación de criterios es independiente del cálculo por secciones o ponderación de tareas.
          </li>
        </ul>
      </div>

      {/* Panel de Vinculación de Cursos para Criterios */}
      {gruposVinculados.length > 0 ? (
        <div className="bg-gradient-to-r from-indigo-50/90 via-indigo-50/60 to-purple-50/60 border border-indigo-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-indigo-950 text-xs">
                  Cursos vinculados a {selectedGrupo?.nombre}:
                </span>
                <span className="font-semibold text-indigo-800 bg-white border border-indigo-200 px-2.5 py-0.5 rounded-lg text-[11px] shadow-2xs">
                  {gruposVinculados.map((g) => g.nombre).join(', ')}
                </span>
              </div>
              <p className="text-[11px] text-indigo-700/90 leading-relaxed">
                Toda la información de criterios y ponderaciones puede sincronizarse y replicarse automáticamente entre cursos paralelos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="flex items-center gap-2 text-xs text-indigo-950 font-bold cursor-pointer select-none bg-white/90 hover:bg-white px-3 py-2 rounded-xl border border-indigo-200 shadow-2xs transition-all">
              <input
                type="checkbox"
                checked={aplicarEnVinculados}
                onChange={(e) => setAplicarEnVinculados(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-3.5 h-3.5"
              />
              <span>Replicar cambios automáticamente</span>
            </label>

            <button
              type="button"
              onClick={handleSincronizarTodosConVinculados}
              disabled={isSyncingAll || criterios.length === 0}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Copiar o sincronizar todos los códigos, descripciones y ponderaciones del curso actual en los cursos vinculados"
            >
              {isSyncingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Sincronizar todo</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              <strong>¿Impartes cursos paralelos (ej: 1º ESO A y 1º ESO B)?</strong> Puedes vincularlos desde la pestaña <em>Cursos</em> para que compartan automáticamente criterios y ponderaciones.
            </span>
          </div>
        </div>
      )}

      {/* Barra de acciones: Formulario de creación + Importación */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Formulario nuevo criterio */}
        <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-indigo-600" />
            Añadir Nuevo Criterio
          </h4>
          <form onSubmit={handleCrear} className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="nuevo-criterio-codigo"
                type="text"
                value={nuevoCodigo}
                onChange={(e) => setNuevoCodigo(e.target.value)}
                onFocus={handleAutoSelect}
                onClick={handleAutoSelect}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('nuevo-criterio-desc')?.focus();
                  }
                }}
                placeholder="Código (ej: 1.1, 2.3, 10.1)"
                disabled={isCreando}
                className="w-full sm:w-36 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900"
              />
              <input
                id="nuevo-criterio-desc"
                type="text"
                value={nuevaDescripcion}
                onChange={(e) => setNuevaDescripcion(e.target.value)}
                onFocus={handleAutoSelect}
                onClick={handleAutoSelect}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('nuevo-criterio-pond')?.focus();
                  }
                }}
                placeholder="Descripción del criterio de evaluación..."
                disabled={isCreando}
                className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
              />
              <input
                id="nuevo-criterio-pond"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={nuevaPonderacion}
                onChange={(e) => setNuevaPonderacion(limpiarCeroInicial(e.target.value))}
                onFocus={handleAutoSelect}
                onClick={handleAutoSelect}
                placeholder="Pond. %"
                disabled={isCreando}
                className="w-full sm:w-20 px-2 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 text-center"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isCreando || !nuevoCodigo.trim() || !nuevaDescripcion.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isCreando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Crear Criterio</span>
              </button>
            </div>
          </form>
        </div>

        {/* Tarjeta de Importación de Word / Excel */}
        <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-100 flex flex-col justify-between space-y-2">
          <div>
            <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-indigo-600" />
              Importar Criterios
            </h4>
            <p className="text-[11px] text-indigo-700/80 mt-1">
              Carga tu programación en Word (.docx) o Excel (.xlsx) con detección de código, texto y ponderación.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Importar desde Archivo</span>
          </button>
        </div>
      </div>

      {/* Lista de Criterios con casillas editables para ponderación */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Criterios del Curso ({criterios.length})
            </span>
            <span className="text-[11px] text-slate-400">
              (10.1 y 10.2 ordenados al final según normativa)
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
                onFocus={handleAutoSelect}
                onClick={handleAutoSelect}
                placeholder="Filtrar código o texto..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
              />
            </div>

            {/* Botón para guardar cambios de ponderación en lote si se han modificado varias casillas */}
            {Object.keys(inlinePonderaciones).length > 0 && (
              <button
                type="button"
                onClick={handleGuardarTodasPonderaciones}
                disabled={isGuardandoLotePond}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="Guardar todos los cambios de ponderación pendientes en Supabase"
              >
                {isGuardandoLotePond ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5" />
                )}
                <span>Guardar ponderaciones ({Object.keys(inlinePonderaciones).length})</span>
              </button>
            )}

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

        {criteriosFiltrados.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-2">
            <Award className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-600">
              {criterios.length === 0 ? 'No hay criterios registrados en este curso.' : 'No hay criterios coincidentes.'}
            </p>
            <p className="text-[11px] text-slate-400">
              {criterios.length === 0
                ? 'Puedes añadirlos manualmente o importarlos de una programación didáctica.'
                : 'Intenta con otro término de búsqueda.'}
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
                          criteriosFiltrados.length > 0 &&
                          criteriosFiltrados.every((c) => selectedIds.includes(c.id))
                        }
                        onChange={handleToggleSeleccionarTodos}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-3 w-20">Código</th>
                    <th className="p-3">Descripción</th>
                    <th className="p-3 w-28 text-center">Ponderación (%)</th>
                    <th className="p-3 w-24 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {criteriosFiltrados.map((criterio, index) => {
                    const isSelected = selectedIds.includes(criterio.id);
                    const estaEditando = editandoId === criterio.id;
                    const isSavingPond = savingPonderacionId === criterio.id;
                    const valInline = inlinePonderaciones[criterio.id];
                    const valorPondActual =
                      valInline !== undefined
                        ? valInline
                        : criterio.ponderacion !== null && criterio.ponderacion !== undefined
                        ? String(criterio.ponderacion)
                        : '';

                    return (
                      <tr
                        key={criterio.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-indigo-50/40' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSeleccion(criterio.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-900">
                          {estaEditando ? (
                            <input
                              type="text"
                              value={codigoEditando}
                              onChange={(e) => setCodigoEditando(e.target.value)}
                              onFocus={handleAutoSelect}
                              onClick={handleAutoSelect}
                              className="w-16 px-1.5 py-1 text-xs border border-indigo-400 rounded focus:outline-none"
                            />
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                              {criterio.codigo}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-800">
                          {estaEditando ? (
                            <textarea
                              value={descEditando}
                              onChange={(e) => setDescEditando(e.target.value)}
                              onFocus={handleAutoSelect}
                              onClick={handleAutoSelect}
                              rows={2}
                              className="w-full px-2 py-1 text-xs border border-indigo-400 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            <p className="line-clamp-2" title={criterio.descripcion || ''}>
                              {criterio.descripcion}
                            </p>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {estaEditando ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={pondEditando}
                              onChange={(e) => setPondEditando(limpiarCeroInicial(e.target.value))}
                              onFocus={handleAutoSelect}
                              onClick={handleAutoSelect}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleGuardarEdicion(criterio.id);
                                }
                              }}
                              className="w-16 px-1.5 py-1 text-xs text-center border border-indigo-400 rounded focus:outline-none"
                              placeholder="%"
                            />
                          ) : (
                            <div className="inline-flex items-center gap-1 justify-center">
                              <input
                                id={`criterio-pond-input-${index}`}
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={valorPondActual}
                                onChange={(e) => {
                                  const val = limpiarCeroInicial(e.target.value);
                                  setInlinePonderaciones((prev) => ({
                                    ...prev,
                                    [criterio.id]: val,
                                  }));
                                }}
                                onFocus={handleAutoSelect}
                                onClick={handleAutoSelect}
                                onBlur={(e) => {
                                  // Solo guardar si cambió respecto al valor original
                                  const origStr =
                                    criterio.ponderacion !== null && criterio.ponderacion !== undefined
                                      ? String(criterio.ponderacion)
                                      : '';
                                  if (e.target.value.trim() !== origStr.trim()) {
                                    handleGuardarPonderacionInline(criterio.id, e.target.value);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const currentVal = (e.currentTarget as HTMLInputElement).value;
                                    const origStr =
                                      criterio.ponderacion !== null && criterio.ponderacion !== undefined
                                        ? String(criterio.ponderacion)
                                        : '';
                                    if (currentVal.trim() !== origStr.trim()) {
                                      handleGuardarPonderacionInline(criterio.id, currentVal);
                                    }
                                    // Seleccionar automáticamente el campo que se encuentre debajo (siguiente fila)
                                    const nextInput = document.getElementById(
                                      `criterio-pond-input-${index + 1}`
                                    ) as HTMLInputElement | null;
                                    if (nextInput) {
                                      nextInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                                      nextInput.focus();
                                      setTimeout(() => nextInput.select(), 0);
                                    } else {
                                      (e.currentTarget as HTMLInputElement).blur();
                                    }
                                  } else if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    const nextInput = document.getElementById(
                                      `criterio-pond-input-${index + 1}`
                                    ) as HTMLInputElement | null;
                                    if (nextInput) {
                                      nextInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                                      nextInput.focus();
                                      setTimeout(() => nextInput.select(), 0);
                                    }
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    const prevInput = document.getElementById(
                                      `criterio-pond-input-${index - 1}`
                                    ) as HTMLInputElement | null;
                                    if (prevInput) {
                                      prevInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                                      prevInput.focus();
                                      setTimeout(() => prevInput.select(), 0);
                                    }
                                  }
                                }}
                                placeholder="Sin peso"
                                disabled={isSavingPond}
                                className={`w-16 px-1.5 py-1 text-xs text-center border rounded transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                                  isSavingPond
                                    ? 'bg-slate-100 text-slate-400 border-slate-200'
                                    : valInline !== undefined && valInline !== (criterio.ponderacion ? String(criterio.ponderacion) : '')
                                    ? 'bg-amber-50 border-amber-400 font-bold'
                                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                                }`}
                                title="Casilla editable de ponderación. Modifica y presiona Enter para pasar a la fila de abajo o haz clic fuera para guardar."
                              />
                              {isSavingPond && <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {estaEditando ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleGuardarEdicion(criterio.id)}
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
                                  onClick={() => handleIniciarEdicion(criterio)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                                  title="Editar criterio"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedIds([criterio.id]);
                                    setShowConfirmModal(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                                  title="Eliminar criterio"
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

      {/* Modal de confirmación de eliminación con comprobación de dependencias */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  ¿Eliminar {selectedIds.length} {selectedIds.length === 1 ? 'criterio' : 'criterios'}?
                </h4>
                <p className="text-xs text-slate-600">
                  El servidor verificará si los criterios seleccionados forman parte de rúbricas activas o tienen evidencias evaluadas asociadas. Si existen calificaciones vinculadas, el borrado se cancelará para mantener la coherencia curricular.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-800">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Integridad de la evaluación:
              </p>
              <p className="text-[11px] mt-0.5">
                No se destruirán criterios que posean notas o dependencias activas en el curso.
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

      {/* Modal de importación de criterios */}
      {showImportModal && selectedGrupoId && (
        <ImportarCriteriosModal
          grupoId={selectedGrupoId}
          grupoNombre={selectedGrupo?.nombre || 'Curso actual'}
          criteriosExistentes={criterios}
          onClose={() => setShowImportModal(false)}
          onSuccess={(count) => {
            setMensajeExito(`Se han importado ${count} criterios con éxito.`);
            refreshCuaderno(true);
          }}
        />
      )}

      {/* Modal de resultados de sincronización con cursos vinculados */}
      {showSyncModal && syncResultados && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Sincronización de Criterios Completada
                  </h4>
                  <p className="text-xs text-slate-500">
                    Origen: {selectedGrupo?.nombre}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {syncResultados.map((res) => (
                <div
                  key={res.grupoId}
                  className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                    res.success
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      {res.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{res.grupoNombre}</span>
                    </p>
                    {res.success ? (
                      <p className="text-[11px] text-emerald-700">
                        {res.actualizados} criterios actualizados (ponderación/texto) · {res.creados} nuevos criterios dados de alta.
                      </p>
                    ) : (
                      <p className="text-[11px] text-rose-700">{res.error}</p>
                    )}
                  </div>
                  <span className="font-bold text-[10px] uppercase px-2 py-0.5 rounded-full bg-white/80 shadow-2xs">
                    {res.success ? 'Sincronizado' : 'Error'}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                Coherencia evaluativa garantizada:
              </p>
              <p className="text-[11px] mt-0.5">
                Los cursos vinculados ahora disponen de los mismos criterios y ponderaciones para las evaluaciones y rúbricas.
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
