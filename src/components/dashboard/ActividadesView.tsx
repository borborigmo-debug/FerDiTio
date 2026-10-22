/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useCuaderno } from '../../context/CuadernoContext';
import {
  FileText,
  FolderTree,
  Target,
  Table as TableIcon,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Calendar,
  Search,
  Info,
  ChevronDown,
  Layers,
  Sparkles,
  Award,
  Filter,
  Trash2,
} from 'lucide-react';
import { ActividadDetalle, Rubrica, Calificacion, Alumno, Criterio, Seccion, CalificacionApartado } from '../../types';
import { normalizeRubrica, NormalizedRubrica, compararCodigosCriterio, compararCriterios } from '../../utils/rubricaUtils';

export interface EvidenciaItem {
  actividadId: string;
  actividadNombre: string;
  fechaEvaluacion: string;
  instrumento: string;
  tipoActividad?: string;
  metodo?: string;
  nota: number;
}

interface TooltipData {
  x: number;
  y: number;
  alumnoNombre: string;
  tituloColumna: string;
  subtituloColumna?: string;
  notaMedia: number | null;
  evidencias: EvidenciaItem[];
  esMediaGlobal?: boolean;
}

export const ActividadesView: React.FC = () => {
  const { cuadernoData, selectedEvaluacion, setActiveTab, eliminarActividades } = useCuaderno();

  // Caso A (Criterios) vs Caso B (Secciones)
  const [modoEvaluacion, setModoEvaluacion] = useState<'criterios' | 'secciones'>('criterios');

  // Alternar entre la Tabla de Evaluación principal y el Catálogo de Actividades
  const [vistaActiva, setVistaActiva] = useState<'tabla' | 'catalogo'>('tabla');

  // Selector de período para la Columna Extra de Nota Media en Caso A
  const [periodoMediaExtra, setPeriodoMediaExtra] = useState<'1.º Ev' | '2.º Ev' | '3.º Ev' | 'Global'>('Global');

  // Filtro de búsqueda de alumno
  const [busquedaAlumno, setBusquedaAlumno] = useState<string>('');

  // Filtros del catálogo de actividades
  const [filtroSeccion, setFiltroSeccion] = useState<string>('todas');
  const [soloPeriodoActual, setSoloPeriodoActual] = useState(false);

  // Selección múltiple para eliminar actividades del catálogo
  const [actividadesSeleccionadas, setActividadesSeleccionadas] = useState<Set<string>>(new Set());
  const [confirmandoEliminarActs, setConfirmandoEliminarActs] = useState(false);
  const [isDeletingActs, setIsDeletingActs] = useState(false);
  const [deleteActsFeedback, setDeleteActsFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Estado del Toolkit / Tooltip flotante con evidencias
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancelar y limpiar cualquier temporizador pendiente al desmontar el componente
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
    };
  }, []);

  const grupo = cuadernoData?.grupo;
  const alumnos = useMemo(() => cuadernoData?.alumnos || [], [cuadernoData?.alumnos]);
  const criterios = useMemo(() => {
    const list = cuadernoData?.criterios || [];
    return list.slice().sort(compararCriterios);
  }, [cuadernoData?.criterios]);
  const actividades = useMemo(() => cuadernoData?.actividades || [], [cuadernoData?.actividades]);
  const secciones = useMemo(() => cuadernoData?.secciones || [], [cuadernoData?.secciones]);
  const rubricas = useMemo(() => cuadernoData?.rubricas || [], [cuadernoData?.rubricas]);
  const calificaciones = useMemo(() => cuadernoData?.calificaciones || [], [cuadernoData?.calificaciones]);
  const calificacionesApartados = useMemo(
    () => cuadernoData?.calificacionesApartados || [],
    [cuadernoData?.calificacionesApartados]
  );

  // Si no hay secciones disponibles en el grupo, forzar Caso A por defecto
  useEffect(() => {
    if (secciones.length === 0 && modoEvaluacion === 'secciones') {
      setModoEvaluacion('criterios');
    }
  }, [secciones.length, modoEvaluacion]);

  // Sincronizar inicialmente el período de la media extra con el seleccionado en la cabecera
  useEffect(() => {
    if (selectedEvaluacion) {
      setPeriodoMediaExtra(selectedEvaluacion);
    }
  }, [selectedEvaluacion]);

  // Mapas rápidos para acceso eficiente en O(1)
  const rubricasMap = useMemo(() => {
    return new Map<string, Rubrica>(rubricas.map((r) => [r.id, r]));
  }, [rubricas]);

  const seccionesMap = useMemo(() => {
    return new Map<string, Seccion>(secciones.map((s) => [s.id, s]));
  }, [secciones]);

  const actividadesMap = useMemo(() => {
    return new Map<string, ActividadDetalle>(actividades.map((a) => [a.id, a]));
  }, [actividades]);

  // Rúbricas normalizadas para acceso directo a apartados, UUIDs, descriptores y criterios vinculados
  const rubricasNormalizadasMap = useMemo(() => {
    const map = new Map<string, NormalizedRubrica>();
    for (const r of rubricas) {
      if (r && r.id) {
        map.set(r.id, normalizeRubrica(r));
      }
    }
    return map;
  }, [rubricas]);

  // Deduplicación determinista de calificaciones de apartados para evitar duplicidades
  const calificacionesApartadosUnicas = useMemo(() => {
    const map = new Map<string, CalificacionApartado>();
    for (const ca of calificacionesApartados) {
      if (ca && ca.alumno_id && ca.rubrica_id && ca.apartado_id) {
        const key = `${ca.alumno_id}_${ca.actividad_id || ''}_${ca.rubrica_id}_${ca.apartado_id}`;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, ca);
        } else if (ca.updated_at && existing.updated_at) {
          if (new Date(ca.updated_at).getTime() >= new Date(existing.updated_at).getTime()) {
            map.set(key, ca);
          }
        } else {
          map.set(key, ca);
        }
      }
    }
    return Array.from(map.values());
  }, [calificacionesApartados]);

  const calificacionesMap = useMemo(() => {
    const map = new Map<string, Calificacion>();
    for (const cal of calificaciones) {
      if (cal.alumno_id && cal.actividad_id) {
        map.set(`${cal.alumno_id}_${cal.actividad_id}`, cal);
      }
    }
    return map;
  }, [calificaciones]);

  // Normalización estándar de períodos de evaluación
  const normalizarPeriodo = (periodo?: string | null): string => {
    if (!periodo) return '';
    const p = periodo.toLowerCase().trim();
    if (p.includes('1') || p.includes('primera') || p.includes('1ev')) return '1.º Ev';
    if (p.includes('2') || p.includes('segunda') || p.includes('2ev')) return '2.º Ev';
    if (p.includes('3') || p.includes('tercera') || p.includes('3ev')) return '3.º Ev';
    if (p.includes('glob') || p.includes('final')) return 'Global';
    return periodo;
  };

  // Formateador de fecha para las evidencias en el tooltip
  const formatearFechaEvaluacion = (updatedAt?: string | null, fallbackPeriodo?: string | null): string => {
    if (updatedAt) {
      try {
        const d = new Date(updatedAt);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
        }
      } catch {
        // Fallo de parseo
      }
    }
    if (fallbackPeriodo) {
      return fallbackPeriodo;
    }
    return 'Fecha no registrada';
  };

  // Obtener nombre del instrumento de evaluación
  const getInstrumentoEvaluacion = (act: ActividadDetalle): string => {
    if (act.rubrica_id) {
      const rub = rubricasMap.get(act.rubrica_id);
      if (rub?.titulo) {
        return `Rúbrica: ${rub.titulo}`;
      }
      return 'Rúbrica';
    }
    if (act.tipo && act.metodo) {
      return `${act.tipo} (${act.metodo})`;
    }
    if (act.tipo) {
      return act.tipo;
    }
    if (act.metodo) {
      return act.metodo;
    }
    return 'Evaluación docente';
  };

  // 1. Obtener evidencias para un Alumno y un Criterio específico (Caso A)
  const getEvidenciasCriterio = (
    alumnoId: string,
    criterioCodigo: string,
    filtroPeriodo?: string
  ): EvidenciaItem[] => {
    const codNormalizado = criterioCodigo.trim().toLowerCase();
    const evidencias: EvidenciaItem[] = [];

    // 1.1. Evidencias procedentes de calificaciones_apartados (rúbricas)
    for (const ca of calificacionesApartadosUnicas) {
      if (ca.alumno_id !== alumnoId) continue;
      // Excluir notas pendientes (null o undefined). El 0 es una calificación válida.
      if (ca.nota === null || ca.nota === undefined || isNaN(Number(ca.nota))) {
        continue;
      }

      const rubricaNorm = rubricasNormalizadasMap.get(ca.rubrica_id);
      if (!rubricaNorm) continue;

      // Localizar el apartado correspondiente en la rúbrica normalizada
      const apartado = rubricaNorm.items.find(
        (it) =>
          (it.uuid && it.uuid === ca.apartado_id) ||
          it.id === ca.apartado_id ||
          (it.legacyId && it.legacyId === ca.apartado_id)
      );

      if (!apartado) continue;

      // Comprobar si este apartado evalúa el criterio solicitado
      const evaluaCriterio =
        Array.isArray(apartado.criterios) &&
        apartado.criterios.some((c) => c.trim().toLowerCase() === codNormalizado);

      if (!evaluaCriterio) continue;

      // Resolver metadatos de la actividad asociada si existe
      const act = ca.actividad_id ? actividadesMap.get(ca.actividad_id) : null;

      // Filtrado por período si se especifica y no es 'Global'
      if (filtroPeriodo && filtroPeriodo !== 'Global') {
        if (act) {
          const pNorm = normalizarPeriodo(act.evaluacion_periodo);
          if (pNorm && pNorm !== filtroPeriodo) {
            continue;
          }
        }
      }

      const tituloApartado = apartado.titulo?.trim() || (apartado.numero ? `Apartado ${apartado.numero}` : '');
      const nombreInstrumento = `Rúbrica: ${rubricaNorm.titulo}${tituloApartado ? ` — ${tituloApartado}` : ''}`;
      const nombreActividad = act?.nombre || rubricaNorm.titulo;
      const fecha = formatearFechaEvaluacion(ca.updated_at, act?.evaluacion_periodo);

      evidencias.push({
        actividadId: act?.id || ca.rubrica_id,
        actividadNombre: nombreActividad,
        fechaEvaluacion: fecha,
        instrumento: nombreInstrumento,
        tipoActividad: act?.tipo || 'Rúbrica',
        metodo: act?.metodo || undefined,
        nota: Number(ca.nota),
      });
    }

    // 1.2. Evidencias procedentes de public.calificaciones
    // Solo para actividades directas sin rúbrica o sin apartados calificados
    const acts = actividades.filter((act) => {
      // Si la actividad tiene rúbrica y ya tiene calificaciones de apartados para este alumno, no duplicar con la nota agregada
      if (act.rubrica_id) {
        const tieneApartadosEvaluados = calificacionesApartadosUnicas.some(
          (ca) =>
            ca.alumno_id === alumnoId &&
            ca.actividad_id === act.id &&
            ca.nota !== null &&
            ca.nota !== undefined
        );
        if (tieneApartadosEvaluados) return false;
      }

      const tieneCriterio =
        Array.isArray(act.criteriosCodigos) &&
        act.criteriosCodigos.some((c) => c.trim().toLowerCase() === codNormalizado);

      if (!tieneCriterio) return false;

      // Filtrar por período si se especifica y no es 'Global'
      if (filtroPeriodo && filtroPeriodo !== 'Global') {
        const pNorm = normalizarPeriodo(act.evaluacion_periodo);
        if (pNorm && pNorm !== filtroPeriodo) {
          return false;
        }
      }

      return true;
    });

    for (const act of acts) {
      const cal = calificacionesMap.get(`${alumnoId}_${act.id}`);
      if (cal && cal.nota !== null && cal.nota !== undefined && !isNaN(Number(cal.nota))) {
        evidencias.push({
          actividadId: act.id,
          actividadNombre: act.nombre,
          fechaEvaluacion: formatearFechaEvaluacion(cal.updated_at, act.evaluacion_periodo),
          instrumento: getInstrumentoEvaluacion(act),
          tipoActividad: act.tipo,
          metodo: act.metodo || undefined,
          nota: Number(cal.nota),
        });
      }
    }

    return evidencias;
  };

  // 2. Obtener evidencias para un Alumno y una Sección específica (Caso B)
  const getEvidenciasSeccion = (
    alumnoId: string,
    seccionId: string,
    filtroPeriodo?: string
  ): EvidenciaItem[] => {
    const evidencias: EvidenciaItem[] = [];

    const acts = actividades.filter((act) => {
      if (act.seccion_id !== seccionId) return false;

      if (filtroPeriodo && filtroPeriodo !== 'Global') {
        const pNorm = normalizarPeriodo(act.evaluacion_periodo);
        if (pNorm && pNorm !== filtroPeriodo) {
          return false;
        }
      }

      return true;
    });

    for (const act of acts) {
      const cal = calificacionesMap.get(`${alumnoId}_${act.id}`);
      if (cal && cal.nota !== null && cal.nota !== undefined && !isNaN(Number(cal.nota))) {
        evidencias.push({
          actividadId: act.id,
          actividadNombre: act.nombre,
          fechaEvaluacion: formatearFechaEvaluacion(cal.updated_at, act.evaluacion_periodo),
          instrumento: getInstrumentoEvaluacion(act),
          tipoActividad: act.tipo,
          metodo: act.metodo || undefined,
          nota: Number(cal.nota),
        });
      }
    }

    return evidencias;
  };

  // 3. Cálculo de la media de una lista de evidencias
  const calcularMediaEvidencias = (evidencias: EvidenciaItem[]): number | null => {
    if (!evidencias || evidencias.length === 0) return null;
    const suma = evidencias.reduce((acc, ev) => acc + ev.nota, 0);
    return Number((suma / evidencias.length).toFixed(2));
  };

  // 4. Cálculo de la Columna Extra de Media de Criterios (Caso A)
  const calcularMediaExtraCriterios = (
    alumnoId: string,
    periodo: '1.º Ev' | '2.º Ev' | '3.º Ev' | 'Global'
  ): {
    media: number | null;
    criteriosConNota: Array<{
      criterio: Criterio;
      notaMedia: number;
      ponderacion: number;
    }>;
  } => {
    const criteriosConNota: Array<{
      criterio: Criterio;
      notaMedia: number;
      ponderacion: number;
    }> = [];

    for (const cr of criterios) {
      const evs = getEvidenciasCriterio(alumnoId, cr.codigo, periodo);
      const mediaCr = calcularMediaEvidencias(evs);
      if (mediaCr !== null) {
        const pond = typeof cr.ponderacion === 'number' && cr.ponderacion > 0 ? cr.ponderacion : 0;
        criteriosConNota.push({
          criterio: cr,
          notaMedia: mediaCr,
          ponderacion: pond,
        });
      }
    }

    if (criteriosConNota.length === 0) {
      return { media: null, criteriosConNota: [] };
    }

    const sumaPonderaciones = criteriosConNota.reduce((acc, item) => acc + item.ponderacion, 0);

    if (sumaPonderaciones > 0) {
      // Media ponderada según pesos de criterios
      const sumaPonderada = criteriosConNota.reduce(
        (acc, item) => acc + item.notaMedia * item.ponderacion,
        0
      );
      return {
        media: Number((sumaPonderada / sumaPonderaciones).toFixed(2)),
        criteriosConNota,
      };
    } else {
      // Media aritmética si no hay ponderaciones asignadas
      const sumaSimple = criteriosConNota.reduce((acc, item) => acc + item.notaMedia, 0);
      return {
        media: Number((sumaSimple / criteriosConNota.length).toFixed(2)),
        criteriosConNota,
      };
    }
  };

  // 5. Cálculo de la Columna Extra de Media de Secciones (Caso B)
  const calcularMediaExtraSecciones = (
    alumnoId: string,
    periodo: '1.º Ev' | '2.º Ev' | '3.º Ev' | 'Global'
  ): {
    media: number | null;
    seccionesConNota: Array<{
      seccion: Seccion;
      notaMedia: number;
      ponderacion: number;
    }>;
  } => {
    const seccionesConNota: Array<{
      seccion: Seccion;
      notaMedia: number;
      ponderacion: number;
    }> = [];

    for (const sec of secciones) {
      const evs = getEvidenciasSeccion(alumnoId, sec.id, periodo);
      const mediaSec = calcularMediaEvidencias(evs);
      if (mediaSec !== null) {
        const pond = typeof sec.ponderacion === 'number' && sec.ponderacion > 0 ? sec.ponderacion : 0;
        seccionesConNota.push({
          seccion: sec,
          notaMedia: mediaSec,
          ponderacion: pond,
        });
      }
    }

    if (seccionesConNota.length === 0) {
      return { media: null, seccionesConNota: [] };
    }

    const sumaPond = seccionesConNota.reduce((acc, item) => acc + item.ponderacion, 0);
    if (sumaPond > 0) {
      const sumaPonderada = seccionesConNota.reduce(
        (acc, item) => acc + item.notaMedia * item.ponderacion,
        0
      );
      return {
        media: Number((sumaPonderada / sumaPond).toFixed(2)),
        seccionesConNota,
      };
    } else {
      const sumaSimple = seccionesConNota.reduce((acc, item) => acc + item.notaMedia, 0);
      return {
        media: Number((sumaSimple / seccionesConNota.length).toFixed(2)),
        seccionesConNota,
      };
    }
  };

  // Filtrado de alumnos por buscador
  const alumnosFiltrados = useMemo(() => {
    if (!busquedaAlumno.trim()) return alumnos;
    const term = busquedaAlumno.toLowerCase();
    return alumnos.filter((a) => a.nombre.toLowerCase().includes(term));
  }, [alumnos, busquedaAlumno]);

  // Actividades filtradas para el Catálogo secundario (orden cronológico: más reciente primero)
  const actividadesCatalogo = useMemo(() => {
    const filtradas = actividades.filter((act) => {
      if (filtroSeccion !== 'todas') {
        if (filtroSeccion === 'sin_seccion' && act.seccion_id) return false;
        if (filtroSeccion !== 'sin_seccion' && act.seccion_id !== filtroSeccion) return false;
      }
      if (soloPeriodoActual && selectedEvaluacion !== 'Global') {
        const pNorm = normalizarPeriodo(act.evaluacion_periodo);
        if (pNorm && pNorm !== selectedEvaluacion) return false;
      }
      return true;
    });

    return filtradas.slice().sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.fecha ? new Date(a.fecha).getTime() : 0);
      const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.fecha ? new Date(b.fecha).getTime() : 0);
      if (timeA !== timeB) return timeB - timeA;
      return 0;
    });
  }, [actividades, filtroSeccion, soloPeriodoActual, selectedEvaluacion]);

  // Manejadores de selección múltiple para actividades del catálogo
  const handleToggleActividad = (actId: string) => {
    setActividadesSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(actId)) {
        next.delete(actId);
      } else {
        next.add(actId);
      }
      return next;
    });
  };

  const handleToggleSeleccionarTodasActs = () => {
    if (actividadesSeleccionadas.size === actividadesCatalogo.length && actividadesCatalogo.length > 0) {
      setActividadesSeleccionadas(new Set());
    } else {
      setActividadesSeleccionadas(new Set(actividadesCatalogo.map((a) => a.id)));
    }
  };

  const handleEjecutarEliminarActs = async () => {
    if (actividadesSeleccionadas.size === 0) return;
    setIsDeletingActs(true);
    setDeleteActsFeedback(null);
    try {
      const ids = Array.from(actividadesSeleccionadas);
      const res = await eliminarActividades(ids);
      setActividadesSeleccionadas(new Set());
      setConfirmandoEliminarActs(false);
      setDeleteActsFeedback({
        type: 'success',
        message: `Se han eliminado correctamente ${res.eliminadas.length} actividad(es) y sus calificaciones asociadas.`,
      });
      setTimeout(() => setDeleteActsFeedback(null), 5000);
    } catch (err: any) {
      console.error('[ActividadesView] Error al eliminar actividades:', err);
      setDeleteActsFeedback({
        type: 'error',
        message: err?.message || 'Error al eliminar actividades en el servidor.',
      });
    } finally {
      setIsDeletingActs(false);
    }
  };

  // Manejador del Hover para abrir el Tooltip en la celda con retardo de 1000 ms
  const handleCellMouseEnter = (
    e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>,
    alumnoNombre: string,
    tituloColumna: string,
    subtituloColumna: string | undefined,
    evidencias: EvidenciaItem[],
    notaMedia: number | null,
    esMediaGlobal?: boolean
  ) => {
    // Limpiar cualquier temporizador pendiente y cerrar tooltip activo previo
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);

    // Calcular posición inmediatamente para asegurar que el rectángulo es válido
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipEstimatedHeight = 240;

    let x = rect.left;
    if (x + tooltipWidth > window.innerWidth - 16) {
      x = Math.max(16, window.innerWidth - tooltipWidth - 16);
    }

    let y = rect.bottom + 8;
    if (y + tooltipEstimatedHeight > window.innerHeight - 16) {
      y = Math.max(16, rect.top - tooltipEstimatedHeight - 8);
    }

    // Programar la apertura del tooltip tras 1000 ms
    tooltipTimerRef.current = setTimeout(() => {
      setTooltip({
        x,
        y,
        alumnoNombre,
        tituloColumna,
        subtituloColumna,
        notaMedia,
        evidencias,
        esMediaGlobal,
      });
      tooltipTimerRef.current = null;
    }, 1000);
  };

  const handleCellMouseLeave = () => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  };

  if (!grupo) {
    return (
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-8 text-center max-w-2xl mx-auto">
        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">Ningún curso seleccionado</h3>
        <p className="text-xs text-slate-500 mt-1">
          Por favor, selecciona un curso o grupo en el selector superior de la cabecera para ver sus actividades y calificaciones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Barra superior: Modos de evaluación (Caso A / Caso B) y controles de vista */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
              <TableIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Evaluación de Actividades</span>
                <span className="text-[11px] font-normal text-slate-400">— {grupo.nombre}</span>
              </h2>
              <p className="text-xs text-slate-500">
                {alumnos.length} alumnos • {criterios.length} criterios • {actividades.length} actividades • {secciones.length} secciones
              </p>
            </div>
          </div>
        </div>

        {/* Selector de Caso A vs Caso B y vistas */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Switch: Caso A (Criterios) vs Caso B (Secciones) */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setModoEvaluacion('criterios')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                modoEvaluacion === 'criterios'
                  ? 'bg-white shadow-xs text-indigo-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Caso A: Evaluar exclusivamente por criterios de evaluación LOMLOE"
            >
              <Target className="w-3.5 h-3.5 text-indigo-600" />
              <span>Por Criterios (Caso A)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (secciones.length === 0) {
                  window.alert(
                    'Este grupo no dispone de secciones en public.secciones. Puedes evaluar por criterios (Caso A) o configurar secciones para este curso.'
                  );
                  return;
                }
                setModoEvaluacion('secciones');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                modoEvaluacion === 'secciones'
                  ? 'bg-white shadow-xs text-indigo-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              } ${secciones.length === 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
              title={
                secciones.length === 0
                  ? 'Sin secciones registradas para este grupo'
                  : 'Caso B: Evaluar con secciones'
              }
            >
              <FolderTree className="w-3.5 h-3.5 text-indigo-600" />
              <span>Con Secciones (Caso B)</span>
              {secciones.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-mono">
                  {secciones.length}
                </span>
              )}
            </button>
          </div>

          {/* Alternar vista de Tabla vs Catálogo de Actividades */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setVistaActiva('tabla')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                vistaActiva === 'tabla'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Ver la tabla de evaluación con notas y evidencias"
            >
              Tabla de Notas
            </button>
            <button
              type="button"
              onClick={() => setVistaActiva('catalogo')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                vistaActiva === 'catalogo'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Ver el catálogo de actividades con casillas de selección"
            >
              Catálogo de Actividades ({actividades.length})
            </button>
          </div>
        </div>
      </div>

      {/* 2. VISTA PRINCIPAL: TABLA DE EVALUACIÓN (CASO A O CASO B) */}
      {vistaActiva === 'tabla' && (
        <div className="space-y-3">
          {/* Barra de utilidades sobre la tabla */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={busquedaAlumno}
                  onChange={(e) => setBusquedaAlumno(e.target.value)}
                  placeholder="Buscar alumno en la tabla..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>

              {busquedaAlumno && (
                <button
                  type="button"
                  onClick={() => setBusquedaAlumno('')}
                  className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>
                Pasa el cursor por encima de cualquier nota media para ver su <strong>toolkit con las evidencias</strong> (título, fecha e instrumento).
              </span>
            </div>
          </div>

          {/* Caso A: Tabla por Criterios */}
          {modoEvaluacion === 'criterios' && (
            <div className="bg-white rounded-xl border-2 border-slate-300 shadow-sm overflow-hidden">
              {criterios.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <Target className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No hay criterios registrados en este curso</p>
                  <p className="text-xs text-slate-500 mt-1">
                    La tabla public.criterios no contiene criterios de evaluación para el grupo {grupo.nombre}.
                  </p>
                </div>
              ) : alumnos.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No hay alumnos matriculados</p>
                  <p className="text-xs text-slate-500 mt-1">La tabla public.alumnos no contiene registros.</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[72vh] relative overscroll-x-contain">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-800 font-bold border-b-2 border-slate-300 sticky top-0 z-30 shadow-xs">
                      <tr>
                        {/* Columna 1: Lista de Alumnos (Fija a la izquierda) */}
                        <th
                          scope="col"
                          className="py-3 px-2.5 sm:px-3.5 min-w-[130px] sm:min-w-[170px] md:min-w-[210px] max-w-[150px] sm:max-w-[200px] md:max-w-[240px] sticky left-0 z-40 bg-slate-200 border-r-2 border-slate-300 shadow-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="uppercase tracking-wider text-[11px] text-slate-900 font-extrabold">Alumno</span>
                            <span className="text-[10px] font-mono text-slate-600 font-semibold hidden sm:inline">
                              {alumnosFiltrados.length} alumnos
                            </span>
                          </div>
                        </th>

                        {/* Columna Extra (Caso A): Nota media de los criterios con selector de período (NO STICKY) */}
                        <th
                          scope="col"
                          className="py-2 px-2 sm:px-3 min-w-[95px] sm:min-w-[120px] md:min-w-[140px] max-w-[110px] sm:max-w-[135px] md:max-w-[150px] bg-indigo-100/90 text-indigo-950 border-r-2 border-indigo-300 text-center"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-950 uppercase tracking-wide">
                              <Award className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                              <span className="truncate">Nota Media</span>
                            </div>
                            {/* Selector de período requerido: 1º Ev, 2º Ev, 3º Ev o Global */}
                            <select
                              id="selector-periodo-media-criterios"
                              value={periodoMediaExtra}
                              onChange={(e) =>
                                setPeriodoMediaExtra(
                                  e.target.value as '1.º Ev' | '2.º Ev' | '3.º Ev' | 'Global'
                                )
                              }
                              className="text-[10px] sm:text-[11px] font-bold bg-white border border-indigo-300 rounded-md px-1 sm:px-1.5 py-0.5 text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                              title="Seleccionar el período para el cálculo de la nota media de los criterios"
                            >
                              <option value="1.º Ev">1.º Ev</option>
                              <option value="2.º Ev">2.º Ev</option>
                              <option value="3.º Ev">3.º Ev</option>
                              <option value="Global">Global</option>
                            </select>
                          </div>
                        </th>

                        {/* Columnas siguientes: Un criterio de evaluación por columna */}
                        {criterios.map((criterio) => {
                          const tienePond =
                            criterio.ponderacion !== null &&
                            criterio.ponderacion !== undefined &&
                            criterio.ponderacion > 0;

                          return (
                            <th
                              key={criterio.id}
                              scope="col"
                              className="py-2 px-1.5 sm:px-2.5 min-w-[70px] sm:min-w-[85px] md:min-w-[105px] max-w-[85px] sm:max-w-[105px] md:max-w-[125px] text-center border-r border-slate-300 hover:bg-slate-200/70 transition-colors"
                              title={`${criterio.codigo}: ${criterio.descripcion || 'Sin descripción'}`}
                            >
                              <div className="flex flex-col items-center">
                                <span className="font-mono text-[11px] sm:text-xs font-bold text-slate-900">
                                  {criterio.codigo}
                                  {tienePond ? (
                                    <span className="hidden sm:inline">{` / ${criterio.ponderacion}%`}</span>
                                  ) : (
                                    ''
                                  )}
                                </span>
                                <span className="text-[9px] sm:text-[10px] text-slate-500 font-medium truncate max-w-[65px] sm:max-w-[95px]">
                                  {criterio.descripcion || 'Criterio'}
                                </span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-300 bg-white">
                      {alumnosFiltrados.map((alumno, index) => {
                        const mediaExtra = calcularMediaExtraCriterios(alumno.id, periodoMediaExtra);

                        return (
                          <tr
                            key={alumno.id}
                            className={`hover:bg-indigo-50/60 transition-colors ${
                              index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'
                            }`}
                          >
                            {/* Alumno (Columna izquierda fija) */}
                            <td
                              className={`py-2.5 px-2.5 sm:px-3.5 sticky left-0 z-20 ${
                                index % 2 === 0 ? 'bg-white' : 'bg-slate-100'
                              } border-r-2 border-slate-300 font-semibold text-slate-900 shadow-xs min-w-[130px] sm:min-w-[170px] md:min-w-[210px] max-w-[150px] sm:max-w-[200px] md:max-w-[240px]`}
                            >
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <span className="text-[10px] font-mono text-slate-400 w-4 sm:w-5 text-right shrink-0">
                                  {alumno.orden || index + 1}
                                </span>
                                <span className="truncate text-xs font-semibold text-slate-800" title={alumno.nombre}>
                                  {alumno.nombre}
                                </span>
                              </div>
                            </td>

                            {/* Columna Extra: Nota Media de Criterios (NO STICKY) */}
                            <td
                              className="py-2 px-1.5 sm:px-2.5 text-center bg-indigo-50/70 border-r-2 border-indigo-200 font-mono text-xs font-bold cursor-help"
                              onMouseEnter={(e) => {
                                const evs = mediaExtra.criteriosConNota.flatMap((item) =>
                                  getEvidenciasCriterio(alumno.id, item.criterio.codigo, periodoMediaExtra)
                                );
                                handleCellMouseEnter(
                                  e,
                                  alumno.nombre,
                                  `Media de Criterios (${periodoMediaExtra})`,
                                  `${mediaExtra.criteriosConNota.length} de ${criterios.length} criterios evaluados`,
                                  evs,
                                  mediaExtra.media,
                                  true
                                );
                              }}
                              onMouseLeave={handleCellMouseLeave}
                              tabIndex={0}
                              onFocus={(e) => {
                                const evs = mediaExtra.criteriosConNota.flatMap((item) =>
                                  getEvidenciasCriterio(alumno.id, item.criterio.codigo, periodoMediaExtra)
                                );
                                handleCellMouseEnter(
                                  e,
                                  alumno.nombre,
                                  `Media de Criterios (${periodoMediaExtra})`,
                                  `${mediaExtra.criteriosConNota.length} de ${criterios.length} criterios evaluados`,
                                  evs,
                                  mediaExtra.media,
                                  true
                                );
                              }}
                              onBlur={handleCellMouseLeave}
                            >
                              {mediaExtra.media !== null ? (
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                    mediaExtra.media >= 7
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : mediaExtra.media >= 5
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {mediaExtra.media.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">—</span>
                              )}
                            </td>

                            {/* Celdas de cada Criterio */}
                            {criterios.map((criterio) => {
                              const evidencias = getEvidenciasCriterio(alumno.id, criterio.codigo);
                              const mediaNota = calcularMediaEvidencias(evidencias);

                              return (
                                <td
                                  key={criterio.id}
                                  className="py-2 px-2 text-center border-r border-slate-200 font-mono text-xs transition-colors hover:bg-indigo-50/70 cursor-help"
                                  onMouseEnter={(e) =>
                                    handleCellMouseEnter(
                                      e,
                                      alumno.nombre,
                                      `Criterio ${criterio.codigo}`,
                                      criterio.descripcion || undefined,
                                      evidencias,
                                      mediaNota
                                    )
                                  }
                                  onMouseLeave={handleCellMouseLeave}
                                  tabIndex={0}
                                  onFocus={(e) =>
                                    handleCellMouseEnter(
                                      e,
                                      alumno.nombre,
                                      `Criterio ${criterio.codigo}`,
                                      criterio.descripcion || undefined,
                                      evidencias,
                                      mediaNota
                                    )
                                  }
                                  onBlur={handleCellMouseLeave}
                                >
                                  {mediaNota !== null ? (
                                    <span
                                      className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                        mediaNota >= 7
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : mediaNota >= 5
                                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}
                                    >
                                      {mediaNota.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-mono text-xs">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Caso B: Tabla con Secciones */}
          {modoEvaluacion === 'secciones' && (
            <div className="bg-white rounded-xl border-2 border-slate-300 shadow-sm overflow-hidden">
              {secciones.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <FolderTree className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No hay secciones en este curso</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Este grupo no tiene secciones registradas en public.secciones.
                  </p>
                  <button
                    type="button"
                    onClick={() => setModoEvaluacion('criterios')}
                    className="mt-3 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-colors cursor-pointer"
                  >
                    Evaluar por Criterios (Caso A)
                  </button>
                </div>
              ) : alumnos.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No hay alumnos matriculados</p>
                  <p className="text-xs text-slate-500 mt-1">La tabla public.alumnos no contiene registros.</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[72vh] relative overscroll-x-contain">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-800 font-bold border-b-2 border-slate-300 sticky top-0 z-30 shadow-xs">
                      <tr>
                        {/* Columna izquierda fija: Alumno */}
                        <th
                          scope="col"
                          className="py-3 px-2.5 sm:px-3.5 min-w-[130px] sm:min-w-[170px] md:min-w-[210px] max-w-[150px] sm:max-w-[200px] md:max-w-[240px] sticky left-0 z-40 bg-slate-200 border-r-2 border-slate-300 shadow-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="uppercase tracking-wider text-[11px] text-slate-900 font-extrabold">Alumno</span>
                            <span className="text-[10px] font-mono text-slate-600 font-semibold hidden sm:inline">
                              {alumnosFiltrados.length} alumnos
                            </span>
                          </div>
                        </th>

                        {/* Columna Extra (Caso B): Nota Media Global de Secciones (NO STICKY) */}
                        <th
                          scope="col"
                          className="py-2 px-2 sm:px-3 min-w-[95px] sm:min-w-[120px] md:min-w-[140px] max-w-[110px] sm:max-w-[135px] md:max-w-[150px] bg-indigo-100/90 text-indigo-950 border-r-2 border-indigo-300 text-center"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-950 uppercase tracking-wide">
                              <Award className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                              <span className="truncate">Media Secciones</span>
                            </div>
                            <select
                              id="selector-periodo-media-secciones"
                              value={periodoMediaExtra}
                              onChange={(e) =>
                                setPeriodoMediaExtra(
                                  e.target.value as '1.º Ev' | '2.º Ev' | '3.º Ev' | 'Global'
                                )
                              }
                              className="text-[10px] sm:text-[11px] font-bold bg-white border border-indigo-300 rounded-md px-1 sm:px-1.5 py-0.5 text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                              title="Seleccionar el período de evaluación"
                            >
                              <option value="1.º Ev">1.º Ev</option>
                              <option value="2.º Ev">2.º Ev</option>
                              <option value="3.º Ev">3.º Ev</option>
                              <option value="Global">Global</option>
                            </select>
                          </div>
                        </th>

                        {/* Columnas de cada Sección */}
                        {secciones.map((sec) => {
                          const tienePond =
                            sec.ponderacion !== null &&
                            sec.ponderacion !== undefined &&
                            sec.ponderacion > 0;

                          return (
                            <th
                              key={sec.id}
                              scope="col"
                              className="py-2.5 px-2 sm:px-3 min-w-[85px] sm:min-w-[110px] md:min-w-[130px] max-w-[110px] sm:max-w-[140px] md:max-w-[160px] text-center border-r border-slate-300 hover:bg-slate-200/70 transition-colors"
                              title={`Sección: ${sec.nombre}`}
                            >
                              <div className="flex flex-col items-center">
                                <span className="text-[11px] sm:text-xs font-bold text-slate-900 truncate max-w-[80px] sm:max-w-[125px]">
                                  {sec.nombre}
                                  {tienePond ? (
                                    <span className="hidden sm:inline">{` / ${sec.ponderacion}%`}</span>
                                  ) : (
                                    ''
                                  )}
                                </span>
                                {sec.color && (
                                  <span
                                    className="w-6 sm:w-8 h-1 rounded-full mt-1"
                                    style={{ backgroundColor: sec.color }}
                                  />
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-300 bg-white">
                      {alumnosFiltrados.map((alumno, index) => {
                        const mediaSecExtra = calcularMediaExtraSecciones(alumno.id, periodoMediaExtra);

                        return (
                          <tr
                            key={alumno.id}
                            className={`hover:bg-indigo-50/60 transition-colors ${
                              index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'
                            }`}
                          >
                            {/* Alumno (Columna izquierda fija) */}
                            <td
                              className={`py-2.5 px-2.5 sm:px-3.5 sticky left-0 z-20 ${
                                index % 2 === 0 ? 'bg-white' : 'bg-slate-100'
                              } border-r-2 border-slate-300 font-semibold text-slate-900 shadow-xs min-w-[130px] sm:min-w-[170px] md:min-w-[210px] max-w-[150px] sm:max-w-[200px] md:max-w-[240px]`}
                            >
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <span className="text-[10px] font-mono text-slate-400 w-4 sm:w-5 text-right shrink-0">
                                  {alumno.orden || index + 1}
                                </span>
                                <span className="truncate text-xs font-semibold text-slate-800" title={alumno.nombre}>
                                  {alumno.nombre}
                                </span>
                              </div>
                            </td>

                            {/* Columna Extra: Media Secciones (NO STICKY) */}
                            <td
                              className="py-2 px-1.5 sm:px-2.5 text-center bg-indigo-50/70 border-r-2 border-indigo-200 font-mono text-xs font-bold cursor-help"
                              onMouseEnter={(e) => {
                                const evs = mediaSecExtra.seccionesConNota.flatMap((item) =>
                                  getEvidenciasSeccion(alumno.id, item.seccion.id, periodoMediaExtra)
                                );
                                handleCellMouseEnter(
                                  e,
                                  alumno.nombre,
                                  `Media de Secciones (${periodoMediaExtra})`,
                                  `${mediaSecExtra.seccionesConNota.length} de ${secciones.length} secciones evaluadas`,
                                  evs,
                                  mediaSecExtra.media,
                                  true
                                );
                              }}
                              onMouseLeave={handleCellMouseLeave}
                              tabIndex={0}
                              onFocus={(e) => {
                                const evs = mediaSecExtra.seccionesConNota.flatMap((item) =>
                                  getEvidenciasSeccion(alumno.id, item.seccion.id, periodoMediaExtra)
                                );
                                handleCellMouseEnter(
                                  e,
                                  alumno.nombre,
                                  `Media de Secciones (${periodoMediaExtra})`,
                                  `${mediaSecExtra.seccionesConNota.length} de ${secciones.length} secciones evaluadas`,
                                  evs,
                                  mediaSecExtra.media,
                                  true
                                );
                              }}
                              onBlur={handleCellMouseLeave}
                            >
                              {mediaSecExtra.media !== null ? (
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                    mediaSecExtra.media >= 7
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : mediaSecExtra.media >= 5
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {mediaSecExtra.media.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">—</span>
                              )}
                            </td>

                            {/* Celdas de cada Sección */}
                            {secciones.map((sec) => {
                              const evidencias = getEvidenciasSeccion(alumno.id, sec.id);
                              const mediaNota = calcularMediaEvidencias(evidencias);

                              return (
                                <td
                                  key={sec.id}
                                  className="py-2 px-3 text-center border-r border-slate-200 font-mono text-xs transition-colors hover:bg-indigo-50/70 cursor-help"
                                  onMouseEnter={(e) =>
                                    handleCellMouseEnter(
                                      e,
                                      alumno.nombre,
                                      `Sección: ${sec.nombre}`,
                                      sec.ponderacion ? `Ponderación: ${sec.ponderacion}%` : undefined,
                                      evidencias,
                                      mediaNota
                                    )
                                  }
                                  onMouseLeave={handleCellMouseLeave}
                                  tabIndex={0}
                                  onFocus={(e) =>
                                    handleCellMouseEnter(
                                      e,
                                      alumno.nombre,
                                      `Sección: ${sec.nombre}`,
                                      sec.ponderacion ? `Ponderación: ${sec.ponderacion}%` : undefined,
                                      evidencias,
                                      mediaNota
                                    )
                                  }
                                  onBlur={handleCellMouseLeave}
                                >
                                  {mediaNota !== null ? (
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                        mediaNota >= 7
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : mediaNota >= 5
                                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}
                                    >
                                      {mediaNota.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-mono text-xs">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. VISTA SECUNDARIA: CATÁLOGO DETALLADO DE ACTIVIDADES */}
      {vistaActiva === 'catalogo' && (
        <div className="space-y-4">
          {/* Mensaje de feedback si hubo eliminación */}
          {deleteActsFeedback && (
            <div
              className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs animate-in fade-in ${
                deleteActsFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {deleteActsFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className="font-medium">{deleteActsFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setDeleteActsFeedback(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-semibold text-slate-800">
                Catálogo: Mostrando {actividadesCatalogo.length} de {actividades.length} actividades
              </span>

              {/* Casilla de selección general: Seleccionar todas */}
              {actividadesCatalogo.length > 0 && (
                <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer select-none text-[11px] font-semibold text-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={
                      actividadesCatalogo.length > 0 &&
                      actividadesSeleccionadas.size === actividadesCatalogo.length
                    }
                    onChange={handleToggleSeleccionarTodasActs}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>
                    {actividadesSeleccionadas.size === actividadesCatalogo.length
                      ? 'Deseleccionar todas'
                      : `Seleccionar todas (${actividadesCatalogo.length})`}
                  </span>
                </label>
              )}

              {/* Botón de acción para eliminar seleccionadas */}
              {actividadesSeleccionadas.size > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in">
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold text-[11px]">
                    {actividadesSeleccionadas.size} seleccionada{actividadesSeleccionadas.size > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmandoEliminarActs(true)}
                    disabled={isDeletingActs}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    title="Eliminar las actividades seleccionadas del cuaderno"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar seleccionadas ({actividadesSeleccionadas.size})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActividadesSeleccionadas(new Set())}
                    className="text-[11px] text-slate-500 hover:text-slate-700 font-medium cursor-pointer underline"
                  >
                    Cancelar selección
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro por período de cabecera */}
              <button
                type="button"
                onClick={() => setSoloPeriodoActual(!soloPeriodoActual)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  soloPeriodoActual
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                title="Filtrar por el período de evaluación activo"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Filtro {selectedEvaluacion}: {soloPeriodoActual ? 'Activo' : 'Inactivo'}</span>
              </button>

              {/* Selector de sección */}
              {secciones.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <label htmlFor="filtro-seccion-catalogo" className="text-xs font-medium text-slate-500">
                    Sección:
                  </label>
                  <select
                    id="filtro-seccion-catalogo"
                    value={filtroSeccion}
                    onChange={(e) => setFiltroSeccion(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="todas">Todas las secciones</option>
                    <option value="sin_seccion">Sin sección</option>
                    {secciones.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {actividadesCatalogo.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 bg-white">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No hay actividades para el filtro seleccionado</p>
              {soloPeriodoActual && (
                <button
                  type="button"
                  onClick={() => setSoloPeriodoActual(false)}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition-colors cursor-pointer"
                >
                  Ver todas las actividades del curso
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {actividadesCatalogo.map((act) => {
                const seccion = act.seccion_id ? seccionesMap.get(act.seccion_id) : null;
                const esConfirmada = act.estadoVinculacion === 'rubrica_confirmada';
                const isSelected = actividadesSeleccionadas.has(act.id);

                return (
                  <div
                    key={act.id}
                    className={`p-4 rounded-xl border transition-all shadow-2xs space-y-2.5 ${
                      isSelected
                        ? 'border-indigo-400 bg-indigo-50/40 ring-1 ring-indigo-400'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Casilla de selección individual */}
                        <label
                          className="flex items-center cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"
                          title={`Seleccionar actividad ${act.nombre}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleActividad(act.id)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            aria-label={`Seleccionar actividad ${act.nombre}`}
                          />
                        </label>

                        <h4 className="text-sm font-bold text-slate-900">{act.nombre}</h4>
                        {act.tipo && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                            {act.tipo}
                          </span>
                        )}
                        {act.evaluacion_periodo && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {act.evaluacion_periodo}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        {seccion && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                            <FolderTree className="w-3 h-3 text-slate-400" />
                            {seccion.nombre}
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-slate-400">ID: {act.id}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {esConfirmada ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Rúbrica verificada
                          </span>
                        ) : act.rubrica_id ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Rúbrica no resuelta
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                            Sin rúbrica
                          </span>
                        )}

                        {Array.isArray(act.criteriosCodigos) && act.criteriosCodigos.length > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">Criterios:</span>
                            <div className="flex flex-wrap gap-1">
                              {act.criteriosCodigos.slice().sort(compararCodigosCriterio).map((cod) => (
                                <span
                                  key={cod}
                                  className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-mono text-[11px] font-semibold border border-indigo-200"
                                >
                                  {cod}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-700 italic">
                            {act.advertenciaRubrica || 'Vinculación con criterios pendiente de verificar'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {act.rubrica_id && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('rubricas')}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors cursor-pointer"
                            title="Ver rúbrica asociada en la pestaña Rúbricas"
                          >
                            <TableIcon className="w-3.5 h-3.5 text-purple-600" />
                            <span>Evaluar con Rúbrica</span>
                          </button>
                        )}
                        {act.metodo && (
                          <span className="text-[11px] text-slate-500 font-mono">
                            Método: <span className="font-semibold text-slate-700">{act.metodo}</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setActividadesSeleccionadas(new Set([act.id]));
                            setConfirmandoEliminarActs(true);
                          }}
                          className="inline-flex items-center justify-center p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title={`Eliminar actividad "${act.nombre}"`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal de confirmación para eliminar actividades seleccionadas */}
          {confirmandoEliminarActs && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
            >
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150 text-slate-800">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-900">
                      ¿Eliminar {actividadesSeleccionadas.size} actividad{actividadesSeleccionadas.size > 1 ? 'es' : ''}?
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Esta acción eliminará de forma permanente las <strong>{actividadesSeleccionadas.size}</strong> actividades seleccionadas en el cuaderno y sus calificaciones asociadas.
                    </p>
                    <p className="text-[11px] text-rose-600 font-semibold">
                      ⚠️ Esta acción no se puede deshacer.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 text-xs">
                  <button
                    type="button"
                    onClick={() => setConfirmandoEliminarActs(false)}
                    disabled={isDeletingActs}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleEjecutarEliminarActs}
                    disabled={isDeletingActs}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {isDeletingActs ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Eliminando...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Sí, eliminar {actividadesSeleccionadas.size} actividad{actividadesSeleccionadas.size > 1 ? 'es' : ''}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. TOOLKIT / TOOLTIP FLOTANTE CON EVIDENCIAS */}
      {tooltip && (
        <div
          style={{ top: `${tooltip.y}px`, left: `${tooltip.x}px` }}
          className="fixed z-50 pointer-events-none w-80 max-w-sm bg-slate-900/95 backdrop-blur text-white text-xs rounded-xl shadow-2xl border border-slate-700/80 p-3.5 space-y-2.5 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Cabecera del Tooltip */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
            <div>
              <p className="font-bold text-slate-100 text-xs leading-snug">{tooltip.alumnoNombre}</p>
              <p className="text-[11px] text-indigo-300 font-medium mt-0.5">
                {tooltip.tituloColumna}
              </p>
              {tooltip.subtituloColumna && (
                <p className="text-[10px] text-slate-400 truncate max-w-[200px]" title={tooltip.subtituloColumna}>
                  {tooltip.subtituloColumna}
                </p>
              )}
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Nota media</span>
              {tooltip.notaMedia !== null ? (
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold font-mono ${
                    tooltip.notaMedia >= 7
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : tooltip.notaMedia >= 5
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {tooltip.notaMedia.toFixed(2)}
                </span>
              ) : (
                <span className="text-slate-400 font-mono text-xs">Pendiente</span>
              )}
            </div>
          </div>

          {/* Lista de Evidencias */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
              <span>Evidencias tenidas en cuenta</span>
              <span className="text-[10px] font-mono text-indigo-400">
                {tooltip.evidencias.length} {tooltip.evidencias.length === 1 ? 'actividad' : 'actividades'}
              </span>
            </div>

            {tooltip.evidencias.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic bg-slate-800/60 p-2.5 rounded-lg border border-slate-800">
                No hay actividades calificadas todavía para este elemento.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {tooltip.evidencias.map((ev, i) => (
                  <div
                    key={`${ev.actividadId}_${i}`}
                    className="p-2 rounded-lg bg-slate-800/70 border border-slate-700/60 space-y-1"
                  >
                    {/* Título de la actividad */}
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-semibold text-slate-100 text-[11px] line-clamp-1" title={ev.actividadNombre}>
                        {ev.actividadNombre}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-amber-300 shrink-0">
                        {ev.nota.toFixed(2)}
                      </span>
                    </div>

                    {/* Fecha de evaluación e Instrumento de evaluación */}
                    <div className="flex flex-col gap-0.5 text-[10px] text-slate-400">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Fecha:</span>
                        <span className="text-slate-300 font-mono">{ev.fechaEvaluacion}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Instrumento:</span>
                        <span className="text-indigo-300 truncate" title={ev.instrumento}>
                          {ev.instrumento}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
