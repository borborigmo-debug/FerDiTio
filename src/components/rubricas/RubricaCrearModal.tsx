/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useId } from 'react';
import { Criterio, Rubrica, ActividadDetalle } from '../../types';
import { EvaluacionPeriodo } from '../../context/CuadernoContext';
import { crearRubricaYActividad } from '../../services/rubricasService';
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
} from 'lucide-react';

export type TipoRubricaCrear = 'ACTIVIDAD' | 'TRABAJO' | 'EXAMEN';

interface ApartadoFormState {
  id: string; // UUID v4 garantizado
  numero: string;
  titulo: string;
  peso: number | null;
  criterios: string[];
}

interface RubricaCrearModalProps {
  grupoId: string;
  tipoInicial: TipoRubricaCrear;
  periodoInicial?: EvaluacionPeriodo;
  criterios: Criterio[];
  onClose: () => void;
  onSuccess: (rubrica: Rubrica, actividad: ActividadDetalle) => void;
}

export const RubricaCrearModal: React.FC<RubricaCrearModalProps> = ({
  grupoId,
  tipoInicial,
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
          descriptores: {
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
                    className="p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-2"
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
                          className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:border-indigo-500 focus:outline-none font-medium"
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
                            className="w-14 px-1.5 py-0.5 text-xs text-right border border-slate-200 rounded focus:border-indigo-500 focus:outline-none font-mono"
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
