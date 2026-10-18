/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useId, useRef, useEffect } from 'react';
import { Criterio, Rubrica, ActividadDetalle } from '../../types';
import { EvaluacionPeriodo } from '../../context/CuadernoContext';
import { crearRubricaYActividad, analizarRubricaConGemini, BorradorRubricaGemini } from '../../services/rubricasService';
import { optimizeImageForGemini, extractDocxTextAndTables } from '../../utils/geminiRubricaImportUtils';
import { generateUuid } from '../../utils/rubricaUtils';
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
} from 'lucide-react';

export type TipoRubricaCrear = 'ACTIVIDAD' | 'TRABAJO' | 'EXAMEN';

interface ApartadoFormState {
  id: string; // UUID v4 garantizado
  numero: string;
  titulo: string;
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
  tipoInicial: TipoRubricaCrear;
  origenInicial?: 'foto' | 'word' | null;
  periodoInicial?: EvaluacionPeriodo;
  criterios: Criterio[];
  onClose: () => void;
  onSuccess: (rubrica: Rubrica, actividad: ActividadDetalle) => void;
}

export const RubricaCrearModal: React.FC<RubricaCrearModalProps> = ({
  grupoId,
  tipoInicial,
  origenInicial = null,
  periodoInicial = '1.º Ev',
  criterios,
  onClose,
  onSuccess,
}) => {
  const [tipo, setTipo] = useState<TipoRubricaCrear>(tipoInicial);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [evaluacionPeriodo, setEvaluacionPeriodo] = useState<EvaluacionPeriodo>(periodoInicial);

  // Criterios seleccionados para la rúbrica / actividad
  const [criteriosSeleccionados, setCriteriosSeleccionados] = useState<string[]>([]);
  const [busquedaCriterio, setBusquedaCriterio] = useState('');

  // Apartados iniciales
  const [apartados, setApartados] = useState<ApartadoFormState[]>([]);

  // Estados de interfaz y envío
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mostrarOpcionesAvanzadas, setMostrarOpcionesAvanzadas] = useState(false);

  // Estados de la Asistencia con Gemini (Foto / Word)
  const [isAnalyzingWithGemini, setIsAnalyzingWithGemini] = useState(false);
  const [analisisMessage, setAnalisisMessage] = useState<string | null>(null);
  const [analisisSuccessMessage, setAnalisisSuccessMessage] = useState<string | null>(null);
  const [analisisError, setAnalisisError] = useState<string | null>(null);

  // Referencias a inputs ocultos de archivos
  const fileInputFotoRef = useRef<HTMLInputElement>(null);
  const fileInputWordRef = useRef<HTMLInputElement>(null);

  // Disparo automático si se solicitó origen asistido al abrir
  useEffect(() => {
    if (origenInicial === 'foto') {
      setTimeout(() => fileInputFotoRef.current?.click(), 100);
    } else if (origenInicial === 'word') {
      setTimeout(() => fileInputWordRef.current?.click(), 100);
    }
  }, [origenInicial]);

  // Períodos válidos admitidos por el modelo y la base de datos
  const periodosValidos: EvaluacionPeriodo[] = ['1.º Ev', '2.º Ev', '3.º Ev', 'Global'];

  // Toggle de criterio
  const handleToggleCriterio = (codigo: string) => {
    setCriteriosSeleccionados((prev) =>
      prev.includes(codigo) ? prev.filter((c) => c !== codigo) : [...prev, codigo]
    );
  };

  // Generar automáticamente apartados iniciales a partir de los criterios seleccionados
  const handleGenerarApartadosDesdeCriterios = () => {
    if (criteriosSeleccionados.length === 0) {
      setErrorMessage('Selecciona al menos un criterio para generar apartados automáticos.');
      return;
    }
    setErrorMessage(null);

    const pesoSugerido = Math.round((100 / criteriosSeleccionados.length) * 100) / 100;
    const nuevosApartados: ApartadoFormState[] = criteriosSeleccionados.map((cod, idx) => {
      const criterioObj = criterios.find((c) => c.codigo === cod);
      return {
        id: generateUuid().toLowerCase(),
        numero: String(idx + 1),
        titulo: criterioObj ? `Apartado ${idx + 1}: ${criterioObj.descripcion}` : `Apartado ${idx + 1} (${cod})`,
        peso: pesoSugerido,
        criterios: [cod],
      };
    });

    setApartados(nuevosApartados);
  };

  // Añadir un apartado manual
  const handleAddApartado = () => {
    const nuevoNumero = String(apartados.length + 1);
    const nuevo: ApartadoFormState = {
      id: generateUuid().toLowerCase(),
      numero: nuevoNumero,
      titulo: `Apartado ${nuevoNumero}`,
      peso: null,
      criterios: criteriosSeleccionados.length > 0 ? [criteriosSeleccionados[0]] : [],
    };
    setApartados((prev) => [...prev, nuevo]);
  };

  // Eliminar un apartado
  const handleRemoveApartado = (id: string) => {
    setApartados((prev) =>
      prev
        .filter((a) => a.id !== id)
        .map((a, idx) => ({
          ...a,
          numero: String(idx + 1),
        }))
    );
  };

  // Actualizar campo de apartado
  const handleUpdateApartado = (id: string, updates: Partial<ApartadoFormState>) => {
    setApartados((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  // Aplicar borrador recibido de Gemini a los estados del formulario para revisión humana
  const aplicarBorradorGemini = (borrador: BorradorRubricaGemini, nombreOrigen: string) => {
    if (borrador.titulo) setTitulo(borrador.titulo);
    if (borrador.tipo) setTipo(borrador.tipo);
    if (borrador.descripcion) setDescripcion(borrador.descripcion);

    const codigosAsociados = new Set<string>();
    const apartadosFormateados: ApartadoFormState[] = (borrador.items || []).map((it, idx) => {
      (it.criterios || []).forEach((c) => codigosAsociados.add(c));
      return {
        id: it.id || generateUuid().toLowerCase(),
        numero: it.numero || String(idx + 1),
        titulo: it.titulo,
        peso: it.peso,
        criterios: it.criterios || [],
        descriptores: it.descriptores,
      };
    });

    setApartados(apartadosFormateados);
    setCriteriosSeleccionados(Array.from(codigosAsociados));

    const sinCriterio = apartadosFormateados.filter((a) => a.criterios.length === 0).length;
    if (sinCriterio > 0) {
      setAnalisisSuccessMessage(
        `Rúbrica analizada con éxito desde "${nombreOrigen}". Se generaron ${apartadosFormateados.length} apartados (${sinCriterio} con criterio pendiente de selección manual). Revisa y edita los datos antes de guardar.`
      );
    } else {
      setAnalisisSuccessMessage(
        `Rúbrica analizada con éxito desde "${nombreOrigen}". Se generaron ${apartadosFormateados.length} apartados vinculados con los criterios del grupo. Revisa y edita los datos antes de guardar.`
      );
    }
  };

  // Manejador para fotografía (cámara o selección de archivo)
  const handleFotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

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

  // Manejador para documento Word (.docx)
  const handleWordSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

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

  // Envío del formulario con persistencia confirmada en Supabase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!titulo.trim()) {
      setErrorMessage('Debes indicar un título para la rúbrica y actividad.');
      return;
    }

    if (titulo.trim().length < 2) {
      setErrorMessage('El título debe tener al menos 2 caracteres.');
      return;
    }

    // Validar que si hay apartados, todos tengan título
    for (let i = 0; i < apartados.length; i++) {
      if (!apartados[i].titulo.trim()) {
        setErrorMessage(`El apartado #${apartados[i].numero} debe tener un título descriptivo.`);
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const resultado = await crearRubricaYActividad({
        grupoId,
        titulo: titulo.trim(),
        tipoRubrica: tipo,
        evaluacionPeriodo,
        descripcion: descripcion.trim() || null,
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

      onSuccess(resultado.rubrica, resultado.actividad);
    } catch (err: any) {
      console.error('[RubricaCrearModal] Error al crear rúbrica:', err);
      setErrorMessage(err?.message || 'Error desconocido al persistir la rúbrica en Supabase.');
      setIsSubmitting(false);
    }
  };

  // Filtrado de criterios disponibles
  const criteriosFiltrados = criterios.filter((c) => {
    if (!busquedaCriterio.trim()) return true;
    const q = busquedaCriterio.toLowerCase();
    return c.codigo.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q);
  });

  // Configuración visual según tipo
  const tipoConfig = {
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
  }[tipo];

  const IconoTipo = tipoConfig.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl overflow-hidden flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Cabecera del Modal */}
        <div className={`${tipoConfig.headerBg} text-white px-5 py-4 flex items-center justify-between gap-3 shadow-sm select-none`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <IconoTipo className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold leading-tight">
                Crear Rúbrica de {tipoConfig.label}
              </h2>
              <p className="text-[11px] text-white/80">
                Se registrará en Rúbricas y creará automáticamente la actividad vinculada en el cuaderno.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido con Scroll */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 text-slate-800 text-xs">
          {/* Inputs ocultos de archivo para fotografía y documento Word */}
          <input
            ref={fileInputFotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFotoSelect}
          />
          <input
            ref={fileInputWordRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleWordSelect}
          />

          {/* ========================================================
              0. ASISTENTE INTELIGENTE CON GEMINI (FOTO Y WORD)
              ======================================================== */}
          <div className="p-3.5 bg-gradient-to-r from-indigo-50/90 via-purple-50/80 to-sky-50/90 border border-indigo-200/90 rounded-xl space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-indigo-950 text-xs">
                  Creación Asistida con Gemini
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Castilla y León
                </span>
              </div>
              <span className="text-[10px] text-indigo-700 font-medium">
                {criterios.length} criterios oficiales en este grupo
              </span>
            </div>

            <p className="text-[11px] text-slate-600 leading-snug">
              Analiza una rúbrica a partir de una <strong>fotografía</strong> o un archivo <strong>Word (.docx)</strong>. Gemini extraerá apartados, pesos y niveles vinculándolos exclusivamente con los criterios oficiales de este grupo.
            </p>

            {/* Botones de acción asistida */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => fileInputFotoRef.current?.click()}
                disabled={isAnalyzingWithGemini || isSubmitting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 border border-indigo-300 text-indigo-900 font-semibold text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                title="Tomar foto con la cámara del dispositivo o subir imagen"
              >
                <Camera className="w-3.5 h-3.5 text-indigo-600" />
                <span>Fotografía / Cámara</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputWordRef.current?.click()}
                disabled={isAnalyzingWithGemini || isSubmitting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 border border-indigo-300 text-indigo-900 font-semibold text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                title="Importar archivo Word (.docx) con matriz o tabla de rúbrica"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Documento Word (.docx)</span>
              </button>
            </div>

            {/* Estado de análisis en curso */}
            {isAnalyzingWithGemini && (
              <div className="p-2.5 bg-indigo-100/90 border border-indigo-300 rounded-lg text-indigo-950 flex items-center gap-2 animate-pulse">
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                <span className="font-medium text-xs">{analisisMessage || 'Analizando rúbrica con Gemini...'}</span>
              </div>
            )}

            {/* Alerta de error en análisis */}
            {analisisError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-start gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <strong className="block font-semibold">Error al procesar con Gemini:</strong>
                  <span>{analisisError}</span>
                </div>
              </div>
            )}

            {/* Notificación de éxito en análisis */}
            {analisisSuccessMessage && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-start gap-2 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs font-medium">{analisisSuccessMessage}</div>
              </div>
            )}
          </div>

          {/* Mensaje de error general si falla */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* 1. Selector de Tipo (Actividad, Trabajo, Examen) */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700 block uppercase tracking-wider text-[11px]">
              Tipo de Rúbrica
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['ACTIVIDAD', 'TRABAJO', 'EXAMEN'] as TipoRubricaCrear[]).map((t) => {
                const isSelected = tipo === t;
                const config = {
                  ACTIVIDAD: { label: 'Actividad', icon: FileCheck },
                  TRABAJO: { label: 'Trabajo', icon: FolderGit2 },
                  EXAMEN: { label: 'Examen', icon: GraduationCap },
                }[t];
                const Icon = config.icon;

                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`py-2 px-3 rounded-lg border text-left font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="truncate">{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Título de la Rúbrica y Actividad */}
          <div className="space-y-1.5">
            <label htmlFor="rubrica-titulo-input" className="font-bold text-slate-700 block uppercase tracking-wider text-[11px]">
              Título de la Rúbrica y de la Actividad <span className="text-rose-500">*</span>
            </label>
            <input
              id="rubrica-titulo-input"
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej.: Exposición oral del Romanticismo, Comentario de texto..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900 transition-all font-medium"
              autoFocus
            />
            <p className="text-[10px] text-slate-400">
              Este nombre identificará unívocamente la rúbrica en el catálogo y la actividad correspondiente en la tabla de evaluación.
            </p>
          </div>

          {/* 3. Período de Evaluación */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700 block uppercase tracking-wider text-[11px]">
              Período de Evaluación
            </label>
            <div className="flex flex-wrap gap-2">
              {periodosValidos.map((p) => {
                const isSelected = evaluacionPeriodo === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setEvaluacionPeriodo(p)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Descripción / Instrucciones (opcional) */}
          <div className="space-y-1.5">
            <label htmlFor="rubrica-desc-input" className="font-bold text-slate-700 block uppercase tracking-wider text-[11px]">
              Descripción o Instrucciones Docentes (opcional)
            </label>
            <textarea
              id="rubrica-desc-input"
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Orientaciones para la calificación, pautas metodológicas o contexto de la tarea..."
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900 transition-all"
            />
          </div>

          {/* 5. Criterios de Evaluación Asociados */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Criterios de Evaluación a Asociar ({criteriosSeleccionados.length})
              </label>
              {criterios.length > 5 && (
                <input
                  type="text"
                  value={busquedaCriterio}
                  onChange={(e) => setBusquedaCriterio(e.target.value)}
                  placeholder="Filtrar criterios..."
                  className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-md w-36 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              )}
            </div>

            {criterios.length === 0 ? (
              <p className="text-[11px] text-amber-700 italic">
                No hay criterios registrados en este grupo. Podrás asociar criterios posteriormente editando la rúbrica.
              </p>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1 p-2 rounded-lg bg-slate-50 border border-slate-200">
                {criteriosFiltrados.map((c) => {
                  const isChecked = criteriosSeleccionados.includes(c.codigo);
                  return (
                    <label
                      key={c.id || c.codigo}
                      className={`flex items-start gap-2 p-1.5 rounded-md cursor-pointer transition-colors ${
                        isChecked ? 'bg-indigo-50/80 text-indigo-950 font-medium' : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleCriterio(c.codigo)}
                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <div className="flex-1 leading-snug">
                        <span className="font-mono font-bold text-[11px] text-indigo-700 mr-1.5">
                          {c.codigo}
                        </span>
                        <span className="text-[11px] line-clamp-1">{c.descripcion}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6. Configuración de Apartados Iniciales */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Apartados de la Rúbrica ({apartados.length})
                </span>
                <p className="text-[10px] text-slate-400">
                  Cada apartado recibirá un UUID v4 persistente en <code className="font-mono">public.rubricas.items</code>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {criteriosSeleccionados.length > 0 && (
                  <button
                    type="button"
                    onClick={handleGenerarApartadosDesdeCriterios}
                    className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                    title="Crea un apartado por cada criterio seleccionado arriba con su UUID correspondiente"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    <span>Autogenerar apartados</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddApartado}
                  className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-slate-600" />
                  <span>Añadir apartado</span>
                </button>
              </div>
            </div>

            {apartados.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center space-y-1">
                <p className="text-slate-500 font-medium">Sin apartados iniciales definidos</p>
                <p className="text-[10px] text-slate-400">
                  Puedes guardar la rúbrica ahora y configurarla después en la matriz, o pulsar «Autogenerar apartados» para crearlos al instante con los criterios seleccionados.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {apartados.map((ap) => (
                  <div
                    key={ap.id}
                    className={`p-2.5 rounded-lg border shadow-2xs space-y-2 transition-all ${
                      ap.criterios.length === 0
                        ? 'border-amber-300 bg-amber-50/40 hover:border-amber-400'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          #{ap.numero}
                        </span>
                        <input
                          type="text"
                          value={ap.titulo}
                          onChange={(e) => handleUpdateApartado(ap.id, { titulo: e.target.value })}
                          placeholder="Título del apartado..."
                          className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:border-indigo-500 focus:outline-none font-medium bg-white"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
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
                            className="w-14 px-1.5 py-0.5 text-xs text-right border border-slate-200 rounded focus:border-indigo-500 focus:outline-none font-mono bg-white"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveApartado(ap.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                          title="Eliminar apartado"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Advertencia si no tiene criterio asignado */}
                    {ap.criterios.length === 0 && (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-100/90 border border-amber-300 text-amber-900 text-[10px] font-medium animate-in fade-in">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Sin criterio asignado. Pulsa sobre el código correspondiente abajo para vincularlo:</span>
                      </div>
                    )}

                    {/* Criterios asociados a este apartado específico */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 pt-1 border-t border-slate-50">
                      <span className="font-semibold text-slate-600">Criterio(s):</span>
                      {criterios.map((c) => {
                        const isAssociated = ap.criterios.includes(c.codigo);
                        return (
                          <button
                            key={c.codigo}
                            type="button"
                            onClick={() => {
                              const newCriterios = isAssociated
                                ? ap.criterios.filter((cod) => cod !== c.codigo)
                                : [...ap.criterios, c.codigo];
                              handleUpdateApartado(ap.id, { criterios: newCriterios });
                            }}
                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold transition-all cursor-pointer ${
                              isAssociated
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {c.codigo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botones de Acción / Pie */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !titulo.trim()}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-300 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Persistiendo en Supabase...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Crear Rúbrica de {tipoConfig.label}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
