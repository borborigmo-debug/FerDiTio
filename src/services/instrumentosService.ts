/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface InstrumentoEvaluacion {
  id: string;
  nombre: string;
  ponderacion: number; // Porcentaje de peso (ej. 40, 30, 20, 10)
  descripcion?: string;
  color?: string;
}

export interface ConfiguracionInstrumentos {
  /**
   * Conmutador global: Esta ponderación solo se tendrá en cuenta si el profesor elige asignarles un peso.
   */
  aplicarPonderacion: boolean;
  instrumentos: InstrumentoEvaluacion[];
  ultimaModificacion?: string;
}

const STORAGE_PREFIX = 'fernanditio_instrumentos_';

/**
 * Instrumentos de evaluación comunes en Educación Secundaria y Bachillerato
 */
export const INSTRUMENTOS_PREDETERMINADOS: InstrumentoEvaluacion[] = [
  {
    id: 'inst-1',
    nombre: 'Prueba escrita',
    ponderacion: 40,
    descripcion: 'Exámenes, controles de comprensión, análisis sintáctico y pruebas objetivas.',
    color: '#6366f1',
  },
  {
    id: 'inst-2',
    nombre: 'Rúbrica de expresión oral y escrita',
    ponderacion: 30,
    descripcion: 'Comentarios de texto, redacciones, debates, exposiciones orales y declamación.',
    color: '#0d9488',
  },
  {
    id: 'inst-3',
    nombre: 'Trabajos y proyectos',
    ponderacion: 20,
    descripcion: 'Trabajo monográfico, proyectos colaborativos, antologías y creaciones literarias.',
    color: '#d97706',
  },
  {
    id: 'inst-4',
    nombre: 'Cuaderno y trabajo diario',
    ponderacion: 10,
    descripcion: 'Seguimiento del cuaderno de aula, tareas habituales y fichas de lectura.',
    color: '#059669',
  },
];

/**
 * Recupera la configuración de instrumentos del docente.
 */
export function getConfiguracionInstrumentos(profesorUid?: string): ConfiguracionInstrumentos {
  const key = `${STORAGE_PREFIX}${profesorUid || 'global'}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.instrumentos)) {
        return parsed as ConfiguracionInstrumentos;
      }
    }
  } catch (err) {
    console.warn('[instrumentosService] Error al leer instrumentos:', err);
  }

  // Por defecto: ponderación desactivada hasta que el profesor elija activarla
  return {
    aplicarPonderacion: false,
    instrumentos: INSTRUMENTOS_PREDETERMINADOS,
  };
}

/**
 * Persiste la configuración de instrumentos del docente.
 */
export function saveConfiguracionInstrumentos(
  config: ConfiguracionInstrumentos,
  profesorUid?: string
): void {
  const key = `${STORAGE_PREFIX}${profesorUid || 'global'}`;
  try {
    const dataToSave: ConfiguracionInstrumentos = {
      ...config,
      ultimaModificacion: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(dataToSave));
    window.dispatchEvent(new CustomEvent('fernanditio:instrumentos-actualizados', { detail: dataToSave }));
  } catch (err) {
    console.error('[instrumentosService] Error al guardar instrumentos:', err);
  }
}
