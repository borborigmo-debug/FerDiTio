/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EvaluacionPeriodo } from '../context/CuadernoContext';

export interface FranjaHoraria {
  id: string;
  nombre: string;
  horaInicio: string; // formato "HH:MM", ej: "08:30"
  horaFin: string;    // formato "HH:MM", ej: "09:25"
  esRecreo?: boolean;
}

export type DiaSemana = 1 | 2 | 3 | 4 | 5; // 1 = Lunes, ..., 5 = Viernes

export interface SesionHorario {
  dia: DiaSemana;
  franjaId: string;
  grupoId: string | null; // ID del grupo asignado o null para hora libre / guardia
  materia?: string;
  aula?: string;
}

export interface EvaluacionFechaRango {
  periodo: EvaluacionPeriodo;
  fechaInicio: string; // formato "YYYY-MM-DD"
  fechaFin: string;    // formato "YYYY-MM-DD"
}

export interface HorarioCalendarioConfig {
  calendario: EvaluacionFechaRango[];
  franjas: FranjaHoraria[];
  horario: SesionHorario[];
  aperturaAutomaticaHabilitada: boolean;
  ultimaActualizacion?: string;
}

const STORAGE_PREFIX = 'fernanditio_horario_calendario_';

/**
 * Franjas horarias lectivas estándar en centros de Secundaria y Bachillerato
 */
export const FRANJAS_PREDETERMINADAS: FranjaHoraria[] = [
  { id: 'f1', nombre: '1.ª Hora', horaInicio: '08:30', horaFin: '09:25' },
  { id: 'f2', nombre: '2.ª Hora', horaInicio: '09:25', horaFin: '10:20' },
  { id: 'f3', nombre: '3.ª Hora', horaInicio: '10:20', horaFin: '11:15' },
  { id: 'fr', nombre: 'Recreo', horaInicio: '11:15', horaFin: '11:45', esRecreo: true },
  { id: 'f4', nombre: '4.ª Hora', horaInicio: '11:45', horaFin: '12:40' },
  { id: 'f5', nombre: '5.ª Hora', horaInicio: '12:40', horaFin: '13:35' },
  { id: 'f6', nombre: '6.ª Hora', horaInicio: '13:35', horaFin: '14:30' },
];

/**
 * Calendario escolar oficial de evaluaciones por defecto (Castilla y León / curso actual)
 */
export function generarCalendarioPredeterminado(): EvaluacionFechaRango[] {
  const hoy = new Date();
  const yearActual = hoy.getFullYear();
  // Si estamos en el primer trimestre (septiembre a diciembre)
  const baseYear = hoy.getMonth() >= 7 ? yearActual : yearActual - 1;
  const nextYear = baseYear + 1;

  return [
    {
      periodo: '1.º Ev',
      fechaInicio: `${baseYear}-09-08`,
      fechaFin: `${baseYear}-11-30`,
    },
    {
      periodo: '2.º Ev',
      fechaInicio: `${baseYear}-12-01`,
      fechaFin: `${nextYear}-03-15`,
    },
    {
      periodo: '3.º Ev',
      fechaInicio: `${nextYear}-03-16`,
      fechaFin: `${nextYear}-06-15`,
    },
    {
      periodo: 'Global',
      fechaInicio: `${nextYear}-06-16`,
      fechaFin: `${nextYear}-06-30`,
    },
  ];
}

/**
 * Recupera la configuración global de horario y calendario del docente.
 * Esta información se introduce una vez y se aplica a todos los grupos.
 */
export function getHorarioCalendario(profesorUid?: string): HorarioCalendarioConfig {
  const key = `${STORAGE_PREFIX}${profesorUid || 'global'}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.calendario) && Array.isArray(parsed.franjas)) {
        return parsed as HorarioCalendarioConfig;
      }
    }
  } catch (err) {
    console.warn('[horarioCalendarioService] Error al leer configuración de horario:', err);
  }

  // Valores predeterminados si no se ha configurado aún
  return {
    calendario: generarCalendarioPredeterminado(),
    franjas: FRANJAS_PREDETERMINADAS,
    horario: [],
    aperturaAutomaticaHabilitada: true,
  };
}

/**
 * Guarda la configuración global de horario y calendario del docente.
 */
export function saveHorarioCalendario(
  config: HorarioCalendarioConfig,
  profesorUid?: string
): void {
  const key = `${STORAGE_PREFIX}${profesorUid || 'global'}`;
  try {
    const dataToSave: HorarioCalendarioConfig = {
      ...config,
      ultimaActualizacion: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(dataToSave));
    // Disparar evento para que otras partes de la app puedan reaccionar
    window.dispatchEvent(new CustomEvent('fernanditio:horario-actualizado', { detail: dataToSave }));
  } catch (err) {
    console.error('[horarioCalendarioService] Error al persistir configuración de horario:', err);
  }
}

/**
 * Determina cuál es la evaluación activa según el calendario escolar y la fecha actual.
 */
export function obtenerEvaluacionActual(
  calendario: EvaluacionFechaRango[],
  fechaReferencia: Date = new Date()
): EvaluacionPeriodo {
  if (!calendario || calendario.length === 0) {
    return '1.º Ev';
  }

  // Convertir fecha a "YYYY-MM-DD"
  const y = fechaReferencia.getFullYear();
  const m = String(fechaReferencia.getMonth() + 1).padStart(2, '0');
  const d = String(fechaReferencia.getDate()).padStart(2, '0');
  const hoyStr = `${y}-${m}-${d}`;

  // Buscar coincidencia en rangos
  for (const item of calendario) {
    if (hoyStr >= item.fechaInicio && hoyStr <= item.fechaFin) {
      return item.periodo;
    }
  }

  // Si hoy es anterior a la primera fecha, 1.º Ev
  if (calendario[0] && hoyStr < calendario[0].fechaInicio) {
    return calendario[0].periodo;
  }

  // Si hoy es posterior a todas, 'Global' o la última
  return calendario[calendario.length - 1].periodo;
}

/**
 * Determina qué grupo tiene clase en la fecha y hora actual según el horario lectivo.
 */
export function obtenerSesionActual(
  horarioConfig: HorarioCalendarioConfig,
  grupos: Array<{ id: string; nombre: string }>,
  fechaReferencia: Date = new Date()
): {
  grupoId: string;
  grupoNombre: string;
  franja: FranjaHoraria;
  diaSemana: DiaSemana;
} | null {
  if (!horarioConfig.aperturaAutomaticaHabilitada) {
    return null;
  }

  const diaRaw = fechaReferencia.getDay(); // 0 = Domingo, 1 = Lunes, ..., 5 = Viernes, 6 = Sábado
  if (diaRaw < 1 || diaRaw > 5) {
    // Es fin de semana (Sábado o Domingo): no hay sesión lectiva
    return null;
  }
  const diaSemana = diaRaw as DiaSemana;

  // Minutos actuales desde las 00:00
  const horaActualMin = fechaReferencia.getHours() * 60 + fechaReferencia.getMinutes();

  // Buscar qué franja horaria está en curso
  const franjaActiva = horarioConfig.franjas.find((f) => {
    if (f.esRecreo) return false;
    const [hIni, mIni] = f.horaInicio.split(':').map(Number);
    const [hFin, mFin] = f.horaFin.split(':').map(Number);
    const minInicio = hIni * 60 + mIni;
    const minFin = hFin * 60 + mFin;
    return horaActualMin >= minInicio && horaActualMin <= minFin;
  });

  if (!franjaActiva) {
    return null;
  }

  // Buscar si hay clase programada para este día y franja
  const sesion = horarioConfig.horario.find(
    (s) => s.dia === diaSemana && s.franjaId === franjaActiva.id && Boolean(s.grupoId)
  );

  if (!sesion || !sesion.grupoId) {
    return null;
  }

  // Verificar que el grupo exista en la lista del docente
  const grupoEncontrado = grupos.find((g) => g.id === sesion.grupoId);
  if (!grupoEncontrado) {
    return null;
  }

  return {
    grupoId: grupoEncontrado.id,
    grupoNombre: grupoEncontrado.nombre,
    franja: franjaActiva,
    diaSemana,
  };
}
