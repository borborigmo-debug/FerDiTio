import React, { useState, useRef, useMemo } from 'react';
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
  Link2,
} from 'lucide-react';
import { Criterio } from '../../../types';
import {
  FilaImportacionCriterio,
  parseCriteriosFromDocx,
  parseCriteriosFromXlsx,
  importarCriterios,
  actualizarCriterio,
} from '../../../services/gestionDatosService';
import {
  obtenerGruposVinculadosCon,
  replicarCriterioEnGruposVinculados,
} from '../../../services/vinculacionCriteriosService';
import { useCuaderno } from '../../../context/CuadernoContext';
import { useAuth } from '../../../context/AuthContext';

interface ImportarCriteriosModalProps {
  grupoId: string;
  grupoNombre: string;
  criteriosExistentes: Criterio[];
  onClose: () => void;
  onSuccess: (importadosCount: number) => void;
}

export const ImportarCriteriosModal: React.FC<ImportarCriteriosModalProps> = ({
  grupoId,
  grupoNombre,
  criteriosExistentes,
  onClose,
  onSuccess,
}) => {
  const { cursoTheme, grupos } = useCuaderno();
  const { user } = useAuth();

  // Grupos vinculados
  const gruposVinculadosIds = useMemo(
    () => (grupoId ? obtenerGruposVinculadosCon(grupoId, user?.uid) : []),
    [grupoId, user?.uid]
  );
  const gruposVinculados = useMemo(
    () => grupos.filter((g) => gruposVinculadosIds.includes(g.id)),
    [grupos, gruposVinculadosIds]
  );

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Opciones de importación
  const [actualizarExistentes, setActualizarExistentes] = useState<boolean>(true);
  const [replicarEnVinculados, setReplicarEnVinculados] = useState<boolean>(true);

  // Filas en la vista previa editable
  const [filas, setFilas] = useState<FilaImportacionCriterio[]>([]);
  const [filtroVista, setFiltroVista] = useState<'todas' | 'validas' | 'duplicados' | 'incompletas'>('todas');
  
  // Edición rápida de fila en modal
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [codigoEditando, setCodigoEditando] = useState<string>('');
  const [descEditando, setDescEditando] = useState<string>('');
  const [pondEditando, setPondEditando] = useState<string>('');

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
      let parseadas: FilaImportacionCriterio[] = [];

      if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')) {
        parseadas = await parseCriteriosFromXlsx(selected, criteriosExistentes);
      } else if (fileNameLower.endsWith('.docx')) {
        parseadas = await parseCriteriosFromDocx(selected, criteriosExistentes);
      } else {
        throw new Error('Formato no compatible. Por favor, selecciona un documento Word (.docx) o Excel (.xlsx).');
      }

      // Si actualizarExistentes está activo, pre-seleccionar los duplicados válidos para que se actualicen
      if (actualizarExistentes) {
        parseadas = parseadas.map((f) => ({
          ...f,
          seleccionado: !f.incompleto,
        }));
      }

      setFilas(parseadas);
    } catch (err: any) {
      console.error('[ImportarCriteriosModal] Error al procesar archivo:', err);
      setParseError(err?.message || 'Error al leer y analizar el archivo de criterios seleccionado.');
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

  const handleIniciarEdicion = (fila: FilaImportacionCriterio) => {
    setEditandoId(fila.id);
    setCodigoEditando(fila.codigo);
    setDescEditando(fila.descripcion);
    setPondEditando(fila.ponderacion !== null && fila.ponderacion !== undefined ? String(fila.ponderacion) : '');
  };

  const handleGuardarEdicion = (id: string) => {
    const cleanCod = codigoEditando.trim();
    const cleanDesc = descEditando.trim();
    let numPond: number | null = null;
    if (pondEditando.trim() !== '') {
      const parsed = parseFloat(pondEditando.replace(',', '.'));
      if (!isNaN(parsed) && parsed >= 0) numPond = parsed;
    }

    setFilas((prev) =>
      prev.map((f) => {
        if (f.id === id) {
          const lower = cleanCod.toLowerCase();
          const esDuplicado = criteriosExistentes.some((c) => c.codigo.trim().toLowerCase() === lower);
          const incompleto = !cleanCod || !cleanDesc || cleanDesc.length < 4;
          return {
            ...f,
            codigo: cleanCod,
            descripcion: cleanDesc,
            ponderacion: numPond,
            esDuplicado,
            motivoDuplicado: esDuplicado ? 'Este código ya existe en el curso' : undefined,
            incompleto,
            motivoIncompleto: incompleto ? 'Código o descripción incompleta' : undefined,
            seleccionado: actualizarExistentes ? !incompleto : (!esDuplicado && !incompleto),
          };
        }
        return f;
      })
    );
    setEditandoId(null);
  };

  const handleConfirmarImportacion = async () => {
    const filasParaImportar = filas.filter((f) => f.seleccionado && !f.incompleto);
    if (filasParaImportar.length === 0) {
      setSubmitError('No hay criterios válidos seleccionados para importar.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const mapaExistentes = new Map<string, Criterio>();
      criteriosExistentes.forEach((c) => {
        if (c.codigo) {
          mapaExistentes.set(c.codigo.trim().toLowerCase(), c);
        }
      });

      const paraActualizar: Array<{ criterioId: number; codigo: string; descripcion: string; ponderacion: number | null }> = [];
      const paraInsertar: Array<{ codigo: string; descripcion: string; ponderacion: number | null }> = [];

      for (const f of filasParaImportar) {
        const codLower = f.codigo.trim().toLowerCase();
        const exist = mapaExistentes.get(codLower);
        if (exist && actualizarExistentes) {
          paraActualizar.push({
            criterioId: exist.id,
            codigo: f.codigo.trim(),
            descripcion: f.descripcion.trim(),
            ponderacion: f.ponderacion ?? null,
          });
        } else if (!exist) {
          paraInsertar.push({
            codigo: f.codigo.trim(),
            descripcion: f.descripcion.trim(),
            ponderacion: f.ponderacion ?? null,
          });
        }
      }

      let countActualizados = 0;
      for (const act of paraActualizar) {
        await actualizarCriterio(
          grupoId,
          act.criterioId,
          act.codigo,
          act.descripcion,
          act.ponderacion
        );
        countActualizados++;
      }

      let countInsertados = 0;
      if (paraInsertar.length > 0) {
        const res = await importarCriterios(grupoId, paraInsertar);
        countInsertados = res.total;
      }

      // Replicar en cursos vinculados si está activo
      if (replicarEnVinculados && gruposVinculados.length > 0) {
        for (const fila of filasParaImportar) {
          try {
            await replicarCriterioEnGruposVinculados(
              fila.codigo.trim(),
              fila.descripcion.trim(),
              fila.ponderacion ?? null,
              gruposVinculados
            );
          } catch (vErr) {
            console.warn('[ImportarCriteriosModal] Error replicando en cursos vinculados:', vErr);
          }
        }
      }

      onSuccess(countActualizados + countInsertados);
      onClose();
    } catch (err: any) {
      console.error('[ImportarCriteriosModal] Error al persistir importación:', err);
      setSubmitError(err?.message || 'Error del servidor al guardar los criterios importados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Borde superior dinámico según el color del curso */}
        <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: cursoTheme.primary }} />

        {/* Cabecera */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Importar Criterios de Evaluación
              </h3>
              <p className="text-xs text-slate-500">
                Curso: <strong className="text-slate-800">{grupoNombre}</strong> · Compatible con Word (.docx) y Excel (.xlsx)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4">
          {/* 1. Selector de archivo si aún no hay filas */}
          {filas.length === 0 && !isParsing && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/30 rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer group flex flex-col items-center justify-center gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition-colors shadow-2xs">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">
                  Haz clic para seleccionar tu archivo Excel o Word
                </p>
                <p className="text-xs text-slate-500">
                  Archivos soportados: <span className="font-semibold text-slate-700">.xlsx, .xls, .docx</span>
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 pt-2">
                <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Columnas: Código, Descripción, Ponderación
                </span>
                <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
                  <FileText className="w-3.5 h-3.5 text-blue-600" /> Tablas o listas de criterios
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.docx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Estado de lectura / parsing */}
          {isParsing && (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700">
                Analizando estructura y reconociendo criterios del documento...
              </p>
            </div>
          )}

          {/* Error de lectura inicial */}
          {parseError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">No se pudo procesar el archivo seleccionado</p>
                <p>{parseError}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-xs font-semibold text-rose-900 underline hover:no-underline cursor-pointer"
                >
                  Intentar con otro archivo
                </button>
              </div>
            </div>
          )}

          {/* 2. Vista Previa Editable y Controles */}
          {filas.length > 0 && (
            <div className="space-y-3">
              {/* Resumen del análisis y filtros */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-700">Detectados:</span>
                  <span className="px-2 py-0.5 rounded-md font-bold bg-white border border-slate-200 text-slate-800">
                    {totalFilas} criterios
                  </span>
                  {duplicadosCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {duplicadosCount} duplicados
                    </span>
                  )}
                  {incompletasCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {incompletasCount} incompletos
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-md font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    {seleccionadasCount} seleccionados para importar
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setFiltroVista('todas')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      filtroVista === 'todas'
                        ? 'bg-slate-800 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    Todos ({totalFilas})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroVista('validas')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      filtroVista === 'validas'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    Válidos ({filas.filter((f) => !f.esDuplicado && !f.incompleto).length})
                  </button>
                  {duplicadosCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFiltroVista('duplicados')}
                      className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                        filtroVista === 'duplicados'
                          ? 'bg-amber-700 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      Duplicados ({duplicadosCount})
                    </button>
                  )}
                </div>
              </div>

              {/* Opciones de actualización y replicación */}
              <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <label className="flex items-start sm:items-center gap-2 text-indigo-950 font-bold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={actualizarExistentes}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setActualizarExistentes(checked);
                      setFilas((prev) =>
                        prev.map((f) => {
                          if (f.esDuplicado && !f.incompleto) {
                            return { ...f, seleccionado: checked };
                          }
                          return f;
                        })
                      );
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4 mt-0.5 sm:mt-0"
                  />
                  <span>
                    Actualizar ponderación y descripción si el código ya existe en el curso
                  </span>
                </label>

                {gruposVinculados.length > 0 && (
                  <label className="flex items-center gap-2 text-indigo-950 font-bold cursor-pointer select-none shrink-0 bg-white/90 px-2.5 py-1.5 rounded-lg border border-indigo-200 shadow-2xs">
                    <input
                      type="checkbox"
                      checked={replicarEnVinculados}
                      onChange={(e) => setReplicarEnVinculados(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-3.5 h-3.5"
                    />
                    <span className="flex items-center gap-1 text-[11px]">
                      <Link2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Replicar en vinculados ({gruposVinculados.map((g) => g.nombre).join(', ')})</span>
                    </span>
                  </label>
                )}
              </div>

              {/* Controles de selección por lotes y cambio de archivo */}
              <div className="flex items-center justify-between text-xs px-1">
                <button
                  type="button"
                  onClick={handleToggleSeleccionarTodas}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                >
                  {filasFiltradas.every((f) => f.seleccionado) ? 'Deseleccionar visibles' : 'Seleccionar visibles'}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 truncate max-w-[200px]" title={file?.name}>
                    {file?.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFilas([]);
                      setFile(null);
                    }}
                    className="text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    Cambiar archivo
                  </button>
                </div>
              </div>

              {/* Tabla de previsualización editable */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10">
                      <tr>
                        <th className="p-2.5 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={filasFiltradas.length > 0 && filasFiltradas.every((f) => f.seleccionado)}
                            onChange={handleToggleSeleccionarTodas}
                            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-2.5 w-24">Código</th>
                        <th className="p-2.5">Descripción del criterio</th>
                        <th className="p-2.5 w-20 text-center">Pond. %</th>
                        <th className="p-2.5 w-28">Estado</th>
                        <th className="p-2.5 w-16 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filasFiltradas.map((fila) => {
                        const estaEditando = editandoId === fila.id;
                        return (
                          <tr
                            key={fila.id}
                            className={`transition-colors ${
                              fila.esDuplicado
                                ? 'bg-amber-50/50'
                                : fila.incompleto
                                ? 'bg-rose-50/50'
                                : fila.seleccionado
                                ? 'bg-indigo-50/30'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="p-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={fila.seleccionado}
                                onChange={() => handleToggleSeleccion(fila.id)}
                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-2.5 font-bold font-mono text-slate-900">
                              {estaEditando ? (
                                <input
                                  type="text"
                                  value={codigoEditando}
                                  onChange={(e) => setCodigoEditando(e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-indigo-400 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  placeholder="Ej: 1.1"
                                />
                              ) : (
                                fila.codigo || <span className="text-rose-500 italic">Sin código</span>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-800">
                              {estaEditando ? (
                                <textarea
                                  value={descEditando}
                                  onChange={(e) => setDescEditando(e.target.value)}
                                  rows={2}
                                  className="w-full px-2 py-1 text-xs border border-indigo-400 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  placeholder="Descripción del criterio..."
                                />
                              ) : (
                                <div className="line-clamp-2" title={fila.descripcion}>
                                  {fila.descripcion}
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              {estaEditando ? (
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  value={pondEditando}
                                  onChange={(e) => setPondEditando(e.target.value)}
                                  className="w-16 px-1.5 py-1 text-xs text-center border border-indigo-400 rounded focus:outline-none"
                                  placeholder="%"
                                />
                              ) : fila.ponderacion !== null && fila.ponderacion !== undefined ? (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 font-semibold text-slate-700">
                                  {fila.ponderacion}%
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {fila.esDuplicado ? (
                                actualizarExistentes ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded"
                                    title="Ya existe en el curso. Se actualizarán su ponderación y descripción con los datos del archivo."
                                  >
                                    <Check className="w-3 h-3 text-indigo-600" /> Actualizará
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded"
                                    title={fila.motivoDuplicado}
                                  >
                                    <AlertTriangle className="w-3 h-3" /> Duplicado
                                  </span>
                                )
                              ) : fila.incompleto ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded"
                                  title={fila.motivoIncompleto}
                                >
                                  <AlertCircle className="w-3 h-3" /> Incompleto
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                                  <CheckCircle2 className="w-3 h-3" /> Válido
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {estaEditando ? (
                                  <button
                                    type="button"
                                    onClick={() => handleGuardarEdicion(fila.id)}
                                    className="p-1 text-emerald-600 hover:text-emerald-800 rounded hover:bg-emerald-50 cursor-pointer"
                                    title="Guardar corrección"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleIniciarEdicion(fila)}
                                    className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 cursor-pointer"
                                    title="Editar criterio"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleEliminarFila(fila.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                                  title="Excluir de la importación"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Mensaje de error al guardar */}
          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}
        </div>

        {/* Pie del modal */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          {filas.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmarImportacion}
              disabled={isSubmitting || seleccionadasCount === 0}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando en Supabase...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Importar {seleccionadasCount} {seleccionadasCount === 1 ? 'criterio' : 'criterios'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
