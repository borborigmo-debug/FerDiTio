/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCurrentIdToken } from './authService';
import { Alumno, Criterio, Seccion, Grupo } from '../types';
import { GrupoDocente } from './gruposService';
import { extractDocxTextAndTables } from '../utils/geminiRubricaImportUtils';
import * as XLSX from 'xlsx';

const SUPABASE_FUNCTIONS_BASE = 'https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1';

async function callEdgeFunction<T>(bodyPayload: Record<string, any>): Promise<T> {
  const token = await getCurrentIdToken();
  if (!token) {
    throw new Error('No existe una sesión autenticada activa con Firebase para conectar con Supabase.');
  }

  const endpoint = `${SUPABASE_FUNCTIONS_BASE}/fernanditio-data`;
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });
  } catch (err: any) {
    throw new Error(
      `Error de red o conexión al comunicarse con Supabase: ${err?.message || 'Fallo de red'}`
    );
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(`El servidor devolvió un error HTTP ${response.status}: ${response.statusText}`);
  }

  if (!response.ok) {
    // Si la función remota desplegada todavía tiene el handler antiguo que exige calificaciones:
    if (data?.error && data.error.includes('Se requiere al menos una calificación')) {
      throw new Error(
        `La función remota 'fernanditio-data' en Supabase todavía no tiene desplegado el controlador para la operación «${bodyPayload.tipo}». Despliegue la última versión de la Edge Function en Supabase.`
      );
    }
    throw new Error(data?.error || `Error ${response.status}: ${response.statusText}`);
  }

  return data as T;
}

// =========================================================================
// 1. CURSOS (GRUPOS)
// =========================================================================

export async function crearGrupo(nombre: string): Promise<GrupoDocente> {
  const cleanNombre = (nombre || '').trim();
  if (!cleanNombre || cleanNombre.length < 2) {
    throw new Error('El nombre del curso debe tener al menos 2 caracteres.');
  }

  const res = await callEdgeFunction<{ success: boolean; grupo: GrupoDocente }>({
    tipo: 'crear_grupo',
    nombre: cleanNombre,
  });

  if (!res?.grupo) {
    throw new Error('La respuesta del servidor no confirmó la creación del curso.');
  }
  return res.grupo;
}

export async function eliminarGrupos(grupoIds: string[]): Promise<{ eliminados: string[] }> {
  if (!Array.isArray(grupoIds) || grupoIds.length === 0) {
    throw new Error('Debe seleccionar al menos un curso para eliminar.');
  }

  const res = await callEdgeFunction<{ success: boolean; eliminados: string[] }>({
    tipo: 'eliminar_grupos',
    grupoIds,
  });

  return { eliminados: res.eliminados || grupoIds };
}

// =========================================================================
// 2. ALUMNOS
// =========================================================================

export async function crearAlumno(grupoId: string, nombre: string, orden?: number): Promise<Alumno> {
  const cleanNombre = (nombre || '').trim();
  if (!cleanNombre || cleanNombre.length < 2) {
    throw new Error('El nombre del alumno debe tener al menos 2 caracteres.');
  }

  const res = await callEdgeFunction<{ success: boolean; alumno: Alumno }>({
    tipo: 'crear_alumno',
    grupoId,
    nombre: cleanNombre,
    orden: typeof orden === 'number' && !isNaN(orden) ? orden : undefined,
  });

  if (!res?.alumno) {
    throw new Error('El servidor no confirmó el alta del alumno.');
  }
  return res.alumno;
}

export async function actualizarAlumno(
  grupoId: string,
  alumnoId: string,
  nombre: string,
  orden?: number
): Promise<Alumno> {
  const cleanNombre = (nombre || '').trim();
  if (!cleanNombre || cleanNombre.length < 2) {
    throw new Error('El nombre del alumno no puede estar vacío.');
  }

  const res = await callEdgeFunction<{ success: boolean; alumno: Alumno }>({
    tipo: 'actualizar_alumno',
    grupoId,
    alumnoId,
    nombre: cleanNombre,
    orden: typeof orden === 'number' && !isNaN(orden) ? orden : undefined,
  });

  if (!res?.alumno) {
    throw new Error('El servidor no confirmó la actualización del alumno.');
  }
  return res.alumno;
}

export async function eliminarAlumnos(
  grupoId: string,
  alumnoIds: string[]
): Promise<{ eliminados: string[] }> {
  if (!Array.isArray(alumnoIds) || alumnoIds.length === 0) {
    throw new Error('Debe seleccionar al menos un alumno para eliminar.');
  }

  const res = await callEdgeFunction<{ success: boolean; eliminados: string[] }>({
    tipo: 'eliminar_alumnos',
    grupoId,
    alumnoIds,
  });

  return { eliminados: res.eliminados || alumnoIds };
}

export async function importarAlumnos(
  grupoId: string,
  alumnos: Array<{ nombre: string; orden?: number }>
): Promise<{ total: number; alumnos: Alumno[] }> {
  if (!Array.isArray(alumnos) || alumnos.length === 0) {
    throw new Error('No hay alumnos para importar.');
  }

  const res = await callEdgeFunction<{ success: boolean; total: number; alumnos: Alumno[] }>({
    tipo: 'importar_alumnos',
    grupoId,
    alumnos,
  });

  return { total: res.total || res.alumnos?.length || 0, alumnos: res.alumnos || [] };
}

// =========================================================================
// 3. CRITERIOS DE EVALUACIÓN
// =========================================================================

export async function crearCriterio(
  grupoId: string,
  codigo: string,
  descripcion: string,
  ponderacion?: number | null
): Promise<Criterio> {
  const cleanCodigo = (codigo || '').trim();
  const cleanDesc = (descripcion || '').trim();
  if (!cleanCodigo) throw new Error('El código del criterio es obligatorio.');
  if (!cleanDesc) throw new Error('La descripción del criterio es obligatoria.');

  if (ponderacion !== null && ponderacion !== undefined) {
    if (isNaN(ponderacion) || ponderacion < 0) {
      throw new Error('La ponderación no puede ser negativa.');
    }
  }

  const res = await callEdgeFunction<{ success: boolean; criterio: Criterio }>({
    tipo: 'crear_criterio',
    grupoId,
    codigo: cleanCodigo,
    descripcion: cleanDesc,
    ponderacion: ponderacion !== null && ponderacion !== undefined ? ponderacion : null,
  });

  if (!res?.criterio) {
    throw new Error('El servidor no confirmó la creación del criterio.');
  }
  return res.criterio;
}

export async function actualizarCriterio(
  grupoId: string,
  criterioId: number,
  codigo: string,
  descripcion: string,
  ponderacion?: number | null
): Promise<Criterio> {
  const cleanCodigo = (codigo || '').trim();
  const cleanDesc = (descripcion || '').trim();
  if (!cleanCodigo) throw new Error('El código del criterio es obligatorio.');
  if (!cleanDesc) throw new Error('La descripción del criterio es obligatoria.');

  if (ponderacion !== null && ponderacion !== undefined) {
    if (isNaN(ponderacion) || ponderacion < 0) {
      throw new Error('La ponderación no puede ser negativa.');
    }
  }

  const res = await callEdgeFunction<{ success: boolean; criterio: Criterio }>({
    tipo: 'actualizar_criterio',
    grupoId,
    criterioId,
    codigo: cleanCodigo,
    descripcion: cleanDesc,
    ponderacion: ponderacion !== null && ponderacion !== undefined ? ponderacion : null,
  });

  if (!res?.criterio) {
    throw new Error('El servidor no confirmó la actualización del criterio.');
  }
  return res.criterio;
}

export async function actualizarPonderacionCriterio(
  grupoId: string,
  criterioId: number,
  ponderacion: number | null
): Promise<{ criterioId: number; ponderacion: number | null }> {
  if (ponderacion !== null && ponderacion !== undefined) {
    if (isNaN(ponderacion) || ponderacion < 0) {
      throw new Error('La ponderación debe ser un número mayor o igual a 0.');
    }
  }

  const res = await callEdgeFunction<{ success: boolean; criterio: Criterio }>({
    tipo: 'actualizar_ponderacion_criterio',
    grupoId,
    criterioId,
    ponderacion,
  });

  return { criterioId, ponderacion: res.criterio?.ponderacion ?? ponderacion };
}

export async function eliminarCriterios(
  grupoId: string,
  criterioIds: number[]
): Promise<{ eliminados: number[] }> {
  if (!Array.isArray(criterioIds) || criterioIds.length === 0) {
    throw new Error('Debe seleccionar al menos un criterio para eliminar.');
  }

  const res = await callEdgeFunction<{ success: boolean; eliminados: number[] }>({
    tipo: 'eliminar_criterios',
    grupoId,
    criterioIds,
  });

  return { eliminados: res.eliminados || criterioIds };
}

export async function importarCriterios(
  grupoId: string,
  criterios: Array<{ codigo: string; descripcion: string; ponderacion?: number | null }>
): Promise<{ total: number; criterios: Criterio[] }> {
  if (!Array.isArray(criterios) || criterios.length === 0) {
    throw new Error('No hay criterios para importar.');
  }

  const res = await callEdgeFunction<{ success: boolean; total: number; criterios: Criterio[] }>({
    tipo: 'importar_criterios',
    grupoId,
    criterios,
  });

  return { total: res.total || res.criterios?.length || 0, criterios: res.criterios || [] };
}

// =========================================================================
// 4. SECCIONES
// =========================================================================

export async function crearSeccion(grupoId: string, nombre: string, color?: string | null): Promise<Seccion> {
  const cleanNombre = (nombre || '').trim();
  if (!cleanNombre || cleanNombre.length < 2) {
    throw new Error('El nombre de la sección debe tener al menos 2 caracteres.');
  }

  const res = await callEdgeFunction<{ success: boolean; seccion: Seccion }>({
    tipo: 'crear_seccion',
    grupoId,
    nombre: cleanNombre,
    color: color || null,
  });

  if (!res?.seccion) {
    throw new Error('El servidor no confirmó la creación de la sección.');
  }
  return res.seccion;
}

export async function actualizarSeccion(
  grupoId: string,
  seccionId: string,
  nombre: string,
  color?: string | null
): Promise<Seccion> {
  const cleanNombre = (nombre || '').trim();
  if (!cleanNombre || cleanNombre.length < 2) {
    throw new Error('El nombre de la sección no puede estar vacío.');
  }

  const res = await callEdgeFunction<{ success: boolean; seccion: Seccion }>({
    tipo: 'actualizar_seccion',
    grupoId,
    seccionId,
    nombre: cleanNombre,
    color: color || null,
  });

  if (!res?.seccion) {
    throw new Error('El servidor no confirmó la actualización de la sección.');
  }
  return res.seccion;
}

export async function eliminarSecciones(
  grupoId: string,
  seccionIds: string[]
): Promise<{ eliminadas: string[] }> {
  if (!Array.isArray(seccionIds) || seccionIds.length === 0) {
    throw new Error('Debe seleccionar al menos una sección para eliminar.');
  }

  const res = await callEdgeFunction<{ success: boolean; eliminadas: string[] }>({
    tipo: 'eliminar_secciones',
    grupoId,
    seccionIds,
  });

  return { eliminadas: res.eliminadas || seccionIds };
}

// =========================================================================
// 5. PARSERS PARA IMPORTACIÓN (WORD .docx Y EXCEL .xlsx)
// =========================================================================

export interface FilaImportacionAlumno {
  id: string; // ID temporal de previsualización
  nombre: string;
  orden?: number;
  esDuplicado: boolean;
  motivoDuplicado?: string;
  incompleto: boolean;
  motivoIncompleto?: string;
  seleccionado: boolean;
}

export interface FilaImportacionCriterio {
  id: string; // ID temporal de previsualización
  codigo: string;
  descripcion: string;
  ponderacion: number | null;
  cursoDetectado?: string;
  esDuplicado: boolean;
  motivoDuplicado?: string;
  incompleto: boolean;
  motivoIncompleto?: string;
  seleccionado: boolean;
}

/**
 * Limpia y normaliza texto de celda/línea
 */
function cleanText(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parsea archivo Excel (.xlsx/.xls) para alumnos
 */
export async function parseAlumnosFromXlsx(
  file: File,
  alumnosExistentes: Alumno[] = []
): Promise<FilaImportacionAlumno[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('El libro Excel no contiene hojas de cálculo legibles.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rows.length === 0) {
    throw new Error('El archivo Excel está vacío.');
  }

  // Detectar cabecera
  let headerIndex = -1;
  let colNombre = -1;
  let colApellidos = -1;
  let colOrden = -1;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map((c) => cleanText(c).toLowerCase());
    const idxNombre = row.findIndex((c) => c.includes('nombre') || c.includes('alumno') || c === 'estudiante');
    const idxApellidos = row.findIndex((c) => c.includes('apellido'));
    const idxOrden = row.findIndex((c) => c === 'nº' || c === 'no' || c === 'num' || c.includes('orden') || c === '#');

    if (idxNombre !== -1 || idxApellidos !== -1) {
      headerIndex = i;
      colNombre = idxNombre;
      colApellidos = idxApellidos;
      colOrden = idxOrden;
      break;
    }
  }

  const nombresExistentesLower = new Set(
    alumnosExistentes.map((a) => a.nombre.trim().toLowerCase())
  );
  const nombresVistosEnArchivo = new Set<string>();

  const resultado: FilaImportacionAlumno[] = [];
  const startRow = headerIndex !== -1 ? headerIndex + 1 : 0;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    let nombreFinal = '';
    let ordenDetectado: number | undefined = undefined;

    if (colNombre !== -1) {
      const parteNombre = cleanText(row[colNombre]);
      const parteApellidos = colApellidos !== -1 ? cleanText(row[colApellidos]) : '';
      if (parteApellidos) {
        nombreFinal = `${parteApellidos}, ${parteNombre}`.replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
      } else {
        nombreFinal = parteNombre;
      }
    } else {
      // Buscar primera celda con texto no numérico
      const textoCandidato = row.find((c) => {
        const str = cleanText(c);
        return str.length > 2 && !/^\d+$/.test(str);
      });
      nombreFinal = cleanText(textoCandidato);
    }

    if (colOrden !== -1 && row[colOrden] !== undefined) {
      const num = parseInt(cleanText(row[colOrden]), 10);
      if (!isNaN(num) && num > 0) {
        ordenDetectado = num;
      }
    }

    // Si la fila está completamente vacía, omitir
    if (!nombreFinal) continue;

    // Quitar prefijos numéricos si vienen en la misma celda (ej: "1. Carlos Gómez")
    const matchPrefix = nombreFinal.match(/^(\d+)[\s.\-_–)]+(.*)$/);
    if (matchPrefix) {
      if (ordenDetectado === undefined) {
        ordenDetectado = parseInt(matchPrefix[1], 10);
      }
      nombreFinal = matchPrefix[2].trim();
    }

    const lower = nombreFinal.toLowerCase();
    const esDuplicadoExistente = nombresExistentesLower.has(lower);
    const esDuplicadoArchivo = nombresVistosEnArchivo.has(lower);
    nombresVistosEnArchivo.add(lower);

    const esDuplicado = esDuplicadoExistente || esDuplicadoArchivo;
    const motivoDuplicado = esDuplicadoExistente
      ? 'Ya está registrado en este curso'
      : esDuplicadoArchivo
      ? 'Aparece repetido en este mismo archivo'
      : undefined;

    const incompleto = nombreFinal.length < 2;
    const motivoIncompleto = incompleto ? 'Nombre excesivamente corto o incompleto' : undefined;

    resultado.push({
      id: `xlsx-al-${r}-${Math.random().toString(36).substring(2, 7)}`,
      nombre: nombreFinal,
      orden: ordenDetectado,
      esDuplicado,
      motivoDuplicado,
      incompleto,
      motivoIncompleto,
      seleccionado: !esDuplicado && !incompleto,
    });
  }

  if (resultado.length === 0) {
    throw new Error('No se encontraron alumnos legibles en el archivo Excel.');
  }

  return resultado;
}

/**
 * Parsea archivo Word (.docx) para alumnos
 */
export async function parseAlumnosFromDocx(
  file: File,
  alumnosExistentes: Alumno[] = []
): Promise<FilaImportacionAlumno[]> {
  const htmlOrText = await extractDocxTextAndTables(file);
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlOrText, 'text/html');

  const nombresDetectados: Array<{ nombre: string; orden?: number }> = [];

  // 1. Si contiene tablas HTML
  const tables = doc.querySelectorAll('table');
  if (tables.length > 0) {
    tables.forEach((table) => {
      const trs = table.querySelectorAll('tr');
      trs.forEach((tr, trIdx) => {
        const tds = Array.from(tr.querySelectorAll('th, td')).map((c) => cleanText(c.textContent));
        if (tds.length === 0) return;

        // Omitir cabeceras típicas
        const filaStr = tds.join(' ').toLowerCase();
        if (trIdx === 0 && (filaStr.includes('alumno') || filaStr.includes('nombre'))) return;

        let ordenNum: number | undefined = undefined;
        let nombreStr = '';

        if (tds.length === 1) {
          nombreStr = tds[0];
        } else {
          // Si primera celda es número
          if (/^\d+$/.test(tds[0])) {
            ordenNum = parseInt(tds[0], 10);
            nombreStr = tds[1] || '';
            if (tds[2] && !/^\d+$/.test(tds[2])) {
              nombreStr = `${nombreStr} ${tds[2]}`.trim();
            }
          } else {
            nombreStr = tds.filter((t) => t.length > 1 && !/^\d+$/.test(t)).join(' ');
          }
        }

        if (nombreStr) {
          nombresDetectados.push({ nombre: nombreStr, orden: ordenNum });
        }
      });
    });
  }

  // 2. Si no hay tablas o no devolvió alumnos, parsear párrafos y listas
  if (nombresDetectados.length === 0) {
    const lineas = (doc.body ? doc.body.textContent || '' : htmlOrText)
      .split('\n')
      .map((l) => cleanText(l))
      .filter((l) => l.length > 2);

    for (const linea of lineas) {
      // Ignorar títulos generales
      const lLower = linea.toLowerCase();
      if (lLower.startsWith('lista de') || lLower.startsWith('alumnos') || lLower.startsWith('curso')) continue;

      let ordenNum: number | undefined = undefined;
      let cleanNombre = linea;

      const matchNum = linea.match(/^(\d+)[\s.\-_–)]+(.*)$/);
      if (matchNum) {
        ordenNum = parseInt(matchNum[1], 10);
        cleanNombre = matchNum[2].trim();
      }

      if (cleanNombre.length >= 2) {
        nombresDetectados.push({ nombre: cleanNombre, orden: ordenNum });
      }
    }
  }

  const nombresExistentesLower = new Set(
    alumnosExistentes.map((a) => a.nombre.trim().toLowerCase())
  );
  const nombresVistos = new Set<string>();

  const resultado: FilaImportacionAlumno[] = [];
  nombresDetectados.forEach((item, idx) => {
    let clean = item.nombre;
    // Si viene con número residual
    const matchPrefix = clean.match(/^(\d+)[\s.\-_–)]+(.*)$/);
    if (matchPrefix) {
      if (!item.orden) item.orden = parseInt(matchPrefix[1], 10);
      clean = matchPrefix[2].trim();
    }

    const lower = clean.toLowerCase();
    const esDuplicadoExistente = nombresExistentesLower.has(lower);
    const esDuplicadoArchivo = nombresVistos.has(lower);
    nombresVistos.add(lower);

    const esDuplicado = esDuplicadoExistente || esDuplicadoArchivo;
    const motivoDuplicado = esDuplicadoExistente
      ? 'Ya está registrado en este curso'
      : esDuplicadoArchivo
      ? 'Aparece repetido en este mismo documento'
      : undefined;

    const incompleto = clean.length < 2;
    const motivoIncompleto = incompleto ? 'Nombre excesivamente corto' : undefined;

    resultado.push({
      id: `docx-al-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      nombre: clean,
      orden: item.orden,
      esDuplicado,
      motivoDuplicado,
      incompleto,
      motivoIncompleto,
      seleccionado: !esDuplicado && !incompleto,
    });
  });

  if (resultado.length === 0) {
    throw new Error('No se detectaron nombres de alumnos legibles en el documento Word.');
  }

  return resultado;
}

/**
 * Parsea archivo Excel (.xlsx/.xls) para criterios de evaluación
 */
export async function parseCriteriosFromXlsx(
  file: File,
  criteriosExistentes: Criterio[] = []
): Promise<FilaImportacionCriterio[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('El libro Excel no contiene hojas de cálculo legibles.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rows.length === 0) {
    throw new Error('El archivo Excel de criterios está vacío.');
  }

  // Detectar cabecera
  let headerIndex = -1;
  let colCodigo = -1;
  let colDescripcion = -1;
  let colPond = -1;
  let colCurso = -1;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map((c) => cleanText(c).toLowerCase());
    const idxCod = row.findIndex((c) => c.includes('código') || c.includes('codigo') || c === 'criterio' || c === 'id');
    const idxDesc = row.findIndex((c) => c.includes('descrip') || c.includes('enunciado') || c.includes('texto'));
    const idxPond = row.findIndex((c) => c.includes('pond') || c.includes('peso') || c.includes('porcent') || c === '%');
    const idxCurso = row.findIndex((c) => c.includes('curso') || c.includes('grupo') || c.includes('nivel'));

    if (idxCod !== -1 || idxDesc !== -1) {
      headerIndex = i;
      colCodigo = idxCod;
      colDescripcion = idxDesc;
      colPond = idxPond;
      colCurso = idxCurso;
      break;
    }
  }

  const codigosExistentesSet = new Set(
    criteriosExistentes.map((c) => c.codigo.trim().toLowerCase())
  );
  const codigosVistos = new Set<string>();

  const resultado: FilaImportacionCriterio[] = [];
  const startRow = headerIndex !== -1 ? headerIndex + 1 : 0;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    let rawCodigo = '';
    let rawDesc = '';
    let rawPond: number | null = null;
    let cursoDetectado: string | undefined = undefined;

    if (colCodigo !== -1 && row[colCodigo] !== undefined) {
      rawCodigo = cleanText(row[colCodigo]);
    }
    if (colDescripcion !== -1 && row[colDescripcion] !== undefined) {
      rawDesc = cleanText(row[colDescripcion]);
    }
    if (colPond !== -1 && row[colPond] !== undefined && row[colPond] !== '') {
      const parsedP = parseFloat(cleanText(row[colPond]).replace('%', '').replace(',', '.'));
      if (!isNaN(parsedP) && parsedP >= 0) rawPond = parsedP;
    }
    if (colCurso !== -1 && row[colCurso] !== undefined) {
      cursoDetectado = cleanText(row[colCurso]) || undefined;
    }

    // Heurística de detección si no había cabecera explícita
    if (!rawCodigo || !rawDesc) {
      for (const cell of row) {
        const text = cleanText(cell);
        if (!rawCodigo && /^(\d+(?:\.\d+)+[a-zA-Z]?|\d+[a-zA-Z])$/.test(text)) {
          rawCodigo = text;
        } else if (!rawDesc && text.length > 15) {
          rawDesc = text;
        } else if (rawPond === null && /^\d+(?:[.,]\d+)?\s*%?$/.test(text)) {
          const num = parseFloat(text.replace('%', '').replace(',', '.'));
          if (!isNaN(num) && num >= 0 && num <= 100) rawPond = num;
        }
      }
    }

    if (!rawCodigo && !rawDesc) continue;

    // Normalizar código si contiene la palabra "Criterio 1.1" -> "1.1"
    const matchCodPref = rawCodigo.match(/(?:criterio|crit\.?)\s*([0-9]+(?:\.[0-9a-zA-Z]+)*)/i);
    if (matchCodPref) {
      rawCodigo = matchCodPref[1];
    }

    const codLower = rawCodigo.toLowerCase();
    const esDuplicadoExistente = codigosExistentesSet.has(codLower);
    const esDuplicadoArchivo = codigosVistos.has(codLower);
    if (rawCodigo) codigosVistos.add(codLower);

    const esDuplicado = esDuplicadoExistente || esDuplicadoArchivo;
    const motivoDuplicado = esDuplicadoExistente
      ? 'Este código de criterio ya existe en este curso'
      : esDuplicadoArchivo
      ? 'Código repetido en este mismo archivo'
      : undefined;

    const incompleto = !rawCodigo || !rawDesc || rawDesc.length < 5;
    const motivoIncompleto = !rawCodigo
      ? 'Falta el código de criterio'
      : !rawDesc
      ? 'Falta la descripción del criterio'
      : rawDesc.length < 5
      ? 'Descripción incompleta'
      : undefined;

    resultado.push({
      id: `xlsx-cr-${r}-${Math.random().toString(36).substring(2, 7)}`,
      codigo: rawCodigo,
      descripcion: rawDesc,
      ponderacion: rawPond,
      cursoDetectado,
      esDuplicado,
      motivoDuplicado,
      incompleto,
      motivoIncompleto,
      seleccionado: !esDuplicado && !incompleto,
    });
  }

  if (resultado.length === 0) {
    throw new Error('No se detectaron criterios de evaluación válidos en el archivo Excel.');
  }

  return resultado;
}

/**
 * Parsea archivo Word (.docx) para criterios de evaluación
 */
export async function parseCriteriosFromDocx(
  file: File,
  criteriosExistentes: Criterio[] = []
): Promise<FilaImportacionCriterio[]> {
  const htmlOrText = await extractDocxTextAndTables(file);
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlOrText, 'text/html');

  const filasCandidatas: Array<{ codigo: string; descripcion: string; ponderacion: number | null }> = [];

  // 1. Revisar tablas
  const tables = doc.querySelectorAll('table');
  if (tables.length > 0) {
    tables.forEach((table) => {
      const trs = table.querySelectorAll('tr');
      trs.forEach((tr, trIdx) => {
        const cells = Array.from(tr.querySelectorAll('th, td')).map((c) => cleanText(c.textContent));
        if (cells.length < 2) return;

        const rowStr = cells.join(' ').toLowerCase();
        if (trIdx === 0 && (rowStr.includes('código') || rowStr.includes('criterio') && rowStr.includes('descrip'))) {
          return;
        }

        let codigo = '';
        let descripcion = '';
        let ponderacion: number | null = null;

        for (const cell of cells) {
          if (!codigo && /^(\d+(?:\.\d+)+[a-zA-Z]?|\d+[a-zA-Z]|criterio\s*\d+(?:\.\d+)*)$/i.test(cell)) {
            codigo = cell.replace(/criterio\s*/i, '').trim();
          } else if (!descripcion && cell.length > 10) {
            descripcion = cell;
          } else if (ponderacion === null && /^\d+(?:[.,]\d+)?\s*%?$/.test(cell)) {
            const num = parseFloat(cell.replace('%', '').replace(',', '.'));
            if (!isNaN(num) && num >= 0 && num <= 100) ponderacion = num;
          }
        }

        if (codigo || descripcion) {
          filasCandidatas.push({ codigo, descripcion, ponderacion });
        }
      });
    });
  }

  // 2. Si no hay tablas o no devolvió criterios, parsear párrafos con patrones como "1.1. Comprender..."
  if (filasCandidatas.length === 0) {
    const lineas = (doc.body ? doc.body.textContent || '' : htmlOrText)
      .split('\n')
      .map((l) => cleanText(l))
      .filter((l) => l.length > 3);

    for (const linea of lineas) {
      // Patrón: "1.1. Descripción..." o "Criterio 1.1: Descripción... (10%)"
      const match = linea.match(/^(?:criterio\s*)?([0-9]+(?:\.[0-9a-zA-Z]+)+)[:.\-–\s]+(.*)$/i);
      if (match) {
        const codigo = match[1].trim();
        let desc = match[2].trim();
        let pond: number | null = null;

        // Extraer ponderación si viene entre paréntesis al final (ej. "(15%)")
        const matchPond = desc.match(/\((?:ponderaci[oó]n|peso)?\s*([0-9]+(?:[.,][0-9]+)?)\s*%\)$/i);
        if (matchPond) {
          pond = parseFloat(matchPond[1].replace(',', '.'));
          desc = desc.replace(matchPond[0], '').trim();
        }

        filasCandidatas.push({ codigo, descripcion: desc, ponderacion: pond });
      }
    }
  }

  const codigosExistentesSet = new Set(
    criteriosExistentes.map((c) => c.codigo.trim().toLowerCase())
  );
  const codigosVistos = new Set<string>();

  const resultado: FilaImportacionCriterio[] = [];
  filasCandidatas.forEach((item, idx) => {
    const rawCodigo = item.codigo.trim();
    const rawDesc = item.descripcion.trim();

    const codLower = rawCodigo.toLowerCase();
    const esDuplicadoExistente = codigosExistentesSet.has(codLower);
    const esDuplicadoArchivo = codigosVistos.has(codLower);
    if (rawCodigo) codigosVistos.add(codLower);

    const esDuplicado = esDuplicadoExistente || esDuplicadoArchivo;
    const motivoDuplicado = esDuplicadoExistente
      ? 'Este criterio ya existe en este curso'
      : esDuplicadoArchivo
      ? 'Aparece repetido en este mismo documento'
      : undefined;

    const incompleto = !rawCodigo || !rawDesc || rawDesc.length < 5;
    const motivoIncompleto = !rawCodigo
      ? 'Falta el código de criterio'
      : !rawDesc
      ? 'Falta la descripción del criterio'
      : rawDesc.length < 5
      ? 'Descripción excesivamente breve'
      : undefined;

    resultado.push({
      id: `docx-cr-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      codigo: rawCodigo,
      descripcion: rawDesc,
      ponderacion: item.ponderacion,
      esDuplicado,
      motivoDuplicado,
      incompleto,
      motivoIncompleto,
      seleccionado: !esDuplicado && !incompleto,
    });
  });

  if (resultado.length === 0) {
    throw new Error('No se detectaron criterios estructurados en el documento Word.');
  }

  return resultado;
}
