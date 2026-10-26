/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Edit2,
  Check,
} from 'lucide-react';
import { Alumno } from '../../../types';
import {
  FilaImportacionAlumno,
  parseAlumnosFromDocx,
  parseAlumnosFromXlsx,
  importarAlumnos,
} from '../../../services/gestionDatosService';

import { useCuaderno } from '../../../context/CuadernoContext';

interface ImportarAlumnosModalProps {
  grupoId: string;
  grupoNombre: string;
  alumnosExistentes: Alumno[];
  onClose: () => void;
  onSuccess: (importadosCount: number) => void;
}

export const ImportarAlumnosModal: React.FC<ImportarAlumnosModalProps> = ({
  grupoId,
  grupoNombre,
  alumnosExistentes,
  onClose,
  onSuccess,
}) => {
  const { cursoTheme } = useCuaderno();
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Filas en la vista previa editable
  const [filas, setFilas] = useState<FilaImportacionAlumno[]>([]);
  const [filtroVista, setFiltroVista] = useState<'todas' | 'validas' | 'duplicados' | 'incompletas'>('todas');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditando, setNombreEditando] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;

    setFile(selected);
    setParseError(null);
    setSubmitError(null);
    setIsParsing(true);
    setFilas([]);

    try {
      const fileNameLower = selected.name.toLowerCase();
      let parseadas: FilaImportacionAlumno[] = [];

      if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')) {
        parseadas = await parseAlumnosFromXlsx(selected, alumnosExistentes);
      } else if (fileNameLower.endsWith('.docx')) {
        parseadas = await parseAlumnosFromDocx(selected, alumnosExistentes);
      } else {
        throw new Error('Formato no compatible. Por favor, selecciona un documento Word (.docx) o Excel (.xlsx).');
      }

      setFilas(parseadas);
    } catch (err: any) {
      console.error('[ImportarAlumnosModal] Error al procesar archivo:', err);
      setParseError(err?.message || 'Error al leer y analizar el archivo seleccionado.');
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  // Contadores
  const totalFilas = filas.length;
  const duplicadosCount = filas.filter((f) => f.esDuplicado).length;
  const incompletasCount = filas.filter((f) => f.incompleto).length;
  const seleccionadasCount = filas.filter((f) => f.seleccionado).length;

  const filasFiltradas = filas.filter((f) => {
    if (filtroVista === 'validas') return !f.esDuplicado && !f.incompleto;
    if (filtroVista === 'duplicados') return f.esDuplicado;
    if (filtroVista === 'incompletas') return f.incompleto;
    return true;
  });

  const handleToggleSeleccion = (id: string) => {
    setFilas((prev) =>
      prev.map((f) => (f.id === id ? { ...f, seleccionado: !f.seleccionado } : f))
    );
  };

  const handleToggleSeleccionarTodas = () => {
    const todasVisiblesEstanSeleccionadas = filasFiltradas.every((f) => f.seleccionado);
    const idsVisibles = new Set(filasFiltradas.map((f) => f.id));

    setFilas((prev) =>
      prev.map((f) => {
        if (idsVisibles.has(f.id)) {
          return { ...f, seleccionado: !todasVisiblesEstanSeleccionadas };
        }
        return f;
      })
    );
  };

  const handleEliminarFila = (id: string) => {
    setFilas((prev) => prev.filter((f) => f.id !== id));
  };

  const handleIniciarEdicion = (fila: FilaImportacionAlumno) => {
    setEditandoId(fila.id);
    setNombreEditando(fila.nombre);
  };

  const handleGuardarEdicion = (id: string) => {
    const clean = nombreEditando.trim();
    if (!clean) return;

    setFilas((prev) =>
      prev.map((f) => {
        if (f.id === id) {
          const lower = clean.toLowerCase();
          const esDuplicado = alumnosExistentes.some((a) => a.nombre.trim().toLowerCase() === lower);
          const incompleto = clean.length < 2;
          return {
            ...f,
            nombre: clean,
            esDuplicado,
            motivoDuplicado: esDuplicado ? 'Ya registrado en este curso' : undefined,
            incompleto,
            motivoIncompleto: incompleto ? 'Nombre muy corto' : undefined,
            seleccionado: !esDuplicado && !incompleto,
          };
        }
        return f;
      })
    );
    setEditandoId(null);
  };

  const handleConfirmarImportacion = async () => {
    const aImportar = filas.filter((f) => f.seleccionado && f.nombre.trim().length >= 2);
    if (aImportar.length === 0) {
      setSubmitError('No hay ningún alumno seleccionado para importar.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = aImportar.map((f) => ({
        nombre: f.nombre.trim(),
        orden: f.orden,
      }));

      const res = await importarAlumnos(grupoId, payload);
      onSuccess(res.total);
      onClose();
    } catch (err: any) {
      console.error('[ImportarAlumnosModal] Error al persistir importación:', err);
      setSubmitError(err?.message || 'Error al importar alumnos en Supabase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Borde superior dinámico según el color del curso */}
        <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: cursoTheme.primary }} />

        {/* Cabecera del modal */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0">
              <Upload className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">
                Importar alumnos a {grupoNombre}
              </h3>
              <p className="text-[11px] text-slate-300">
                Formatos compatibles: Microsoft Word (.docx) y Microsoft Excel (.xlsx / .xls)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido principal */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs text-slate-700">
          {/* Zona de selección de archivo */}
          <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-slate-100/70 transition-colors text-center space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.xlsx,.xls,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex items-center justify-center gap-3 text-slate-400">
              <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
              <span className="text-slate-300 font-bold">/</span>
              <FileText className="w-8 h-8 text-blue-600" />
            </div>

            <div>
              <p className="text-xs font-bold text-slate-800">
                {file ? file.name : 'Selecciona o arrastra un archivo Word (.docx) o Excel (.xlsx)'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Detecta automáticamente tablas, listas de clase y columnas de nombres y apellidos.
              </p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing || isSubmitting}
              className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold text-xs shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>{file ? 'Cambiar archivo' : 'Examinar archivo...'}</span>
            </button>
          </div>

          {/* Estado de lectura en proceso */}
          {isParsing && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
              <span className="font-semibold">Leyendo y analizando las filas del documento...</span>
            </div>
          )}

          {/* Errores */}
          {parseError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Vista previa editable de las filas detectadas */}
          {filas.length > 0 && (
            <div className="space-y-3">
              {/* Barra de métricas y filtros */}
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800">Vista previa:</span>
                  <span className="px-2 py-0.5 rounded-full bg-white text-slate-700 font-bold border border-slate-200 text-[11px]">
                    {totalFilas} {totalFilas === 1 ? 'fila' : 'filas'} detectadas
                  </span>
                  {duplicadosCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200 text-[11px]">
                      {duplicadosCount} posible(s) duplicado(s)
                    </span>
                  )}
                  {incompletasCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold border border-rose-200 text-[11px]">
                      {incompletasCount} incompleta(s)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['todas', 'validas', 'duplicados', 'incompletas'] as const).map((filtro) => (
                    <button
                      key={filtro}
                      type="button"
                      onClick={() => setFiltroVista(filtro)}
                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                        filtroVista === filtro
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {filtro === 'todas'
                        ? 'Todas'
                        : filtro === 'validas'
                        ? 'Válidas'
                        : filtro === 'duplicados'
                        ? 'Duplicados'
                        : 'Incompletas'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botón de selección general */}
              <div className="flex items-center justify-between px-1">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 select-none text-[11px]">
                  <input
                    type="checkbox"
                    checked={filasFiltradas.length > 0 && filasFiltradas.every((f) => f.seleccionado)}
                    onChange={handleToggleSeleccionarTodas}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>
                    Seleccionar todas las visibles ({seleccionadasCount} de {totalFilas} seleccionadas para importar)
                  </span>
                </label>
                <span className="text-[10px] text-slate-400">
                  Puedes editar nombres pulsando el icono del lápiz o desmarcar filas para excluirlas.
                </span>
              </div>

              {/* Tabla de filas */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[42vh] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3 w-10 text-center">Imp.</th>
                      <th className="py-2 px-3 w-16 text-center">Nº</th>
                      <th className="py-2 px-3">Nombre del Alumno</th>
                      <th className="py-2 px-3">Estado / Validación</th>
                      <th className="py-2 px-3 w-20 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filasFiltradas.map((f, idx) => (
                      <tr
                        key={f.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          !f.seleccionado ? 'opacity-60 bg-slate-50/50' : ''
                        }`}
                      >
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={f.seleccionado}
                            onChange={() => handleToggleSeleccion(f.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-500 text-[11px]">
                          {f.orden ?? idx + 1}
                        </td>
                        <td className="py-2 px-3">
                          {editandoId === f.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={nombreEditando}
                                onChange={(e) => setNombreEditando(e.target.value)}
                                className="px-2 py-0.5 text-xs border border-indigo-400 rounded focus:outline-none flex-1 font-medium bg-white"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleGuardarEdicion(f.id);
                                  if (e.key === 'Escape') setEditandoId(null);
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleGuardarEdicion(f.id)}
                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                title="Guardar"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="font-semibold text-slate-900">{f.nombre}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {f.esDuplicado ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>{f.motivoDuplicado || 'Duplicado'}</span>
                            </span>
                          ) : f.incompleto ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>{f.motivoIncompleto || 'Incompleto'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              <span>Listo para importar</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleIniciarEdicion(f)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100"
                              title="Editar nombre"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEliminarFila(f.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100"
                              title="Excluir fila"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pie del modal con confirmación obligatoria */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-white transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirmarImportacion}
              disabled={isSubmitting || seleccionadasCount === 0}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando en Supabase...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirmar e importar ({seleccionadasCount} alumnos)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
