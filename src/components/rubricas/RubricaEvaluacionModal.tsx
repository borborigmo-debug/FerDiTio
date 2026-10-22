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
  CalificacionApartado,
} from '../../types';
import {
  normalizeRubrica,
  isValidUuid,
  parseRubricaItems,
  compararCodigosCriterio,
} from '../../utils/rubricaUtils';
import {
  guardarCalificacionesEvaluacion,
  guardarCalificacionesApartados,
} from '../../services/calificacionesService';
import { asegurarYPersistirRubricaUuids } from '../../services/rubricasService';
import { useCuaderno } from '../../context/CuadernoContext';
import {
  User,
  X,
  Dices,
  Save,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Trash2,
  RotateCcw,
  Check,
  ChevronDown,
  Info,
  Scale,
} from 'lucide-react';

interface RubricaEvaluacionModalProps {
  rubrica: Rubrica;
  alumnos: Alumno[];
  criterios: Criterio[];
  actividades: ActividadDetalle[];
  calificaciones: Calificacion[];
  calificacionesApartados?: CalificacionApartado[];
  grupoId: string;
  onClose: () => void;
  onUpdateCalificaciones: (nuevasCalificaciones: Calificacion[]) => void;
  onUpdateCalificacionesApartados?: (nuevas: CalificacionApartado[]) => void;
  onUpdateRubrica?: (rubricaActualizada: Rubrica) => void;
  initialAlumnoId?: string;
  initialActividadId?: string;
}

interface ApartadoEvaluacion {
  apartadoId: string;
  edicionKey: string;
  visualId: string;
  numero: string;
  titulo: string;
  criteriosCodigos: string[];
  peso: number | null;
  descriptores: Record<string, string>;
}

type RatingScaleMode = 'standard5' | 'standard4';

export const RubricaEvaluacionModal: React.FC<RubricaEvaluacionModalProps> = ({
  rubrica: rubricaRaw,
  alumnos,
  criterios,
  actividades,
  calificaciones,
  calificacionesApartados = [],
  grupoId,
  onClose,
  onUpdateCalificaciones,
  onUpdateCalificacionesApartados,
  onUpdateRubrica,
  initialAlumnoId,
  initialActividadId,
}) => {
  const { setHasUnsavedChanges, selectedGrupo, eliminarActividades: contextEliminarActividades } = useCuaderno();

  // Estado local sincronizado de la rúbrica
  const [rubricaActiva, setRubricaActiva] = useState<Rubrica>(rubricaRaw);

  useEffect(() => {
    setRubricaActiva(rubricaRaw);
  }, [rubricaRaw]);

  // Asegurar persistencia de UUIDs
  useEffect(() => {
    let cancelado = false;
    async function verificarYPersistirUuids() {
      const itemsRaw = parseRubricaItems(rubricaRaw.items);
      const faltanUuids = itemsRaw.some((it: any) => !isValidUuid(it?.id));
      if (!faltanUuids) return;

      try {
        const persistida = await asegurarYPersistirRubricaUuids(grupoId, rubricaRaw);
        if (!cancelado) {
          setRubricaActiva(persistida);
          if (onUpdateRubrica) {
            onUpdateRubrica(persistida);
          }
        }
      } catch (err) {
        console.warn('[RubricaEvaluacionModal] Error al sincronizar UUIDs en segundo plano:', err);
      }
    }

    verificarYPersistirUuids();
    return () => {
      cancelado = true;
    };
  }, [grupoId, rubricaRaw, onUpdateRubrica]);

  // Normalizar rúbrica
  const rubrica = useMemo(() => normalizeRubrica(rubricaActiva), [rubricaActiva]);

  // Actividades asociadas a esta rúbrica
  const actividadesAsociadas = useMemo(() => {
    return (actividades || []).filter((a) => a.rubrica_id === rubrica.id);
  }, [actividades, rubrica.id]);

  const [actividadSeleccionadaId, setActividadSeleccionadaId] = useState<string | null>(() => {
    if (initialActividadId && actividadesAsociadas.some((a) => a.id === initialActividadId)) {
      return initialActividadId;
    }
    return actividadesAsociadas.length > 0 ? actividadesAsociadas[0].id : null;
  });

  // Apartados evaluables
  const apartadosEvaluables: ApartadoEvaluacion[] = useMemo(() => {
    return rubrica.items.map((it, idx) => {
      const apId =
        (it.uuid && it.uuid.trim()) ||
        (isValidUuid(it.raw?.id) ? it.raw.id.trim() : '') ||
        (isValidUuid(it.id) ? it.id.trim() : '');

      const histId = it.legacyId || it.raw?.legacyId || it.id;
      const edKey = apId || (histId ? String(histId).trim() : `item_${idx}`);

      return {
        apartadoId: apId,
        edicionKey: edKey,
        visualId: histId,
        numero: it.numero || (it.raw?.numero ? String(it.raw.numero) : String(idx + 1)),
        titulo: it.titulo,
        criteriosCodigos: it.criterios || [],
        peso: it.peso,
        descriptores: it.descriptores || {},
      };
    });
  }, [rubrica]);

  // Mapa de criterios
  const criteriosMap = useMemo(() => {
    return new Map<string, Criterio>((criterios || []).map((c) => [c.codigo, c]));
  }, [criterios]);

  // Alumnos ordenados
  const alumnosOrdenados = useMemo(() => {
    return [...(alumnos || [])].sort((a, b) => {
      if (a.orden !== undefined && b.orden !== undefined) {
        return a.orden - b.orden;
      }
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
  }, [alumnos]);

  // Opciones de selección de alumno: "pendiente" y "aleatorio" (independientes o combinables)
  const [modoPendiente, setModoPendiente] = useState<boolean>(false);
  const [modoAleatorio, setModoAleatorio] = useState<boolean>(false);

  // Casillas de selección por actividad (para eliminar o enfocar selección de alumno pendiente)
  const [actividadesSeleccionadas, setActividadesSeleccionadas] = useState<Set<string>>(new Set());

  // Alumno activo actual
  const [alumnoActualId, setAlumnoActualId] = useState<string>(() => {
    if (initialAlumnoId && alumnosOrdenados.some((a) => a.id === initialAlumnoId)) {
      return initialAlumnoId;
    }
    return alumnosOrdenados[0]?.id || '';
  });

  // Escala de botones: estándar 5 notas (0, 3, 5, 7, 10) vs 4 notas (0, 4, 7, 10)
  const [escalaMode, setEscalaMode] = useState<RatingScaleMode>('standard5');

  // Calificaciones locales del alumno actual
  const [calificacionesEdicion, setCalificacionesEdicion] = useState<Record<string, number | null>>({});
  const [hasModificacionesSinGuardar, setHasModificacionesSinGuardar] = useState<boolean>(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Modales de confirmación
  const [showConfirmCeros, setShowConfirmCeros] = useState<boolean>(false);
  const [showConfirmSalir, setShowConfirmSalir] = useState<boolean>(false);
  const [showConfirmEliminarActividades, setShowConfirmEliminarActividades] = useState<boolean>(false);

  // Sincronizar aviso global
  useEffect(() => {
    setHasUnsavedChanges(hasModificacionesSinGuardar);
  }, [hasModificacionesSinGuardar, setHasUnsavedChanges]);

  // Cargar calificaciones del alumno seleccionado
  const cargarCalificacionesAlumno = useCallback(
    (alumnoId: string) => {
      const mapaInicial: Record<string, number | null> = {};
      apartadosEvaluables.forEach((item) => {
        const cal = calificacionesApartados.find(
          (ca) =>
            ca.alumno_id === alumnoId &&
            ca.rubrica_id === rubrica.id &&
            (ca.apartado_id === item.apartadoId || (item.visualId && ca.apartado_id === item.visualId)) &&
            (actividadSeleccionadaId ? ca.actividad_id === actividadSeleccionadaId : !ca.actividad_id)
        );

        if (cal && cal.nota !== null && cal.nota !== undefined && !isNaN(Number(cal.nota))) {
          mapaInicial[item.edicionKey] = Number(cal.nota);
        } else {
          mapaInicial[item.edicionKey] = null;
        }
      });
      setCalificacionesEdicion(mapaInicial);
      setHasModificacionesSinGuardar(false);
      setHasUnsavedChanges(false);
    },
    [apartadosEvaluables, calificacionesApartados, rubrica.id, actividadSeleccionadaId, setHasUnsavedChanges]
  );

  useEffect(() => {
    if (alumnoActualId) {
      cargarCalificacionesAlumno(alumnoActualId);
    }
  }, [alumnoActualId, actividadSeleccionadaId, cargarCalificacionesAlumno]);

  const alumnoActual = useMemo(() => {
    return alumnosOrdenados.find((a) => a.id === alumnoActualId) || alumnosOrdenados[0];
  }, [alumnosOrdenados, alumnoActualId]);

  const indexActual = useMemo(() => {
    return alumnosOrdenados.findIndex((a) => a.id === alumnoActualId);
  }, [alumnosOrdenados, alumnoActualId]);

  // Diagnóstico del estado de evaluación de cada alumno
  const alumnosEstadoMap = useMemo(() => {
    const map = new Map<string, { esPendiente: boolean; evidenciasCompletadas: number; totalEvidencias: number }>();

    alumnosOrdenados.forEach((al) => {
      let completadas = 0;
      apartadosEvaluables.forEach((item) => {
        const cal = calificacionesApartados.find(
          (ca) =>
            ca.alumno_id === al.id &&
            ca.rubrica_id === rubrica.id &&
            ((item.apartadoId && ca.apartado_id === item.apartadoId) || (item.visualId && ca.apartado_id === item.visualId)) &&
            (actividadSeleccionadaId ? ca.actividad_id === actividadSeleccionadaId : !ca.actividad_id)
        );
        if (cal && cal.nota !== null && cal.nota !== undefined && !isNaN(Number(cal.nota))) {
          completadas++;
        }
      });

      const esPendiente = completadas < apartadosEvaluables.length;
      map.set(al.id, {
        esPendiente,
        evidenciasCompletadas: completadas,
        totalEvidencias: apartadosEvaluables.length,
      });
    });

    return map;
  }, [alumnosOrdenados, apartadosEvaluables, calificacionesApartados, rubrica.id, actividadSeleccionadaId]);

  // Botones de calificación
  const botonesCalificacion = useMemo(() => {
    if (escalaMode === 'standard4') {
      return [
        { valor: 0, label: '0', color: 'border-rose-300 text-rose-700 hover:bg-rose-50', active: 'bg-rose-600 text-white font-bold ring-1 ring-rose-400' },
        { valor: 4, label: '4', color: 'border-orange-300 text-orange-700 hover:bg-orange-50', active: 'bg-orange-500 text-white font-bold ring-1 ring-orange-300' },
        { valor: 7, label: '7', color: 'border-sky-300 text-sky-700 hover:bg-sky-50', active: 'bg-sky-600 text-white font-bold ring-1 ring-sky-300' },
        { valor: 10, label: '10', color: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50', active: 'bg-emerald-600 text-white font-bold ring-1 ring-emerald-300' },
      ];
    }
    return [
      { valor: 0, label: '0', color: 'border-rose-300 text-rose-700 hover:bg-rose-50', active: 'bg-rose-600 text-white font-bold ring-1 ring-rose-400' },
      { valor: 3, label: '3', color: 'border-orange-300 text-orange-700 hover:bg-orange-50', active: 'bg-orange-500 text-white font-bold ring-1 ring-orange-300' },
      { valor: 5, label: '5', color: 'border-amber-300 text-amber-700 hover:bg-amber-50', active: 'bg-amber-500 text-white font-bold ring-1 ring-amber-300' },
      { valor: 7, label: '7', color: 'border-sky-300 text-sky-700 hover:bg-sky-50', active: 'bg-sky-600 text-white font-bold ring-1 ring-sky-300' },
      { valor: 10, label: '10', color: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50', active: 'bg-emerald-600 text-white font-bold ring-1 ring-emerald-300' },
    ];
  }, [escalaMode]);

  // Selección de puntuación por apartado
  const handleTogglePuntuacion = (key: string, valor: number) => {
    setCalificacionesEdicion((prev) => {
      const actual = prev[key];
      const nueva = actual === valor ? null : valor;
      return {
        ...prev,
        [key]: nueva,
      };
    });
    setHasModificacionesSinGuardar(true);
    setHasUnsavedChanges(true);
    setMensajeExito(null);
    setMensajeError(null);
  };

  // Asignar 0 a todas las actividades
  const handlePonerCerosTodas = () => {
    const ceros: Record<string, number | null> = {};
    apartadosEvaluables.forEach((item) => {
      ceros[item.edicionKey] = 0;
    });
    setCalificacionesEdicion(ceros);
    setHasModificacionesSinGuardar(true);
    setHasUnsavedChanges(true);
    setShowConfirmCeros(false);
  };

  // Cambio seguro de alumno
  const cambiarAlumnoConSeguridad = (nuevoId: string) => {
    if (nuevoId === alumnoActualId) return;
    if (hasModificacionesSinGuardar) {
      const confirmacion = window.confirm(
        `Tienes calificaciones sin guardar para ${alumnoActual?.nombre}. ¿Deseas descartar los cambios y cambiar de alumno?`
      );
      if (!confirmacion) return;
    }
    setHasModificacionesSinGuardar(false);
    setHasUnsavedChanges(false);
    setAlumnoActualId(nuevoId);
  };

  /**
   * Determina los criterios de las actividades seleccionadas con la casilla,
   * o si no hay ninguna casilla marcada, de todas las actividades de la rúbrica.
   */
  const criteriosObjetivo = useMemo(() => {
    const codigos = new Set<string>();
    if (actividadesSeleccionadas.size > 0) {
      apartadosEvaluables.forEach((item) => {
        if (actividadesSeleccionadas.has(item.edicionKey)) {
          item.criteriosCodigos.forEach((c) => codigos.add(c));
        }
      });
    }

    // Fallback: si no hay casillas marcadas o no tienen criterios, usar los criterios de la rúbrica
    if (codigos.size === 0) {
      apartadosEvaluables.forEach((item) => {
        item.criteriosCodigos.forEach((c) => codigos.add(c));
      });
    }

    return Array.from(codigos);
  }, [apartadosEvaluables, actividadesSeleccionadas]);

  /**
   * Calcula el siguiente alumno según los modos "pendiente" y "aleatorio"
   */
  const obtenerSiguienteAlumnoId = useCallback(
    (pendiente: boolean, aleatorio: boolean): string | null => {
      if (alumnosOrdenados.length === 0) return null;
      if (alumnosOrdenados.length === 1) return alumnosOrdenados[0].id;

      // 1. Si está activo "pendiente": buscar alumno(s) con menos calificaciones en el criterio
      if (pendiente) {
        const critSet = new Set(criteriosObjetivo);

        // Contar cuántas notas tiene cada alumno en los criterios objetivo
        const conteos = alumnosOrdenados.map((al) => {
          let countNotas = 0;
          apartadosEvaluables.forEach((item) => {
            const tocaCriterio = item.criteriosCodigos.some((c) => critSet.has(c));
            if (tocaCriterio) {
              const cal = calificacionesApartados.find(
                (ca) =>
                  ca.alumno_id === al.id &&
                  ca.rubrica_id === rubrica.id &&
                  ((item.apartadoId && ca.apartado_id === item.apartadoId) || (item.visualId && ca.apartado_id === item.visualId)) &&
                  (actividadSeleccionadaId ? ca.actividad_id === actividadSeleccionadaId : true)
              );
              if (cal && cal.nota !== null && cal.nota !== undefined && !isNaN(Number(cal.nota))) {
                countNotas++;
              }
            }
          });
          return { alumnoId: al.id, countNotas };
        });

        // Encontrar el mínimo número de notas
        const minNotas = Math.min(...conteos.map((c) => c.countNotas));
        // Todos los alumnos que tienen ese mínimo
        let candidatos = conteos.filter((c) => c.countNotas === minNotas).map((c) => c.alumnoId);

        // Si hay varios candidatos y uno es el actual, priorizar a otros
        if (candidatos.length > 1) {
          const sinActual = candidatos.filter((id) => id !== alumnoActualId);
          if (sinActual.length > 0) candidatos = sinActual;
        }

        // Si además está activo "aleatorio", elegir aleatoriamente entre los candidatos con menos notas
        if (aleatorio) {
          const randIdx = Math.floor(Math.random() * candidatos.length);
          return candidatos[randIdx];
        }

        // Si solo está "pendiente", elegir el primero de la lista de candidatos
        return candidatos[0];
      }

      // 2. Si solo está activo "aleatorio" (sin "pendiente")
      if (aleatorio) {
        const alternativas = alumnosOrdenados.filter((a) => a.id !== alumnoActualId);
        if (alternativas.length === 0) return alumnosOrdenados[0].id;
        const randIdx = Math.floor(Math.random() * alternativas.length);
        return alternativas[randIdx].id;
      }

      // 3. Ni pendiente ni aleatorio: siguiente secuencial de la lista
      const siguienteIndex = (indexActual + 1) % alumnosOrdenados.length;
      return alumnosOrdenados[siguienteIndex].id;
    },
    [alumnosOrdenados, criteriosObjetivo, apartadosEvaluables, calificacionesApartados, rubrica.id, actividadSeleccionadaId, alumnoActualId, indexActual]
  );

  // Botón para aplicar la selección de alumno según las opciones activas
  const handleAplicarSeleccionAlumno = () => {
    const siguienteId = obtenerSiguienteAlumnoId(modoPendiente, modoAleatorio);
    if (siguienteId) {
      cambiarAlumnoConSeguridad(siguienteId);
    }
  };

  // Toggle de selección de actividad
  const handleToggleSeleccionActividad = (key: string) => {
    setActividadesSeleccionadas((prev) => {
      const copy = new Set(prev);
      if (copy.has(key)) copy.delete(key);
      else copy.add(key);
      return copy;
    });
  };

  // Eliminar actividades seleccionadas
  const handleConfirmarEliminarActividades = async () => {
    if (actividadesSeleccionadas.size === 0) return;
    try {
      // Filtrar items de la rúbrica activa
      const itemsRaw = parseRubricaItems(rubricaActiva.items);
      const itemsRestantes = itemsRaw.filter((it: any, idx: number) => {
        const edKey = (it.id && isValidUuid(it.id)) ? it.id : (it.legacyId || `item_${idx}`);
        return !actividadesSeleccionadas.has(edKey);
      });

      const rubricaActualizada: Rubrica = {
        ...rubricaActiva,
        items: itemsRestantes,
      };

      if (onUpdateRubrica) {
        onUpdateRubrica(rubricaActualizada);
      }
      setRubricaActiva(rubricaActualizada);
      setActividadesSeleccionadas(new Set());
      setShowConfirmEliminarActividades(false);
      setMensajeExito('Actividades seleccionadas eliminadas correctamente.');
    } catch (err: any) {
      console.error('[RubricaEvaluacionModal] Error al eliminar actividades:', err);
      setMensajeError(err?.message || 'Error al eliminar las actividades.');
    }
  };

  // Guardar y avanzar
  const handleGuardarCalificacion = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setMensajeError(null);
    setMensajeExito(null);

    try {
      let rubricaFinal = rubricaActiva;
      const itemsRaw = parseRubricaItems(rubricaFinal.items);
      const faltanUuids = itemsRaw.some((it: any) => !isValidUuid(it?.id));
      if (faltanUuids) {
        try {
          rubricaFinal = await asegurarYPersistirRubricaUuids(grupoId, rubricaFinal);
          setRubricaActiva(rubricaFinal);
          if (onUpdateRubrica) {
            onUpdateRubrica(rubricaFinal);
          }
        } catch (rubErr: any) {
          const detalle = rubErr?.message || 'Error de comunicación con el servidor';
          setMensajeError(`No se pueden guardar las calificaciones: error al confirmar identificadores (${detalle}).`);
          setIsSaving(false);
          return;
        }
      }

      const itemsFinalesRaw = parseRubricaItems(rubricaFinal.items);
      const listaNuevasNotasApartados: Array<{
        alumnoId: string;
        apartadoId: string;
        rubricaId: string;
        actividadId?: string | null;
        nota: number | null;
      }> = [];

      apartadosEvaluables.forEach((item, idx) => {
        const itemFinal = itemsFinalesRaw[idx];
        const apIdFinal = (itemFinal && isValidUuid(itemFinal.id))
          ? String(itemFinal.id).trim().toLowerCase()
          : (item.apartadoId && isValidUuid(item.apartadoId) ? item.apartadoId.trim().toLowerCase() : '');

        if (!apIdFinal || !isValidUuid(apIdFinal)) {
          throw new Error(`El apartado '${item.titulo}' no tiene un identificador UUID válido confirmado.`);
        }

        const nota = calificacionesEdicion[item.edicionKey] ?? null;
        listaNuevasNotasApartados.push({
          alumnoId: alumnoActualId,
          apartadoId: apIdFinal,
          rubricaId: rubricaFinal.id,
          actividadId: actividadSeleccionadaId,
          nota,
        });
      });

      // 1. Guardar calificaciones de apartados en Supabase
      const resApartados = await guardarCalificacionesApartados(
        grupoId,
        calificacionesApartados,
        listaNuevasNotasApartados
      );

      if (resApartados.success && onUpdateCalificacionesApartados) {
        onUpdateCalificacionesApartados(resApartados.calificacionesApartados);
      }

      // 2. Si hay actividad asociada, calcular y guardar su nota agregada
      if (actividadSeleccionadaId) {
        let sumaNotas = 0;
        let sumaPesos = 0;
        let hayNotas = false;

        apartadosEvaluables.forEach((item) => {
          const n = calificacionesEdicion[item.edicionKey];
          if (n !== null && n !== undefined && !isNaN(n)) {
            hayNotas = true;
            const peso = (item.peso !== null && item.peso !== undefined && item.peso > 0) ? item.peso : 1;
            sumaNotas += n * peso;
            sumaPesos += peso;
          }
        });

        const notaActividad = hayNotas && sumaPesos > 0
          ? Math.round((sumaNotas / sumaPesos) * 100) / 100
          : null;

        const resActividad = await guardarCalificacionesEvaluacion(grupoId, calificaciones, [
          {
            alumnoId: alumnoActualId,
            actividadId: actividadSeleccionadaId,
            nota: notaActividad,
          },
        ]);

        if (resActividad.success) {
          onUpdateCalificaciones(resActividad.calificaciones);
        }
      }

      setHasModificacionesSinGuardar(false);
      setHasUnsavedChanges(false);
      setMensajeExito(`¡Calificación guardada para ${alumnoActual?.nombre}!`);

      // 3. Al guardar, avanzar al alumno siguiente según "pendiente", "aleatorio" o lista
      const siguienteId = obtenerSiguienteAlumnoId(modoPendiente, modoAleatorio);
      if (siguienteId && siguienteId !== alumnoActualId) {
        setTimeout(() => {
          setAlumnoActualId(siguienteId);
        }, 350);
      }
    } catch (err: any) {
      console.error('[RubricaEvaluacionModal] Error al guardar calificaciones:', err);
      setMensajeError(err?.message || 'Error inesperado al guardar calificaciones.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleIntentarCerrar = () => {
    if (hasModificacionesSinGuardar) {
      setShowConfirmSalir(true);
    } else {
      onClose();
    }
  };

  const estadoAlumnoActual = alumnosEstadoMap.get(alumnoActualId);
  const esAlumnoPendiente = estadoAlumnoActual?.esPendiente ?? true;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-1 sm:p-4 overflow-hidden"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-5xl h-full sm:h-auto max-h-[96vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* ========================================================
            CONTENEDOR DESPLAZABLE VERTICALMENTE
            Las filas 1 y 2 se ocultan al hacer scroll hacia abajo.
            La fila 3 (desplegable de alumno) permanece siempre visible (sticky).
            ======================================================== */}
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100">
          {/* ========================================================
              FILA 1 (PARTE SUPERIOR): CURSO Y NOMBRE DE LA RÚBRICA
              Se oculta al realizar scroll hacia abajo.
              ======================================================== */}
          <div className="bg-[#1e3a8a] text-white px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between gap-2 shadow-xs select-none">
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-blue-600/70 border border-blue-400/40 text-[11px] sm:text-xs font-bold tracking-wide uppercase shrink-0">
                {selectedGrupo?.nombre || 'Curso'}
              </span>
              <h2 className="text-xs sm:text-sm font-bold text-white truncate max-w-xs sm:max-w-md" title={rubrica.titulo}>
                {rubrica.titulo}
              </h2>
            </div>

            <button
              type="button"
              onClick={handleIntentarCerrar}
              className="p-1 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ========================================================
              FILA 2 (DEBAJO): OPCIONES DE SELECCIÓN DE ALUMNO
              "pendiente" (reloj de arena) y "aleatorio" (dado).
              Se activan/desactivan independientemente, ambas o ninguna.
              Se ocultan al realizar scroll hacia abajo.
              ======================================================== */}
          <div className="p-2 sm:p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs select-none">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
                Selección de alumno:
              </span>

              {/* Opción "Pendiente": reloj de arena */}
              <button
                type="button"
                onClick={() => setModoPendiente((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  modoPendiente
                    ? 'bg-amber-500 text-white border-amber-600 shadow-2xs ring-1 ring-amber-400'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
                title="Selecciona al alumno con menos calificaciones en el criterio de la actividad seleccionada"
              >
                <Hourglass className={`w-3.5 h-3.5 ${modoPendiente ? 'text-white' : 'text-amber-600'}`} />
                <span>Pendiente</span>
                {modoPendiente && <Check className="w-3 h-3 stroke-[3]" />}
              </button>

              {/* Opción "Aleatorio": icono de dado */}
              <button
                type="button"
                onClick={() => setModoAleatorio((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  modoAleatorio
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs ring-1 ring-indigo-400'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
                title="Selección aleatoria de alumno"
              >
                <Dices className={`w-3.5 h-3.5 ${modoAleatorio ? 'text-white' : 'text-indigo-600'}`} />
                <span>Aleatorio</span>
                {modoAleatorio && <Check className="w-3 h-3 stroke-[3]" />}
              </button>

              {/* Botón rápido para saltar al siguiente con las opciones activas */}
              {(modoPendiente || modoAleatorio) && (
                <button
                  type="button"
                  onClick={handleAplicarSeleccionAlumno}
                  className="px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors cursor-pointer"
                >
                  Elegir ahora
                </button>
              )}
            </div>

            {/* Selector de escala de notas */}
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <span className="hidden sm:inline">Escala:</span>
              <button
                type="button"
                onClick={() => setEscalaMode('standard5')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  escalaMode === 'standard5'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
                title="0 · 3 · 5 · 7 · 10"
              >
                0-3-5-7-10
              </button>
              <button
                type="button"
                onClick={() => setEscalaMode('standard4')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  escalaMode === 'standard4'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
                title="0 · 4 · 7 · 10"
              >
                0-4-7-10
              </button>
            </div>
          </div>

          {/* ========================================================
              FILA 3 (DEBAJO): DESPLEGABLE DE SELECCIÓN DE ALUMNO
              SIEMPRE VISIBLE (sticky top-0 z-30 al hacer scroll)
              ======================================================== */}
          <div className="sticky top-0 z-30 bg-white px-3 sm:px-5 py-2 border-b border-slate-200 shadow-2xs flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <select
                  id="select-alumno-modal"
                  value={alumnoActualId}
                  onChange={(e) => cambiarAlumnoConSeguridad(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-900 font-bold text-xs sm:text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs cursor-pointer truncate"
                >
                  {alumnosOrdenados.map((al) => {
                    const est = alumnosEstadoMap.get(al.id);
                    const tag = est?.esPendiente ? '⏳ (Pendiente)' : '✅ (Evaluado)';
                    return (
                      <option key={al.id} value={al.id}>
                        {al.orden !== undefined ? `${al.orden}. ` : ''}{al.nombre} {tag}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 text-xs">
              <span className="hidden sm:inline font-mono text-[11px] text-slate-500">
                {indexActual + 1}/{alumnosOrdenados.length}
              </span>
              {esAlumnoPendiente ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300 flex items-center gap-1">
                  <Hourglass className="w-3 h-3 text-amber-600" />
                  <span className="hidden xs:inline">Pendiente</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span className="hidden xs:inline">Evaluado</span>
                </span>
              )}
            </div>
          </div>

          {/* ========================================================
              FILA 4 (DEBAJO): LISTA DE ACTIVIDADES
              Diseñada para que en móvil se vean varias actividades
              simultáneamente.
              Columnas (de izq. a dcha.):
              1. Casilla de selección (desaparece al hacer scroll a la derecha)
              2. Número de la actividad (número del documento original ej: 5.c o c)
              3. Botones de evaluación o calificación numérica
              4. Comienzo del enunciado de la actividad
              5. Criterio/s asociados a la actividad
              ======================================================== */}
          <div className="p-2 sm:p-4 space-y-3">
            {/* Mensajes de feedback */}
            {mensajeExito && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center justify-between gap-2 animate-in fade-in">
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
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-semibold">{mensajeError}</span>
                </div>
                <button type="button" onClick={() => setMensajeError(null)} className="text-rose-700 hover:text-rose-900">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Barra de acción cuando hay actividades seleccionadas con checkbox */}
            {actividadesSeleccionadas.size > 0 && (
              <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between text-xs animate-in fade-in">
                <span className="font-semibold text-indigo-900">
                  {actividadesSeleccionadas.size} {actividadesSeleccionadas.size === 1 ? 'actividad seleccionada' : 'actividades seleccionadas'}
                  {modoPendiente && ' (criterio activo para selección pendiente)'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmEliminarActividades(true)}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Eliminar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActividadesSeleccionadas(new Set())}
                    className="text-slate-500 hover:text-slate-700 text-[11px] underline cursor-pointer"
                  >
                    Deseleccionar
                  </button>
                </div>
              </div>
            )}

            {/* Tabla compacta con scroll horizontal y líneas bien definidas */}
            <div className="border-2 border-slate-300 rounded-xl overflow-x-auto shadow-xs bg-white">
              <table className="w-full text-left text-xs border-collapse min-w-[540px]">
                <thead className="bg-slate-100 border-b-2 border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[10px] select-none">
                  <tr>
                    {/* 1. Casilla de selección (no sticky: desaparece al scrollear a la dcha) */}
                    <th scope="col" className="py-2.5 px-2.5 w-10 text-center border-r border-slate-300">
                      <input
                        type="checkbox"
                        checked={
                          apartadosEvaluables.length > 0 &&
                          apartadosEvaluables.every((a) => actividadesSeleccionadas.has(a.edicionKey))
                        }
                        onChange={() => {
                          if (actividadesSeleccionadas.size === apartadosEvaluables.length) {
                            setActividadesSeleccionadas(new Set());
                          } else {
                            setActividadesSeleccionadas(new Set(apartadosEvaluables.map((a) => a.edicionKey)));
                          }
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        title="Seleccionar todas"
                      />
                    </th>

                    {/* 2. Número de la actividad */}
                    <th scope="col" className="py-2.5 px-2 w-14 text-center border-r border-slate-300">
                      N.º
                    </th>

                    {/* 3. Botones de evaluación o casilla de calificación */}
                    <th scope="col" className="py-2.5 px-3 w-52 text-center border-r border-slate-300">
                      Evaluación
                    </th>

                    {/* 4. Comienzo del enunciado de la actividad */}
                    <th scope="col" className="py-2.5 px-3 border-r border-slate-300">
                      Enunciado / Actividad
                    </th>

                    {/* 5. Criterio/s asociados a la actividad */}
                    <th scope="col" className="py-2.5 px-3 w-28 text-right">
                      Criterio/s
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {apartadosEvaluables.map((item) => {
                    const isChecked = actividadesSeleccionadas.has(item.edicionKey);
                    const notaActual = calificacionesEdicion[item.edicionKey];
                    const tieneNota = notaActual !== null && notaActual !== undefined && !isNaN(notaActual);

                    return (
                      <tr
                        key={item.edicionKey}
                        className={`transition-colors h-11 ${
                          isChecked
                            ? 'bg-indigo-50/50'
                            : tieneNota
                            ? 'hover:bg-slate-50'
                            : 'bg-amber-50/20 hover:bg-amber-50/40'
                        }`}
                      >
                        {/* 1. Casilla de selección */}
                        <td className="py-1.5 px-2.5 text-center align-middle">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSeleccionActividad(item.edicionKey)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            title="Seleccionar actividad para criterio pendiente o eliminar"
                          />
                        </td>

                        {/* 2. Número de la actividad (del documento original: ej 5.c o c) */}
                        <td className="py-1.5 px-2 text-center align-middle font-mono font-bold text-xs text-indigo-700">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200">
                            {item.numero}
                          </span>
                        </td>

                        {/* 3. Botones de evaluación o casilla numérica */}
                        <td className="py-1.5 px-3 text-center align-middle">
                          <div className="inline-flex items-center gap-1 justify-center">
                            {botonesCalificacion.map((btn) => {
                              const isSelected = tieneNota && notaActual === btn.valor;
                              return (
                                <button
                                  key={btn.valor}
                                  type="button"
                                  onClick={() => handleTogglePuntuacion(item.edicionKey, btn.valor)}
                                  className={`w-7 h-7 sm:w-8 sm:h-7 rounded text-xs font-bold border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? btn.active
                                      : `${btn.color} bg-white shadow-2xs`
                                  }`}
                                  title={`Puntuación: ${btn.valor} pts`}
                                >
                                  {btn.label}
                                </button>
                              );
                            })}

                            {/* Casilla numérica compacta para ver/editar nota */}
                            <input
                              type="number"
                              min="0"
                              max="10"
                              step="0.1"
                              value={tieneNota ? String(notaActual) : ''}
                              onChange={(e) => {
                                const val = e.target.value.trim();
                                if (val === '') {
                                  handleTogglePuntuacion(item.edicionKey, notaActual ?? 0);
                                } else {
                                  const num = parseFloat(val);
                                  if (!isNaN(num) && num >= 0 && num <= 10) {
                                    setCalificacionesEdicion((prev) => ({
                                      ...prev,
                                      [item.edicionKey]: num,
                                    }));
                                    setHasModificacionesSinGuardar(true);
                                    setHasUnsavedChanges(true);
                                  }
                                }
                              }}
                              placeholder="-"
                              className={`w-9 h-7 text-xs font-mono font-bold text-center border rounded px-0.5 focus:outline-none ${
                                tieneNota
                                  ? notaActual === 0
                                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-50 text-slate-400 border-slate-200'
                              }`}
                              title="Puntuación manual (0-10)"
                            />
                          </div>
                        </td>

                        {/* 4. Comienzo del enunciado de la actividad */}
                        <td className="py-1.5 px-3 align-middle text-slate-800">
                          <div className="line-clamp-1 max-w-xs sm:max-w-md font-medium text-xs" title={item.titulo}>
                            {item.titulo}
                          </div>
                          {item.peso !== null && item.peso !== undefined && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Peso: {item.peso}%
                            </span>
                          )}
                        </td>

                        {/* 5. Criterio/s asociados */}
                        <td className="py-1.5 px-3 text-right align-middle">
                          <div className="flex flex-wrap gap-1 justify-end">
                            {item.criteriosCodigos.length > 0 ? (
                              item.criteriosCodigos.map((cod) => (
                                <span
                                  key={cod}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200"
                                  title={criteriosMap.get(cod)?.descripcion || cod}
                                >
                                  {cod}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">-</span>
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
        </div>

        {/* ========================================================
            FILA 5 (DEBAJO): PIE CON BOTONES DE ACCIÓN
            1. "0 en todas las actividades"
            2. "Cerrar"
            3. "Guardar"
            Al guardar, se muestra al alumno siguiente según las opciones.
            ======================================================== */}
        <div className="p-2.5 sm:p-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 select-none shrink-0">
          {/* Botón 0 en todas las actividades */}
          <button
            type="button"
            onClick={() => setShowConfirmCeros(true)}
            className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>0 en todas las actividades</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Botón Cerrar */}
            <button
              type="button"
              onClick={handleIntentarCerrar}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Cerrar
            </button>

            {/* Botón Guardar */}
            <button
              type="button"
              onClick={handleGuardarCalificacion}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1d4ed8] active:bg-[#1e3a8a] rounded-lg shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de confirmación: 0 en todas las actividades */}
      {showConfirmCeros && (
        <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 max-w-sm w-full space-y-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-rose-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Confirmar nota 0</span>
            </div>
            <p className="text-xs text-slate-600">
              ¿Poner <strong>0</strong> en todas las actividades de esta rúbrica para <strong>{alumnoActual?.nombre}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmCeros(false)}
                className="px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePonerCerosTodas}
                className="px-3 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
              >
                Sí, poner 0
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación: Eliminar actividades seleccionadas */}
      {showConfirmEliminarActividades && (
        <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 max-w-sm w-full space-y-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-rose-600 font-bold text-sm">
              <Trash2 className="w-5 h-5 shrink-0" />
              <span>Eliminar actividades</span>
            </div>
            <p className="text-xs text-slate-600">
              ¿Deseas eliminar las {actividadesSeleccionadas.size} actividades seleccionadas de la rúbrica?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmEliminarActividades(false)}
                className="px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEliminarActividades}
                className="px-3 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación: Salir con cambios sin guardar */}
      {showConfirmSalir && (
        <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 max-w-sm w-full space-y-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-amber-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Cambios sin guardar</span>
            </div>
            <p className="text-xs text-slate-600">
              Has modificado calificaciones de <strong>{alumnoActual?.nombre}</strong>. Si sales ahora se perderán.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSalir(false)}
                className="px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmSalir(false);
                  setHasModificacionesSinGuardar(false);
                  setHasUnsavedChanges(false);
                  onClose();
                }}
                className="px-3 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg cursor-pointer"
              >
                Descartar y salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
