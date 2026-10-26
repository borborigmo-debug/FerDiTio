/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Percent,
  RotateCcw,
  Save,
  Scale,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  ConfiguracionInstrumentos,
  InstrumentoEvaluacion,
  getConfiguracionInstrumentos,
  saveConfiguracionInstrumentos,
  INSTRUMENTOS_PREDETERMINADOS,
} from '../../../services/instrumentosService';

export const GestionInstrumentos: React.FC = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<ConfiguracionInstrumentos>(() =>
    getConfiguracionInstrumentos(user?.uid)
  );

  // Estados del formulario para nuevo instrumento
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaPonderacion, setNuevaPonderacion] = useState<string>('20');
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');

  // Edición en fila
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [pondEdit, setPondEdit] = useState<string>('20');
  const [descEdit, setDescEdit] = useState('');

  // Mensajes de retroalimentación
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  useEffect(() => {
    setConfig(getConfiguracionInstrumentos(user?.uid));
  }, [user?.uid]);

  // Suma total de las ponderaciones de los instrumentos
  const sumaPonderaciones = useMemo(() => {
    return config.instrumentos.reduce((acc, inst) => acc + (inst.ponderacion || 0), 0);
  }, [config.instrumentos]);

  const handleGuardarCambios = (nuevaConfig?: ConfiguracionInstrumentos) => {
    const toSave = nuevaConfig || config;
    saveConfiguracionInstrumentos(toSave, user?.uid);
    setConfig({ ...toSave });
    setMensajeExito('Configuración de instrumentos de evaluación guardada correctamente.');
    setTimeout(() => setMensajeExito(null), 3500);
  };

  const handleToggleAplicarPonderacion = (nuevoEstado: boolean) => {
    const updated = {
      ...config,
      aplicarPonderacion: nuevoEstado,
    };
    handleGuardarCambios(updated);
  };

  // Selección automática de todo el contenido al recibir foco o clic para permitir sobreescribir sin borrar
  const handleAutoSelect = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement> | React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const target = e.currentTarget;
    setTimeout(() => {
      if (target && typeof target.select === 'function') {
        target.select();
      }
    }, 0);
  };

  const limpiarCeroInicial = (val: string): string => {
    if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.') && !val.startsWith('0,')) {
      return val.replace(/^0+/, '');
    }
    return val;
  };

  const handleCrearInstrumento = (e: React.FormEvent) => {
    e.preventDefault();
    setMensajeError(null);

    const cleanNombre = nuevoNombre.trim();
    if (!cleanNombre || cleanNombre.length < 2) {
      setMensajeError('El nombre del instrumento debe tener al menos 2 caracteres.');
      return;
    }

    const numPond = Number(nuevaPonderacion);
    if (isNaN(numPond) || numPond < 0 || numPond > 100) {
      setMensajeError('La ponderación debe ser un número entre 0 y 100.');
      return;
    }

    const nuevo: InstrumentoEvaluacion = {
      id: `inst_${Date.now()}`,
      nombre: cleanNombre,
      ponderacion: numPond,
      descripcion: nuevaDescripcion.trim() || undefined,
    };

    const updated = {
      ...config,
      instrumentos: [...config.instrumentos, nuevo],
    };

    setNuevoNombre('');
    setNuevaPonderacion('20');
    setNuevaDescripcion('');
    handleGuardarCambios(updated);
  };

  const handleIniciarEdicion = (inst: InstrumentoEvaluacion) => {
    setEditandoId(inst.id);
    setNombreEdit(inst.nombre);
    setPondEdit(String(inst.ponderacion));
    setDescEdit(inst.descripcion || '');
  };

  const handleGuardarEdicion = (id: string) => {
    const clean = nombreEdit.trim();
    if (!clean || clean.length < 2) {
      setMensajeError('El nombre no puede estar vacío.');
      return;
    }
    const numPond = Number(pondEdit);
    if (isNaN(numPond) || numPond < 0 || numPond > 100) {
      setMensajeError('La ponderación debe ser un número entre 0 y 100.');
      return;
    }

    const actualizados = config.instrumentos.map((inst) =>
      inst.id === id
        ? {
            ...inst,
            nombre: clean,
            ponderacion: numPond,
            descripcion: descEdit.trim() || undefined,
          }
        : inst
    );

    setEditandoId(null);
    setMensajeError(null);
    handleGuardarCambios({ ...config, instrumentos: actualizados });
  };

  const handleEliminarInstrumento = (id: string) => {
    const filtrados = config.instrumentos.filter((i) => i.id !== id);
    handleGuardarCambios({ ...config, instrumentos: filtrados });
  };

  const handleRestablecerPredeterminados = () => {
    if (
      window.confirm(
        '¿Deseas restablecer los instrumentos a los valores oficiales predeterminados?'
      )
    ) {
      handleGuardarCambios({
        aplicarPonderacion: false,
        instrumentos: INSTRUMENTOS_PREDETERMINADOS,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Mensajes de retroalimentación */}
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

      {mensajeError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{mensajeError}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensajeError(null)}
            className="text-rose-700 font-bold hover:text-rose-900"
          >
            ×
          </button>
        </div>
      )}

      {/* Cabecera explicativa con el interruptor principal */}
      <div className="bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 p-4 rounded-xl border border-indigo-200/80 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Instrumentos de Evaluación y Ponderaciones</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">
                Crea los instrumentos que consideres oportunos (pruebas escritas, rúbricas de expresión, cuadernos, proyectos) y asígnales una ponderación. Esta ponderación solo se tendrá en cuenta si eliges asignarles un peso mediante el interruptor inferior.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRestablecerPredeterminados}
            className="px-2.5 py-1 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-md border border-slate-200 hover:bg-slate-50 flex items-center gap-1 cursor-pointer self-start sm:self-auto shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restablecer</span>
          </button>
        </div>

        {/* Interruptor crítico: Asignar peso a los instrumentos */}
        <div className="pt-3 border-t border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200/80">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                ¿Asignar peso ponderado a los instrumentos de evaluación?
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  config.aplicarPonderacion
                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                    : 'bg-slate-100 text-slate-600 border border-slate-300'
                }`}
              >
                {config.aplicarPonderacion ? 'Ponderación ACTIVA' : 'Ponderación DESACTIVADA'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {config.aplicarPonderacion
                ? 'Las actividades vinculadas a cada instrumento contribuirán a los criterios según el peso configurado.'
                : 'Sin ponderación: todas las actividades que evalúan el mismo criterio tienen el mismo peso aritmético.'}
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={config.aplicarPonderacion}
              onChange={(e) => handleToggleAplicarPonderacion(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>
      </div>

      {/* Formulario para añadir un nuevo instrumento */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-indigo-600" />
          Añadir Nuevo Instrumento de Evaluación
        </h4>

        <form onSubmit={handleCrearInstrumento} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Nombre del instrumento:
            </label>
            <input
              type="text"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onFocus={handleAutoSelect}
              onClick={handleAutoSelect}
              placeholder="Ej: Prueba escrita, Cuaderno, Proyecto, Rúbrica oral..."
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Ponderación (%):
            </label>
            <div className="relative flex items-center">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={nuevaPonderacion}
                onChange={(e) => setNuevaPonderacion(limpiarCeroInicial(e.target.value))}
                onFocus={handleAutoSelect}
                onClick={handleAutoSelect}
                className="w-full pl-3 pr-6 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-slate-900"
              />
              <span className="absolute right-2 text-slate-400 text-xs font-bold">%</span>
            </div>
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Descripción o notas (opcional):
            </label>
            <input
              type="text"
              value={nuevaDescripcion}
              onChange={(e) => setNuevaDescripcion(e.target.value)}
              onFocus={handleAutoSelect}
              onClick={handleAutoSelect}
              placeholder="Ej: Controles bimestrales..."
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!nuevoNombre.trim()}
              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir</span>
            </button>
          </div>
        </form>
      </div>

      {/* Lista de Instrumentos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Instrumentos Registrados ({config.instrumentos.length})
            </span>
            <span
              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                sumaPonderaciones === 100
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              Suma de pesos: {sumaPonderaciones}%
            </span>
          </div>

          <span className="text-[11px] text-slate-500">
            {config.aplicarPonderacion
              ? '✅ Los pesos activos se aplicarán al calcular las medias.'
              : 'ℹ️ Los pesos no intervienen en el cálculo (modo desactivado).'}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">Nombre del Instrumento</th>
                <th className="p-3 w-32 text-center">Ponderación</th>
                <th className="p-3">Descripción / Orientaciones</th>
                <th className="p-3 w-24 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {config.instrumentos.map((inst) => {
                const isEditing = editandoId === inst.id;

                return (
                  <tr key={inst.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-semibold text-slate-900">
                      {isEditing ? (
                        <input
                          type="text"
                          value={nombreEdit}
                          onChange={(e) => setNombreEdit(e.target.value)}
                          onFocus={handleAutoSelect}
                          onClick={handleAutoSelect}
                          className="w-full px-2 py-1 text-xs border border-indigo-400 rounded focus:outline-none"
                        />
                      ) : (
                        <span>{inst.nombre}</span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      {isEditing ? (
                        <div className="inline-flex items-center">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={pondEdit}
                            onChange={(e) => setPondEdit(limpiarCeroInicial(e.target.value))}
                            onFocus={handleAutoSelect}
                            onClick={handleAutoSelect}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleGuardarEdicion(inst.id);
                              }
                            }}
                            className="w-16 px-1.5 py-1 text-xs border border-indigo-400 rounded text-center font-mono focus:outline-none"
                          />
                          <span className="ml-1 text-slate-500">%</span>
                        </div>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full font-mono font-bold bg-slate-100 text-slate-800 text-[11px]">
                          {inst.ponderacion}%
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-slate-600">
                      {isEditing ? (
                        <input
                          type="text"
                          value={descEdit}
                          onChange={(e) => setDescEdit(e.target.value)}
                          onFocus={handleAutoSelect}
                          onClick={handleAutoSelect}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleGuardarEdicion(inst.id);
                            }
                          }}
                          placeholder="Descripción opcional..."
                          className="w-full px-2 py-1 text-xs border border-indigo-400 rounded focus:outline-none"
                        />
                      ) : (
                        <span className="text-slate-500 text-[11px]">
                          {inst.descripcion || '—'}
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleGuardarEdicion(inst.id)}
                              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md cursor-pointer"
                              title="Guardar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditandoId(null)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleIniciarEdicion(inst)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEliminarInstrumento(inst.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
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
  );
};
