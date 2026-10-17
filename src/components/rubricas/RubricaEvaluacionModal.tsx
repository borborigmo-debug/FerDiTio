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
import { normalizeRubrica, isValidUuid, parseRubricaItems, asegurarApartadosConUuid } from '../../utils/rubricaUtils';
import {
  guardarCalificacionesEvaluacion,
  guardarCalificacionesApartados,
} from '../../services/calificacionesService';
import { asegurarYPersistirRubricaUuids } from '../../services/rubricasService';
import { useCuaderno } from '../../context/CuadernoContext';
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
  Sparkles,
  FileSpreadsheet,
  Link,
  Layers,
  RotateCcw,
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
  apartadoId: string; // UUID persistente o id canónico
  edicionKey: string; // Clave para el estado local en calificacionesEdicion
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
  // Contexto global del cuaderno para protección de cambios sin guardar
  const { setHasUnsavedChanges } = useCuaderno();

  // Estado local sincronizado de la rúbrica fiel a la rúbrica remota existente
  const [rubricaActiva, setRubricaActiva] = useState<Rubrica>(rubricaRaw);

  useEffect(() => {
    setRubricaActiva(rubricaRaw);
  }, [rubricaRaw]);

  // Asegurar que la rúbrica cuente con UUIDs persistentes e inmutables verificados en Supabase
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
        console.warn('[RubricaEvaluacionModal] Error al sincronizar UUIDs de apartados en segundo plano:', err);
      }
    }

    verificarYPersistirUuids();
    return () => {
      cancelado = true;
    };
  }, [grupoId, rubricaRaw, onUpdateRubrica]);

  // 1. Normalizar la rúbrica activa
  const rubrica = useMemo(() => normalizeRubrica(rubricaActiva), [rubricaActiva]);

  // 2. Actividades del cuaderno asociadas a esta rúbrica
  const actividadesAsociadas = useMemo(() => {
    return (actividades || []).filter((a) => a.rubrica_id === rubrica.id);
  }, [actividades, rubrica.id]);

  // Actividad seleccionada actualmente para la evaluación (si existen actividades asociadas)
  const [actividadSeleccionadaId, setActividadSeleccionadaId] = useState<string | null>(() => {
    if (initialActividadId && actividadesAsociadas.some((a) => a.id === initialActividadId)) {
      return initialActividadId;
    }
    return actividadesAsociadas.length > 0 ? actividadesAsociadas[0].id : null;
  });

  // 3. Apartados evaluables reales de la rúbrica
  const apartadosEvaluables: ApartadoEvaluacion[] = useMemo(() => {
    return rubrica.items.map((it, idx) => {
      // 1. Priorizar UUID persistente verificado si existe
      // 2. Si no, comprobar si el id existente en raw es un UUID válido
      // 3. Evitar terminantemente generar identificadores alternativos basados en el índice o en el ID de la rúbrica
      const apId = (it.uuid && it.uuid.trim())
        || (isValidUuid(it.raw?.id) ? it.raw.id.trim() : '')
        || (isValidUuid(it.id) ? it.id.trim() : '');

      const histId = it.legacyId || it.raw?.legacyId || it.id;
      const edKey = apId || (histId ? String(histId).trim() : `item_${idx}`);

      return {
        apartadoId: apId,
        edicionKey: edKey,
        visualId: histId,
        numero: it.numero || String(idx + 1),
        titulo: it.titulo,
        criteriosCodigos: it.criterios || [],
        peso: it.peso,
        descriptores: it.descriptores || {},
      };
    });
  }, [rubrica]);

  // Mapa de criterios por código para acceso rápido a descripción
  const criteriosMap = useMemo(() => {
    return new Map<string, Criterio>((criterios || []).map((c) => [c.codigo, c]));
  }, [criterios]);

  // Alumnos ordenados por número de orden o nombre
  const alumnosOrdenados = useMemo(() => {
    return [...(alumnos || [])].sort((a, b) => {
      if (a.orden !== undefined && b.orden !== undefined) {
        return a.orden - b.orden;
      }
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
  }, [alumnos]);

  // Diagnóstico del estado de evaluación de cada alumno (Pendiente vs Evaluado)
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
        // Distingue calificación numérica finita (incluso 0) de pendiente (null o ausente)
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

  // Estados de control de la interfaz
  const [modo, setModo] = useState<'individual' | 'multiple'>('individual');
  const [alumnosSeleccionadosMultiples, setAlumnosSeleccionadosMultiples] = useState<Set<string>>(new Set());
  const [soloPendientes, setSoloPendientes] = useState<boolean>(false);
  const [autoAvanzar, setAutoAvanzar] = useState<boolean>(true);
  const [escalaMode, setEscalaMode] = useState<RatingScaleMode>('standard5'); // 0,3,5,7,10 vs 0,4,7,10
  const [showOrtografiaNotice, setShowOrtografiaNotice] = useState<boolean>(false);
  const [showConfirmCeros, setShowConfirmCeros] = useState<boolean>(false);
  const [showConfirmLimpiar, setShowConfirmLimpiar] = useState<boolean>(false);
  const [showConfirmSalir, setShowConfirmSalir] = useState<boolean>(false);

  // Alumno activo actual (Modo Individual)
  const [alumnoActualId, setAlumnoActualId] = useState<string>(() => {
    if (initialAlumnoId && alumnosOrdenados.some((a) => a.id === initialAlumnoId)) {
      return initialAlumnoId;
    }
    return alumnosOrdenados[0]?.id || '';
  });

  // Calificaciones temporales en edición para el alumno actual
  // apartadoId -> nota (number 0 a 10) | null (pendiente)
  const [calificacionesEdicion, setCalificacionesEdicion] = useState<Record<string, number | null>>({});
  const [hasModificacionesSinGuardar, setHasModificacionesSinGuardar] = useState<boolean>(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Sincronizar el estado de modificaciones con la protección global de CuadernoContext
  useEffect(() => {
    setHasUnsavedChanges(hasModificacionesSinGuardar);
  }, [hasModificacionesSinGuardar, setHasUnsavedChanges]);

  // Cargar calificaciones existentes del alumno actual en el búfer de edición
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
          mapaInicial[item.edicionKey] = null; // Pendiente de evaluar
        }
      });
      setCalificacionesEdicion(mapaInicial);
      setHasModificacionesSinGuardar(false);
      setHasUnsavedChanges(false);
    },
    [apartadosEvaluables, calificacionesApartados, rubrica.id, actividadSeleccionadaId, setHasUnsavedChanges]
  );

  // Cargar notas al cambiar alumno o actividad
  useEffect(() => {
    if (alumnoActualId) {
      cargarCalificacionesAlumno(alumnoActualId);
    }
  }, [alumnoActualId, actividadSeleccionadaId, cargarCalificacionesAlumno]);

  // Lista de alumnos filtrados por "Solo pendientes"
  const alumnosElegibles = useMemo(() => {
    if (!soloPendientes) return alumnosOrdenados;
    return alumnosOrdenados.filter((al) => {
      const estado = alumnosEstadoMap.get(al.id);
      return estado?.esPendiente ?? true;
    });
  }, [alumnosOrdenados, soloPendientes, alumnosEstadoMap]);

  const alumnoActual = useMemo(() => {
    return alumnosOrdenados.find((a) => a.id === alumnoActualId) || alumnosOrdenados[0];
  }, [alumnosOrdenados, alumnoActualId]);

  const indexActualElegible = useMemo(() => {
    return alumnosElegibles.findIndex((a) => a.id === alumnoActualId);
  }, [alumnosElegibles, alumnoActualId]);

  // Botones de calificación según escala
  const botonesCalificacion = useMemo(() => {
    if (escalaMode === 'standard4') {
      return [
        { valor: 0, label: '0', color: 'border-rose-300 text-rose-700 hover:bg-rose-50', active: 'bg-rose-600 text-white font-bold ring-2 ring-rose-400' },
        { valor: 4, label: '4', color: 'border-orange-300 text-orange-700 hover:bg-orange-50', active: 'bg-orange-500 text-white font-bold ring-2 ring-orange-300' },
        { valor: 7, label: '7', color: 'border-sky-300 text-sky-700 hover:bg-sky-50', active: 'bg-sky-600 text-white font-bold ring-2 ring-sky-300' },
        { valor: 10, label: '10', color: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50', active: 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-300' },
      ];
    }
    // Escala estándar Fernanditio 2: 0, 3, 5, 7, 10
    return [
      { valor: 0, label: '0', color: 'border-rose-300 text-rose-700 hover:bg-rose-50', active: 'bg-rose-600 text-white font-bold ring-2 ring-rose-400' },
      { valor: 3, label: '3', color: 'border-orange-300 text-orange-700 hover:bg-orange-50', active: 'bg-orange-500 text-white font-bold ring-2 ring-orange-300' },
      { valor: 5, label: '5', color: 'border-amber-300 text-amber-700 hover:bg-amber-50', active: 'bg-amber-500 text-white font-bold ring-2 ring-amber-300' },
      { valor: 7, label: '7', color: 'border-sky-300 text-sky-700 hover:bg-sky-50', active: 'bg-sky-600 text-white font-bold ring-2 ring-sky-300' },
      { valor: 10, label: '10', color: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50', active: 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-300' },
    ];
  }, [escalaMode]);

  /**
   * Clic en un botón de puntuación:
   * - Si ya estaba seleccionado, se desmarca pasando a null (pendiente).
   * - Si se pulsa otra puntuación, se asigna (incluido el 0 real).
   */
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

  /**
   * Poner 0 a todos los apartados del alumno actual
   */
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

  /**
   * Limpiar calificaciones pasando todos los apartados a pendiente
   */
  const handleLimpiarTodas = () => {
    const pendientes: Record<string, number | null> = {};
    apartadosEvaluables.forEach((item) => {
      pendientes[item.edicionKey] = null;
    });
    setCalificacionesEdicion(pendientes);
    setHasModificacionesSinGuardar(true);
    setHasUnsavedChanges(true);
    setShowConfirmLimpiar(false);
  };

  /**
   * Navegación segura entre alumnos
   */
  const cambiarAlumnoConSeguridad = (nuevoId: string) => {
    if (nuevoId === alumnoActualId) return;
    if (hasModificacionesSinGuardar) {
      const confirmacion = window.confirm(
        `Tienes calificaciones sin guardar para ${alumnoActual?.nombre}. Si cambias de alumno sin guardar, se perderán estos cambios. ¿Deseas descartarlos y cambiar de alumno?`
      );
      if (!confirmacion) return;
    }
    setHasModificacionesSinGuardar(false);
    setHasUnsavedChanges(false);
    setAlumnoActualId(nuevoId);
  };

  const handleAnteriorAlumno = () => {
    if (alumnosElegibles.length === 0) return;
    let nuevoIndex = indexActualElegible - 1;
    if (nuevoIndex < 0) nuevoIndex = alumnosElegibles.length - 1;
    cambiarAlumnoConSeguridad(alumnosElegibles[nuevoIndex].id);
  };

  const handleSiguienteAlumno = () => {
    if (alumnosElegibles.length === 0) return;
    let nuevoIndex = indexActualElegible + 1;
    if (nuevoIndex >= alumnosElegibles.length) nuevoIndex = 0;
    cambiarAlumnoConSeguridad(alumnosElegibles[nuevoIndex].id);
  };

  const handleAlumnoAleatorio = () => {
    if (alumnosElegibles.length <= 1) return;
    const alternativas = alumnosElegibles.filter((a) => a.id !== alumnoActualId);
    const randomIndex = Math.floor(Math.random() * alternativas.length);
    cambiarAlumnoConSeguridad(alternativas[randomIndex].id);
  };

  /**
   * Cálculo de estadísticas en tiempo real para el alumno actual
   */
  const resumenEvaluacionActual = useMemo(() => {
    let sumaPonderada = 0;
    let sumaPesos = 0;
    let apartadosConNota = 0;

    // Resumen por criterios asociados
    const criteriosAcumulados = new Map<string, { notas: number[]; criterio?: Criterio }>();

    apartadosEvaluables.forEach((item) => {
      const nota = calificacionesEdicion[item.edicionKey];
      if (nota !== null && nota !== undefined && !isNaN(nota)) {
        apartadosConNota++;
        const peso = (item.peso !== null && item.peso !== undefined && item.peso > 0) ? item.peso : 1;
        sumaPonderada += nota * peso;
        sumaPesos += peso;

        item.criteriosCodigos.forEach((cod) => {
          if (!criteriosAcumulados.has(cod)) {
            criteriosAcumulados.set(cod, {
              notas: [],
              criterio: criteriosMap.get(cod),
            });
          }
          criteriosAcumulados.get(cod)!.notas.push(nota);
        });
      }
    });

    const notaGlobalCalculada = apartadosConNota > 0 && sumaPesos > 0
      ? Math.round((sumaPonderada / sumaPesos) * 100) / 100
      : null;

    const criteriosDesglose: Array<{ codigo: string; descripcion?: string; promedio: number | null }> = [];
    criteriosAcumulados.forEach((val, cod) => {
      const prom = val.notas.length > 0
        ? Math.round((val.notas.reduce((a, b) => a + b, 0) / val.notas.length) * 100) / 100
        : null;
      criteriosDesglose.push({
        codigo: cod,
        descripcion: val.criterio?.descripcion,
        promedio: prom,
      });
    });

    return {
      apartadosConNota,
      totalApartados: apartadosEvaluables.length,
      notaGlobalCalculada,
      criteriosDesglose,
    };
  }, [apartadosEvaluables, calificacionesEdicion, criteriosMap]);

  /**
   * Guardar y persistir calificaciones en Supabase
   */
  const handleGuardarCalificacion = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setMensajeError(null);
    setMensajeExito(null);

    try {
      // Asegurar que la rúbrica cuente con todos sus apartados con UUID persistidos y confirmados en Supabase antes de guardar notas
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
          setMensajeError(`No se pueden guardar las calificaciones: no fue posible confirmar la persistencia de los identificadores de la rúbrica en la base de datos remota (${detalle}). Compruebe la conexión o el servicio antes de reintentar.`);
          setIsSaving(false);
          return;
        }
      }

      // Validar estrictamente que todos los apartados cuenten con UUID persistido y confirmado en Supabase
      const itemsFinalesRaw = parseRubricaItems(rubricaFinal.items);
      const apartadosSinUuidConfirmado = itemsFinalesRaw.filter((it: any) => !isValidUuid(it?.id));
      if (apartadosSinUuidConfirmado.length > 0) {
        setMensajeError(`No se pueden guardar las calificaciones: la rúbrica contiene ${apartadosSinUuidConfirmado.length} apartado(s) sin un identificador UUID confirmado en la base de datos remota.`);
        setIsSaving(false);
        return;
      }

      const alumnosAGuardarIds =
        modo === 'multiple' && alumnosSeleccionadosMultiples.size > 0
          ? Array.from(alumnosSeleccionadosMultiples)
          : [alumnoActualId];

      const listaNuevasNotasApartados: Array<{
        alumnoId: string;
        apartadoId: string;
        rubricaId: string;
        actividadId?: string | null;
        nota: number | null;
      }> = [];

      for (const alId of alumnosAGuardarIds) {
        apartadosEvaluables.forEach((item, idx) => {
          const itemFinal = itemsFinalesRaw[idx];
          const apIdFinal = (itemFinal && isValidUuid(itemFinal.id))
            ? String(itemFinal.id).trim().toLowerCase()
            : (item.apartadoId && isValidUuid(item.apartadoId) ? item.apartadoId.trim().toLowerCase() : '');

          if (!apIdFinal || !isValidUuid(apIdFinal)) {
            throw new Error(`El apartado '${item.titulo}' no tiene un identificador UUID válido confirmado en Supabase. No se pueden registrar calificaciones sin identificadores persistentes.`);
          }

          const nota = calificacionesEdicion[item.edicionKey] ?? null;
          listaNuevasNotasApartados.push({
            alumnoId: alId,
            apartadoId: apIdFinal,
            rubricaId: rubricaFinal.id,
            actividadId: actividadSeleccionadaId,
            nota,
          });
        });
      }

      // 1. Persistir calificaciones granulares por apartado
      const resApartados = await guardarCalificacionesApartados(
        grupoId,
        calificacionesApartados,
        listaNuevasNotasApartados
      );

      if (resApartados.success && onUpdateCalificacionesApartados) {
        onUpdateCalificacionesApartados(resApartados.calificacionesApartados);
      }

      // 2. Si hay una actividad asociada seleccionada, calcular la nota global de la actividad
      // y actualizar public.calificaciones para que el cuaderno refleje la nota inmediatamente
      let avisoActividad: string | null = null;
      if (actividadSeleccionadaId) {
        try {
          const listaCalifsActividad: Array<{
            alumnoId: string;
            actividadId: string;
            nota: number | null;
          }> = [];

          for (const alId of alumnosAGuardarIds) {
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

            listaCalifsActividad.push({
              alumnoId: alId,
              actividadId: actividadSeleccionadaId,
              nota: notaActividad,
            });
          }

          const resActividad = await guardarCalificacionesEvaluacion(
            grupoId,
            calificaciones,
            listaCalifsActividad
          );

          if (resActividad.success) {
            onUpdateCalificaciones(resActividad.calificaciones);
          }
        } catch (actErr: any) {
          console.warn('[RubricaEvaluacionModal] Error al sincronizar nota general de la actividad:', actErr);
          avisoActividad = actErr?.message || 'No se pudo sincronizar la nota general de la actividad';
        }
      }

      setHasModificacionesSinGuardar(false);
      setHasUnsavedChanges(false);

      const nombreMsg =
        modo === 'multiple'
          ? `${alumnosAGuardarIds.length} alumnos`
          : alumnoActual?.nombre || 'alumno';

      if (avisoActividad) {
        setMensajeExito(
          `¡Calificaciones de apartados guardadas para ${nombreMsg}! (Advertencia: ${avisoActividad})`
        );
      } else {
        setMensajeExito(
          `¡Calificaciones de la rúbrica guardadas y sincronizadas con éxito para ${nombreMsg}!`
        );
      }

      if (autoAvanzar && modo === 'individual') {
        setTimeout(() => {
          handleSiguienteAlumno();
        }, 400);
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
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-5xl overflow-hidden flex flex-col max-h-[96vh] animate-in fade-in zoom-in-95 duration-150">
        {/* ========================================================
            A. CABECERA DE EVALUACIÓN
            ======================================================== */}
        <div className="bg-[#1e3a8a] text-white px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm select-none">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-full bg-purple-900/60 border border-purple-400/40 flex items-center justify-center text-purple-200 shadow-inner shrink-0">
              <User className="w-5 h-5" aria-hidden="true" />
            </div>

            <h2 className="text-base sm:text-lg font-black tracking-wide uppercase text-white truncate max-w-xs sm:max-w-md">
              {alumnoActual?.nombre || 'Alumno'}
            </h2>

            {esAlumnoPendiente ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                <Hourglass className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                Pendiente ({resumenEvaluacionActual.apartadosConNota}/{resumenEvaluacionActual.totalApartados})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                Evaluado ({resumenEvaluacionActual.apartadosConNota}/{resumenEvaluacionActual.totalApartados})
              </span>
            )}

            <span className="text-xs font-medium text-blue-200">
              n.º {alumnoActual?.orden ?? '—'} ({indexActualElegible + 1} de {alumnosElegibles.length})
            </span>

            <div className="inline-flex items-center gap-1 ml-1">
              <button
                type="button"
                onClick={handleAnteriorAlumno}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded border border-blue-400/30 transition-colors shadow-2xs cursor-pointer"
                title="Alumno anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Ant.</span>
              </button>
              <button
                type="button"
                onClick={handleSiguienteAlumno}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded border border-blue-400/30 transition-colors shadow-2xs cursor-pointer"
                title="Alumno siguiente"
              >
                <span>Sig.</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600/70 border border-blue-400/30 text-xs font-bold text-white tracking-tight">
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-200" aria-hidden="true" />
              Rúbrica: {rubrica.titulo}
            </span>

            <button
              type="button"
              onClick={handleIntentarCerrar}
              className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              aria-label="Cerrar pantalla de evaluación"
              title="Cerrar pantalla de evaluación"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================
            B. PANEL DE CONTROL DE ALUMNOS Y ACTIVIDAD ASOCIADA
            ======================================================== */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 space-y-3">
          {/* Fila 1: Modos y filtros */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="inline-flex p-0.5 rounded-lg bg-slate-200/80 border border-slate-300">
                <button
                  type="button"
                  onClick={() => setModo('individual')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
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
                    setAlumnosSeleccionadosMultiples(new Set([alumnoActualId]));
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                    modo === 'multiple'
                      ? 'bg-[#1e40af] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Múltiple</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowOrtografiaNotice(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 font-bold border border-pink-200 transition-colors shadow-2xs cursor-pointer"
                title="Módulo de evaluación de ortografía"
              >
                <span>✍️ Evaluar Ortografía</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 hover:text-slate-900 select-none">
                <input
                  type="checkbox"
                  checked={autoAvanzar}
                  onChange={(e) => setAutoAvanzar(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <span>➡️ Siguiente</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 hover:text-slate-900 select-none">
                <input
                  type="checkbox"
                  checked={soloPendientes}
                  onChange={(e) => setSoloPendientes(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
                <span>⏳ Solo pendientes</span>
              </label>

              <button
                type="button"
                onClick={handleAlumnoAleatorio}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold transition-colors shadow-2xs cursor-pointer"
                title="Elegir alumno aleatoriamente"
              >
                <Dices className="w-4 h-4" />
                <span>Aleatorio</span>
              </button>
            </div>
          </div>

          {/* Fila 2: Selector de Actividad Asociada */}
          {actividadesAsociadas.length > 0 && (
            <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-indigo-900 font-semibold">
                <Link className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Actividad del cuaderno vinculada:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {actividadesAsociadas.map((act) => {
                  const isActSelected = actividadSeleccionadaId === act.id;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setActividadSeleccionadaId(act.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        isActSelected
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white text-indigo-800 border border-indigo-300 hover:bg-indigo-100'
                      }`}
                    >
                      {act.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fila 3: Selector de Alumno */}
          {modo === 'individual' ? (
            <div className="flex items-center gap-2">
              <label htmlFor="select-alumno" className="text-xs font-bold text-slate-700 shrink-0">
                Cambiar alumno:
              </label>
              <select
                id="select-alumno"
                value={alumnoActualId}
                onChange={(e) => cambiarAlumnoConSeguridad(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 font-semibold text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs cursor-pointer"
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
            <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  Alumnos seleccionados ({alumnosSeleccionadosMultiples.size} de {alumnosOrdenados.length}):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAlumnosSeleccionadosMultiples(new Set(alumnosOrdenados.map((a) => a.id)))}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    Seleccionar todos
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => setAlumnosSeleccionadosMultiples(new Set())}
                    className="text-xs text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
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
                      className={`px-2 py-1 rounded text-[11px] font-semibold border transition-all flex items-center gap-1 cursor-pointer ${
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
            C. TABLA DE EVALUACIÓN DE APARTADOS DE LA RÚBRICA
            ======================================================== */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {mensajeExito && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{mensajeExito}</span>
              </div>
              <button type="button" onClick={() => setMensajeExito(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
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
              <button type="button" onClick={() => setMensajeError(null)} className="text-rose-700 hover:text-rose-900 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Selector de escala de botones */}
          <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
            <span className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              Apartados de la Rúbrica ({apartadosEvaluables.length})
            </span>

            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-400">Escala:</span>
              <button
                type="button"
                onClick={() => setEscalaMode('standard5')}
                className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                  escalaMode === 'standard5'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title="Escala 5 botones: 0, 3, 5, 7, 10"
              >
                0 · 3 · 5 · 7 · 10
              </button>
              <button
                type="button"
                onClick={() => setEscalaMode('standard4')}
                className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
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

          {/* Tabla de Apartados */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th scope="col" className="py-3 px-3 w-16 text-center">
                    Apartado
                  </th>
                  <th scope="col" className="py-3 px-4 w-60 sm:w-72 text-center">
                    Calificación
                  </th>
                  <th scope="col" className="py-3 px-4">
                    Descripción y Descriptores
                  </th>
                  <th scope="col" className="py-3 px-4 w-32 text-right">
                    Criterios
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {apartadosEvaluables.map((item) => {
                  const notaActual = calificacionesEdicion[item.edicionKey];
                  const tieneNota = notaActual !== null && notaActual !== undefined && !isNaN(notaActual);

                  // Buscar descriptor correspondiente al nivel seleccionado si existe
                  let descriptorSeleccionado: string | null = null;
                  if (tieneNota && item.descriptores) {
                    const strNota = String(notaActual);
                    descriptorSeleccionado = item.descriptores[strNota] || null;
                    if (!descriptorSeleccionado) {
                      // Buscar por correspondencia de nivel (1 a 5)
                      const nivelKey = notaActual === 0 ? '1' : notaActual <= 3 ? '2' : notaActual <= 5 ? '3' : notaActual <= 7 ? '4' : '5';
                      descriptorSeleccionado = item.descriptores[nivelKey] || null;
                    }
                  }

                  return (
                    <tr
                      key={item.edicionKey}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* 1. Columna Número del Apartado */}
                      <td className="py-3.5 px-3 text-center align-middle">
                        <span className="inline-block px-2.5 py-1 font-mono font-bold text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg shadow-2xs">
                          {item.numero}
                        </span>
                      </td>

                      {/* 2. Columna Botones de Calificación */}
                      <td className="py-3.5 px-4 text-center align-middle">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                            {botonesCalificacion.map((btn) => {
                              const isSelected = tieneNota && notaActual === btn.valor;

                              return (
                                <button
                                  key={btn.valor}
                                  type="button"
                                  onClick={() => handleTogglePuntuacion(item.edicionKey, btn.valor)}
                                  className={`w-9 h-8 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center ${
                                    isSelected
                                      ? btn.active
                                      : `${btn.color} bg-white shadow-2xs`
                                  }`}
                                  title={`Puntuación: ${btn.valor} pts (Pulsar de nuevo para desmarcar)`}
                                >
                                  {btn.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Indicador de estado de la calificación */}
                          <div className="text-[11px] font-mono">
                            {tieneNota ? (
                              <span
                                className={`px-2 py-0.5 rounded font-bold ${
                                  notaActual === 0
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                              >
                                Nota: {notaActual.toFixed(2)} pts {notaActual === 0 && '(Cero real)'}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">⏳ Pendiente</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 3. Columna Descripción del Apartado */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-xs sm:text-sm">
                              {item.titulo}
                            </span>
                            {item.peso !== null && item.peso !== undefined && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                Peso: {item.peso}%
                              </span>
                            )}
                          </div>

                          {/* Si hay un descriptor asociado a la nota seleccionada, mostrarlo */}
                          {descriptorSeleccionado && (
                            <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200/80 leading-relaxed italic">
                              "{descriptorSeleccionado}"
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 4. Columna Criterios Asociados */}
                      <td className="py-3.5 px-4 text-right align-middle">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {item.criteriosCodigos.length > 0 ? (
                            item.criteriosCodigos.map((cod) => (
                              <span
                                key={cod}
                                className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs"
                                title={criteriosMap.get(cod)?.descripcion || cod}
                              >
                                {cod}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">
                              Sin criterios
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
              D. RESUMEN DE NOTAS POR CRITERIO Y NOTA GLOBAL
              ======================================================== */}
          <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-slate-50/90 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">📊</span>
                <h3 className="text-sm font-bold text-slate-900">
                  Resumen de Notas por Criterio y Nota Global de la Rúbrica
                </h3>
              </div>
              <div className="text-xs font-semibold text-slate-600">
                Apartados calificados: <strong className="text-slate-900">{resumenEvaluacionActual.apartadosConNota}</strong> de {resumenEvaluacionActual.totalApartados}
              </div>
            </div>

            {resumenEvaluacionActual.criteriosDesglose.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                {resumenEvaluacionActual.criteriosDesglose.map((c) => (
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
            ) : (
              <p className="text-xs text-slate-400 italic">
                Selecciona puntuaciones para calcular los promedios de los criterios evaluados.
              </p>
            )}

            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                Nota Global Calculada de la Rúbrica:
              </span>
              <span className="text-sm sm:text-base font-mono font-bold text-blue-700">
                {resumenEvaluacionActual.notaGlobalCalculada !== null
                  ? `${resumenEvaluacionActual.notaGlobalCalculada.toFixed(2)} / 10`
                  : '⏳ Pendiente de evaluar'}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================
            E. BOTONES INFERIORES DE ACCIÓN
            ======================================================== */}
        <div className="p-3 sm:p-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowConfirmCeros(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <span>⭕ Poner 0 en todos los apartados</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConfirmLimpiar(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Dejar todos los apartados como pendientes de evaluar"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar</span>
            </button>
          </div>

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
                {isSaving
                  ? 'Guardando...'
                  : modo === 'multiple'
                  ? `Guardar Calificación de ${alumnosSeleccionadosMultiples.size} Alumnos`
                  : `Guardar Calificación de ${alumnoActual?.nombre || 'Alumno'}`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Diálogo de Confirmación: Ceros en todos los apartados */}
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
              ¿Estás seguro de que deseas poner una nota de <strong>0</strong> en todos los apartados de esta rúbrica para <strong>{alumnoActual?.nombre}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmCeros(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePonerCerosTodas}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-2xs cursor-pointer"
              >
                Sí, poner 0 a todos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo de Confirmación: Limpiar / Pendientes */}
      {showConfirmLimpiar && (
        <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 max-w-md w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-sm font-bold text-slate-900">
                Limpiar calificaciones
              </h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              ¿Deseas desmarcar todas las calificaciones de <strong>{alumnoActual?.nombre}</strong> para que queden como <strong>pendientes de evaluar</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmLimpiar(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleLimpiarTodas}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-2xs cursor-pointer"
              >
                Sí, dejar pendientes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo de Confirmación: Salir con cambios sin guardar */}
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
              Has modificado calificaciones de <strong>{alumnoActual?.nombre}</strong> que aún no se han guardado en Supabase. ¿Deseas descartar estos cambios?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSalir(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
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
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-2xs cursor-pointer"
              >
                Descartar y salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso Ortografía */}
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
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1d4ed8] rounded-lg shadow-2xs cursor-pointer"
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
