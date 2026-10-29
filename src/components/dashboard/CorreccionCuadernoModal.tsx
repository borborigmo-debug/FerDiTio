/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Alumno,
  Rubrica,
  ActividadDetalle,
  Criterio,
  Seccion,
  Calificacion,
  CalificacionApartado,
} from '../../types';
import {
  prepararRubricasCronologicas,
  RubricaConMetadataFecha,
} from '../../utils/correccionCuadernoUtils';
import { normalizeRubrica } from '../../utils/rubricaUtils';
import { RubricaEvaluacionModal } from '../rubricas/RubricaEvaluacionModal';
import {
  BookOpen,
  User,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  X,
  Info,
  Check,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface CorreccionCuadernoModalProps {
  isOpen: boolean;
  onClose: () => void;
  grupoId: string;
  grupoNombre: string;
  alumnos: Alumno[];
  rubricas: Rubrica[];
  actividades: ActividadDetalle[];
  criterios: Criterio[];
  secciones: Seccion[];
  calificaciones: Calificacion[];
  calificacionesApartados: CalificacionApartado[];
  onUpdateCalificaciones: (nuevas: Calificacion[]) => void;
  onUpdateCalificacionesApartados: (nuevas: CalificacionApartado[]) => void;
  onUpdateRubrica?: (actualizada: Rubrica) => void;
  initialAlumnoId?: string;
}

type PasoCorreccion = 'configuracion' | 'evaluacion' | 'completado';

export const CorreccionCuadernoModal: React.FC<CorreccionCuadernoModalProps> = ({
  isOpen,
  onClose,
  grupoId,
  grupoNombre,
  alumnos,
  rubricas,
  actividades,
  criterios,
  secciones,
  calificaciones,
  calificacionesApartados,
  onUpdateCalificaciones,
  onUpdateCalificacionesApartados,
  onUpdateRubrica,
  initialAlumnoId,
}) => {
  if (!isOpen) return null;

  // Alumnos ordenados por número de orden o alfabéticamente
  const alumnosOrdenados = useMemo(() => {
    return [...(alumnos || [])].sort((a, b) => {
      if (a.orden !== undefined && b.orden !== undefined) {
        return a.orden - b.orden;
      }
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
  }, [alumnos]);

  // Alumno seleccionado para la corrección
  const [alumnoSeleccionadoId, setAlumnoSeleccionadoId] = useState<string>(() => {
    if (initialAlumnoId && alumnosOrdenados.some((a) => a.id === initialAlumnoId)) {
      return initialAlumnoId;
    }
    return alumnosOrdenados[0]?.id || '';
  });

  // Preparación y ordenación cronológica de rúbricas (más antigua a más reciente)
  const rubricasCronologicas: RubricaConMetadataFecha[] = useMemo(() => {
    return prepararRubricasCronologicas(rubricas, actividades, secciones);
  }, [rubricas, actividades, secciones]);

  // Conjunto de IDs de rúbricas seleccionadas para la sesión de corrección
  const [rubricasSeleccionadasIds, setRubricasSeleccionadasIds] = useState<Set<string>>(() => {
    const sugeridas = rubricasCronologicas.filter((r) => r.esSugeridaCuaderno).map((r) => r.rubrica.id);
    if (sugeridas.length > 0) {
      return new Set(sugeridas);
    }
    // Si ninguna coincide con la heurística de sección/instrumento, preseleccionar todas para que el docente elija
    return new Set(rubricasCronologicas.map((r) => r.rubrica.id));
  });

  // Paso actual del flujo
  const [paso, setPaso] = useState<PasoCorreccion>('configuracion');

  // Índice de la rúbrica actual en el array de seleccionadas
  const [indiceActual, setIndiceActual] = useState<number>(0);

  // Lista ordenada de rúbricas efectivamente seleccionadas
  const rubricasParaEvaluar = useMemo(() => {
    return rubricasCronologicas
      .filter((item) => rubricasSeleccionadasIds.has(item.rubrica.id))
      .map((item) => item.rubrica);
  }, [rubricasCronologicas, rubricasSeleccionadasIds]);

  const alumnoActual = useMemo(() => {
    return alumnosOrdenados.find((a) => a.id === alumnoSeleccionadoId) || alumnosOrdenados[0];
  }, [alumnosOrdenados, alumnoSeleccionadoId]);

  // Alternar selección de una rúbrica en la lista
  const handleToggleRubrica = (id: string) => {
    setRubricasSeleccionadasIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSeleccionarTodas = () => {
    setRubricasSeleccionadasIds(new Set(rubricasCronologicas.map((r) => r.rubrica.id)));
  };

  const handleDeseleccionarTodas = () => {
    setRubricasSeleccionadasIds(new Set());
  };

  const handleRestablecerSugeridas = () => {
    const sugeridas = rubricasCronologicas.filter((r) => r.esSugeridaCuaderno).map((r) => r.rubrica.id);
    setRubricasSeleccionadasIds(new Set(sugeridas.length > 0 ? sugeridas : rubricasCronologicas.map((r) => r.rubrica.id)));
  };

  // Iniciar la corrección secuencial
  const handleIniciarCorreccion = () => {
    if (rubricasParaEvaluar.length === 0) {
      window.alert('Debes seleccionar al menos una rúbrica para iniciar la corrección del cuaderno.');
      return;
    }
    setIndiceActual(0);
    setPaso('evaluacion');
  };

  // Siguiente rúbrica en la secuencia
  const handleSiguienteRubrica = useCallback(() => {
    if (indiceActual < rubricasParaEvaluar.length - 1) {
      setIndiceActual((prev) => prev + 1);
    } else {
      setPaso('completado');
    }
  }, [indiceActual, rubricasParaEvaluar.length]);

  // Rúbrica anterior en la secuencia
  const handleAnteriorRubrica = useCallback(() => {
    if (indiceActual > 0) {
      setIndiceActual((prev) => prev - 1);
    }
  }, [indiceActual]);

  // Finalizar corrección
  const handleFinalizar = useCallback(() => {
    setPaso('completado');
  }, []);

  // Modal de confirmación para reiniciar el grupo tras completar todos los alumnos
  const [showConfirmReiniciarGrupo, setShowConfirmReiniciarGrupo] = useState<boolean>(false);

  // Posición del alumno actual y control de fin de grupo
  const indexAlumnoActual = useMemo(() => {
    return alumnosOrdenados.findIndex((a) => a.id === alumnoSeleccionadoId);
  }, [alumnosOrdenados, alumnoSeleccionadoId]);

  const esUltimoAlumno = useMemo(() => {
    if (alumnosOrdenados.length === 0) return true;
    return indexAlumnoActual >= alumnosOrdenados.length - 1;
  }, [alumnosOrdenados.length, indexAlumnoActual]);

  const siguienteAlumno = useMemo(() => {
    if (indexAlumnoActual >= 0 && indexAlumnoActual < alumnosOrdenados.length - 1) {
      return alumnosOrdenados[indexAlumnoActual + 1];
    }
    return null;
  }, [alumnosOrdenados, indexAlumnoActual]);

  // Volver a la primera rúbrica para el mismo alumno
  const handleVolverPrimeraRubrica = () => {
    setIndiceActual(0);
    setPaso('evaluacion');
  };

  // Evaluar siguiente alumno (solo avanza si existe un siguiente alumno en la lista)
  const handleEvaluarSiguienteAlumno = () => {
    if (siguienteAlumno) {
      setAlumnoSeleccionadoId(siguienteAlumno.id);
      setIndiceActual(0);
      setPaso('evaluacion');
    }
  };

  // Reiniciar deliberadamente la corrección desde el primer alumno tras confirmación explícita
  const handleReiniciarDesdePrimerAlumno = () => {
    if (alumnosOrdenados.length > 0) {
      setAlumnoSeleccionadoId(alumnosOrdenados[0].id);
      setIndiceActual(0);
      setShowConfirmReiniciarGrupo(false);
      setPaso('evaluacion');
    }
  };

  // =========================================================================
  // PASO 2: EVALUACIÓN ACTIVA DE LA RÚBRICA ACTUAL
  // =========================================================================
  if (paso === 'evaluacion' && rubricasParaEvaluar.length > 0) {
    const rubricaActual = rubricasParaEvaluar[indiceActual];
    return (
      <RubricaEvaluacionModal
        rubrica={rubricaActual}
        alumnos={alumnos}
        criterios={criterios}
        actividades={actividades}
        calificaciones={calificaciones}
        calificacionesApartados={calificacionesApartados}
        grupoId={grupoId}
        onClose={onClose}
        onUpdateCalificaciones={onUpdateCalificaciones}
        onUpdateCalificacionesApartados={onUpdateCalificacionesApartados}
        onUpdateRubrica={onUpdateRubrica}
        initialAlumnoId={alumnoSeleccionadoId}
        modoCorreccionCuaderno={{
          indiceActual,
          totalRubricas: rubricasParaEvaluar.length,
          esUltimaRubrica: indiceActual === rubricasParaEvaluar.length - 1,
          onSiguienteRubrica: handleSiguienteRubrica,
          onAnteriorRubrica: handleAnteriorRubrica,
          onFinalizar: handleFinalizar,
        }}
      />
    );
  }

  // =========================================================================
  // PASO 3: PANTALLA DE FINALIZACIÓN Y RESUMEN DEL ALUMNO
  // =========================================================================
  if (paso === 'completado') {
    // Calcular resumen de notas por rúbrica para este alumno (comprobando calificaciones directas y apartados)
    const resumenNotas = rubricasParaEvaluar.map((rub) => {
      // Actividad vinculada
      const act = actividades.find((a) => a.rubrica_id === rub.id);

      // 1. Comprobar si existe calificación directa consolidada en la actividad
      let notaConsolidada: number | null = null;
      if (act) {
        const cal = calificaciones.find(
          (c) => c.alumno_id === alumnoSeleccionadoId && c.actividad_id === act.id
        );
        if (cal && cal.nota !== null && cal.nota !== undefined && !isNaN(Number(cal.nota))) {
          notaConsolidada = Number(cal.nota);
        }
      }

      // 2. Comprobar si existen calificaciones de apartados para este alumno y rúbrica
      const rubNorm = normalizeRubrica(rub);
      const items = rubNorm.items;
      let apartadosConNota = 0;
      let sumaPonderada = 0;
      let sumaPesos = 0;

      items.forEach((item, idx) => {
        const apUuid = item.uuid ? item.uuid.toLowerCase() : '';
        const visualId = item.id;
        const legacyId = item.legacyId;

        const calApartado = calificacionesApartados.find(
          (ca) =>
            ca.alumno_id === alumnoSeleccionadoId &&
            ca.rubrica_id === rub.id &&
            ((apUuid && ca.apartado_id.toLowerCase() === apUuid) ||
              (visualId && ca.apartado_id === visualId) ||
              (legacyId && ca.apartado_id === legacyId) ||
              ca.apartado_id === `item_${idx}` ||
              ca.apartado_id === `item-${idx}`)
        );

        if (
          calApartado &&
          calApartado.nota !== null &&
          calApartado.nota !== undefined &&
          !isNaN(Number(calApartado.nota))
        ) {
          apartadosConNota++;
          const notaNum = Number(calApartado.nota);
          const peso = (item.peso !== null && item.peso !== undefined && item.peso > 0) ? item.peso : 1;
          sumaPonderada += notaNum * peso;
          sumaPesos += peso;
        }
      });

      // Si no coincidieron por items pero hay apartados directos registrados para este alumno y rúbrica
      if (apartadosConNota === 0) {
        const calsDirectas = calificacionesApartados.filter(
          (ca) =>
            ca.alumno_id === alumnoSeleccionadoId &&
            ca.rubrica_id === rub.id &&
            ca.nota !== null &&
            ca.nota !== undefined &&
            !isNaN(Number(ca.nota))
        );
        if (calsDirectas.length > 0) {
          apartadosConNota = calsDirectas.length;
          sumaPesos = calsDirectas.length;
          sumaPonderada = calsDirectas.reduce((acc, c) => acc + Number(c.nota), 0);
        }
      }

      // Determinar nota final y estado inequívoco (distinguiendo nota 0 de pendiente)
      let notaFinal: number | null = null;
      let estadoNota: 'calificada' | 'sin_calcular' | 'sin_evaluar' = 'sin_evaluar';

      if (notaConsolidada !== null) {
        notaFinal = notaConsolidada;
        estadoNota = 'calificada';
      } else if (apartadosConNota > 0) {
        if (sumaPesos > 0) {
          notaFinal = Math.round((sumaPonderada / sumaPesos) * 100) / 100;
          estadoNota = 'calificada';
        } else {
          estadoNota = 'sin_calcular';
        }
      } else {
        estadoNota = 'sin_evaluar';
      }

      return {
        rubrica: rub,
        actividadNombre: act?.nombre,
        nota: notaFinal,
        estado: estadoNota,
      };
    });

    const totalEvaluadas = resumenNotas.filter((r) => r.estado === 'calificada').length;

    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95">
          {/* Cabecera verde de éxito */}
          <div className="bg-emerald-700 text-white p-5 text-center relative">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 text-emerald-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-14 h-14 bg-emerald-800/80 border-2 border-emerald-400/40 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-100 shadow-inner">
              <CheckCircle2 className="w-8 h-8 text-emerald-300" />
            </div>
            <h3 className="text-lg font-bold text-white">¡Corrección de cuaderno completada!</h3>
            <p className="text-xs text-emerald-100 mt-1">
              Se han revisado todas las rúbricas seleccionadas para este alumno.
            </p>
          </div>

          <div className="p-5 space-y-4">
            {/* Tarjeta del alumno */}
            <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                  {alumnoActual?.orden !== undefined ? alumnoActual.orden : <User className="w-4 h-4" />}
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-900">{alumnoActual?.nombre}</div>
                  <div className="text-xs text-emerald-800 font-medium">{grupoNombre}</div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-emerald-900 bg-white px-2.5 py-1 rounded-lg border border-emerald-300 shadow-2xs">
                  {totalEvaluadas} de {rubricasParaEvaluar.length} calificadas
                </span>
              </div>
            </div>

            {/* Lista resumida de rúbricas */}
            <div>
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Resumen de calificaciones obtenidas
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                {resumenNotas.map((item, idx) => (
                  <div
                    key={item.rubrica.id}
                    className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-mono text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <div className="font-semibold text-slate-900 truncate" title={item.rubrica.titulo}>
                          {item.rubrica.titulo}
                        </div>
                        {item.actividadNombre && (
                          <div className="text-[10px] text-slate-500 truncate">
                            Actividad: {item.actividadNombre}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono font-bold text-xs">
                      {item.estado === 'calificada' && item.nota !== null ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono font-bold">
                          {item.nota.toFixed(2)}
                        </span>
                      ) : item.estado === 'sin_calcular' ? (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-semibold">
                          Sin nota final calculada
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-300 text-[10px] font-semibold">
                          Pendiente de evaluar
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Aviso cuando se llega al final de la lista del grupo */}
            {esUltimoAlumno && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-950">
                    Fin de la lista de alumnos
                  </div>
                  <div className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    Has completado la corrección del último alumno de la lista ({alumnoActual?.nombre}).
                  </div>
                </div>
              </div>
            )}

            {/* Botones de acción */}
            <div className="pt-2 space-y-2">
              {!esUltimoAlumno && siguienteAlumno ? (
                <button
                  type="button"
                  onClick={handleEvaluarSiguienteAlumno}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <span>Corregir siguiente alumno ({siguienteAlumno.nombre})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirmReiniciarGrupo(true)}
                  className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reiniciar corrección desde el 1.er alumno ({alumnosOrdenados[0]?.nombre || 'Primero'})</span>
                </button>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleVolverPrimeraRubrica}
                  className="flex-1 py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Volver a la 1.ª rúbrica</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-colors cursor-pointer text-center"
                >
                  Salir de corrección
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal de confirmación para reiniciar el grupo */}
        {showConfirmReiniciarGrupo && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          >
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3 shadow-2xl border border-slate-200 text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <span>¿Reiniciar grupo desde el principio?</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Ya has evaluado a todos los alumnos de la lista. Esta acción te llevará de nuevo a la primera rúbrica con el primer alumno del grupo (<strong>{alumnosOrdenados[0]?.nombre}</strong>).
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmReiniciarGrupo(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleReiniciarDesdePrimerAlumno}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer shadow-xs"
                >
                  Sí, reiniciar grupo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // PASO 1: CONFIGURACIÓN Y SELECCIÓN DE ALUMNO Y RÚBRICAS
  // =========================================================================
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95">
        {/* Cabecera */}
        <div className="bg-emerald-800 text-white px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 shrink-0 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center shadow-inner">
              <BookOpen className="w-4 h-4 text-emerald-100" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">Corrección de Cuaderno</h2>
              <p className="text-[11px] text-emerald-200">
                Curso: <strong className="text-white">{grupoNombre}</strong> · Evaluación consecutiva sin cambiar de alumno
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-emerald-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo configurable con scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* Selección de Alumno */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
            <label htmlFor="alumno-correccion-select" className="font-bold text-slate-800 flex items-center gap-1.5">
              <User className="w-4 h-4 text-emerald-700" />
              <span>1. Alumno que vas a evaluar</span>
            </label>
            <p className="text-[11px] text-slate-500">
              Este alumno se mantendrá fijo al avanzar consecutivamente entre las rúbricas seleccionadas.
            </p>
            <select
              id="alumno-correccion-select"
              value={alumnoSeleccionadoId}
              onChange={(e) => setAlumnoSeleccionadoId(e.target.value)}
              className="w-full bg-white border border-slate-300 text-slate-900 font-bold text-xs sm:text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer shadow-2xs"
            >
              {alumnosOrdenados.map((al) => (
                <option key={al.id} value={al.id}>
                  {al.orden !== undefined ? `${al.orden}. ` : ''}{al.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Información y transparencia sobre la identificación de rúbricas y orden cronológico */}
          <div className="bg-blue-50/80 border border-blue-200 text-blue-900 p-3 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-blue-950">
              <Info className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Orden cronológico e identificación de rúbricas</span>
            </div>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              Las rúbricas se muestran <strong>ordenadas cronológicamente (de la más antigua a la más reciente)</strong> utilizando la fecha real de la actividad asociada o la fecha de creación de la rúbrica en Supabase.
            </p>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              Dado que el modelo de datos no dispone de una columna nativa <em>es_cuaderno</em>, se han preseleccionado las rúbricas asociadas a secciones o métodos de cuaderno. Puedes activar o desactivar las casillas para definir exactamente qué rúbricas componen esta corrección.
            </p>
          </div>

          {/* Lista de rúbricas ordenadas cronológicamente */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-700" />
                <span>2. Rúbricas del cuaderno ({rubricasSeleccionadasIds.size} de {rubricasCronologicas.length} seleccionadas)</span>
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={handleSeleccionarTodas}
                  className="px-2 py-0.5 text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50 rounded border border-emerald-300 font-semibold cursor-pointer"
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={handleDeseleccionarTodas}
                  className="px-2 py-0.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded border border-slate-300 font-semibold cursor-pointer"
                >
                  Ninguna
                </button>
                <button
                  type="button"
                  onClick={handleRestablecerSugeridas}
                  className="px-2 py-0.5 text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded border border-blue-200 font-semibold cursor-pointer"
                >
                  Sugeridas
                </button>
              </div>
            </div>

            {rubricasCronologicas.length === 0 ? (
              <div className="p-4 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                No hay rúbricas registradas en este grupo. Crea o importa una rúbrica antes de iniciar la corrección.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto bg-white">
                {rubricasCronologicas.map((item, index) => {
                  const isChecked = rubricasSeleccionadasIds.has(item.rubrica.id);
                  return (
                    <label
                      key={item.rubrica.id}
                      className={`p-2.5 sm:p-3 flex items-start gap-3 cursor-pointer transition-colors ${
                        isChecked ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleRubrica(item.rubrica.id)}
                        className="mt-0.5 h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                      />

                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[10px] text-slate-500 font-bold">
                            #{index + 1}
                          </span>
                          <span className="font-bold text-slate-900 text-xs sm:text-sm">
                            {item.rubrica.titulo}
                          </span>
                          {item.esSugeridaCuaderno && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Sugerida cuaderno
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                          {/* Fecha */}
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{item.fechaFormateada}</span>
                            <span className="text-[10px] text-slate-400">({item.origenFecha})</span>
                          </span>

                          {/* Actividad vinculada */}
                          {item.actividadAsociada && (
                            <span className="text-slate-600 truncate max-w-xs" title={item.actividadAsociada.nombre}>
                              Actividad: <strong>{item.actividadAsociada.nombre}</strong>
                            </span>
                          )}

                          {/* Sección vinculada */}
                          {item.seccionAsociada && (
                            <span className="text-slate-600">
                              Sección: <strong>{item.seccionAsociada.nombre}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Pie de acción */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleIniciarCorreccion}
            disabled={rubricasParaEvaluar.length === 0 || !alumnoActual}
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <span>Iniciar corrección ({rubricasParaEvaluar.length} rúbricas)</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
