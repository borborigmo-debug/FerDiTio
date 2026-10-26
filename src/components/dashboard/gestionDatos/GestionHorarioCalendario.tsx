/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  Info,
  CalendarCheck,
  GraduationCap,
  Bell,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useCuaderno, EvaluacionPeriodo } from '../../../context/CuadernoContext';
import {
  HorarioCalendarioConfig,
  EvaluacionFechaRango,
  FranjaHoraria,
  SesionHorario,
  DiaSemana,
  getHorarioCalendario,
  saveHorarioCalendario,
  generarCalendarioPredeterminado,
  FRANJAS_PREDETERMINADAS,
  obtenerEvaluacionActual,
  obtenerSesionActual,
} from '../../../services/horarioCalendarioService';

const DIAS_SEMANA: Array<{ id: DiaSemana; label: string; abreviado: string }> = [
  { id: 1, label: 'Lunes', abreviado: 'L' },
  { id: 2, label: 'Martes', abreviado: 'M' },
  { id: 3, label: 'Miércoles', abreviado: 'X' },
  { id: 4, label: 'Jueves', abreviado: 'J' },
  { id: 5, label: 'Viernes', abreviado: 'V' },
];

export const GestionHorarioCalendario: React.FC = () => {
  const { user } = useAuth();
  const { grupos } = useCuaderno();

  const [config, setConfig] = useState<HorarioCalendarioConfig>(() =>
    getHorarioCalendario(user?.uid)
  );
  const [subTab, setSubTab] = useState<'calendario' | 'horario' | 'franjas'>('horario');
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Recargar al cambiar de usuario
  useEffect(() => {
    setConfig(getHorarioCalendario(user?.uid));
  }, [user?.uid]);

  // Diagnóstico en tiempo real
  const evaluacionActualHoy = useMemo(() => {
    return obtenerEvaluacionActual(config.calendario);
  }, [config.calendario]);

  const sesionActualHoy = useMemo(() => {
    return obtenerSesionActual(config, grupos);
  }, [config, grupos]);

  const handleGuardar = (nuevaConfig?: HorarioCalendarioConfig) => {
    const toSave = nuevaConfig || config;
    saveHorarioCalendario(toSave, user?.uid);
    setConfig({ ...toSave });
    setMensajeExito('Horario lectivo y calendario de evaluaciones guardados correctamente.');
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const handleRestablecerValores = () => {
    if (
      window.confirm(
        '¿Deseas restablecer el calendario de evaluaciones y las franjas horarias a los valores oficiales predeterminados?'
      )
    ) {
      const resetConfig: HorarioCalendarioConfig = {
        calendario: generarCalendarioPredeterminado(),
        franjas: FRANJAS_PREDETERMINADAS,
        horario: config.horario, // conservamos las asignaciones hechas
        aperturaAutomaticaHabilitada: true,
      };
      handleGuardar(resetConfig);
    }
  };

  // Modificar fecha de evaluación
  const handleUpdateFechaEvaluacion = (
    periodo: EvaluacionPeriodo,
    campo: 'fechaInicio' | 'fechaFin',
    valor: string
  ) => {
    const nuevoCalendario = config.calendario.map((item) =>
      item.periodo === periodo ? { ...item, [campo]: valor } : item
    );
    const updated = { ...config, calendario: nuevoCalendario };
    setConfig(updated);
  };

  // Modificar asignación en horario
  const handleSetSesionGrupo = (dia: DiaSemana, franjaId: string, grupoId: string | null) => {
    const sinActual = config.horario.filter(
      (s) => !(s.dia === dia && s.franjaId === franjaId)
    );
    let nuevoHorario = sinActual;
    if (grupoId) {
      nuevoHorario = [...sinActual, { dia, franjaId, grupoId }];
    }
    const updated = { ...config, horario: nuevoHorario };
    setConfig(updated);
    saveHorarioCalendario(updated, user?.uid);
  };

  // Modificar franja horaria
  const handleUpdateFranja = (franjaId: string, updates: Partial<FranjaHoraria>) => {
    const nuevasFranjas = config.franjas.map((f) =>
      f.id === franjaId ? { ...f, ...updates } : f
    );
    const updated = { ...config, franjas: nuevasFranjas };
    setConfig(updated);
  };

  // Añadir nueva franja
  const handleAddFranja = () => {
    const id = `f_${Date.now()}`;
    const ultima = config.franjas[config.franjas.length - 1];
    const nueva: FranjaHoraria = {
      id,
      nombre: `Nueva Sesión`,
      horaInicio: ultima ? ultima.horaFin : '15:00',
      horaFin: '16:00',
    };
    const updated = { ...config, franjas: [...config.franjas, nueva] };
    setConfig(updated);
  };

  // Eliminar franja
  const handleRemoveFranja = (franjaId: string) => {
    const nuevasFranjas = config.franjas.filter((f) => f.id !== franjaId);
    const nuevoHorario = config.horario.filter((h) => h.franjaId !== franjaId);
    const updated = { ...config, franjas: nuevasFranjas, horario: nuevoHorario };
    setConfig(updated);
  };

  return (
    <div className="space-y-6">
      {/* Mensaje de confirmación */}
      {mensajeExito && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{mensajeExito}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensajeExito(null)}
            className="text-emerald-700 font-bold hover:text-emerald-900"
          >
            ×
          </button>
        </div>
      )}

      {/* Banner explicativo y diagnóstico en vivo */}
      <div className="bg-gradient-to-r from-indigo-50/80 via-white to-blue-50/80 p-4 rounded-xl border border-indigo-200/80 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Horario Lectivo y Calendario de Evaluaciones</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Global Docente
                </span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Con esta información, Fernanditio se abrirá automáticamente en la evaluación y en el grupo correspondiente a esa fecha y a esa hora. Esta información se introduce una sola vez y se aplica a todos los grupos.
              </p>
            </div>
          </div>

          {/* Conmutador de apertura automática */}
          <div className="flex items-center gap-2.5 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs shrink-0 self-start sm:self-center">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.aperturaAutomaticaHabilitada}
                onChange={(e) => {
                  const updated = {
                    ...config,
                    aperturaAutomaticaHabilitada: e.target.checked,
                  };
                  setConfig(updated);
                  saveHorarioCalendario(updated, user?.uid);
                }}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800">
                Apertura automática al entrar
              </span>
            </label>
          </div>
        </div>

        {/* Estado actual según la hora y fecha del sistema */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-indigo-100 text-xs">
          <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200/70">
            <CalendarCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-slate-600">Evaluación oficial según calendario hoy:</span>
            <span className="font-bold text-slate-900 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
              {evaluacionActualHoy}
            </span>
          </div>

          <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200/70">
            <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-slate-600">Sesión lectiva ahora:</span>
            {sesionActualHoy ? (
              <span className="font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 truncate">
                {sesionActualHoy.grupoNombre} ({sesionActualHoy.franja.nombre})
              </span>
            ) : (
              <span className="text-slate-500 italic">
                Sin clase activa en este momento
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Subpestañas */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('horario')}
            className={`px-4 py-2 text-xs font-bold border-b-2 cursor-pointer transition-all flex items-center gap-1.5 ${
              subTab === 'horario'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Horario Semanal Lectivo</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('calendario')}
            className={`px-4 py-2 text-xs font-bold border-b-2 cursor-pointer transition-all flex items-center gap-1.5 ${
              subTab === 'calendario'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Calendario de Evaluaciones</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('franjas')}
            className={`px-4 py-2 text-xs font-bold border-b-2 cursor-pointer transition-all flex items-center gap-1.5 ${
              subTab === 'franjas'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Configurar Franjas Horarias</span>
          </button>
        </div>

        <div className="flex items-center gap-2 pb-1">
          <button
            type="button"
            onClick={handleRestablecerValores}
            className="px-2.5 py-1 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-md border border-slate-200 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
            title="Restablecer calendario y franjas a los valores oficiales predeterminados"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restablecer</span>
          </button>

          <button
            type="button"
            onClick={() => handleGuardar()}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-md flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar cambios</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          1. VISTA: HORARIO SEMANAL LECTIVO
          ======================================================== */}
      {subTab === 'horario' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>
              Haz clic en el desplegable de cada sesión para asignar el grupo que tienes asignado en esa hora:
            </span>
            <span className="font-semibold text-indigo-700">
              {grupos.length} {grupos.length === 1 ? 'curso disponible' : 'cursos disponibles'}
            </span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-32 border-r border-slate-200 text-center">
                    Hora / Sesión
                  </th>
                  {DIAS_SEMANA.map((d) => (
                    <th key={d.id} className="p-3 text-center border-r border-slate-200 last:border-r-0">
                      <span className="block text-slate-900 font-bold">{d.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {config.franjas.map((franja) => {
                  if (franja.esRecreo) {
                    return (
                      <tr key={franja.id} className="bg-amber-50/50 text-amber-900 border-y border-amber-200/60">
                        <td className="p-2.5 text-center font-bold border-r border-amber-200/60 font-mono text-[11px]">
                          {franja.horaInicio} - {franja.horaFin}
                        </td>
                        <td colSpan={5} className="p-2 text-center font-bold tracking-wider uppercase text-[11px] text-amber-800">
                          ☕ {franja.nombre}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={franja.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3 border-r border-slate-200 bg-slate-50/50">
                        <span className="block font-bold text-slate-800">{franja.nombre}</span>
                        <span className="block text-[11px] font-mono text-slate-500">
                          {franja.horaInicio} - {franja.horaFin}
                        </span>
                      </td>

                      {DIAS_SEMANA.map((d) => {
                        const sesion = config.horario.find(
                          (s) => s.dia === d.id && s.franjaId === franja.id
                        );
                        const grupoAsignadoId = sesion?.grupoId || '';
                        const grupoActual = grupos.find((g) => g.id === grupoAsignadoId);

                        return (
                          <td
                            key={d.id}
                            className={`p-2 border-r border-slate-200 last:border-r-0 transition-colors ${
                              grupoActual ? 'bg-indigo-50/30' : ''
                            }`}
                          >
                            <select
                              value={grupoAsignadoId}
                              onChange={(e) =>
                                handleSetSesionGrupo(
                                  d.id,
                                  franja.id,
                                  e.target.value || null
                                )
                              }
                              className={`w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer ${
                                grupoActual
                                  ? 'bg-indigo-600 text-white font-bold border-indigo-700 shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                              }`}
                            >
                              <option value="" className="bg-white text-slate-700">
                                -- Libre / Guardia --
                              </option>
                              {grupos.map((g) => (
                                <option key={g.id} value={g.id} className="bg-white text-slate-900 font-bold">
                                  {g.nombre}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          2. VISTA: CALENDARIO DE EVALUACIONES
          ======================================================== */}
      {subTab === 'calendario' && (
        <div className="space-y-4 animate-in fade-in">
          <p className="text-xs text-slate-600">
            Define los rangos de fechas de cada evaluación escolar. Al abrir Fernanditio, se seleccionará automáticamente la evaluación que corresponda a la fecha actual.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {config.calendario.map((ev) => {
              const esActivaHoy = evaluacionActualHoy === ev.periodo;

              return (
                <div
                  key={ev.periodo}
                  className={`p-4 rounded-xl border transition-all ${
                    esActivaHoy
                      ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white border-slate-200 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <GraduationCap className={`w-4 h-4 ${esActivaHoy ? 'text-indigo-600' : 'text-slate-500'}`} />
                      <h4 className="font-bold text-sm text-slate-900">{ev.periodo}</h4>
                    </div>
                    {esActivaHoy && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Activa hoy
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Fecha de inicio:
                      </label>
                      <input
                        type="date"
                        value={ev.fechaInicio}
                        onChange={(e) =>
                          handleUpdateFechaEvaluacion(
                            ev.periodo,
                            'fechaInicio',
                            e.target.value
                          )
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Fecha de fin:
                      </label>
                      <input
                        type="date"
                        value={ev.fechaFin}
                        onChange={(e) =>
                          handleUpdateFechaEvaluacion(
                            ev.periodo,
                            'fechaFin',
                            e.target.value
                          )
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================
          3. VISTA: CONFIGURAR FRANJAS HORARIAS
          ======================================================== */}
      {subTab === 'franjas' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">
              Ajusta las horas de entrada y salida de las sesiones lectivas del centro escolar:
            </p>
            <button
              type="button"
              onClick={handleAddFranja}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir sesión</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Nombre de la sesión</th>
                  <th className="p-3 w-32">Hora Inicio</th>
                  <th className="p-3 w-32">Hora Fin</th>
                  <th className="p-3 w-28 text-center">¿Recreo?</th>
                  <th className="p-3 w-20 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {config.franjas.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <input
                        type="text"
                        value={f.nombre}
                        onChange={(e) =>
                          handleUpdateFranja(f.id, { nombre: e.target.value })
                        }
                        className="w-full max-w-xs px-2.5 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 font-medium"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="time"
                        value={f.horaInicio}
                        onChange={(e) =>
                          handleUpdateFranja(f.id, { horaInicio: e.target.value })
                        }
                        className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-slate-900"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="time"
                        value={f.horaFin}
                        onChange={(e) =>
                          handleUpdateFranja(f.id, { horaFin: e.target.value })
                        }
                        className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-slate-900"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(f.esRecreo)}
                        onChange={(e) =>
                          handleUpdateFranja(f.id, { esRecreo: e.target.checked })
                        }
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveFranja(f.id)}
                        disabled={config.franjas.length <= 1}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer disabled:opacity-30"
                        title="Eliminar sesión"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
