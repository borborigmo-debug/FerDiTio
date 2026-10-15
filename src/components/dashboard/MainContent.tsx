/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useCuaderno } from '../../context/CuadernoContext';
import { ActividadesView } from './ActividadesView';
import { RubricasView } from '../rubricas/RubricasView';
import { FiltroView } from './FiltroView';
import { ResultadosView } from './ResultadosView';
import { ConfiguracionView } from './ConfiguracionView';
import { GroupSelector } from './GroupSelector';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AlertTriangle, RefreshCw, Layers } from 'lucide-react';

export const MainContent: React.FC = () => {
  const {
    activeTab,
    selectedGrupoId,
    selectedGrupo,
    grupos,
    selectGrupo,
    isLoadingGrupos,
    cuadernoData,
    isLoadingCuaderno,
    cuadernoError,
    refreshCuaderno,
    updateCalificaciones,
    updateCalificacionesApartados,
  } = useCuaderno();

  // Si está cargando el cuaderno de un grupo seleccionado
  if (isLoadingCuaderno) {
    return (
      <div className="py-16 flex items-center justify-center">
        <LoadingSpinner
          message={`Cargando cuaderno y calificaciones de ${selectedGrupo?.nombre || 'grupo'}...`}
          size="lg"
        />
      </div>
    );
  }

  // Si se produjo un error al cargar el cuaderno
  if (cuadernoError && selectedGrupoId) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-xl border border-rose-200 shadow-sm text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Error al consultar el cuaderno en Supabase</h3>
        <p className="text-xs text-rose-700">{cuadernoError}</p>
        <button
          type="button"
          onClick={() => refreshCuaderno()}
          className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reintentar carga del cuaderno</span>
        </button>
      </div>
    );
  }

  // Si la pestaña requiere grupo pero ninguno está seleccionado
  if (!selectedGrupoId && activeTab !== 'configuracion') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs text-center space-y-2">
          <Layers className="w-10 h-10 text-indigo-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Selecciona un curso para comenzar</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Elige uno de tus grupos asignados en el selector superior de la cabecera o selecciona uno de la lista a continuación.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
          <GroupSelector
            grupos={grupos}
            selectedGrupoId={selectedGrupoId}
            onSelectGrupo={(id) => selectGrupo(id)}
            isLoading={isLoadingGrupos}
          />
        </div>
      </div>
    );
  }

  // Renderizado según la pestaña activa de la Fila 2
  switch (activeTab) {
    case 'actividades':
      return <ActividadesView />;

    case 'rubricas':
      if (!cuadernoData) return null;
      return (
        <RubricasView
          rubricas={cuadernoData.rubricas || []}
          criterios={cuadernoData.criterios || []}
          actividades={cuadernoData.actividades || []}
          alumnos={cuadernoData.alumnos || []}
          calificaciones={cuadernoData.calificaciones || []}
          calificacionesApartados={cuadernoData.calificacionesApartados || []}
          grupoId={cuadernoData.grupo.id}
          onUpdateCalificaciones={updateCalificaciones}
          onUpdateCalificacionesApartados={updateCalificacionesApartados}
        />
      );

    case 'filtro':
      return <FiltroView />;

    case 'resultados':
      return <ResultadosView />;

    case 'configuracion':
      return <ConfiguracionView />;

    default:
      return <ActividadesView />;
  }
};
