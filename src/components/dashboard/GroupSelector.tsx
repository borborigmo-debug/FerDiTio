/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GrupoDocente } from '../../services/gruposService';
import { Folder, CheckCircle, EyeOff, Users, Layers } from 'lucide-react';

interface GroupSelectorProps {
  grupos: GrupoDocente[];
  selectedGrupoId: string | null;
  onSelectGrupo: (grupoId: string) => void;
  isLoading: boolean;
}

export const GroupSelector: React.FC<GroupSelectorProps> = ({
  grupos,
  selectedGrupoId,
  onSelectGrupo,
  isLoading,
}) => {
  if (grupos.length === 0) {
    return (
      <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center">
        <Users className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
        <p className="text-sm font-semibold text-slate-700">No hay grupos disponibles</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Tu cuenta de profesor no tiene grupos asociados en la base de datos de Supabase.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-indigo-600" aria-hidden="true" />
          Seleccionar Grupo de Lengua y Literatura:
        </label>
        <span className="text-xs text-slate-500 font-medium">
          {grupos.length} {grupos.length === 1 ? 'grupo asignado' : 'grupos asignados'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
        {grupos.map((grupo) => {
          const isSelected = grupo.id === selectedGrupoId;

          return (
            <button
              key={grupo.id}
              onClick={() => onSelectGrupo(grupo.id)}
              disabled={isLoading && isSelected}
              type="button"
              className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isSelected
                  ? 'bg-indigo-50/70 border-indigo-400 shadow-sm ring-1 ring-indigo-400'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Folder className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <span className="text-sm font-bold text-slate-900 truncate">
                    {grupo.nombre}
                  </span>
                </div>

                {isSelected ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-white px-2 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
                    <CheckCircle className="w-3 h-3 text-indigo-600" />
                    Activo
                  </span>
                ) : grupo.oculto ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    <EyeOff className="w-3 h-3 text-slate-400" />
                    Oculto
                  </span>
                ) : null}
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span className="truncate">ID: {grupo.id}</span>
                {grupo.oculto && !isSelected && (
                  <span className="text-amber-600 font-sans text-[10px]">Grupo archivado</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
