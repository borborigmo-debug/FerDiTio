/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useId, useRef, useEffect, useMemo } from 'react';
import { Criterio, Rubrica, ActividadDetalle } from '../../types';
import { EvaluacionPeriodo, useCuaderno } from '../../context/CuadernoContext';
import { useAuth } from '../../context/AuthContext';
import { crearRubricaYActividad, analizarRubricaConGemini, BorradorRubricaGemini } from '../../services/rubricasService';
import { optimizeImageForGemini, extractDocxTextAndTables } from '../../utils/geminiRubricaImportUtils';
import { generateUuid, compararCriterios, compararCodigosCriterio } from '../../utils/rubricaUtils';
import { organizarArbolSecciones } from '../../services/seccionesJerarquiaService';
import { getCursoColorTheme } from '../../utils/cursoColorUtils';
import {
  obtenerGruposVinculadosCon,
  replicarRubricaEnGrupos,
} from '../../services/vinculacionRubricasService';
import {
  X,
  FileCheck,
  FolderGit2,
  GraduationCap,
  Plus,
  Trash2,
  AlertTriangle,
  Check,
  Sparkles,
  Info,
  Layers,
  ChevronDown,
  ChevronUp,
  Camera,
  FileText,
  Upload,
  Loader2,
  HelpCircle,
  Link2,
} from 'lucide-react';

export type TipoRubricaCrear = 'ACTIVIDAD' | 'TRABAJO' | 'EXAMEN';
export type OrigenRubricaCrear = 'foto' | 'galeria' | 'ia' | 'manual' | null;

export interface ApartadoFormState {
  id: string; // UUID v4 garantizado
  numero: string; // Identificador original (ej. "5.a", "5.b", "2", "3.1")
  titulo: string; // Enunciado de la actividad
  peso: number | null;
  criterios: string[];
  descriptores?: {
    "1": string;
    "2": string;
    "3": string;
    "4": string;
  };
}

interface RubricaCrearModalProps {
  grupoId: string;
  grupoNombre?: string;
  tipoInicial: TipoRubricaCrear;
  origenInicial?: OrigenRubricaCrear;
  archivoInicial?: File | null;
  periodoInicial?: EvaluacionPeriodo;
  criterios: Criterio[];
  onClose: () => void;
  onSuccess: (rubrica: Rubrica, actividad: ActividadDetalle, iniciarEvaluacion?: boolean) => void;
}

/**
 * Extrae de forma robusta el número original y el enunciado de un apartado.
 * Respeta exactamente numeraciones como "5.a", "5.b", "2", "3.1" sin forzar que empiecen por 1.
 */
export function extraerNumeroYEnunciado(
  rawTitulo: string,
  rawNumero?: string | null,
  fallbackIndex?: number
): { numero: string; enunciado: string } {
  const cleanTitulo = (rawTitulo || '').trim();

  // 1. Si el número explícito ya contiene caracteres alfanuméricos / puntos / guiones ("5.a", "2.1", "5a")
  if (rawNumero && typeof rawNumero === 'string') {
    const trimmedNum = rawNumero.trim();
    if (trimmedNum && !/^\d+$/.test(trimmedNum)) {
      return { numero: trimmedNum, enunciado: cleanTitulo };
    }
  }

  // 2. Extraer del texto del enunciado si comienza con patrones como "5.a.", "5.a)", "Actividad 5.a:", "Pregunta 2.b"
  const regexConPrefijo = /^(?:actividad|ejercicio|pregunta|apartado|tarea|cuesti[oó]n|item)?\s*([0-9]+(?:\.[0-9a-zA-Z]+|\.[a-zA-Z]|[a-zA-Z])?|[a-zA-Z]\))(?:\s*[:.\-–)]\s*|\s+)(.*)$/i;
  const match = cleanTitulo.match(regexConPrefijo);
  if (match) {
    const numDetectado = match[1].replace(/[):.\-–]/g, '').trim();
    const restoEnunciado = match[2].trim();
    if (numDetectado) {
      return {
        numero: numDetectado,
        enunciado: restoEnunciado || cleanTitulo,
      };
    }
  }

  // 3. Patrón puro al inicio: "5.a ", "5.a: ", "12.b. ", "5.1: "
  const regexPuro = /^([0-9]+[a-zA-Z]|[0-9]+(?:\.[0-9a-zA-Z]+)+|[a-zA-Z]\))(?:\s*[:.\-–]\s*|\s+)(.*)$/i;
  const matchPuro = cleanTitulo.match(regexPuro);
  if (matchPuro) {
    const numDetectado = matchPuro[1].replace(/[):.\-–]/g, '').trim();
    const restoEnunciado = matchPuro[2].trim();
    if (numDetectado) {
      return {
        numero: numDetectado,
        enunciado: restoEnunciado || cleanTitulo,
      };
    }
  }

  // 4. Si hay rawNumero disponible válido, usarlo
  if (rawNumero && String(rawNumero).trim()) {
    return { numero: String(rawNumero).trim(), enunciado: cleanTitulo };
  }

  // 5. Fallback a número secuencial
  const def = fallbackIndex !== undefined ? String(fallbackIndex + 1) : '1';
  return { numero: def, enunciado: cleanTitulo };
}

/**
 * Obtiene la actividad base de una numeración (ej.: "5.a" -> base "5", sub "a"; "2" -> base "2").
 */
export function getBaseActivity(numero: string): { base: string; sub?: string } {
  const clean = String(numero || '').trim();
  const match = clean.match(/^([0-9]+)(?:[.\-_/]([a-zA-Z0-9]+)|([a-zA-Z]+))$/);
  if (match) {
    const base = match[1];
    const sub = match[2] || match[3];
    return { base, sub };
  }
  const matchLetter = clean.match(/^([a-zA-Z]+)[.\-_/]([0-9]+)$/);
  if (matchLetter) {
    return { base: matchLetter[1], sub: matchLetter[2] };
  }
  return { base: clean };
}

export interface GrupoActividadVista {
  key: string;
  isGroup: boolean;
  baseNumero: string;
  displayNumero: string;
  criterios: string[];
  tituloComun: string;
  items: ApartadoFormState[];
}

export const RubricaCrearModal: React.FC<RubricaCrearModalProps> = ({
  grupoId,
  grupoNombre = 'Curso actual',
  tipoInicial,
  origenInicial = null,
  archivoInicial = null,
  periodoInicial = '1.º Ev',
  criterios,
  onClose,
  onSuccess,
}) => {
  const { cuadernoData, grupos } = useCuaderno();
  const { user } = useAuth();
  const cursoTheme = useMemo(() => getCursoColorTheme(grupoId, grupoNombre), [grupoId, grupoNombre]);
  const arbolSecciones = useMemo(
    () => organizarArbolSecciones(cuadernoData?.secciones || [], grupoId),
    [cuadernoData?.secciones, grupoId]
  );

  // Cursos vinculados para replicación de rúbricas
  const gruposVinculadosIds = useMemo(
    () => obtenerGruposVinculadosCon(grupoId, user?.uid),
    [grupoId, user?.uid]
  );
  const gruposVinculados = useMemo(
    () => (grupos || []).filter((g) => gruposVinculadosIds.includes(g.id)),
    [grupos, gruposVinculadosIds]
  );
  const [replicarEnVinculados, setReplicarEnVinculados] = useState<boolean>(true);
  const [gruposSeleccionadosParaReplicar, setGruposSeleccionadosParaReplicar] = useState<string[]>([]);

  useEffect(() => {
    setGruposSeleccionadosParaReplicar(gruposVinculadosIds);
  }, [gruposVinculadosIds]);

  const [tipo, setTipo] = useState<TipoRubricaCrear>(tipoInicial);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [evaluacionPeriodo, setEvaluacionPeriodo] = useState<EvaluacionPeriodo>(periodoInicial);

  // Evaluar por secciones y subsecciones
  const [evaluarPorSecciones, setEvaluarPorSecciones] = useState(false);
  const [seccionSeleccionadaId, setSeccionSeleccionadaId] = useState<string>('');

  // Criterios seleccionados para la rúbrica / actividad
  const [criteriosSeleccionados, setCriteriosSeleccionados] = useState<string[]>([]);
  const [busquedaCriterio, setBusquedaCriterio] = useState('');

  // Apartados / actividades de la rúbrica
  const [apartados, setApartados] = useState<ApartadoFormState[]>([]);

  // Selección múltiple para eliminar actividades dentro del modal
  const [selectedApartadoIds, setSelectedApartadoIds] = useState<Set<string>>(new Set());

  // Grupos de epígrafes desplegados en pantalla (por defecto colapsados)
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());

  // Estados de interfaz y envío
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados de la Asistencia con Gemini (Foto / Word)
  const [isAnalyzingWithGemini, setIsAnalyzingWithGemini] = useState(false);
  const [analisisMessage, setAnalisisMessage] = useState<string | null>(null);
  const [analisisSuccessMessage, setAnalisisSuccessMessage] = useState<string | null>(null);
  const [analisisError, setAnalisisError] = useState<string | null>(null);

  // Opciones adicionales de análisis con Gemini
  const [evaluarOrtografia, setEvaluarOrtografia] = useState(false);
  const [evaluarPresentacion, setEvaluarPresentacion] = useState(false);

  // Estado para la opción 3: Rúbrica IA
  const [promptIaTexto, setPromptIaTexto] = useState('');
  const [mostrarSeccionIa, setMostrarSeccionIa] = useState<boolean>(origenInicial === 'ia');

  // Referencias a inputs ocultos de archivos
  const fileInputFotoRef = useRef<HTMLInputElement>(null);
  const fileInputCamaraRef = useRef<HTMLInputElement>(null);
  const fileInputGaleriaRef = useRef<HTMLInputElement>(null);
  const fileInputWordRef = useRef<HTMLInputElement>(null);
  // Estado para controlar si ya se procesó el archivo inicial
  const archivoProcesadoRef = useRef(false);

  // Períodos válidos admitidos por el modelo y la base de datos
  const periodosValidos: EvaluacionPeriodo[] = ['1.º Ev', '2.º Ev', '3.º Ev', 'Global'];

  // Toggle de criterio
  const handleToggleCriterio = (codigo: string) => {
    setCriteriosSeleccionados((prev) =>
      prev.includes(codigo) ? prev.filter((c) => c !== codigo) : [...prev, codigo]
    );
  };

  // Añadir un apartado manual
  const handleAddApartado = () => {
    // Proponer numeración basada en el último o siguiente disponible
    let sugerido = String(apartados.length + 1);
    if (apartados.length > 0) {
      const ultimo = apartados[apartados.length - 1].numero;
      const matchNum = ultimo.match(/^(\d+)/);
      if (matchNum) {
        sugerido = String(parseInt(matchNum[1], 10) + 1);
      }
    }

    const nuevo: ApartadoFormState = {
      id: generateUuid().toLowerCase(),
      numero: sugerido,
      titulo: `Actividad ${sugerido}`,
      peso: null,
      criterios: criteriosSeleccionados.length > 0 ? [criteriosSeleccionados[0]] : [],
    };
    setApartados((prev) => [...prev, nuevo]);
  };

  // Eliminar un apartado individual (CONSERVANDO los números originales de los demás)
  const handleRemoveApartado = (id: string) => {
    setApartados((prev) => prev.filter((a) => a.id !== id));
    setSelectedApartadoIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Eliminar múltiples actividades seleccionadas
  const handleDeleteSelectedApartados = () => {
    if (selectedApartadoIds.size === 0) return;
    setApartados((prev) => prev.filter((a) => !selectedApartadoIds.has(a.id)));
    setSelectedApartadoIds(new Set());
  };

  // Toggle selección de un apartado
  const handleToggleSelectApartado = (id: string) => {
    setSelectedApartadoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle seleccionar todas las actividades
  const handleToggleSelectAll = () => {
    if (selectedApartadoIds.size === apartados.length && apartados.length > 0) {
      setSelectedApartadoIds(new Set());
    } else {
      setSelectedApartadoIds(new Set(apartados.map((a) => a.id)));
    }
  };

  // Toggle desplegar/colapsar epígrafes de una actividad agrupada
  const handleToggleExpandGroup = (groupKey: string) => {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Actualizar campo de apartado
  const handleUpdateApartado = (id: string, updates: Partial<ApartadoFormState>) => {
    setApartados((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  // Aplicar borrador recibido de Gemini conservando numeración original
  const aplicarBorradorGemini = (borrador: BorradorRubricaGemini, nombreOrigen: string) => {
    if (!borrador) {
      throw new Error('La respuesta de Gemini no contiene un borrador válido.');
    }

    // Asignar el título sugerido por Gemini únicamente si el profesor aún no ha escrito un título en el formulario
    if (!titulo.trim() && borrador.titulo && typeof borrador.titulo === 'string') {
      setTitulo(borrador.titulo.trim());
    }

    if (borrador.tipo) {
      const tipoStr = String(borrador.tipo).toUpperCase().trim();
      if (tipoStr.includes('TRABAJO') || tipoStr.includes('PROYECTO')) {
        setTipo('TRABAJO');
      } else if (tipoStr.includes('EXAMEN') || tipoStr.includes('PRUEBA')) {
        setTipo('EXAMEN');
      } else {
        setTipo('ACTIVIDAD');
      }
    }

    if (borrador.descripcion && typeof borrador.descripcion === 'string') {
      setDescripcion(borrador.descripcion.trim());
    }

    const codigosAsociados = new Set<string>();
    const apartadosFormateados: ApartadoFormState[] = Array.isArray(borrador.items)
      ? borrador.items.map((it, idx) => {
          const itemCriterios = Array.isArray(it?.criterios)
            ? it.criterios.filter((c: any) => typeof c === 'string' && c.trim())
            : [];
          itemCriterios.forEach((c) => codigosAsociados.add(c));

          // Extraer número original del título o campo número (ej. "5.a", "2", "3.b")
          const { numero: numExtraid, enunciado: enunciadExtraid } = extraerNumeroYEnunciado(
            it?.titulo || '',
            it?.numero,
            idx
          );

          return {
            id: it?.id && typeof it.id === 'string' && it.id.trim() ? it.id : generateUuid().toLowerCase(),
            numero: numExtraid,
            titulo: enunciadExtraid || `Apartado ${numExtraid}`,
            peso: typeof it?.peso === 'number' && !isNaN(it.peso) ? it.peso : null,
            criterios: itemCriterios,
            descriptores: it?.descriptores && typeof it.descriptores === 'object' ? it.descriptores : undefined,
          };
        })
      : [];

    setApartados(apartadosFormateados);
    setCriteriosSeleccionados(Array.from(codigosAsociados));
    setSelectedApartadoIds(new Set());
    setExpandedGroupKeys(new Set()); // Colapsados por defecto

    const sinCriterio = apartadosFormateados.filter((a) => a.criterios.length === 0).length;
    if (sinCriterio > 0) {
      setAnalisisSuccessMessage(
        `Rúbrica importada con éxito desde "${nombreOrigen}". Se detectaron ${apartadosFormateados.length} apartados (${sinCriterio} con criterio pendiente). Conservada la numeración original.`
      );
    } else {
      setAnalisisSuccessMessage(
        `Rúbrica importada con éxito desde "${nombreOrigen}". Se detectaron ${apartadosFormateados.length} apartados con su numeración original vinculados a los criterios oficiales.`
      );
    }
  };

  // Procesa una fotografía tomada con la cámara o seleccionada
  const procesarArchivoFoto = async (file: File) => {
    setIsAnalyzingWithGemini(true);
    setAnalisisError(null);
    setAnalisisSuccessMessage(null);
    setAnalisisMessage(`Optimizando fotografía (${file.name}) y analizando con Gemini...`);

    try {
      const { base64, mimeType } = await optimizeImageForGemini(file);
      setAnalisisMessage('Gemini está estructurando la rúbrica y contrastando contra los criterios oficiales del grupo...');
      const borrador = await analizarRubricaConGemini({
        grupoId,
        origen: 'foto',
        imagenBase64: base64,
        mimeType,
        criterios,
        grupoNombre,
        evaluarOrtografia,
        evaluarPresentacion,
      });
      aplicarBorradorGemini(borrador, file.name);
    } catch (err: any) {
      console.error('[RubricaCrearModal] Error en análisis de foto con Gemini:', err);
      setAnalisisError(err?.message || 'Error al analizar la fotografía de la rúbrica con Gemini.');
    } finally {
      setIsAnalyzingWithGemini(false);
      setAnalisisMessage(null);
    }
  };

  // Procesa un archivo seleccionado de galería (imagen, pdf, word, etc.)
  const procesarArchivoGaleria = async (file: File) => {
    setIsAnalyzingWithGemini(true);
    setAnalisisError(null);
    setAnalisisSuccessMessage(null);
    setAnalisisMessage(`Procesando archivo "${file.name}" de la galería...`);

    try {
      const fileNameLower = file.name.toLowerCase();
      const isPdf = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
      const isWord =
        fileNameLower.endsWith('.docx') ||
        fileNameLower.endsWith('.doc') ||
        file.type.includes('word') ||
        file.type.includes('officedocument');
      const isImage = file.type.startsWith('image/');

      if (isImage) {
        setAnalisisMessage(`Optimizando imagen "${file.name}" y analizando con Gemini...`);
        const { base64, mimeType } = await optimizeImageForGemini(file);
        setAnalisisMessage('Gemini está estructurando la rúbrica y contrastando contra los criterios oficiales del grupo...');
        const borrador = await analizarRubricaConGemini({
          grupoId,
          origen: 'galeria',
          imagenBase64: base64,
          mimeType,
          criterios,
          grupoNombre,
          evaluarOrtografia,
          evaluarPresentacion,
        });
        aplicarBorradorGemini(borrador, file.name);
      } else if (isPdf) {
        setAnalisisMessage(`Cargando documento PDF "${file.name}"...`);
        const pdfBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = (reader.result as string) || '';
            resolve(res.includes(',') ? res.split(',')[1] : res);
          };
          reader.onerror = () => reject(new Error('No se pudo leer el archivo PDF seleccionado.'));
          reader.readAsDataURL(file);
        });
        setAnalisisMessage('Gemini está procesando el documento PDF y vinculando con los criterios oficiales del grupo...');
        const borrador = await analizarRubricaConGemini({
          grupoId,
          origen: 'galeria',
          pdfBase64,
          mimeType: 'application/pdf',
          criterios,
          grupoNombre,
          evaluarOrtografia,
          evaluarPresentacion,
        });
        aplicarBorradorGemini(borrador, file.name);
      } else if (isWord) {
        setAnalisisMessage(`Extrayendo texto y tablas del documento Word "${file.name}"...`);
        const textoDocx = await extractDocxTextAndTables(file);
        setAnalisisMessage('Gemini está analizando la matriz de Word y contrastando contra los criterios oficiales del grupo...');
        const borrador = await analizarRubricaConGemini({
          grupoId,
          origen: 'galeria',
          documentoTexto: textoDocx,
          criterios,
          grupoNombre,
          evaluarOrtografia,
          evaluarPresentacion,
        });
        aplicarBorradorGemini(borrador, file.name);
      } else {
        setAnalisisMessage(`Leyendo archivo de texto "${file.name}"...`);
        const texto = await file.text();
        setAnalisisMessage('Gemini está estructurando la rúbrica y contrastando con los criterios oficiales...');
        const borrador = await analizarRubricaConGemini({
          grupoId,
          origen: 'galeria',
          documentoTexto: texto,
          criterios,
          grupoNombre,
          evaluarOrtografia,
          evaluarPresentacion,
        });
        aplicarBorradorGemini(borrador, file.name);
      }
    } catch (err: any) {
      console.error('[RubricaCrearModal] Error en análisis de archivo de galería con Gemini:', err);
      setAnalisisError(err?.message || 'Error al analizar el archivo de la galería con Gemini.');
    } finally {
      setIsAnalyzingWithGemini(false);
      setAnalisisMessage(null);
    }
  };

  // Procesamiento automático del archivo inicial recibido
  useEffect(() => {
    if (archivoInicial && !archivoProcesadoRef.current) {
      archivoProcesadoRef.current = true;
      if (origenInicial === 'foto') {
        procesarArchivoFoto(archivoInicial);
      } else if (origenInicial === 'galeria') {
        procesarArchivoGaleria(archivoInicial);
      }
    }
  }, [archivoInicial, origenInicial]);

  // Manejador para fotografía (Cámara / Imagen)
  const handleFotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await procesarArchivoFoto(file);
  };

  // Manejador para galería (explorador de archivos: imagen, pdf, word)
  const handleGaleriaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await procesarArchivoGaleria(file);
  };

  // Manejador para documento Word (.docx) directo
  const handleWordSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsAnalyzingWithGemini(true);
    setAnalisisError(null);
    setAnalisisSuccessMessage(null);
    setAnalisisMessage(`Extrayendo texto y tablas de "${file.name}"...`);

    try {
      const textoDocx = await extractDocxTextAndTables(file);
      setAnalisisMessage('Gemini está analizando la matriz de Word y contrastando contra los criterios oficiales del grupo...');
      const borrador = await analizarRubricaConGemini({
        grupoId,
        origen: 'word',
        documentoTexto: textoDocx,
        criterios,
        grupoNombre,
        evaluarOrtografia,
        evaluarPresentacion,
      });
      aplicarBorradorGemini(borrador, file.name);
    } catch (err: any) {
      console.error('[RubricaCrearModal] Error en análisis de Word con Gemini:', err);
      setAnalisisError(err?.message || 'Error al analizar el documento Word de la rúbrica con Gemini.');
    } finally {
      setIsAnalyzingWithGemini(false);
      setAnalisisMessage(null);
    }
  };

  // Manejador para opción 3: Rúbrica IA (planteamiento al modelo Gemini)
  const handleGenerarConGeminiIa = async () => {
    if (!promptIaTexto.trim()) {
      setAnalisisError('Por favor, describe en el cuadro de texto lo que deseas que contenga la rúbrica (tema, ejercicios, apartados o criterios).');
      return;
    }

    setIsAnalyzingWithGemini(true);
    setAnalisisError(null);
    setAnalisisSuccessMessage(null);
    setAnalisisMessage('Gemini está diseñando la rúbrica y alineándola con los criterios oficiales del grupo...');

    try {
      const borrador = await analizarRubricaConGemini({
        grupoId,
        origen: 'ia',
        promptTexto: promptIaTexto.trim(),
        criterios,
        grupoNombre,
        evaluarOrtografia,
        evaluarPresentacion,
      });
      aplicarBorradorGemini(borrador, 'Rúbrica IA');
      setMostrarSeccionIa(false); // Colapsar sección tras generar con éxito
    } catch (err: any) {
      console.error('[RubricaCrearModal] Error al generar rúbrica con Gemini IA:', err);
      setAnalisisError(err?.message || 'Error al solicitar a Gemini la generación de la rúbrica.');
    } finally {
      setIsAnalyzingWithGemini(false);
      setAnalisisMessage(null);
    }
  };

  // Envío del formulario y persistencia (Validación obligatoria de título de rúbrica)
  const handleSubmit = async (iniciarEvaluacionInmediata = false) => {
    if (!titulo.trim()) {
      setErrorMessage('Es obligatorio escribir el título de la rúbrica antes de guardarla.');
      return;
    }

    if (titulo.trim().length < 2) {
      setErrorMessage('El título de la rúbrica debe tener al menos 2 caracteres.');
      return;
    }

    if (apartados.length === 0) {
      setErrorMessage('La rúbrica debe contener al menos una actividad o apartado.');
      return;
    }

    // Validar que si hay apartados, todos tengan título o enunciado
    for (let i = 0; i < apartados.length; i++) {
      if (!apartados[i].titulo.trim()) {
        setErrorMessage(`La actividad #${apartados[i].numero} debe tener un enunciado o título.`);
        return;
      }
    }

    // Validar selección de sección/subsección obligatoria si se activa "Evaluar por secciones"
    if (evaluarPorSecciones && !seccionSeleccionadaId) {
      setErrorMessage('Has activado «Evaluar por secciones». Es obligatorio seleccionar una sección o subsección.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const fechaCreacionIso = new Date().toISOString();
      const resultado = await crearRubricaYActividad({
        grupoId,
        titulo: titulo.trim(),
        tipoRubrica: tipo,
        evaluacionPeriodo,
        seccionId: evaluarPorSecciones ? seccionSeleccionadaId : null,
        descripcion: descripcion.trim() || null,
        fechaCreacion: fechaCreacionIso,
        items: apartados.map((a) => ({
          id: a.id,
          numero: a.numero,
          titulo: a.titulo.trim(),
          peso: a.peso,
          criterios: a.criterios,
          descriptores: a.descriptores || {
            '1': 'Inicial / Insuficiente',
            '2': 'En proceso / Suficiente',
            '3': 'Conseguido / Notable',
            '4': 'Avanzado / Sobresaliente',
          },
        })),
      });

      // Si la vinculación de rúbricas está activa y se seleccionaron cursos destino, replicar automáticamente
      if (replicarEnVinculados && gruposSeleccionadosParaReplicar.length > 0) {
        const targets = (grupos || []).filter((g) => gruposSeleccionadosParaReplicar.includes(g.id));
        if (targets.length > 0) {
          try {
            await replicarRubricaEnGrupos(
              {
                titulo: titulo.trim(),
                tipoRubrica: tipo,
                evaluacionPeriodo,
                descripcion: descripcion.trim() || null,
                fechaCreacion: fechaCreacionIso,
                items: apartados.map((a) => ({
                  numero: a.numero,
                  titulo: a.titulo.trim(),
                  peso: a.peso,
                  criterios: a.criterios,
                  descriptores: a.descriptores,
                })),
              },
              targets.map((t) => ({ id: t.id, nombre: t.nombre }))
            );
          } catch (repErr) {
            console.warn('[RubricaCrearModal] Error no bloqueante al replicar en cursos vinculados:', repErr);
          }
        }
      }

      onSuccess(resultado.rubrica, resultado.actividad, iniciarEvaluacionInmediata);
    } catch (err: any) {
      console.error('[RubricaCrearModal] Error al crear rúbrica:', err);
      setErrorMessage(err?.message || 'Error desconocido al persistir la rúbrica en Supabase.');
      setIsSubmitting(false);
    }
  };

  // Filtrado de criterios disponibles (con 10.1 y 10.2 en último lugar)
  const criteriosFiltrados = useMemo(() => {
    const list = criterios.slice().sort(compararCriterios);
    if (!busquedaCriterio.trim()) return list;
    const q = busquedaCriterio.toLowerCase();
    return list.filter((c) => c.codigo.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q));
  }, [criterios, busquedaCriterio]);

  /**
   * Cálculo de actividades agrupadas y epígrafes según criterios:
   * - Si una actividad tiene varios epígrafes (a,b,c...) y todos evalúan el mismo criterio, se agrupan por defecto colapsados.
   * - Si un epígrafe evalúa otros criterios, aparece aparte por defecto.
   */
  const actividadesAgrupadas = useMemo((): GrupoActividadVista[] => {
    if (apartados.length === 0) return [];

    // Agrupar preliminarmente por base de numeración (ej: "5" para "5.a", "5.b")
    const mapBase = new Map<string, ApartadoFormState[]>();
    for (const ap of apartados) {
      const { base } = getBaseActivity(ap.numero);
      const list = mapBase.get(base) || [];
      list.push(ap);
      mapBase.set(base, list);
    }

    const resultado: GrupoActividadVista[] = [];
    const getCritKey = (c: string[]) => (c || []).slice().sort().join('|');

    for (const [base, items] of mapBase.entries()) {
      if (items.length <= 1) {
        // Actividad única sin múltiples epígrafes
        const it = items[0];
        resultado.push({
          key: it.id,
          isGroup: false,
          baseNumero: it.numero,
          displayNumero: it.numero,
          criterios: it.criterios,
          tituloComun: it.titulo,
          items: [it],
        });
      } else {
        // Múltiples apartados con la misma base. Comprobar criterios:
        // Agrupar por clave de criterios
        const porCriterio = new Map<string, ApartadoFormState[]>();
        for (const it of items) {
          const k = getCritKey(it.criterios);
          const list = porCriterio.get(k) || [];
          list.push(it);
          porCriterio.set(k, list);
        }

        // Si todos los epígrafes tienen exactamente el mismo criterio:
        if (porCriterio.size === 1) {
          const subEpigrafes = items.map((it) => it.numero).join(', ');
          resultado.push({
            key: `group_${base}`,
            isGroup: true,
            baseNumero: base,
            displayNumero: `Actividad ${base}`,
            criterios: items[0].criterios,
            tituloComun: `${items[0].titulo} (${items.length} epígrafes: ${subEpigrafes})`,
            items: items,
          });
        } else {
          // Evalúan criterios distintos: los epígrafes con criterios diferentes deben aparecer aparte
          for (const [critKey, subItems] of porCriterio.entries()) {
            if (subItems.length > 1) {
              const subNums = subItems.map((it) => it.numero).join(', ');
              resultado.push({
                key: `group_${base}_${critKey}`,
                isGroup: true,
                baseNumero: base,
                displayNumero: `Actividad ${base} (${subNums})`,
                criterios: subItems[0].criterios,
                tituloComun: `${subItems[0].titulo} (${subItems.length} epígrafes)`,
                items: subItems,
              });
            } else {
              // Epígrafe singular con criterio distinto: aparece aparte por defecto
              const it = subItems[0];
              resultado.push({
                key: it.id,
                isGroup: false,
                baseNumero: it.numero,
                displayNumero: it.numero,
                criterios: it.criterios,
                tituloComun: it.titulo,
                items: [it],
              });
            }
          }
        }
      }
    }

    return resultado;
  }, [apartados]);

  // Configuración de estilo según tipo
  const tipoConfigs: Record<TipoRubricaCrear, {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    badgeColor: string;
    headerBg: string;
  }> = {
    ACTIVIDAD: {
      label: 'Actividad',
      icon: FileCheck,
      color: 'border-emerald-500 bg-emerald-50/70 text-emerald-800',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      headerBg: 'bg-[#15803d]',
    },
    TRABAJO: {
      label: 'Trabajo / Proyecto',
      icon: FolderGit2,
      color: 'border-sky-500 bg-sky-50/70 text-sky-800',
      badgeColor: 'bg-sky-100 text-sky-800 border-sky-300',
      headerBg: 'bg-[#0284c7]',
    },
    EXAMEN: {
      label: 'Examen / Prueba',
      icon: GraduationCap,
      color: 'border-purple-500 bg-purple-50/70 text-purple-800',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
      headerBg: 'bg-[#6d28d9]',
    },
  };

  const tipoConfig = tipoConfigs[tipo] || tipoConfigs.ACTIVIDAD;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-3xl overflow-hidden flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Borde superior del modal distintivo según el curso seleccionado */}
        <div
          className="h-2 w-full shrink-0 transition-colors shadow-xs"
          style={{ backgroundColor: cursoTheme.primary }}
          title={`Curso activo: ${grupoNombre}`}
        />

        {/* Inputs ocultos de archivo para fotografía, galería y Word */}
        <input
          ref={fileInputFotoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFotoSelect}
        />
        <input
          ref={fileInputCamaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFotoSelect}
        />
        <input
          ref={fileInputGaleriaRef}
          type="file"
          accept="image/*,.pdf,application/pdf,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleGaleriaSelect}
        />
        <input
          ref={fileInputWordRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleWordSelect}
        />

        {/* ========================================================
            1. PARTE SUPERIOR: CURSO / EVALUACIÓN
            ======================================================== */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between gap-3 shadow-sm select-none border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-2xs">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">Curso:</span>
                <span className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                  {grupoNombre}
                </span>
                <span className="text-slate-400 font-bold">/</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">Evaluación:</span>
                <select
                  value={evaluacionPeriodo}
                  onChange={(e) => setEvaluacionPeriodo(e.target.value as EvaluacionPeriodo)}
                  className="bg-slate-800 text-white font-bold font-mono text-xs px-2 py-0.5 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  title="Cambiar evaluación para esta actividad"
                >
                  {periodosValidos.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {origenInicial === 'manual'
                  ? 'Creación manual de rúbrica y actividades evaluables para el cuaderno.'
                  : 'Rúbrica estructurada con Gemini y vinculada a los criterios oficiales del grupo.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================================
            2. DEBAJO: TÍTULO OBLIGATORIO DE LA RÚBRICA Y EVALUAR ALUMNOS
            ======================================================== */}
        <div className="bg-indigo-50/70 border-b border-indigo-100 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label htmlFor="modal-actividad-titulo" className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider">
                Título de la rúbrica / actividad <span className="text-rose-600 font-extrabold">* (Obligatorio)</span>
              </label>
              {!titulo.trim() && (
                <span className="text-[10px] text-amber-700 font-bold">
                  ⚠️ Escribe el título antes de guardar
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="modal-actividad-titulo"
                type="text"
                value={titulo}
                onChange={(e) => {
                  setTitulo(e.target.value);
                  if (errorMessage && e.target.value.trim()) {
                    setErrorMessage(null);
                  }
                }}
                placeholder="Escribe el título de la rúbrica (obligatorio)..."
                className={`flex-1 px-3 py-1.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 font-semibold text-slate-900 shadow-2xs ${
                  !titulo.trim()
                    ? 'border-amber-400 focus:ring-amber-500 bg-amber-50/30'
                    : 'border-indigo-200 focus:ring-indigo-500'
                }`}
              />
              <div className="flex items-center gap-1 shrink-0" title="Selecciona el tipo de rúbrica">
                {(['ACTIVIDAD', 'TRABAJO', 'EXAMEN'] as TipoRubricaCrear[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                      tipo === t
                        ? 'bg-indigo-700 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Botón directo: Evaluar alumnos */}
          <div className="flex items-center gap-2 shrink-0 sm:self-end">
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={isSubmitting || !titulo.trim() || apartados.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                !titulo.trim()
                  ? 'Escribe el título de la rúbrica antes de evaluar'
                  : 'Guardar la rúbrica y abrir inmediatamente la pantalla para calificar alumnos'
              }
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Evaluar alumnos</span>
            </button>
          </div>
        </div>

        {/* Sub-barra: Evaluar por secciones (con secciones y subsecciones creadas por el docente) */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={evaluarPorSecciones}
              onChange={(e) => {
                setEvaluarPorSecciones(e.target.checked);
                if (!e.target.checked) setSeccionSeleccionadaId('');
              }}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
            />
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Evaluar por secciones
            </span>
          </label>

          {evaluarPorSecciones && (
            <div className="flex-1 sm:max-w-md w-full animate-in fade-in flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-[11px] font-bold text-slate-700 shrink-0">
                Sección / Subsección <span className="text-rose-600 font-extrabold">*</span>:
              </span>
              <select
                value={seccionSeleccionadaId}
                onChange={(e) => {
                  setSeccionSeleccionadaId(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer shadow-2xs ${
                  !seccionSeleccionadaId
                    ? 'border-amber-400 bg-amber-50/40 text-amber-950 font-bold'
                    : 'border-slate-300 text-slate-900 font-semibold'
                }`}
              >
                <option value="">-- Selecciona una sección o subsección (Obligatorio) --</option>
                {arbolSecciones.length === 0 ? (
                  <option value="" disabled>
                    (No hay secciones creadas en este curso)
                  </option>
                ) : (
                  arbolSecciones.map((item) => (
                    <optgroup key={item.seccion.id} label={`📁 ${item.seccion.nombre}`}>
                      <option value={item.seccion.id} className="font-bold text-slate-900">
                        📁 {item.seccion.nombre} (Sección principal)
                      </option>
                      {item.subsecciones.map((sub) => (
                        <option key={sub.id} value={sub.id} className="text-slate-700 pl-4">
                          &nbsp;&nbsp;↳ {sub.nombre} (Subsección)
                        </option>
                      ))}
                    </optgroup>
                  ))
                )}
              </select>
            </div>
          )}
        </div>

        {/* ========================================================
            3. DEBAJO: ASISTENCIA Y CONTENIDO DE RÚBRICA
            ======================================================== */}
        <div className="p-5 overflow-y-auto space-y-4 text-slate-800 text-xs flex-1">
          {/* PANEL DE EVALUACIONES ASISTIDAS ADICIONALES (Ortografía y Presentación) */}
          <div className="p-3 bg-purple-50/60 border border-purple-200/80 rounded-xl space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-950 text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>Evaluación asistida por Gemini (Opciones adicionales)</span>
              </span>
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                LOMLOE / CyL
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-purple-100 hover:border-purple-300 cursor-pointer transition-all select-none">
                <input
                  type="checkbox"
                  checked={evaluarOrtografia}
                  onChange={(e) => setEvaluarOrtografia(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 cursor-pointer"
                />
                <span className="font-semibold text-slate-800">
                  Evaluar ortografía y expresión escrita
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-purple-100 hover:border-purple-300 cursor-pointer transition-all select-none">
                <input
                  type="checkbox"
                  checked={evaluarPresentacion}
                  onChange={(e) => setEvaluarPresentacion(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 cursor-pointer"
                />
                <span className="font-semibold text-slate-800">
                  Evaluar presentación y formato
                </span>
              </label>
            </div>
          </div>

          {/* OPCIÓN 3: RÚBRICA IA (PLANTEAMIENTO DIRECTO A GEMINI) */}
          {origenInicial === 'ia' ? (
            <div className="p-3.5 bg-gradient-to-br from-purple-50/80 to-indigo-50/80 border border-purple-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span className="font-bold text-slate-900 text-xs">
                    ¿Qué deseas evaluar con esta rúbrica?
                  </span>
                </div>
                <span className="text-[10px] text-purple-700 font-mono font-medium">
                  {criterios.length} criterios del grupo contrastados
                </span>
              </div>
              <textarea
                value={promptIaTexto}
                onChange={(e) => setPromptIaTexto(e.target.value)}
                placeholder="Describe el contenido, ejercicios o apartados deseados (ej.: Examen de Lengua del tema 4 con 3 apartados: análisis morfosintáctico, figuras retóricas y comentario crítico)..."
                rows={3}
                className="w-full p-2.5 text-xs bg-white border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-slate-900 shadow-2xs resize-none"
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] text-slate-500">
                  Gemini estructurará la rúbrica y vinculará los apartados a los criterios oficiales.
                </span>
                <button
                  type="button"
                  onClick={handleGenerarConGeminiIa}
                  disabled={isAnalyzingWithGemini || isSubmitting || !promptIaTexto.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:bg-purple-300 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  {isAnalyzingWithGemini ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generar rúbrica con Gemini</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : origenInicial === 'foto' && !archivoInicial && apartados.length === 0 && !isAnalyzingWithGemini ? (
            /* En caso de que se haya cancelado la captura previa, botón directo para abrir la cámara */
            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-semibold text-indigo-950">
                  Fotografía de la rúbrica pendiente de captura
                </span>
              </div>
              <button
                type="button"
                onClick={() => fileInputCamaraRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Abrir cámara para fotografiar</span>
              </button>
            </div>
          ) : null}

          {/* Estado de análisis con Gemini */}
          {isAnalyzingWithGemini && (
            <div className="p-2.5 bg-indigo-100 border border-indigo-300 rounded-lg text-indigo-950 flex items-center gap-2 animate-pulse text-xs">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
              <span>{analisisMessage || 'Analizando material con Gemini y alineando criterios oficiales...'}</span>
            </div>
          )}

          {/* Mensaje de error de análisis */}
          {analisisError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-start gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{analisisError}</span>
                {origenInicial === 'foto' && (
                  <button
                    type="button"
                    onClick={() => fileInputCamaraRef.current?.click()}
                    className="mt-1 text-xs text-rose-700 font-bold underline block cursor-pointer"
                  >
                    Volver a abrir la cámara para repetir la fotografía
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Mensaje de éxito de análisis */}
          {analisisSuccessMessage && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-start gap-2 text-xs">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{analisisSuccessMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Sección de la Propuesta de Rúbrica */}
          <div className="space-y-3">
            {/* Cabecera de la propuesta y barra de selección múltiple */}
            <div className="bg-slate-100/90 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                  Propuesta de Rúbrica
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 font-mono text-[11px] font-bold">
                  {apartados.length} {apartados.length === 1 ? 'apartado' : 'apartados'}
                </span>
              </div>

              {/* Botones de acción y eliminación múltiple */}
              <div className="flex items-center gap-2 flex-wrap">
                {apartados.length > 0 && (
                  <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={apartados.length > 0 && selectedApartadoIds.size === apartados.length}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>
                      {selectedApartadoIds.size === apartados.length
                        ? 'Deseleccionar todas'
                        : `Seleccionar todas (${apartados.length})`}
                    </span>
                  </label>
                )}

                {selectedApartadoIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteSelectedApartados}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                    title="Eliminar las actividades seleccionadas"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar seleccionadas ({selectedApartadoIds.size})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddApartado}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir actividad</span>
                </button>
              </div>
            </div>

            {/* Lista de actividades/epígrafes de la rúbrica */}
            {apartados.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-300 text-center space-y-2 bg-slate-50/50">
                <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-600 text-xs">Sin actividades en la propuesta de rúbrica</p>
                <p className="text-[11px] text-slate-400">
                  Importa una foto o documento Word con Gemini, o añade actividades manualmente con el botón «Añadir actividad».
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {actividadesAgrupadas.map((grupo) => {
                  const isExpanded = expandedGroupKeys.has(grupo.key);
                  const todosSeleccionados = grupo.items.every((it) => selectedApartadoIds.has(it.id));
                  const algunSeleccionado = grupo.items.some((it) => selectedApartadoIds.has(it.id));

                  // Si es un grupo colapsable de epígrafes con el mismo criterio
                  if (grupo.isGroup) {
                    return (
                      <div
                        key={grupo.key}
                        className="rounded-xl border border-indigo-200 bg-white shadow-2xs overflow-hidden transition-all"
                      >
                        {/* Cabecera de la Actividad Agrupada */}
                        <div className="p-3 bg-slate-50/80 hover:bg-indigo-50/40 transition-colors flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            {/* Checkbox de selección múltiple para el grupo */}
                            <input
                              type="checkbox"
                              checked={todosSeleccionados}
                              ref={(el) => {
                                if (el) el.indeterminate = algunSeleccionado && !todosSeleccionados;
                              }}
                              onChange={() => {
                                setSelectedApartadoIds((prev) => {
                                  const next = new Set(prev);
                                  if (todosSeleccionados) {
                                    grupo.items.forEach((it) => next.delete(it.id));
                                  } else {
                                    grupo.items.forEach((it) => next.add(it.id));
                                  }
                                  return next;
                                });
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              title="Seleccionar todos los epígrafes de esta actividad"
                            />

                            {/* Número de actividad */}
                            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-200 shrink-0">
                              {grupo.displayNumero}
                            </span>

                            {/* Título / Enunciado (Pulsable para desplegar/colapsar epígrafes) */}
                            <button
                              type="button"
                              onClick={() => handleToggleExpandGroup(grupo.key)}
                              className="flex items-center gap-2 text-left flex-1 min-w-0 hover:text-indigo-600 transition-colors cursor-pointer group"
                              title="Pulsar para desplegar u ocultar los epígrafes de esta actividad"
                            >
                              <span className="font-semibold text-xs text-slate-800 line-clamp-1 group-hover:text-indigo-700">
                                {grupo.tituloComun}
                              </span>
                              <div className="flex items-center text-[10px] text-indigo-600 font-bold shrink-0">
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </div>
                            </button>
                          </div>

                          {/* Criterios asignados y botón de eliminar grupo */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              {grupo.criterios.length > 0 ? (
                                grupo.criterios.map((c) => (
                                  <span
                                    key={c}
                                    className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200"
                                    title={`Criterio oficial: ${c}`}
                                  >
                                    {c}
                                  </span>
                                ))
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  Sin criterio
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                grupo.items.forEach((it) => handleRemoveApartado(it.id));
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                              title={`Eliminar toda la ${grupo.displayNumero}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Despliegue de los epígrafes individuales al pulsar sobre el título */}
                        {isExpanded && (
                          <div className="p-3 bg-white border-t border-indigo-100 space-y-2">
                            <p className="text-[10px] text-slate-400 font-medium">
                              Epígrafes de la actividad (evalúan conjuntamente el criterio):
                            </p>
                            {grupo.items.map((ap) => (
                              <div
                                key={ap.id}
                                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={selectedApartadoIds.has(ap.id)}
                                    onChange={() => handleToggleSelectApartado(ap.id)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                  <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-800 shrink-0">
                                    {ap.numero}
                                  </span>
                                  <input
                                    type="text"
                                    value={ap.titulo}
                                    onChange={(e) => handleUpdateApartado(ap.id, { titulo: e.target.value })}
                                    className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:border-indigo-500 focus:outline-none bg-white font-medium"
                                    placeholder="Enunciado del epígrafe..."
                                  />
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400 font-mono">Peso:</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="any"
                                      value={ap.peso !== null && ap.peso !== undefined ? ap.peso : ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? null : Number(e.target.value);
                                        handleUpdateApartado(ap.id, { peso: val });
                                      }}
                                      placeholder="%"
                                      className="w-12 px-1 py-0.5 text-xs text-right border border-slate-200 rounded font-mono bg-white"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveApartado(ap.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Eliminar este epígrafe"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Actividad individual o epígrafe con criterio diferente (aparece aparte por defecto)
                  const ap = grupo.items[0];
                  const isChecked = selectedApartadoIds.has(ap.id);

                  return (
                    <div
                      key={ap.id}
                      className={`p-3 rounded-xl border shadow-2xs space-y-2 transition-all ${
                        isChecked
                          ? 'border-indigo-400 bg-indigo-50/30'
                          : ap.criterios.length === 0
                          ? 'border-amber-300 bg-amber-50/30'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {/* Casilla de selección múltiple */}
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSelectApartado(ap.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            title="Seleccionar para eliminar"
                          />

                          {/* Número de actividad (conservado exactamente, ej: 5.a, 2, 3.b) */}
                          <input
                            type="text"
                            value={ap.numero}
                            onChange={(e) => handleUpdateApartado(ap.id, { numero: e.target.value })}
                            className="font-mono font-bold text-xs px-2 py-1 rounded bg-slate-100 border border-slate-200 text-slate-800 w-16 text-center focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0"
                            title="Identificador original de la actividad o epígrafe"
                          />

                          {/* Comienzo del enunciado / Título */}
                          <input
                            type="text"
                            value={ap.titulo}
                            onChange={(e) => handleUpdateApartado(ap.id, { titulo: e.target.value })}
                            placeholder="Comienzo del enunciado de la actividad..."
                            className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none font-medium bg-white"
                          />
                        </div>

                        {/* Peso y eliminación individual */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 font-mono">Peso:</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              value={ap.peso !== null && ap.peso !== undefined ? ap.peso : ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : Number(e.target.value);
                                handleUpdateApartado(ap.id, { peso: val });
                              }}
                              placeholder="%"
                              className="w-14 px-1.5 py-0.5 text-xs text-right border border-slate-200 rounded font-mono bg-white"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveApartado(ap.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Eliminar actividad"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Criterios asignados a esta actividad */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 text-[10px]">
                        <span className="font-semibold text-slate-500">Criterio(s):</span>
                        {ap.criterios.length === 0 ? (
                          <span className="text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Pendiente de asignar
                          </span>
                        ) : null}

                        {/* Badges de criterios asignados con botón para desvincular */}
                        {ap.criterios.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200"
                          >
                            <span>{c}</span>
                            <button
                              type="button"
                              onClick={() => {
                                handleUpdateApartado(ap.id, {
                                  criterios: ap.criterios.filter((cod) => cod !== c),
                                });
                              }}
                              className="text-indigo-400 hover:text-indigo-700 cursor-pointer"
                              title={`Quitar criterio ${c}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}

                        {/* Botón para asignar otro criterio de los disponibles */}
                        {criterios.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              const cod = e.target.value;
                              if (cod && !ap.criterios.includes(cod)) {
                                handleUpdateApartado(ap.id, {
                                  criterios: [...ap.criterios, cod],
                                });
                              }
                            }}
                            className="text-[10px] font-semibold bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 focus:outline-none cursor-pointer"
                          >
                            <option value="">+ Asignar criterio...</option>
                            {criterios
                              .filter((c) => !ap.criterios.includes(c.codigo))
                              .slice()
                              .sort(compararCriterios)
                              .map((c) => (
                                <option key={c.codigo} value={c.codigo}>
                                  {c.codigo}: {c.descripcion ? c.descripcion.substring(0, 35) + '...' : ''}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ========================================================
                VINCULACIÓN ACTIVA DE RÚBRICAS ENTRE CURSOS
                ======================================================== */}
            {gruposVinculados.length > 0 && (
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 space-y-2 mt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="text-xs font-bold text-indigo-900">
                      Replicación en cursos vinculados ({gruposVinculados.length})
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={replicarEnVinculados}
                      onChange={(e) => setReplicarEnVinculados(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-indigo-900">
                      Replicar esta rúbrica automáticamente
                    </span>
                  </label>
                </div>

                {replicarEnVinculados && (
                  <div className="space-y-1.5 pt-1.5 border-t border-indigo-100">
                    <p className="text-[11px] text-indigo-700">
                      Selecciona los cursos vinculados en los que deseas crear esta rúbrica:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {gruposVinculados.map((g) => {
                        const isChecked = gruposSeleccionadosParaReplicar.includes(g.id);
                        return (
                          <label
                            key={g.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-white border-indigo-300 text-indigo-950 shadow-2xs'
                                : 'bg-indigo-100/40 border-indigo-200 text-indigo-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setGruposSeleccionadosParaReplicar((prev) => [...prev, g.id]);
                                } else {
                                  setGruposSeleccionadosParaReplicar((prev) => prev.filter((id) => id !== g.id));
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span>{g.nombre}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================
            PIE DE ACCIÓN DEL MODAL
            ======================================================== */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting || !titulo.trim() || apartados.length === 0}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-300 text-white font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              title={
                !titulo.trim()
                  ? 'Es obligatorio escribir el título de la rúbrica antes de guardarla'
                  : apartados.length === 0
                  ? 'Añade al menos una actividad o apartado'
                  : 'Guardar rúbrica y actividades en el cuaderno'
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Rúbrica</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={isSubmitting || !titulo.trim() || apartados.length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300 text-white font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              title={
                !titulo.trim()
                  ? 'Es obligatorio escribir el título de la rúbrica antes de guardarla'
                  : apartados.length === 0
                  ? 'Añade al menos una actividad o apartado'
                  : 'Guardar la rúbrica y abrir inmediatamente la pantalla para calificar alumnos'
              }
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Guardar y Evaluar Alumnos</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
