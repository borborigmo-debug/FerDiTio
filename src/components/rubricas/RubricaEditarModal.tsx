/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Rubrica, ActividadDetalle, Criterio } from '../../types';
import { actualizarRubricaDatos, analizarRubricaConGemini } from '../../services/rubricasService';
import { parseRubricaItems, normalizeRubrica, compararCodigosCriterio, generateUuid } from '../../utils/rubricaUtils';
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
  Target,
  Plus,
  Info,
  SlidersHorizontal,
  PlusCircle,
  XCircle,
  FileText,
  HelpCircle,
  Scale,
  BookOpen,
  CheckSquare,
  Square,
  Save,
  Sparkles,
} from 'lucide-react';
import { getCursoColorTheme } from '../../utils/cursoColorUtils';

interface RubricaEditarModalProps {
  rubrica: Rubrica;
  actividades: ActividadDetalle[];
  criterios?: Criterio[];
  grupoId: string;
  onClose: () => void;
  onSaveRubrica: (rubricaActualizada: Rubrica) => void;
  onEliminarActividad: (actividadId: string) => Promise<any>;
}

export type TabEditarRubrica = 'datos' | 'actividades' | 'criterios' | 'items';

export const RubricaEditarModal: React.FC<RubricaEditarModalProps> = ({
  rubrica,
  actividades,
  criterios = [],
  grupoId,
  onClose,
  onSaveRubrica,
  onEliminarActividad,
}) => {
  const cursoTheme = useMemo(() => getCursoColorTheme(grupoId), [grupoId]);

  // Pestaña activa del modal
  const [activeTab, setActiveTab] = useState<TabEditarRubrica>('datos');

  // Estado de los datos de la rúbrica
  const [titulo, setTitulo] = useState(rubrica.titulo || '');

  // Formato inicial de la fecha de creación YYYY-MM-DD para <input type="date">
  const initialFechaDate = useMemo(() => {
    const rawVal =
      rubrica.fecha_creacion ||
      (rubrica as any)?.raw?.fecha_creacion ||
      rubrica.created_at ||
      (rubrica as any)?.raw?.created_at ||
      rubrica.fecha ||
      '';

    if (!rawVal) return new Date().toISOString().split('T')[0];
    if (rawVal.includes('T')) return rawVal.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawVal.trim())) return rawVal.trim();

    const d = new Date(rawVal);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }

    return new Date().toISOString().split('T')[0];
  }, [rubrica]);

  const [fechaCreacion, setFechaCreacion] = useState(initialFechaDate);
  const [itemsState, setItemsState] = useState<any[]>(() => parseRubricaItems(rubrica.items));

  // Selección multi-apartado y cambios pendientes
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [hasUnsavedItemsChanges, setHasUnsavedItemsChanges] = useState(false);
  const [confirmRemoveModalOpen, setConfirmRemoveModalOpen] = useState(false);
  const [showUnsavedConfirmModal, setShowUnsavedConfirmModal] = useState(false);

  // Formulario para «Añadir apartado + criterios»
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [nuevoItemTitulo, setNuevoItemTitulo] = useState('');
  const [nuevoItemPeso, setNuevoItemPeso] = useState<string>('100');
  const [selectedCriteriosToAdd, setSelectedCriteriosToAdd] = useState<string[]>([]);

  // Estados para la generación asistida con Gemini (Ortografía / Presentación)
  const [isGeneratingGeminiItem, setIsGeneratingGeminiItem] = useState(false);
  const [geminiItemError, setGeminiItemError] = useState<string | null>(null);
  const [duplicateWarningModal, setDuplicateWarningModal] = useState<{
    open: boolean;
    tipo: 'ortografia' | 'presentacion';
    existingTitle: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estado para la supresión de actividades individuales
  const [actividadAEliminar, setActividadAEliminar] = useState<ActividadDetalle | null>(null);
  const [isDeletingAct, setIsDeletingAct] = useState(false);

  // Generar un apartado específico (Ortografía o Presentación) asistido por Gemini
  const handleGenerarApartadoGemini = async (
    modo: 'ortografia' | 'presentacion',
    forzarReemplazo = false,
    ignorarDuplicado = false
  ) => {
    // Comprobar si ya existe un apartado equivalente en la rúbrica
    if (!forzarReemplazo && !ignorarDuplicado) {
      const keywords = modo === 'ortografia'
        ? ['ortografía', 'ortografia', 'expresión escrita', 'expresion escrita']
        : ['presentación', 'presentacion', 'formato', 'pulcritud', 'limpieza'];

      const itemExistente = itemsState.find((it: any) => {
        const titleLower = String(it.titulo || '').toLowerCase();
        return keywords.some((kw) => titleLower.includes(kw));
      });

      if (itemExistente) {
        setDuplicateWarningModal({
          open: true,
          tipo: modo,
          existingTitle: itemExistente.titulo || (modo === 'ortografia' ? 'Ortografía' : 'Presentación'),
        });
        return;
      }
    }

    setIsGeneratingGeminiItem(true);
    setGeminiItemError(null);

    try {
      const borrador = await analizarRubricaConGemini({
        grupoId,
        origen: 'ia',
        modoEspecifico: modo,
        criterios,
      });

      const itemEspecial = Array.isArray(borrador?.items) && borrador.items.length > 0 ? borrador.items[0] : null;

      const newUuid = generateUuid().toLowerCase();
      const nextNumero = String(itemsState.length + 1);

      const newItem = {
        id: newUuid,
        numero: itemEspecial?.numero || nextNumero,
        titulo: itemEspecial?.titulo || (modo === 'ortografia' ? 'Ortografía y expresión escrita' : 'Presentación y formato'),
        peso: typeof itemEspecial?.peso === 'number' ? itemEspecial.peso : 100,
        criterio: Array.isArray(itemEspecial?.criterios) && itemEspecial.criterios.length > 0 ? itemEspecial.criterios[0] : null,
        criterios: Array.isArray(itemEspecial?.criterios) ? itemEspecial.criterios : [],
        descriptores: itemEspecial?.descriptores || {
          '1': 'Inicial',
          '2': 'Suficiente',
          '3': 'Notable',
          '4': 'Sobresaliente',
        },
        raw: {
          enunciado: itemEspecial?.titulo,
          id: newUuid,
        },
      };

      setItemsState((prevItems) => {
        if (forzarReemplazo && duplicateWarningModal?.existingTitle) {
          const keywords = modo === 'ortografia'
            ? ['ortografía', 'ortografia', 'expresión escrita', 'expresion escrita']
            : ['presentación', 'presentacion', 'formato', 'pulcritud', 'limpieza'];

          const filtered = prevItems.filter((it: any) => {
            const titleLower = String(it.titulo || '').toLowerCase();
            return !keywords.some((kw) => titleLower.includes(kw));
          });
          return [...filtered, newItem];
        }
        return [...prevItems, newItem];
      });

      setHasUnsavedItemsChanges(true);
      setDuplicateWarningModal(null);
      setFeedback({
        type: 'success',
        message: `Apartado para "${modo === 'ortografia' ? 'Ortografía y expresión escrita' : 'Presentación y formato'}" generado con Gemini y añadido a los ítems evaluables. Guarde los cambios para persistir en Supabase.`,
      });
    } catch (err: any) {
      console.error('[RubricaEditarModal] Error al generar apartado con Gemini:', err);
      setGeminiItemError(err?.message || 'Error al conectar con Gemini para generar el apartado.');
    } finally {
      setIsGeneratingGeminiItem(false);
    }
  };

  // Normalizar objeto de rúbrica sincronizado con los ítems actuales
  const normalizedRubrica = useMemo(() => {
    const rubricaCompleta = {
      ...rubrica,
      titulo,
      fecha_creacion: fechaCreacion,
      items: itemsState,
    };
    return normalizeRubrica(rubricaCompleta);
  }, [rubrica, titulo, fechaCreacion, itemsState]);

  // Mapa de criterios del grupo para lookup de descripciones
  const criteriosMap = useMemo(() => {
    return new Map<string, Criterio>((criterios || []).map((c) => [c.codigo, c]));
  }, [criterios]);

  // Lista de actividades vinculadas a esta rúbrica
  const actividadesVinculadas = useMemo(() => {
    return actividades.filter((a) => a.rubrica_id === rubrica.id);
  }, [actividades, rubrica.id]);

  // Lista de actividades del grupo que no están vinculadas a ninguna rúbrica
  const actividadesSinRubrica = useMemo(() => {
    return actividades.filter((a) => !a.rubrica_id || a.rubrica_id !== rubrica.id);
  }, [actividades, rubrica.id]);

  // Criterios actualmente vinculados en los apartados (items) de esta rúbrica
  const criteriosEnRubricaSet = useMemo(() => {
    const set = new Set<string>();
    for (const item of itemsState) {
      if (item && typeof item === 'object') {
        if (typeof item.criterio === 'string' && item.criterio.trim()) {
          set.add(item.criterio.trim());
        }
        if (Array.isArray(item.criterios)) {
          for (const c of item.criterios) {
            if (typeof c === 'string' && c.trim()) {
              set.add(c.trim());
            }
          }
        }
      }
    }
    return set;
  }, [itemsState]);

  const criteriosCodigosList = useMemo(() => {
    return Array.from(criteriosEnRubricaSet).sort(compararCodigosCriterio);
  }, [criteriosEnRubricaSet]);

  // Determinar si la rúbrica es de tipo examen o actividad
  const esExamen = useMemo(() => {
    const tipoClean = (rubrica.tipo || '').toUpperCase().trim();
    return tipoClean.includes('EXAMEN') || tipoClean.includes('PRUEBA');
  }, [rubrica.tipo]);

  // Helper para extraer el enunciado real del ítem sin textos genéricos
  const getEnunciadoReal = (item: any): string => {
    const raw = item.raw || {};
    const directText = raw.enunciado || raw.pregunta || raw.instrucciones || raw.descripcion || raw.texto || raw.indicador;
    if (typeof directText === 'string' && directText.trim() && directText.trim() !== item.titulo) {
      return directText.trim();
    }

    const descValues = Object.values(item.descriptores || {}).filter((v) => typeof v === 'string' && v.trim()) as string[];
    if (descValues.length > 0) {
      return descValues[descValues.length - 1] || descValues[0];
    }

    return item.titulo || `Apartado ${item.numero}`;
  };

  // Intentar cerrar el modal de forma segura (con comprobación de cambios pendientes)
  const handleAttemptClose = () => {
    if (hasUnsavedItemsChanges) {
      setShowUnsavedConfirmModal(true);
    } else {
      onClose();
    }
  };

  // Guardar datos generales de la rúbrica (Título, Fecha de creación e Items)
  const handleGuardarDatosRubrica = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanTitulo = titulo.trim();
    if (!cleanTitulo) {
      setFeedback({ type: 'error', message: 'El título de la rúbrica no puede estar vacío.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const rubricaActualizada = await actualizarRubricaDatos(grupoId, rubrica.id, {
        titulo: cleanTitulo,
        fechaCreacion,
        items: itemsState,
      });

      onSaveRubrica(rubricaActualizada);
      setHasUnsavedItemsChanges(false);
      setSelectedItemIds(new Set());
      setFeedback({
        type: 'success',
        message: 'Estructura de la rúbrica guardada y sincronizada correctamente en Supabase.',
      });
      setTimeout(() => {
        setFeedback(null);
      }, 4000);
    } catch (err: any) {
      console.error('[RubricaEditarModal] Error al actualizar rúbrica:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Error al actualizar los datos de la rúbrica en el servidor.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Alternar selección de un apartado
  const toggleSelectItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Marcar/Desmarcar todos los apartados
  const handleToggleSelectAll = () => {
    if (selectedItemIds.size === normalizedRubrica.items.length) {
      setSelectedItemIds(new Set());
    } else {
      const allIds = new Set(normalizedRubrica.items.map((it) => it.id));
      setSelectedItemIds(allIds);
    }
  };

  // Confirmar y retirar los apartados seleccionados
  const handleConfirmRemoveItems = () => {
    if (selectedItemIds.size === 0) return;

    setItemsState((prevItems) => {
      return prevItems.filter((it, idx) => {
        const itemVisualId = it.id || (it as any).uuid || `item-${idx}`;
        return !selectedItemIds.has(itemVisualId) && !selectedItemIds.has(String(it.id)) && !selectedItemIds.has(`item-${idx}`);
      });
    });

    setSelectedItemIds(new Set());
    setConfirmRemoveModalOpen(false);
    setHasUnsavedItemsChanges(true);
    setFeedback({
      type: 'success',
      message: 'Apartados seleccionados retirados del diseño editable. Pulse "Guardar cambios" para persistir.',
    });
  };

  // Añadir un nuevo apartado con criterios seleccionados
  const handleAddNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = nuevoItemTitulo.trim();
    if (!cleanTitle) {
      setFeedback({ type: 'error', message: 'Debe especificar un título o enunciado para el nuevo apartado.' });
      return;
    }

    const uniqueCrits = Array.from(new Set(selectedCriteriosToAdd));
    const newUuid = generateUuid().toLowerCase();
    const newItemNumber = String(itemsState.length + 1);
    const parsedPeso = parseFloat(nuevoItemPeso);

    const newItem = {
      id: newUuid,
      numero: newItemNumber,
      titulo: cleanTitle,
      peso: !isNaN(parsedPeso) ? parsedPeso : 100,
      criterio: uniqueCrits[0] || null,
      criterios: uniqueCrits,
      descriptores: {
        '1': 'Inicial',
        '2': 'Suficiente',
        '3': 'Notable',
        '4': 'Sobresaliente',
      },
      raw: {
        enunciado: cleanTitle,
        id: newUuid,
      },
    };

    setItemsState((prev) => [...prev, newItem]);
    setHasUnsavedItemsChanges(true);
    setNuevoItemTitulo('');
    setNuevoItemPeso('100');
    setSelectedCriteriosToAdd([]);
    setShowAddItemForm(false);
    setFeedback({
      type: 'success',
      message: `Apartado "${cleanTitle}" añadido correctamente a la rúbrica. Guarde los cambios para persistir en Supabase.`,
    });
  };

  // Suprimir definitivamente una actividad vinculada
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

  // Añadir un código de criterio de evaluación a la rúbrica
  const handleAsociarCriterio = (codigo: string) => {
    const cleanCod = codigo.trim();
    if (!cleanCod || criteriosEnRubricaSet.has(cleanCod)) return;

    setItemsState((prevItems) => {
      if (prevItems.length === 0) {
        return [
          {
            id: generateUuid().toLowerCase(),
            numero: '1',
            titulo: 'Apartado 1',
            peso: 100,
            criterios: [cleanCod],
            descriptores: {
              '1': 'Inicial',
              '2': 'Suficiente',
              '3': 'Notable',
              '4': 'Sobresaliente',
            },
          },
        ];
      }

      return prevItems.map((it, idx) => {
        if (idx === 0) {
          const currentCrits = Array.isArray(it.criterios)
            ? [...it.criterios]
            : (it.criterio ? [it.criterio] : []);
          if (!currentCrits.includes(cleanCod)) {
            currentCrits.push(cleanCod);
          }
          return {
            ...it,
            criterios: currentCrits,
          };
        }
        return it;
      });
    });

    setHasUnsavedItemsChanges(true);
    setFeedback({
      type: 'success',
      message: `Criterio ${cleanCod} asociado localmente a la rúbrica. Guarde los cambios para persistir en Supabase.`,
    });
  };

  // Retirar la asociación de un código de criterio de los apartados de la rúbrica
  const handleRetirarCriterio = (codigo: string) => {
    const cleanCod = codigo.trim();

    setItemsState((prevItems) => {
      return prevItems.map((it) => {
        let modified = false;
        let newCrits: string[] = [];

        if (Array.isArray(it.criterios)) {
          newCrits = it.criterios.filter((c: any) => String(c).trim() !== cleanCod);
          if (newCrits.length !== it.criterios.length) modified = true;
        }

        let newCritSingular = it.criterio;
        if (typeof it.criterio === 'string' && it.criterio.trim() === cleanCod) {
          newCritSingular = null;
          modified = true;
        }

        if (modified) {
          return {
            ...it,
            criterio: newCritSingular,
            criterios: newCrits,
          };
        }

        return it;
      });
    });

    setHasUnsavedItemsChanges(true);
    setFeedback({
      type: 'success',
      message: `Asociación del criterio ${cleanCod} retirada de esta rúbrica. Guarde los cambios para persistir en Supabase.`,
    });
  };

  // Componente de renderizado reutilizable para la lista de Ítems Evaluables con checkboxes y botones de acción
  const renderItemsEvaluablesList = () => {
    return (
      <div className="space-y-3">
        {/* SECCIÓN "AÑADIR EVALUACIÓN ASISTIDA POR GEMINI" */}
        <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/60 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="font-bold text-slate-900 text-xs">
                Añadir evaluación asistida por Gemini
              </span>
            </div>
            <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
              IA LOMLOE / CyL
            </span>
          </div>
          <p className="text-[11px] text-slate-600">
            Genera un apartado evaluable específico con descriptores y vinculación a los criterios oficiales del grupo sin alterar los apartados ni las calificaciones existentes.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleGenerarApartadoGemini('ortografia')}
              disabled={isGeneratingGeminiItem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-900 bg-white hover:bg-purple-100 border border-purple-300 rounded-lg transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              {isGeneratingGeminiItem ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              )}
              <span>Evaluar ortografía con Gemini</span>
            </button>

            <button
              type="button"
              onClick={() => handleGenerarApartadoGemini('presentacion')}
              disabled={isGeneratingGeminiItem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-900 bg-white hover:bg-purple-100 border border-purple-300 rounded-lg transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              {isGeneratingGeminiItem ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              )}
              <span>Evaluar presentación con Gemini</span>
            </button>
          </div>
          {geminiItemError && (
            <p className="text-[11px] text-rose-700 font-semibold">{geminiItemError}</p>
          )}
        </div>

        {/* BARRA DE ACCIONES PARA RETIRAR Y AÑADIR APARTADOS */}
        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2 flex-wrap text-xs shadow-2xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              disabled={normalizedRubrica.items.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer disabled:opacity-40"
            >
              {selectedItemIds.size === normalizedRubrica.items.length && normalizedRubrica.items.length > 0 ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Desmarcar todos</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                  <span>Marcar todos</span>
                </>
              )}
            </button>

            {selectedItemIds.size > 0 && (
              <span className="text-slate-600 font-medium text-[11px]">
                {selectedItemIds.size} de {normalizedRubrica.items.length} seleccionados
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Botón «Retirar apartados seleccionados» */}
            <button
              type="button"
              onClick={() => setConfirmRemoveModalOpen(true)}
              disabled={selectedItemIds.size === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Retirar apartados seleccionados</span>
            </button>

            {/* Botón denominado exactamente «Añadir apartado + criterios» */}
            <button
              type="button"
              onClick={() => setShowAddItemForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-900 bg-indigo-100 hover:bg-indigo-200 border border-indigo-300 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-700" />
              <span>Añadir apartado + criterios</span>
            </button>
          </div>
        </div>

        {/* FORMULARIO INLINE PARA AÑADIR APARTADO + CRITERIOS */}
        {showAddItemForm && (
          <form
            onSubmit={handleAddNewItem}
            className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/70 space-y-3 animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2">
              <h5 className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4 text-indigo-700" />
                <span>Formulario: Añadir apartado + criterios</span>
              </h5>
              <button
                type="button"
                onClick={() => setShowAddItemForm(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label htmlFor="nuevo-item-titulo" className="block text-[11px] font-bold text-slate-700 uppercase">
                  Título / Enunciado del apartado *
                </label>
                <input
                  id="nuevo-item-titulo"
                  type="text"
                  value={nuevoItemTitulo}
                  onChange={(e) => setNuevoItemTitulo(e.target.value)}
                  placeholder="Ej: Análisis sintáctico de la oración subordinada"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="nuevo-item-peso" className="block text-[11px] font-bold text-slate-700 uppercase">
                  Peso / Ponderación (%)
                </label>
                <input
                  id="nuevo-item-peso"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={nuevoItemPeso}
                  onChange={(e) => setNuevoItemPeso(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                />
              </div>
            </div>

            {/* Selector de criterios del catálogo del grupo */}
            <div className="space-y-1.5">
              <span className="block text-[11px] font-bold text-slate-700 uppercase">
                Seleccionar criterios del catálogo del grupo ({criterios.length} disponibles)
              </span>

              {criterios.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  No hay criterios registrados en este grupo para seleccionar.
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto p-2 bg-white rounded-lg border border-slate-200 space-y-1">
                  {criterios.map((crit) => {
                    const isChecked = selectedCriteriosToAdd.includes(crit.codigo);
                    return (
                      <label
                        key={crit.id}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50 cursor-pointer text-xs text-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedCriteriosToAdd((prev) =>
                              isChecked
                                ? prev.filter((c) => c !== crit.codigo)
                                : [...prev, crit.codigo]
                            );
                          }}
                          className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="font-bold text-indigo-900">{crit.codigo}</span>
                        {crit.descripcion && (
                          <span className="text-slate-600 text-[11px] truncate flex-1">
                            — {crit.descripcion}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Vista previa de criterios seleccionados */}
              {selectedCriteriosToAdd.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] font-bold text-indigo-900">Seleccionados:</span>
                  {selectedCriteriosToAdd.map((cod) => (
                    <span
                      key={cod}
                      className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-200 text-[11px] font-bold"
                    >
                      {cod}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-200">
              <button
                type="button"
                onClick={() => setShowAddItemForm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!nuevoItemTitulo.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Confirmar y añadir apartado</span>
              </button>
            </div>
          </form>
        )}

        {/* LISTADO DE APARTADOS EVALUABLES */}
        {normalizedRubrica.items.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center space-y-2">
            <p className="text-xs text-slate-600 font-semibold">
              No hay ítems evaluables definidos en esta rúbrica.
            </p>
            <p className="text-[11px] text-slate-400">
              Pulse "Añadir apartado + criterios" para definir la primera pregunta o apartado evaluable.
            </p>
          </div>
        ) : (
          normalizedRubrica.items.map((item, idx) => {
            const enunciadoText = getEnunciadoReal(item);
            const tieneCriterios = item.criterios && item.criterios.length > 0;
            const totalDescriptores = Object.keys(item.descriptores || {}).length;
            const isSelected = selectedItemIds.has(item.id);

            return (
              <div
                key={item.id || `item_${idx}`}
                className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                  isSelected
                    ? 'border-indigo-400 bg-indigo-50/40 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {/* Encabezado del ítem evaluable con Checkbox de selección */}
                <div className="flex items-center justify-between gap-2 flex-wrap pb-1.5 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectItem(item.id)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      title="Seleccionar para retirar de la rúbrica"
                    />
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold text-xs font-mono">
                      {esExamen ? `Pregunta ${item.numero}` : `Apartado ${item.numero}`}
                    </span>
                    <h5 className="font-bold text-slate-900 text-sm">
                      {item.titulo}
                    </h5>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {item.peso !== null && item.peso !== undefined && (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px]">
                        Peso: {item.peso}%
                      </span>
                    )}
                    {totalDescriptores > 0 && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                        {totalDescriptores} niveles de desempeño
                      </span>
                    )}
                  </div>
                </div>

                {/* Comienzo del enunciado real */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Enunciado / Descriptor evaluable:
                  </span>
                  <p className="text-xs text-slate-700 font-medium leading-relaxed bg-slate-50/80 border border-slate-200/80 p-2.5 rounded-lg line-clamp-3 hover:line-clamp-none transition-all">
                    {enunciadoText}
                  </p>
                </div>

                {/* Criterios de evaluación asociados */}
                <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                      <Target className="w-3 h-3 text-purple-600" />
                      <span>Criterios:</span>
                    </span>

                    {tieneCriterios ? (
                      item.criterios.map((cod) => {
                        const objCrit = criteriosMap.get(cod);
                        return (
                          <span
                            key={cod}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-900 font-bold text-[11px]"
                            title={objCrit?.descripcion || `Criterio ${cod}`}
                          >
                            <span>{cod}</span>
                            {objCrit?.descripcion && (
                              <span className="font-normal text-slate-600 truncate max-w-[120px]">
                                · {objCrit.descripcion}
                              </span>
                            )}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Sin criterios asociados
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-editar-rubrica-title"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-4 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200 text-slate-800 my-6 overflow-hidden relative flex flex-col max-h-[90vh]">
        {/* Borde superior del modal distintivo según el curso seleccionado */}
        <div
          className="h-2 w-full absolute top-0 left-0 right-0 transition-colors"
          style={{ backgroundColor: cursoTheme.primary }}
        />

        {/* Cabecera del modal */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3 id="modal-editar-rubrica-title" className="text-base sm:text-lg font-bold text-slate-900">
                Gestión y Edición de Rúbrica
              </h3>
              <p className="text-xs text-slate-500">
                Administra los datos generales, fecha, ítems evaluables, actividades y criterios.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAttemptClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AVISO DESTACADO DE CAMBIOS PENDIENTES DE GUARDAR */}
        {hasUnsavedItemsChanges && (
          <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex items-center justify-between gap-2 text-xs shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-bold">
                «Cambios pendientes de guardar»: Existen modificaciones en la estructura de apartados o criterios sin persistir en Supabase.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleGuardarDatosRubrica()}
              disabled={isSaving}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer shrink-0 shadow-2xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Guardar ahora</span>
            </button>
          </div>
        )}

        {/* Notificaciones y avisos de feedback */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs shrink-0 animate-in fade-in ${
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

        {/* NAVEGACIÓN POR PESTAÑAS DENTRO DEL MODAL */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 text-xs shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('datos')}
            className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'datos'
                ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>1. Datos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('items')}
            className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'items'
                ? 'bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            <span>2. Ítems Evaluables ({normalizedRubrica.items.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('actividades')}
            className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'actividades'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>3. Actividades ({actividadesVinculadas.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('criterios')}
            className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'criterios'
                ? 'bg-purple-100 text-purple-900 border border-purple-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Target className="w-3.5 h-3.5 text-purple-600" />
            <span>4. Criterios ({criteriosCodigosList.length})</span>
          </button>
        </div>

        {/* CUERPO DEL MODAL (Scrollable) */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4">
          {/* ========================================================
              PESTAÑA 1: DATOS DE LA RÚBRICA Y FECHA DE CREACIÓN
              ======================================================== */}
          {activeTab === 'datos' && (
            <form onSubmit={handleGuardarDatosRubrica} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label htmlFor="rubrica-titulo-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Título de la Rúbrica
                </label>
                <input
                  id="rubrica-titulo-input"
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej: Expresión Oral y Debate"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-slate-800 transition-all font-semibold"
                  disabled={isSaving}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {/* Selector de calendario para la fecha de creación */}
                <div className="space-y-1.5">
                  <label htmlFor="rubrica-fecha-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Fecha de creación</span>
                  </label>
                  <input
                    id="rubrica-fecha-input"
                    type="date"
                    value={fechaCreacion}
                    onChange={(e) => setFechaCreacion(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 transition-all"
                    disabled={isSaving}
                  />
                  <p className="text-[11px] text-slate-400">
                    Se guarda en Supabase en la columna <code className="font-mono text-slate-600">fecha_creacion</code>.
                  </p>
                </div>

                {/* Tipo de rúbrica (Información del diseño) */}
                <div className="space-y-1.5">
                  <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                    <span>Tipo y Estructura</span>
                  </span>
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{rubrica.tipo || 'Rúbrica Analítica'}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                      {normalizedRubrica.items.length} apartados
                    </span>
                  </div>
                </div>
              </div>

              {/* SECCIÓN INFORMATIVA DENTRO DE DATOS: ÍTEMS EVALUABLES DE LA RÚBRICA */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>Ítems evaluables de la rúbrica ({normalizedRubrica.items.length})</span>
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {esExamen ? 'Estructura por Preguntas / Ejercicios' : 'Estructura por Apartados / Tareas'}
                  </span>
                </div>

                {renderItemsEvaluablesList()}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="submit"
                  disabled={isSaving || !titulo.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="Guardar título, fecha e ítems en Supabase"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando en Supabase...</span>
                    </>
                  ) : (
                    <>
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Guardar cambios generales</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ========================================================
              PESTAÑA 2: ÍTEMS EVALUABLES DE LA RÚBRICA (DEDICADA)
              ======================================================== */}
          {activeTab === 'items' && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>Ítems evaluables de la rúbrica ({normalizedRubrica.items.length})</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {esExamen
                      ? 'Desglose evaluable por preguntas y ejercicios del examen con sus enunciados y criterios.'
                      : 'Desglose evaluable por tareas y apartados de la actividad con sus enunciados y criterios.'}
                  </p>
                </div>
              </div>

              {renderItemsEvaluablesList()}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => handleGuardarDatosRubrica()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando en Supabase...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Guardar cambios en Supabase</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================
              PESTAÑA 3: ACTIVIDADES ASOCIADAS
              ======================================================== */}
          {activeTab === 'actividades' && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-indigo-600" />
                  <span>Actividades vinculadas ({actividadesVinculadas.length})</span>
                </h4>
                <span className="text-[11px] text-slate-400">
                  Gestión de instrumentos del cuaderno
                </span>
              </div>

              {actividadesVinculadas.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center space-y-1">
                  <p className="text-xs font-semibold text-slate-700">
                    Esta rúbrica no tiene actividades vinculadas actualmente.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Las calificaciones registradas se asociarán a la actividad vinculada.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {actividadesVinculadas.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 text-sm">
                            {act.nombre}
                          </span>
                          {act.evaluacion_periodo && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800">
                              {act.evaluacion_periodo}
                            </span>
                          )}
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-200 text-slate-700">
                            {act.tipo || 'ACTIVIDAD'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                          {act.fecha_creacion && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{act.fecha_creacion}</span>
                            </span>
                          )}
                          {act.criteriosCodigos && act.criteriosCodigos.length > 0 && (
                            <span className="flex items-center gap-1 text-purple-700 font-medium">
                              <Target className="w-3 h-3 text-purple-500" />
                              <span>Criterios: {act.criteriosCodigos.join(', ')}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botón para suprimir actividad de Supabase */}
                      <button
                        type="button"
                        onClick={() => setActividadAEliminar(act)}
                        disabled={isDeletingAct}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-center"
                        title={`Suprimir actividad "${act.nombre}"`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Suprimir actividad</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Informante de asociación de actividades */}
              {actividadesSinRubrica.length > 0 && (
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2 pt-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    <Info className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Actividades sin rúbrica en este grupo ({actividadesSinRubrica.length})</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Las actividades se vinculan con su rúbrica al momento de su creación. Si requiere asociar una actividad independiente a esta rúbrica, sus calificaciones por apartado se compartirán.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              PESTAÑA 4: CRITERIOS DE EVALUACIÓN
              ======================================================== */}
          {activeTab === 'criterios' && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-purple-600" />
                    <span>Criterios de Evaluación en esta Rúbrica ({criteriosCodigosList.length})</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Vincula o retira criterios de la rúbrica sin alterar el catálogo oficial del grupo.
                  </p>
                </div>
              </div>

              {/* Criterios actualmente asociados a la rúbrica */}
              {criteriosCodigosList.length === 0 ? (
                <div className="p-3.5 rounded-xl border border-dashed border-purple-200 bg-purple-50/50 text-center">
                  <p className="text-xs text-purple-800 font-medium">
                    No hay criterios asignados a los apartados de esta rúbrica.
                  </p>
                  <p className="text-[11px] text-purple-600 mt-0.5">
                    Seleccione un criterio del catálogo inferior para vincularlo.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-purple-200 bg-purple-50/60 space-y-2">
                  <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wider block">
                    Criterios vinculados actualmente:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {criteriosCodigosList.map((cod) => {
                      const objCrit = criterios.find((c) => c.codigo === cod);
                      return (
                        <div
                          key={cod}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-purple-300 text-purple-900 font-bold text-xs shadow-2xs"
                        >
                          <span>{cod}</span>
                          {objCrit?.descripcion && (
                            <span className="font-normal text-slate-600 truncate max-w-[150px]" title={objCrit.descripcion}>
                              · {objCrit.descripcion}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRetirarCriterio(cod)}
                            className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer transition-colors"
                            title={`Retirar criterio ${cod} de esta rúbrica`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Catálogo curricular de criterios del grupo */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Catálogo de Criterios del Grupo ({criterios.length})
                </span>

                {criterios.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    No hay criterios registrados en el grupo activo. Importe o cree criterios en la sección de Criterios.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {criterios.map((crit) => {
                      const isAsociado = criteriosEnRubricaSet.has(crit.codigo);

                      return (
                        <div
                          key={crit.id}
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs transition-colors ${
                            isAsociado
                              ? 'bg-purple-50/50 border-purple-200'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-800 text-xs">
                              {crit.codigo}
                            </span>
                            {crit.descripcion && (
                              <span className="text-slate-600 text-[11px] ml-1.5 line-clamp-1">
                                — {crit.descripcion}
                              </span>
                            )}
                          </div>

                          {isAsociado ? (
                            <button
                              type="button"
                              onClick={() => handleRetirarCriterio(crit.codigo)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors cursor-pointer shrink-0"
                              title={`Retirar asociación del criterio ${crit.codigo}`}
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Retirar</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAsociarCriterio(crit.codigo)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-purple-900 bg-purple-100 hover:bg-purple-200 border border-purple-300 rounded-md transition-colors cursor-pointer shrink-0"
                              title={`Asociar el criterio ${crit.codigo} a la rúbrica`}
                            >
                              <PlusCircle className="w-3 h-3 text-purple-700" />
                              <span>Asociar</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Botón para guardar los cambios de criterios */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => handleGuardarDatosRubrica()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="Guardar asociaciones de criterios en Supabase"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando criterios en Supabase...</span>
                    </>
                  ) : (
                    <>
                      <Target className="w-3.5 h-3.5" />
                      <span>Guardar criterios en Supabase</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL INTERNO DE CONFIRMACIÓN PARA RETIRAR APARTADOS SELECCIONADOS */}
        {confirmRemoveModalOpen && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 space-y-3 animate-in fade-in shrink-0">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-rose-900">
                <p className="font-bold text-sm">
                  ¿Confirmas que deseas retirar {selectedItemIds.size} apartado(s) de la rúbrica?
                </p>
                <p className="text-rose-800 leading-relaxed">
                  Si estos apartados tienen calificaciones históricas registradas, su retirada del diseño de la rúbrica afectará a la interpretación de esas notas en los cálculos posteriores de evaluación.
                </p>
                <p className="text-rose-700 font-semibold text-[11px]">
                  ✓ Nota de protección: No se eliminarán notas existentes de la base de datos, ni actividades de <code className="font-mono">public.actividades</code>, ni criterios del catálogo curricular.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmRemoveModalOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveItems}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sí, retirar apartados seleccionados</span>
              </button>
            </div>
          </div>
        )}

        {/* MODAL INTERNO DE CONFIRMACIÓN PARA SUPRIMIR ACTIVIDAD */}
        {actividadAEliminar && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/90 space-y-3 animate-in fade-in shrink-0">
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

        {/* MODAL / AVISO DE DUPLICADOS EN GENERACIÓN GEMINI (Ortografía / Presentación) */}
        {duplicateWarningModal?.open && (
          <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 space-y-3 animate-in fade-in shrink-0">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-amber-950">
                <p className="font-bold text-sm">
                  Ya existe un apartado para evaluar {duplicateWarningModal.tipo === 'ortografia' ? 'ortografía' : 'presentación'} («{duplicateWarningModal.existingTitle}»)
                </p>
                <p className="text-amber-800 leading-relaxed">
                  ¿Deseas reemplazar el apartado existente con la nueva propuesta de Gemini o añadirlo como un apartado adicional?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={() => setDuplicateWarningModal(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleGenerarApartadoGemini(duplicateWarningModal.tipo, false, true)}
                className="px-3 py-1.5 text-xs font-bold text-purple-900 bg-purple-100 hover:bg-purple-200 border border-purple-300 rounded-lg transition-colors cursor-pointer"
              >
                Añadir como nuevo apartado
              </button>
              <button
                type="button"
                onClick={() => handleGenerarApartadoGemini(duplicateWarningModal.tipo, true, false)}
                className="px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                Reemplazar apartado existente
              </button>
            </div>
          </div>
        )}

        {/* MODAL INTERNO DE CONFIRMACIÓN AL INTENTAR CERRAR CON CAMBIOS PENDIENTES */}
        {showUnsavedConfirmModal && (
          <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 space-y-3 animate-in fade-in shrink-0">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-amber-950">
                <p className="font-bold text-sm">
                  ¿Desea guardar los cambios pendientes en Supabase antes de salir?
                </p>
                <p className="text-amber-800 leading-relaxed">
                  Ha realizado modificaciones en los apartados o criterios de la rúbrica que no se han guardado todavía en el servidor.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowUnsavedConfirmModal(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
              >
                Descartar cambios
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowUnsavedConfirmModal(false);
                  await handleGuardarDatosRubrica();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar en Supabase y salir</span>
              </button>
            </div>
          </div>
        )}

        {/* Pie del modal */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 shrink-0 text-xs">
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Fernanditio · Cuaderno Docente
          </span>
          <button
            type="button"
            onClick={handleAttemptClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer ml-auto"
          >
            Cerrar modal
          </button>
        </div>
      </div>
    </div>
  );
};

