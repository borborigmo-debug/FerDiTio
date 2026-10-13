/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { NormalizedRubrica, NormalizedRubricaItem, getLevelBadgeStyle } from '../../utils/rubricaUtils';
import { Criterio } from '../../types';
import { Target, ChevronDown, ChevronUp, Layers, Check } from 'lucide-react';

interface RubricaTarjetasProps {
  rubrica: NormalizedRubrica;
  niveles: string[];
  itemsFiltrados: NormalizedRubricaItem[];
  criteriosMap: Map<string, Criterio>;
  searchTerm?: string;
  onSelectCriterio?: (codigo: string) => void;
  filtroNivel?: string | null;
}

function highlightMatch(text: string, search: string): React.ReactNode {
  if (!search || !search.trim()) return text;
  const query = search.trim();
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;

  const before = text.substring(0, index);
  const match = text.substring(index, index + query.length);
  const after = text.substring(index + query.length);

  return (
    <>
      {before}
      <mark className="bg-amber-100 text-amber-900 rounded px-0.5 font-medium">
        {match}
      </mark>
      {highlightMatch(after, search)}
    </>
  );
}

export const RubricaTarjetas: React.FC<RubricaTarjetasProps> = ({
  rubrica,
  niveles,
  itemsFiltrados,
  criteriosMap,
  searchTerm = '',
  onSelectCriterio,
  filtroNivel,
}) => {
  // Estado de colapso de cada apartado (por defecto todos abiertos)
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) => {
    setCollapsedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const nivelesAMostrar = filtroNivel
    ? niveles.filter((n) => n === filtroNivel)
    : niveles;

  if (itemsFiltrados.length === 0) {
    return (
      <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
        <p className="text-sm font-semibold text-slate-700">No se encontraron apartados</p>
        <p className="text-xs text-slate-500 mt-1">
          Ningún elemento coincide con los criterios de búsqueda.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {itemsFiltrados.map((item) => {
        const isCollapsed = Boolean(collapsedItems[item.id]);

        return (
          <div
            key={item.id}
            className="border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden transition-all hover:border-slate-300"
          >
            {/* Cabecera del Apartado */}
            <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <span className="font-mono font-bold text-xs px-2 py-1 rounded bg-slate-200 text-slate-800 shrink-0 mt-0.5">
                  #{item.numero}
                </span>

                <div className="space-y-1 flex-1">
                  <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    {highlightMatch(item.titulo, searchTerm)}
                  </h4>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
                    {item.peso !== null && (
                      <span className="font-mono font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                        Ponderación: {item.peso}%
                      </span>
                    )}

                    {item.criterios.map((cod) => {
                      const criterio = criteriosMap.get(cod);
                      return (
                        <button
                          key={cod}
                          type="button"
                          onClick={() => onSelectCriterio && onSelectCriterio(cod)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono font-bold border border-indigo-200 transition-colors"
                          title={criterio?.descripcion || `Criterio ${cod}`}
                        >
                          <Target className="w-3.5 h-3.5 text-indigo-500 shrink-0" aria-hidden="true" />
                          <span>{cod}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Botón expandir/plegar */}
              <button
                type="button"
                onClick={() => toggleCollapse(item.id)}
                className="self-end sm:self-center inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                aria-expanded={!isCollapsed}
              >
                <span>{isCollapsed ? 'Mostrar niveles' : 'Plegar'}</span>
                {isCollapsed ? (
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Niveles y descriptores del Apartado */}
            {!isCollapsed && (
              <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white">
                {nivelesAMostrar.map((nivel) => {
                  const descriptor = item.descriptores[nivel];
                  const style = getLevelBadgeStyle(nivel, niveles.length);
                  const tieneDescriptor = Boolean(descriptor && descriptor.trim());

                  return (
                    <div
                      key={nivel}
                      className={`p-3.5 rounded-lg border transition-all ${
                        tieneDescriptor
                          ? 'border-slate-200 bg-slate-50/40 hover:bg-white hover:border-slate-300'
                          : 'border-slate-100 bg-slate-50/20 opacity-60'
                      }`}
                    >
                      {/* Cabecera del Nivel */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} aria-hidden="true" />
                          <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                            {nivel.toUpperCase().startsWith('NIVEL') ? nivel : `Nivel ${nivel}`}
                          </span>
                        </div>
                      </div>

                      {/* Texto del Descriptor */}
                      {tieneDescriptor ? (
                        <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed whitespace-pre-line">
                          {highlightMatch(descriptor, searchTerm)}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 italic">
                          Sin descriptor especificado para este nivel de desempeño.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
