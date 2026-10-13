/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Rubrica, Criterio, ActividadDetalle } from '../../types';
import {
  normalizeRubrica,
  sortNiveles,
  NormalizedRubricaItem,
} from '../../utils/rubricaUtils';
import { RubricaMatriz } from './RubricaMatriz';
import { RubricaTarjetas } from './RubricaTarjetas';
import {
  Table,
  LayoutGrid,
  ArrowUpDown,
  Search,
  Filter,
  Printer,
  Code2,
  Target,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  Info,
} from 'lucide-react';

interface RubricaDetalleProps {
  rubricaRaw: Rubrica;
  criterios: Criterio[];
  actividades: ActividadDetalle[];
  onBackToList?: () => void;
  onIniciarEvaluacion?: () => void;
}

export const RubricaDetalle: React.FC<RubricaDetalleProps> = ({
  rubricaRaw,
  criterios,
  actividades,
  onBackToList,
  onIniciarEvaluacion,
}) => {
  // Normalización segura y no destructiva de la rúbrica
  const rubrica = useMemo(() => normalizeRubrica(rubricaRaw), [rubricaRaw]);

  // Mapa de criterios del grupo para lookup inmediato de descripciones
  const criteriosMap = useMemo(() => {
    return new Map<string, Criterio>(
      (criterios || []).map((c) => [c.codigo, c])
    );
  }, [criterios]);

  // Actividades asociadas a esta rúbrica
  const actividadesAsociadas = useMemo(() => {
    return (actividades || []).filter((a) => a.rubrica_id === rubrica.id);
  }, [actividades, rubrica.id]);

  // Estados de vista y filtros
  const [viewMode, setViewMode] = useState<'matriz' | 'tarjetas'>('matriz');
  const [orderAsc, setOrderAsc] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCriterioFiltro, setSelectedCriterioFiltro] = useState<string>('todos');
  const [selectedNivelFiltro, setSelectedNivelFiltro] = useState<string>('todos');
  const [showJsonRaw, setShowJsonRaw] = useState<boolean>(false);
  const [criterioModal, setCriterioModal] = useState<Criterio | null>(null);

  // Niveles ordenados según la preferencia del usuario
  const nivelesOrdenados = useMemo(() => {
    return sortNiveles(rubrica.niveles, orderAsc);
  }, [rubrica.niveles, orderAsc]);

  // Filtrado de apartados por término de búsqueda y por criterio
  const itemsFiltrados = useMemo(() => {
    let result = rubrica.items;

    // Filtro por criterio
    if (selectedCriterioFiltro !== 'todos') {
      result = result.filter((it) => it.criterios.includes(selectedCriterioFiltro));
    }

    // Filtro por búsqueda de texto
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter((it) => {
        const enTitulo = it.titulo.toLowerCase().includes(q);
        const enNumero = it.numero.toLowerCase().includes(q);
        const enDescriptores = Object.values(it.descriptores).some((d) =>
          d.toLowerCase().includes(q)
        );
        return enTitulo || enNumero || enDescriptores;
      });
    }

    return result;
  }, [rubrica.items, selectedCriterioFiltro, searchTerm]);

  // Manejador de clic en un criterio
  const handleOpenCriterio = (codigo: string) => {
    const c = criteriosMap.get(codigo);
    if (c) {
      setCriterioModal(c);
    } else {
      setCriterioModal({
        id: 0,
        grupo_id: rubrica.grupo_id,
        codigo,
        descripcion: 'Este código de criterio no figura en el catálogo oficial de este grupo.',
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Cabecera Principal de la Rúbrica */}
      <div className="p-5 sm:p-6 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 uppercase">
                {rubrica.tipo}
              </span>
              <span className="text-xs font-mono text-slate-400">
                ID: {rubrica.id}
              </span>
            </div>

            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mt-1 tracking-tight">
              {rubrica.titulo}
            </h3>

            {rubrica.descripcion && (
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
                {rubrica.descripcion}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 self-start flex-wrap">
            {onIniciarEvaluacion && (
              <button
                type="button"
                onClick={onIniciarEvaluacion}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1d4ed8] active:bg-[#1e3a8a] rounded-lg shadow-sm transition-colors cursor-pointer"
                title="Evaluar a los alumnos con esta rúbrica"
              >
                <span>📊</span>
                <span>Evaluar Alumnos</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
              title="Imprimir o exportar matriz de rúbrica a PDF"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>

            {onBackToList && (
              <button
                type="button"
                onClick={onBackToList}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-700 bg-slate-50 hover:bg-indigo-50 border border-slate-200 rounded-lg transition-colors"
              >
                Volver a la lista
              </button>
            )}
          </div>
        </div>

        {/* Métricas y Diagnóstico del Cuaderno */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] text-slate-500 font-medium">Apartados / Ítems</p>
            <p className="text-base font-bold text-slate-900 mt-0.5">
              {rubrica.items.length}
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] text-slate-500 font-medium">Escala de Desempeño</p>
            <p className="text-base font-bold text-slate-900 mt-0.5">
              {rubrica.niveles.length} niveles
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] text-slate-500 font-medium">Ponderación Total</p>
            <p className="text-base font-bold text-slate-900 mt-0.5">
              {rubrica.sumaPesos !== null ? `${rubrica.sumaPesos}%` : 'Sin ponderar'}
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] text-slate-500 font-medium">Actividades Usándola</p>
            <p className="text-base font-bold text-slate-900 mt-0.5">
              {actividadesAsociadas.length}
            </p>
          </div>
        </div>

        {/* Criterios de Evaluación Cubiertos */}
        {rubrica.criteriosUnicos.length > 0 && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5 shrink-0">
              <Target className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
              Criterios evaluados:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {rubrica.criteriosUnicos.map((cod) => {
                const c = criteriosMap.get(cod);
                return (
                  <button
                    key={cod}
                    type="button"
                    onClick={() => handleOpenCriterio(cod)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono text-xs font-bold border border-indigo-200 transition-colors"
                    title={c ? `${c.codigo}: ${c.descripcion}` : `Criterio ${cod}`}
                  >
                    <span>{cod}</span>
                    {c && <span className="text-[10px] text-indigo-500 font-normal truncate max-w-[120px] hidden sm:inline">· {c.descripcion}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Actividades del Cuaderno Vinculadas */}
        {actividadesAsociadas.length > 0 && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5 shrink-0">
              <FileText className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
              Actividades en este grupo:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {actividadesAsociadas.map((act) => (
                <span
                  key={act.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] font-medium border border-slate-200"
                >
                  <span>{act.nombre}</span>
                  {act.evaluacion_periodo && (
                    <span className="text-slate-500 font-mono text-[10px]">({act.evaluacion_periodo})</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Barra de Herramientas y Controles de la Matriz */}
      <div className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Selector de Modo de Visualización (Matriz Tabular vs Desglose Tarjetas) */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode('matriz')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors ${
              viewMode === 'matriz'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Table className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Matriz Tabular</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('tarjetas')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors ${
              viewMode === 'tarjetas'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Desglose por Apartados</span>
          </button>
        </div>

        {/* Buscador de texto en apartados y descriptores */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar en descriptores o apartados..."
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-800 placeholder:text-slate-400"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Controles secundarios: Orden de niveles, Filtro de Criterio y Filtro de Nivel */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Invertir orden de la escala de niveles */}
          <button
            type="button"
            onClick={() => setOrderAsc(!orderAsc)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-medium rounded-lg border border-slate-200 transition-colors shadow-2xs"
            title="Cambiar sentido de la escala"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>{orderAsc ? 'Nivel: 1 → 4 (Ascendente)' : 'Nivel: 4 → 1 (Descendente)'}</span>
          </button>

          {/* Filtro por Criterio */}
          {rubrica.criteriosUnicos.length > 0 && (
            <div className="flex items-center gap-1">
              <select
                value={selectedCriterioFiltro}
                onChange={(e) => setSelectedCriterioFiltro(e.target.value)}
                className="bg-white border border-slate-200 text-slate-700 py-1.5 px-2.5 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-2xs"
                aria-label="Filtrar por criterio"
              >
                <option value="todos">Todos los criterios</option>
                {rubrica.criteriosUnicos.map((c) => (
                  <option key={c} value={c}>
                    Criterio {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filtro por Nivel (enfocar un nivel concreto) */}
          <select
            value={selectedNivelFiltro}
            onChange={(e) => setSelectedNivelFiltro(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 py-1.5 px-2.5 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-2xs"
            aria-label="Filtrar por nivel"
          >
            <option value="todos">Todos los niveles</option>
            {nivelesOrdenados.map((n) => (
              <option key={n} value={n}>
                Nivel {n}
              </option>
            ))}
          </select>

          {/* Toggle de JSON sin procesar */}
          <button
            type="button"
            onClick={() => setShowJsonRaw(!showJsonRaw)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              showJsonRaw
                ? 'bg-slate-800 text-white border-slate-700'
                : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200'
            }`}
            title="Inspeccionar estructura original JSONB de Supabase"
          >
            <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden md:inline">JSON original</span>
          </button>
        </div>
      </div>

      {/* Inspección Técnica de JSONB (Colapsable) */}
      {showJsonRaw && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400">Datos originales almacenados en public.rubricas:</span>
            <button
              type="button"
              onClick={() => setShowJsonRaw(false)}
              className="text-slate-400 hover:text-white"
            >
              Cerrar
            </button>
          </div>
          <pre className="overflow-x-auto max-h-72 p-3 bg-slate-950 rounded-lg text-indigo-300 text-[11px] leading-relaxed">
            {JSON.stringify(rubricaRaw, null, 2)}
          </pre>
        </div>
      )}

      {/* Visualización Principal de la Rúbrica: Matriz Tabular o Desglose Tarjetas */}
      {viewMode === 'matriz' ? (
        <RubricaMatriz
          rubrica={rubrica}
          niveles={
            selectedNivelFiltro !== 'todos'
              ? [selectedNivelFiltro]
              : nivelesOrdenados
          }
          itemsFiltrados={itemsFiltrados}
          criteriosMap={criteriosMap}
          searchTerm={searchTerm}
          onSelectCriterio={handleOpenCriterio}
        />
      ) : (
        <RubricaTarjetas
          rubrica={rubrica}
          niveles={nivelesOrdenados}
          itemsFiltrados={itemsFiltrados}
          criteriosMap={criteriosMap}
          searchTerm={searchTerm}
          onSelectCriterio={handleOpenCriterio}
          filtroNivel={selectedNivelFiltro !== 'todos' ? selectedNivelFiltro : null}
        />
      )}

      {/* Modal / Diálogo de Información de Criterio */}
      {criterioModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setCriterioModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 relative animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-mono">
                    {criterioModal.codigo}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 mt-1">
                    Criterio de Evaluación LOMLOE
                  </h4>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCriterioModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-700 leading-relaxed">
              <p className="font-medium text-slate-900 mb-1">Descripción oficial:</p>
              <p className="whitespace-pre-line">{criterioModal.descripcion}</p>
            </div>

            {criterioModal.ponderacion !== null && criterioModal.ponderacion !== undefined && (
              <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                <span>Ponderación global del criterio:</span>
                <span className="font-bold text-slate-900 font-mono">{criterioModal.ponderacion}%</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setCriterioModal(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
