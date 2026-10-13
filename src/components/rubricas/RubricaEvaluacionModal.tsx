/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Rubrica,
  Alumno,
  Criterio,
  ActividadDetalle,
  Calificacion,
} from '../../types';
import { normalizeRubrica, NormalizedRubricaItem } from '../../utils/rubricaUtils';
import {
  guardarCalificacionesEvaluacion,
} from '../../services/calificacionesService';
import {
  User,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
  Dices,
  Save,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Clock,
  RotateCcw,
  Sparkles,
  Info,
  Layers,
  ArrowRight,
  FileSpreadsheet,
} from 'lucide-react';

interface RubricaEvaluacionModalProps {
  rubrica: Rubrica;
  alumnos: Alumno[];
  criterios: Criterio[];
  actividades: ActividadDetalle[];
  calificaciones: Calificacion[];
  grupoId: string;
  onClose: () => void;
  onUpdateCalificaciones: (nuevasCalificaciones: Calificacion[]) => void;
  initialAlumnoId?: string;
}

interface ItemEvaluacion {
  actividadId: string;
  numero: string;
  descripcion: string;
  criteriosCodigos: string[];
  peso: number | null;
  tipo: string;
  esExamen: boolean;
  puntuacionMaxima: number;
}

type RatingScaleMode = 'standard5' | 'standard4' | 'standard6';

export const RubricaEvaluacionModal: React.FC<RubricaEvaluacionModalProps> = ({
  rubrica: rubricaRaw,
  alumnos,
  criterios,
  actividades,
  calificaciones,
  grupoId,
  onClose,
  onUpdateCalificaciones,
  initialAlumnoId,
}) => {
  // Normalizar la rúbrica activa
  const rubrica = useMemo(() => normalizeRubrica(rubricaRaw), [rubricaRaw]);

  // Mapa de criterios por código para acceso rápido a descripción
  const criteriosMap = useMemo(() => {
    return new Map<string, Criterio>((criterios || []).map((c) => [c.codigo, c]));
  }, [criterios]);

  // Construir la lista de actividades/ítems evaluables para esta rúbrica
  const itemsEvaluables: ItemEvaluacion[] = useMemo(() => {
    const list: ItemEvaluacion[] = [];

    // 1. Actividades del cuaderno vinculadas a esta rúbrica
    const actsVinculadas = (actividades || []).filter(
      (a) => a.rubrica_id === rubrica.id
    );

    if (actsVinculadas.length > 0) {
      actsVinculadas.forEach((act, index) => {
        const esExamen = act.tipo?.toLowerCase().includes('examen') || act.metodo?.toLowerCase().includes('examen');
        list.push({
          actividadId: act.id,
          numero: String(index + 1),
          descripcion: act.nombre,
          criteriosCodigos: act.criteriosCodigos || [],
          peso: null,
          tipo: act.tipo || 'Actividad',
          esExamen: Boolean(esExamen),
          puntuacionMaxima: 10,
        });
      });
    }

    // 2. Si la rúbrica tiene apartados definidos en rubrica.items, utilizarlos o complementar
    if (list.length === 0 && rubrica.items.length > 0) {
      rubrica.items.forEach((it, index) => {
        list.push({
          actividadId: `${rubrica.id}_item_${index}`,
          numero: it.numero || String(index + 1),
          descripcion: it.titulo,
          criteriosCodigos: it.criterios,
          peso: it.peso,
          tipo: rubrica.tipo || 'Rúbrica',
          esExamen: false,
          puntuacionMaxima: 10,
        });
      });
    }

    // 3. Fallback mínimo de seguridad si no hay actividades ni ítems
    if (list.length === 0) {
      list.push({
        actividadId: `${rubrica.id}_default`,
        numero: '1',
        descripcion: rubrica.titulo,
        criteriosCodigos: rubrica.criteriosUnicos,
        peso: null,
        tipo: 'Actividad',
        esExamen: false,
        puntuacionMaxima: 10,
      });
    }

    return list;
  }, [actividades, rubrica]);

  // Alumnos ordenados por número de orden o nombre
  const alumnosOrdenados = useMemo(() => {
    return [...(alumnos || [])].sort((a, b) => {
      if (a.orden !== undefined && b.orden !== undefined) {
        return a.orden - b.orden;
      }
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
  }, [alumnos]);

  // Cálculo del estado de evaluación de cada alumno (Pendiente vs Evaluado)
  const alumnosEstadoMap = useMemo(() => {
    const map = new Map<string, { esPendiente: boolean; evidenciasCompletadas: number; totalEvidencias: number }>();

    alumnosOrdenados.forEach((al) => {
      let completadas = 0;
      itemsEvaluables.forEach((item) => {
        const cal = calificaciones.find(
          (c) => c.alumno_id === al.id && c.actividad_id === item.actividadId
        );
        // Distingue entre calificación numérica (incluso 0) y evidencia pendiente (null o ausente)
        if (cal && cal.nota !== null && cal.nota !== undefined && !isNaN(Number(cal.nota))) {
          completadas++;
        }
      });

      const esPendiente = completadas < itemsEvaluables.length;
      map.set(al.id, {
        esPendiente,
        evidenciasCompletadas: completadas,
        totalEvidencias: itemsEvaluables.length,
      });
    });

    return map;
  }, [alumnosOrdenados, itemsEvaluables, calificaciones]);

  // Estados de control de la interfaz
  const [modo, setModo] = useState<'individual' | 'multiple'>('individual');
  const [alumnosSeleccionadosMultiples, setAlumnosSeleccionadosMultiples] = useState<Set<string>>(new Set());
  const [soloPendientes, setSoloPendientes] = useState<boolean>(false);
  const [autoAvanzar, setAutoAvanzar] = useState<boolean>(true);
  const [escalaMode, setEscalaMode] = useState<RatingScaleMode>('standard5'); // 'standard5' = 0,3,5,7,10 (Captura 1) | 'standard4' = 0,4,7,10 (Sección 4.A)
  const [showOrtografiaNotice, setShowOrtografiaNotice] = useState<boolean>(false);
  const [showConfirmCeros, setShowConfirmCeros] = useState<boolean>(false);
  const [showConfirmSalir, setShowConfirmSalir] = useState<boolean>(false);

  // Alumno activo actual (Modo Individual)
  const [alumnoActualId, setAlumnoActualId] = useState<string>(() => {
    if (initialAlumnoId && alumnosOrdenados.some((a) => a.id === initialAlumnoId)) {
      return initialAlumnoId;
    }
    return alumnosOrdenados[0]?.id || '';
  });

  // Calificaciones temporales del alumno actual (en edición antes de guardar)
  // Mapeo actividadId -> nota | null
  const [calificacionesEdicion, setCalificacionesEdicion] = useState<Record<string, number | null>>({});
  const [hasModificacionesSinGuardar, setHasModificacionesSinGuardar] = useState<boolean>(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Cargar calificaciones existentes del alumno seleccionado en el búfer de edición
  const cargarCalificacionesAlumno = useCallback((alumnoId: string) => {
    const mapaInicial: Record<string, number | null> = {};
    itemsEvaluables.forEach((item) => {
      const cal = calificaciones.find(
        (c) => c.alumno_id === alumnoId && c.actividad_id === item.actividadId
      );
      if (cal && cal.nota !== null && cal.nota !== undefined && !isNaN(Number(cal.nota))) {
        mapaInicial[item.actividadId] = Number(cal.nota);
      } else {
        mapaInicial[item.actividadId] = null; // Pendiente
      }
    });
    setCalificacionesEdicion(mapaInicial);
    setHasModificacionesSinGuardar(false);
  }, [itemsEvaluables, calificaciones]);

  // Al cambiar de alumno, cargar sus notas
  useEffect(() => {
    if (alumnoActualId) {
      cargarCalificacionesAlumno(alumnoActualId);
    }
  }, [alumnoActualId, cargarCalificacionesAlumno]);

  // Lista de alumnos elegibles según filtro "Solo pendientes"
  const alumnosElegibles = useMemo(() => {
    if (!soloPendientes) return alumnosOrdenados;
    return alumnosOrdenados.filter((al) => {
      const estado = alumnosEstadoMap.get(al.id);
      return estado?.esPendiente ?? true;
    });
  }, [alumnosOrdenados, soloPendientes, alumnosEstadoMap]);

  // Alumno actual
  const alumnoActual = useMemo(() => {
    return alumnosOrdenados.find((a) => a.id === alumnoActualId) || alumnosOrdenados[0];
  }, [alumnosOrdenados, alumnoActualId]);

  const indexActualElegible = useMemo(() => {
    return alumnosElegibles.findIndex((a) => a.id === alumnoActualId);
  }, [alumnosElegibles, alumnoActualId]);

  // Botones de calificación según la escala configurada
  const botonesCalificacion = useMemo(() => {
    if (escalaMode === 'standard4') {
      return [
        { valor: 0, color: 'border-rose-300 text-rose-700 hover:bg-rose-50', active: 'bg-rose-600 text-white font-bold ring-2 ring-rose-300' },
        { valor: 4, color: 'border-orange-300 text-orange-700 hover:bg-orange-50', active: 'bg-orange-500 text-white font-bold ring-2 ring-orange-300' },
        { valor: 7, color: 'border-sky-300 text-sky-700 hover:bg-sky-50', active: 'bg-sky-600 text-white font-bold ring-2 ring-sky-300' },
        { valor: 10, color: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50', active: 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-300' },
      ];
    }
    // Captura 1: [ 0, 3, 5, 7, 10 ]
    return [
      { valor: 0, color: 'border-rose-300 text-rose-700 hover:bg-rose-50', active: 'bg-rose-600 text-white font-bold ring-2 ring-rose-300' },
      { valor: 3, color: 'border-orange-300 text-orange-700 hover:bg-orange-50', active: 'bg-orange-500 text-white font-bold ring-2 ring-orange-300' },
      { valor: 5, color: 'border-amber-300 text-amber-700 hover:bg-amber-50', active: 'bg-amber-500 text-white font-bold ring-2 ring-amber-300' },
      { valor: 7, color: 'border-sky-300 text-sky-700 hover:bg-sky-50', active: 'bg-sky-600 text-white font-bold ring-2 ring-sky-300' },
      { valor: 10, color: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50', active: 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-300' },
    ];
  }, [escalaMode]);

  /**
   * Manejador de clic en un botón de calificación:
   * 1. Al pulsar una puntuación, queda seleccionada visualmente.
   * 2. Al pulsar otra puntuación, la anterior se sustituye.
   * 3. Si se vuelve a pulsar el botón seleccionado, se desmarca y queda pendiente (null).
   */
  const handleTogglePuntuacion = (actividadId: string, valor: number) => {
    setCalificacionesEdicion((prev) => {
      const actual = prev[actividadId];
      const nuevaNota = actual === valor ? null : valor;
      return {
        ...prev,
        [actividadId]: nuevaNota,
      };
    });
    setHasModificacionesSinGuardar(true);
    setMensajeExito(null);
    setMensajeError(null);
  };

  /**
   * Manejador para entrada numérica de examen:
   * Nota normalizada = (puntosObtenidos / puntuacionMaxima) * 10
   */
  const handleExamenPuntosChange = (actividadId: string, puntosObtenidosStr: string, maxPuntos: number) => {
    if (puntosObtenidosStr === '') {
      setCalificacionesEdicion((prev) => ({ ...prev, [actividadId]: null }));
      setHasModificacionesSinGuardar(true);
      return;
    }

    const puntos = parseFloat(puntosObtenidosStr);
    if (isNaN(puntos) || puntos < 0 || puntos > maxPuntos) {
      return; // Prevenir valores fuera de rango
    }

    const notaNormalizada = Math.round(((puntos / maxPuntos) * 10) * 100) / 100;
    setCalificacionesEdicion((prev) => ({
      ...prev,
      [actividadId]: Math.min(10, Math.max(0, notaNormalizada)),
    }));
    setHasModificacionesSinGuardar(true);
  };

  /**
   * Asigna un cero explícito a todas las actividades evaluables del alumno actual
   */
  const handlePonerCerosTodas = () => {
    const ceros: Record<string, number | null> = {};
    itemsEvaluables.forEach((item) => {
      ceros[item.actividadId] = 0;
    });
    setCalificacionesEdicion(ceros);
    setHasModificacionesSinGuardar(true);
    setShowConfirmCeros(false);
  };

  /**
   * Navegación: Cambiar a alumno con verificación de cambios sin guardar
   */
  const cambiarAlumnoConSeguridad = (nuevoId: string) => {
    if (nuevoId === alumnoActualId) return;

    if (hasModificacionesSinGuardar) {
      const confirmacion = window.confirm(
        `Tienes calificaciones sin guardar para ${alumnoActual?.nombre}. ¿Deseas descartar los cambios y cambiar de alumno?`
      );
      if (!confirmacion) return;
    }

    setAlumnoActualId(nuevoId);
  };

  /**
   * Botón Anterior
   */
  const handleAnteriorAlumno = () => {
    if (alumnosElegibles.length === 0) return;
    let nuevoIndex = indexActualElegible - 1;
    if (nuevoIndex < 0) {
      nuevoIndex = alumnosElegibles.length - 1; // Ciclo
    }
    cambiarAlumnoConSeguridad(alumnosElegibles[nuevoIndex].id);
  };

  /**
   * Botón Siguiente
   */
  const handleSiguienteAlumno = () => {
    if (alumnosElegibles.length === 0) return;
    let nuevoIndex = indexActualElegible + 1;
    if (nuevoIndex >= alumnosElegibles.length) {
      nuevoIndex = 0; // Ciclo
    }
    cambiarAlumnoConSeguridad(alumnosElegibles[nuevoIndex].id);
  };

  /**
   * Botón Aleatorio
   */
  const handleAlumnoAleatorio = () => {
    if (alumnosElegibles.length === 0) return;
    if (alumnosElegibles.length === 1) {
      cambiarAlumnoConSeguridad(alumnosElegibles[0].id);
      return;
    }

    // Elegir aleatoriamente excluyendo el alumno actual si hay alternativas
    const alternativas = alumnosElegibles.filter((a) => a.id !== alumnoActualId);
    const randomIndex = Math.floor(Math.random() * alternativas.length);
    cambiarAlumnoConSeguridad(alternativas[randomIndex].id);
  };

  /**
   * Guardar Calificación del Alumno Actual (o Múltiples)
   */
  const handleGuardarCalificacion = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setMensajeError(null);
    setMensajeExito(null);

    try {
      const alumnosAGuardarIds = modo === 'multiple' && alumnosSeleccionadosMultiples.size > 0
        ? Array.from(alumnosSeleccionadosMultiples)
        : [alumnoActualId];

      const listaNuevasCalifs: Array<{
        alumnoId: string;
        actividadId: string;
        nota: number | null;
      }> = [];

      for (const alId of alumnosAGuardarIds) {
        for (const item of itemsEvaluables) {
          const nota = calificacionesEdicion[item.actividadId] ?? null;
          listaNuevasCalifs.push({
            alumnoId: alId,
            actividadId: item.actividadId,
            nota,
          });
        }
      }

      // Persistir y sincronizar mediante calificacionesService
      const resultado = await guardarCalificacionesEvaluacion(
        grupoId,
        calificaciones,
        listaNuevasCalifs
      );

      if (resultado.success) {
        onUpdateCalificaciones(resultado.calificaciones);
        setHasModificacionesSinGuardar(false);

        const nombreMsg = modo === 'multiple'
          ? `${alumnosAGuardarIds.length} alumnos`
          : alumnoActual?.nombre || 'alumno';

        let msg = `¡Calificaciones guardadas y sincronizadas en Supabase para ${nombreMsg}!`;
        if (typeof resultado.guardadas === 'number' && typeof resultado.retiradas === 'number') {
          if (resultado.retiradas > 0 && resultado.guardadas > 0) {
            msg = `¡Sincronizado para ${nombreMsg} (${resultado.guardadas} calificaciones guardadas, ${resultado.retiradas} pasadas a pendiente en Supabase)!`;
          } else if (resultado.retiradas > 0) {
            msg = `¡Sincronizado para ${nombreMsg} (${resultado.retiradas} evidencias pasadas a pendiente en Supabase)!`;
          } else if (resultado.guardadas > 0) {
            msg = `¡Calificaciones guardadas y sincronizadas en Supabase para ${nombreMsg} (${resultado.guardadas} notas numéricas)!`;
          }
        }

        setMensajeExito(msg);

        // Si autoAvanzar está activo, pasar al siguiente alumno
        if (autoAvanzar && modo === 'individual') {
          setTimeout(() => {
            handleSiguienteAlumno();
          }, 400);
        }
      } else {
        throw new Error(resultado.error || 'Error al guardar calificaciones.');
      }
    } catch (err: any) {
      console.error('[RubricaEvaluacionModal] Error al guardar:', err);
      setMensajeError(err?.message || 'Error inesperado al guardar las calificaciones.');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Manejador de Cierre Seguro
   */
  const handleIntentarCerrar = () => {
    if (hasModificacionesSinGuardar) {
      setShowConfirmSalir(true);
    } else {
      onClose();
    }
  };

  // Cálculo del resumen de notas por criterio para el alumno actual
  const resumenCriterios = useMemo(() => {
    const criteriosResumenMap = new Map<string, { notas: number[]; criterio: Criterio | undefined }>();

    itemsEvaluables.forEach((item) => {
      const nota = calificacionesEdicion[item.actividadId];
      if (nota !== null && nota !== undefined && !isNaN(nota)) {
        item.criteriosCodigos.forEach((cod) => {
          const entry = criteriosResumenMap.get(cod) || {
            notas: [],
            criterio: criteriosMap.get(cod),
          };
          entry.notas.push(nota);
          criteriosResumenMap.set(cod, entry);
        });
      } else {
        // Criterio asociado pero aún sin nota en esta evidencia
        item.criteriosCodigos.forEach((cod) => {
          if (!criteriosResumenMap.has(cod)) {
            criteriosResumenMap.set(cod, {
              notas: [],
              criterio: criteriosMap.get(cod),
            });
          }
        });
      }
    });

    const lista: Array<{ codigo: string; descripcion?: string; promedio: number | null; count: number }> = [];
    let sumaGlobal = 0;
    let countGlobal = 0;

    criteriosResumenMap.forEach((entry, codigo) => {
      if (entry.notas.length > 0) {
        const suma = entry.notas.reduce((acc, curr) => acc + curr, 0);
        const prom = Math.round((suma / entry.notas.length) * 100) / 100;
        lista.push({
          codigo,
          descripcion: entry.criterio?.descripcion,
          promedio: prom,
          count: entry.notas.length,
        });
        sumaGlobal += prom;
        countGlobal++;
      } else {
        lista.push({
          codigo,
          descripcion: entry.criterio?.descripcion,
          promedio: null, // Pendiente
          count: 0,
        });
      }
    });

    const notaGlobal = countGlobal > 0 ? Math.round((sumaGlobal / countGlobal) * 100) / 100 : null;

    return {
      criteriosList: lista,
      notaGlobal,
    };
  }, [itemsEvaluables, calificacionesEdicion, criteriosMap]);

  const estadoAlumnoActual = alumnosEstadoMap.get(alumnoActualId);
  const esAlumnoPendiente = estadoAlumnoActual?.esPendiente ?? true;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-5xl overflow-hidden flex flex-col max-h-[96vh] animate-in fade-in zoom-in-95 duration-150">
        {/* ========================================================
            A. CABECERA DE EVALUACIÓN (Idéntica a Fernanditio 2)
            ======================================================== */}
        <div className="bg-[#1e3a8a] text-white px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm select-none">
          {/* Identificación del Alumno Actual y Navegación */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-full bg-purple-900/60 border border-purple-400/40 flex items-center justify-center text-purple-200 shadow-inner shrink-0">
              <User className="w-5 h-5" aria-hidden="true" />
            </div>

            <h2 className="text-base sm:text-lg font-black tracking-wide uppercase text-white truncate max-w-xs sm:max-w-md">
              {alumnoActual?.nombre || 'Alumno'}
            </h2>

            {/* Estado: Pendiente vs Evaluado */}
            {esAlumnoPendiente ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                <Hourglass className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                Pendiente
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                Evaluado
              </span>
            )}

            {/* Posición del alumno dentro del grupo */}
            <span className="text-xs font-medium text-blue-200">
              n.º {alumnoActual?.orden ?? '—'} ({indexActualElegible + 1} de {alumnosElegibles.length})
            </span>

            {/* Botones Anterior y Siguiente */}
            <div className="inline-flex items-center gap-1 ml-1">
              <button
                type="button"
                onClick={handleAnteriorAlumno}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded border border-blue-400/30 transition-colors shadow-2xs"
                title="Alumno anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Ant.</span>
              </button>
              <button
                type="button"
                onClick={handleSiguienteAlumno}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded border border-blue-400/30 transition-colors shadow-2xs"
                title="Alumno siguiente"
              >
                <span>Sig.</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Rúbrica activa e icono de cerrar */}
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600/70 border border-blue-400/30 text-xs font-bold text-white tracking-tight">
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-200" aria-hidden="true" />
              Rúbrica: {rubrica.titulo}
            </span>

            <button
              type="button"
              onClick={handleIntentarCerrar}
              className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Cerrar pantalla de evaluación"
              title="Cerrar pantalla de evaluación"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================
            B. PANEL DE SELECCIÓN Y NAVEGACIÓN DE ALUMNOS
            ======================================================== */}
        <div className="p-3 sm:p-4 bg-slate-50/80 border-b border-slate-200 space-y-3">
          {/* Fila 1: Modos y controles rápidos */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Grupo izquierdo: Modos Individual / Múltiple y Ortografía */}
            <div className="flex items-center gap-2">
              <div className="inline-flex p-0.5 rounded-lg bg-slate-200/80 border border-slate-300">
                <button
                  type="button"
                  onClick={() => setModo('individual')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all ${
                    modo === 'individual'
                      ? 'bg-[#1e40af] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Individual</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModo('multiple');
                    // Inicializar con el alumno actual
                    setAlumnosSeleccionadosMultiples(new Set([alumnoActualId]));
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all ${
                    modo === 'multiple'
                      ? 'bg-[#1e40af] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Múltiple</span>
                </button>
              </div>

              {/* Botón Evaluar Ortografía (conservado visualmente) */}
              <button
                type="button"
                onClick={() => setShowOrtografiaNotice(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 font-bold border border-pink-200 transition-colors shadow-2xs"
                title="Módulo de evaluación de ortografía"
              >
                <span>✍️ Evaluar Ortografía</span>
              </button>
            </div>

            {/* Grupo derecho: Siguiente, Solo Pendientes, Aleatorio */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Checkbox Siguiente */}
              <label className="inline-flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 hover:text-slate-900 select-none">
                <input
                  type="checkbox"
                  checked={autoAvanzar}
                  onChange={(e) => setAutoAvanzar(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <span>➡️ Siguiente</span>
              </label>

              {/* Checkbox Solo Pendientes */}
              <label className="inline-flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 hover:text-slate-900 select-none">
                <input
                  type="checkbox"
                  checked={soloPendientes}
                  onChange={(e) => setSoloPendientes(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
                <span>⏳ Solo pendientes</span>
              </label>

              {/* Botón Aleatorio */}
              <button
                type="button"
                onClick={handleAlumnoAleatorio}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold transition-colors shadow-2xs"
                title="Elegir alumno aleatoriamente"
              >
                <Dices className="w-4 h-4" />
                <span>Aleatorio</span>
              </button>
            </div>
          </div>

          {/* Fila 2: Selector desplegable de alumno (Modo Individual) o Selector múltiple */}
          {modo === 'individual' ? (
            <div className="flex items-center gap-2">
              <label htmlFor="select-alumno" className="text-xs font-bold text-slate-700 shrink-0">
                Cambiar alumno:
              </label>
              <select
                id="select-alumno"
                value={alumnoActualId}
                onChange={(e) => cambiarAlumnoConSeguridad(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 font-semibold text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
              >
                {alumnosElegibles.map((al) => {
                  const est = alumnosEstadoMap.get(al.id);
                  const iconText = est?.esPendiente ? '⏳ (Pendiente)' : '✅ (Evaluado)';
                  return (
                    <option key={al.id} value={al.id}>
                      {al.orden !== undefined ? `${al.orden}. ` : ''}{al.nombre} {iconText}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : (
            /* Modo Múltiple: Selección de varios alumnos */
            <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  Alumnos seleccionados ({alumnosSeleccionadosMultiples.size} de {alumnosOrdenados.length}):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAlumnosSeleccionadosMultiples(new Set(alumnosOrdenados.map((a) => a.id)))}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    Seleccionar todos
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => setAlumnosSeleccionadosMultiples(new Set())}
                    className="text-xs text-slate-500 hover:text-slate-700 font-semibold"
                  >
                    Deseleccionar
                  </button>
                </div>
              </div>

              <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1.5 p-1 border border-slate-100 rounded-md bg-slate-50">
                {alumnosOrdenados.map((al) => {
                  const isChecked = alumnosSeleccionadosMultiples.has(al.id);
                  return (
                    <button
                      key={al.id}
                      type="button"
                      onClick={() => {
                        const copy = new Set(alumnosSeleccionadosMultiples);
                        if (copy.has(al.id)) copy.delete(al.id);
                        else copy.add(al.id);
                        setAlumnosSeleccionadosMultiples(copy);
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                        isChecked
                          ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span>{al.orden ? `${al.orden}. ` : ''}{al.nombre}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================
            C. TABLA DE EVALUACIÓN DE ACTIVIDADES
            ======================================================== */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Mensajes de éxito / error */}
          {mensajeExito && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{mensajeExito}</span>
              </div>
              <button type="button" onClick={() => setMensajeExito(null)} className="text-emerald-700 hover:text-emerald-900">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {mensajeError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-semibold">{mensajeError}</span>
              </div>
              <button type="button" onClick={() => setMensajeError(null)} className="text-rose-700 hover:text-rose-900">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Selector discreto de escala de botones de calificación */}
          <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
            <span className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              Actividades Evaluables ({itemsEvaluables.length})
            </span>

            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-400">Escala de botones:</span>
              <button
                type="button"
                onClick={() => setEscalaMode('standard5')}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  escalaMode === 'standard5'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title="Escala Fernanditio 2: 0, 3, 5, 7, 10"
              >
                0 · 3 · 5 · 7 · 10
              </button>
              <button
                type="button"
                onClick={() => setEscalaMode('standard4')}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  escalaMode === 'standard4'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title="Escala 4 botones: 0, 4, 7, 10"
              >
                0 · 4 · 7 · 10
              </button>
            </div>
          </div>

          {/* Tabla de Actividades */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th scope="col" className="py-3 px-4 w-20 text-center">
                    Actividad
                  </th>
                  <th scope="col" className="py-3 px-4 w-60 sm:w-72 text-center">
                    Calificación
                  </th>
                  <th scope="col" className="py-3 px-4">
                    Descripción
                  </th>
                  <th scope="col" className="py-3 px-4 w-32 text-right">
                    Criterio
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsEvaluables.map((item) => {
                  const notaActual = calificacionesEdicion[item.actividadId];
                  const tieneNota = notaActual !== null && notaActual !== undefined && !isNaN(notaActual);

                  return (
                    <tr
                      key={item.actividadId}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* 1. Columna Actividad: Número en badge azul */}
                      <td className="py-3.5 px-4 text-center align-middle">
                        <span className="inline-block px-3 py-1 font-mono font-bold text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg shadow-2xs">
                          {item.numero}
                        </span>
                      </td>

                      {/* 2. Columna Calificación: Botones 0, 3, 5, 7, 10 (o input examen) */}
                      <td className="py-3.5 px-4 text-center align-middle">
                        {item.esExamen ? (
                          /* Modo Examen con entrada numérica directa */
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max={item.puntuacionMaxima}
                              placeholder="0"
                              value={notaActual !== null && notaActual !== undefined ? notaActual : ''}
                              onChange={(e) => handleExamenPuntosChange(item.actividadId, e.target.value, item.puntuacionMaxima)}
                              className="w-16 py-1 px-2 text-center font-bold text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <span className="text-[11px] text-slate-400">/ {item.puntuacionMaxima} pts</span>
                          </div>
                        ) : (
                          /* Botones rápidos de calificación */
                          <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                            {botonesCalificacion.map((btn) => {
                              const isSelected = tieneNota && notaActual === btn.valor;

                              return (
                                <button
                                  key={btn.valor}
                                  type="button"
                                  onClick={() => handleTogglePuntuacion(item.actividadId, btn.valor)}
                                  className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all flex items-center justify-center shadow-2xs cursor-pointer ${
                                    isSelected
                                      ? btn.active
                                      : `${btn.color} bg-white`
                                  }`}
                                  title={`Asignar ${btn.valor} puntos (clic de nuevo para desmarcar)`}
                                >
                                  {btn.valor}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* 3. Columna Descripción */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-900 leading-snug">
                            {item.descripcion}
                          </p>
                          {item.peso !== null && (
                            <span className="text-[10px] font-mono text-slate-500">
                              Peso: {item.peso}%
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Columna Criterio: Badges con código LOMLOE */}
                      <td className="py-3.5 px-4 text-right align-middle">
                        <div className="inline-flex flex-wrap gap-1 justify-end">
                          {item.criteriosCodigos.length > 0 ? (
                            item.criteriosCodigos.map((cod) => {
                              const crit = criteriosMap.get(cod);
                              return (
                                <span
                                  key={cod}
                                  className="inline-block px-2 py-0.5 font-mono font-bold text-xs text-blue-700 bg-blue-50/60 border border-blue-200 rounded shadow-2xs"
                                  title={crit?.descripcion || `Criterio ${cod}`}
                                >
                                  {cod}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">
                              Sin criterio
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ========================================================
              D. RESUMEN DE NOTAS POR CRITERIO (ESCALA 0-10)
              ======================================================== */}
          <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-slate-50/90 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📊</span>
              <h3 className="text-sm font-bold text-slate-900">
                Resumen de Notas por Criterio (Escala 0-10)
              </h3>
            </div>

            <p className="text-xs text-slate-500">
              Selecciona puntuaciones para calcular los promedios.
            </p>

            {/* Desglose por criterio si existen puntuaciones */}
            {resumenCriterios.criteriosList.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                {resumenCriterios.criteriosList.map((c) => (
                  <div
                    key={c.codigo}
                    className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div className="truncate pr-2">
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[11px] mr-1.5">
                        {c.codigo}
                      </span>
                      <span className="text-slate-700 text-[11px] truncate">
                        {c.descripcion ? c.descripcion.substring(0, 30) + '...' : ''}
                      </span>
                    </div>

                    <div className="font-mono font-bold shrink-0">
                      {c.promedio !== null ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {c.promedio.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal italic text-[11px]">
                          Pendiente
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Nota Global Ponderada de la Rúbrica */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                Nota Global Ponderada de la Rúbrica:
              </span>
              <span className="text-sm sm:text-base font-mono font-bold text-blue-700">
                {resumenCriterios.notaGlobal !== null
                  ? resumenCriterios.notaGlobal.toFixed(2)
                  : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================
            E. BOTONES INFERIORES DE ACCIÓN
            ======================================================== */}
        <div className="p-3 sm:p-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 select-none">
          {/* Botón Poner 0 en todas las actividades */}
          <button
            type="button"
            onClick={() => setShowConfirmCeros(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <span>⭕ Poner 0 en todas las actividades</span>
          </button>

          {/* Botones Cerrar y Guardar Calificación */}
          <div className="w-full sm:w-auto flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleIntentarCerrar}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={handleGuardarCalificacion}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1d4ed8] active:bg-[#1e3a8a] rounded-lg shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>
                {modo === 'multiple'
                  ? `Guardar Calificación de ${alumnosSeleccionadosMultiples.size} Alumnos`
                  : `Guardar Calificación de ${alumnoActual?.nombre || 'Alumno'}`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          DIÁLOGOS DE CONFIRMACIÓN Y AVISOS DE SEGURIDAD
          ======================================================== */}
      {/* Confirmación de Poner 0 a todas las actividades */}
      {showConfirmCeros && (
        <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 max-w-md w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-sm font-bold text-slate-900">
                Confirmar asignación de ceros
              </h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              ¿Estás seguro de que deseas poner una nota de <strong>0</strong> en todas las actividades de esta rúbrica para <strong>{alumnoActual?.nombre}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmCeros(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePonerCerosTodas}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-2xs"
              >
                Sí, poner 0 a todas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de salir con cambios sin guardar */}
      {showConfirmSalir && (
        <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 max-w-md w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-sm font-bold text-slate-900">
                Calificaciones sin guardar
              </h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Has modificado calificaciones de <strong>{alumnoActual?.nombre}</strong> que aún no se han guardado. ¿Deseas salir y descartar estos cambios?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSalir(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmSalir(false);
                  onClose();
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-2xs"
              >
                Descartar y salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso del módulo de Ortografía */}
      {showOrtografiaNotice && (
        <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 max-w-md w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-pink-600">
              <Sparkles className="w-6 h-6 shrink-0" />
              <h4 className="text-sm font-bold text-slate-900">
                Evaluar Ortografía
              </h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              De acuerdo con las instrucciones maestras de Fernanditio (Sección 3.B.3), no se inventan deducciones arbitrarias de faltas ortográficas hasta que se defina la regla reglamentaria correspondiente a la normativa de evaluación.
            </p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowOrtografiaNotice(false)}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1d4ed8] rounded-lg shadow-2xs"
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
