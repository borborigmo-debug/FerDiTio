/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Estados de inicialización y sesión en la aplicación
 */
export type AuthStatus = 
  | 'initializing'    // Comprobando sesión con Firebase
  | 'authenticated'   // Sesión activa confirmada
  | 'unauthenticated' // Sin sesión activa
  | 'unconfigured';   // Firebase no dispone de variables de configuración

/**
 * Representación tipada del docente autenticado
 */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * Contratos de dominio que reflejan fielmente el esquema auditado de Supabase
 * Tipos de identificadores confirmados:
 * - string (text): profesor, grupo, alumno, actividad, rubrica, seccion
 * - number (integer): criterio, calificacion
 */

export interface Profesor {
  id: string;
  email: string;
  nombre: string;
  created_at?: string;
  updated_at?: string;
}

export interface Grupo {
  id: string;
  profesor_id: string;
  nombre: string;
  oculto?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Alumno {
  id: string;
  grupo_id: string;
  nombre: string;
  orden: number;
  created_at?: string;
}

export interface Criterio {
  id: number; // integer en PostgreSQL
  grupo_id: string;
  codigo: string;
  descripcion: string;
  ponderacion?: number | null;
}

export interface Seccion {
  id: string;
  grupo_id: string;
  nombre: string;
  color?: string | null;
  ponderacion?: number | null; // Inactivo para el cálculo de notas
  oculto?: boolean;
}

export interface RubricaItem {
  id?: string; // Identificador UUID persistente (RFC 4122/9562); ausente u opcional en rúbricas históricas
  numero?: string;
  titulo?: string;
  peso?: number | null;
  criterio?: string | null; // Soporte histórico para criterio singular
  criterios?: string[] | null; // Soporte histórico para lista de criterios
  descriptores?: Record<string, string>;
  [key: string]: any;
}

export interface Rubrica {
  id: string;
  grupo_id: string;
  titulo: string;
  tipo: string;
  descripcion?: string | null;
  items: RubricaItem[] | any;
}

export interface Actividad {
  id: string;
  grupo_id: string;
  evaluacion_periodo?: string | null;
  nombre: string;
  tipo: string;
  seccion_id?: string | null;
  metodo?: string | null;
  rubrica_id?: string | null;
  fecha?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Representación extendida de una actividad con diagnóstico de sus criterios
 */
export interface ActividadDetalle extends Actividad {
  criteriosCodigos: string[];
  estadoVinculacion: 'rubrica_confirmada' | 'pendiente_verificar' | 'sin_rubrica';
  advertenciaRubrica?: string | null;
}

export interface Calificacion {
  id: number; // integer en PostgreSQL
  grupo_id: string;
  alumno_id: string;
  actividad_id: string;
  nota: number | null;
  updated_at?: string;
}

/**
 * Calificación granular e individual de un apartado específico de una rúbrica.
 * Asocia inequívocamente al alumno, la actividad real, la rúbrica y el UUID del apartado.
 * La ausencia de fila en Supabase representa 'pendiente de evaluar'.
 */
export interface CalificacionApartado {
  id: number | string; // bigserial en PostgreSQL o temporal
  grupo_id: string;
  alumno_id: string;
  actividad_id?: string | null;
  rubrica_id: string;
  apartado_id: string; // UUID persistente del apartado
  nota: number; // Numérico (0.00 a 10.00). El 0 es una calificación real.
  updated_at?: string;
}

/**
 * Estructura completa de lectura del cuaderno para un grupo seleccionado
 */
export interface CuadernoGrupoData {
  grupo: Grupo;
  alumnos: Alumno[];
  criterios: Criterio[];
  actividades: ActividadDetalle[];
  secciones: Seccion[];
  rubricas: Rubrica[];
  calificaciones: Calificacion[];
  calificacionesApartados?: CalificacionApartado[];
  estadisticas: {
    totalAlumnos: number;
    totalCriterios: number;
    totalActividades: number;
    totalRubricas: number;
    totalSecciones: number;
    totalCalificaciones: number;
    totalCalificacionesApartados?: number;
  };
}
