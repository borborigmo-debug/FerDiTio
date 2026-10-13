/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { NormalizedRubrica, NormalizedRubricaItem, getLevelBadgeStyle } from '../../utils/rubricaUtils';
import { Criterio } from '../../types';
import { Target, Info, CheckCircle2 } from 'lucide-react';

interface RubricaMatrizProps {
  rubrica: NormalizedRubrica;
  niveles: string[];
  itemsFiltrados: NormalizedRubricaItem[];
  criteriosMap: Map<string, Criterio>;
  searchTerm?: string;
  onSelectCriterio?: (codigo: string) => void;
}

/**
 * Resalta las coincidencias de búsqueda en el texto del descriptor
 */
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

export const RubricaMatriz: React.FC<RubricaMatrizProps> = ({
  rubrica,
  niveles,
  itemsFiltrados,
  criteriosMap,
  searchTerm = '',
  onSelectCriterio,
}) => {
  if (itemsFiltrados.length === 0) {
    return (
      <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
        <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-700">
          No se encontraron apartados
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Ningún elemento coincide con los filtros o la búsqueda aplicados.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden border border-slate-200 rounded-xl shadow-2xs bg-white">
      {/* Contenedor con scroll horizontal responsivo y cabecera pegajosa */}
      <div className="overflow-x-auto focus-visible:outline-none">
        <table className="w-full text-left border-collapse min-w-[760px] lg:min-w-[900px]">
          {/* Cabecera de Niveles de Desempeño */}
          <thead className="bg-slate-50 border-b border-slate-200 select-none">
            <tr>
              {/* Columna fija: Apartado / Indicador de evaluación */}
              <th
                scope="col"
                className="py-3.5 px-4 w-72 sm:w-80 font-bold text-xs text-slate-800 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]"
              >
                <div className="flex items-center justify-between">
                  <span>Apartado / Indicador</span>
                  <span className="text-[11px] font-mono text-slate-400 font-normal normal-case">
                    {itemsFiltrados.length} {itemsFiltrados.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>
              </th>

              {/* Columnas dinámicas de Niveles de desempeño */}
              {niveles.map((nivel) => {
                const style = getLevelBadgeStyle(nivel, niveles.length);
                return (
                  <th
                    key={nivel}
                    scope="col"
                    className="py-3.5 px-4 min-w-[200px] text-xs font-bold text-slate-800 border-r border-slate-200 last:border-r-0 align-top"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} aria-hidden="true" />
                      <span className="font-semibold text-slate-900">
                        {nivel.toUpperCase().startsWith('NIVEL') ? nivel : `Nivel ${nivel}`}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Filas: Cada apartado con sus descriptores por nivel */}
          <tbody className="divide-y divide-slate-100 text-xs">
            {itemsFiltrados.map((item, idx) => {
              const bgRow = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';

              return (
                <tr
                  key={item.id}
                  className={`${bgRow} hover:bg-indigo-50/30 transition-colors group`}
                >
                  {/* Celda del Apartado (Título, peso, criterios) */}
                  <th
                    scope="row"
                    className={`py-4 px-4 font-normal align-top sticky left-0 z-10 border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)] ${
                      idx % 2 === 0 ? 'bg-white group-hover:bg-indigo-50/30' : 'bg-slate-50/90 group-hover:bg-indigo-50/30'
                    }`}
                  >
                    <div className="space-y-2">
                      {/* Número y Título */}
                      <div className="flex items-start gap-2">
                        <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                          #{item.numero}
                        </span>
                        <h4 className="font-bold text-slate-900 leading-snug">
                          {highlightMatch(item.titulo, searchTerm)}
                        </h4>
                      </div>

                      {/* Peso y Criterios asociados */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {item.peso !== null && (
                          <span
                            className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200"
                            title="Ponderación de este apartado"
                          >
                            Peso: {item.peso}%
                          </span>
                        )}

                        {item.criterios.map((cod) => {
                          const criterio = criteriosMap.get(cod);
                          return (
                            <button
                              key={cod}
                              type="button"
                              onClick={() => onSelectCriterio && onSelectCriterio(cod)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono text-[11px] font-bold border border-indigo-200 transition-colors cursor-pointer text-left"
                              title={
                                criterio
                                  ? `${criterio.codigo}: ${criterio.descripcion}`
                                  : `Criterio ${cod}`
                              }
                            >
                              <Target className="w-3 h-3 text-indigo-500 shrink-0" aria-hidden="true" />
                              <span>{cod}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Descripción de los criterios (tooltip visual compacto si hay 1 criterio) */}
                      {item.criterios.length === 1 && criteriosMap.get(item.criterios[0]) && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed italic">
                          {criteriosMap.get(item.criterios[0])?.descripcion}
                        </p>
                      )}
                    </div>
                  </th>

                  {/* Celdas de Descriptores para cada nivel */}
                  {niveles.map((nivel) => {
                    const descriptor = item.descriptores[nivel];
                    const tieneTexto = Boolean(descriptor && descriptor.trim());

                    return (
                      <td
                        key={nivel}
                        className="py-4 px-4 align-top border-r border-slate-200 last:border-r-0"
                      >
                        {tieneTexto ? (
                          <div className="text-slate-700 text-xs sm:text-[13px] leading-relaxed whitespace-pre-line">
                            {highlightMatch(descriptor, searchTerm)}
                          </div>
                        ) : (
                          <div
                            className="text-slate-300 italic text-xs select-none"
                            aria-label="Sin descriptor para este nivel"
                          >
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pie de tabla con resumen informativo */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center gap-1.5">
          <Info className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span>
            Desplaza horizontalmente para comparar todos los niveles de desempeño.
          </span>
        </div>
        <div className="font-mono text-[11px] text-slate-500">
          Total apartados: {rubrica.items.length} · Niveles: {niveles.length}
        </div>
      </div>
    </div>
  );
};
