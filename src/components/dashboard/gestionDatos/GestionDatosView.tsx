/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Folder,
  Users,
  Award,
  Layers,
  Calendar,
  Scale,
} from 'lucide-react';
import { useCuaderno } from '../../../context/CuadernoContext';
import { GestionCursos } from './GestionCursos';
import { GestionAlumnos } from './GestionAlumnos';
import { GestionCriterios } from './GestionCriterios';
import { GestionSecciones } from './GestionSecciones';
import { GestionHorarioCalendario } from './GestionHorarioCalendario';
import { GestionInstrumentos } from './GestionInstrumentos';

export type SubApartadoGestion =
  | 'cursos'
  | 'alumnos'
  | 'criterios'
  | 'secciones'
  | 'horario_calendario'
  | 'instrumentos';

export const GestionDatosView: React.FC = () => {
  const { selectedGrupo } = useCuaderno();
  const [apartadoActivo, setApartadoActivo] = useState<SubApartadoGestion>('cursos');

  const apartados: Array<{
    id: SubApartadoGestion;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    sublabel: string;
  }> = [
    {
      id: 'cursos',
      label: 'Cursos',
      icon: Folder,
      description: 'Gestión de grupos escolares y cursos docentes',
      sublabel: 'Todos los cursos',
    },
    {
      id: 'alumnos',
      label: 'Alumnos',
      icon: Users,
      description: 'Expediente, altas, bajas e importación Word/Excel',
      sublabel: selectedGrupo?.nombre || 'Selecciona curso',
    },
    {
      id: 'criterios',
      label: 'Criterios de evaluación',
      icon: Award,
      description: 'Criterios LOMLOE, ponderaciones e importación de programaciones',
      sublabel: selectedGrupo?.nombre || 'Selecciona curso',
    },
    {
      id: 'secciones',
      label: 'Secciones',
      icon: Layers,
      description: 'Bloques temáticos y subsecciones organizativas del curso',
      sublabel: selectedGrupo?.nombre || 'Selecciona curso',
    },
    {
      id: 'horario_calendario',
      label: 'Horario/Calendario',
      icon: Calendar,
      description: 'Horario lectivo y fechas oficiales de evaluaciones',
      sublabel: 'Apertura automática',
    },
    {
      id: 'instrumentos',
      label: 'Instrumentos de evaluación',
      icon: Scale,
      description: 'Instrumentos del docente y ponderaciones opcionales',
      sublabel: 'Ponderación opcional',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Subnavegación de apartados en Configuración */}
      <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
          {apartados.map((item) => {
            const Icon = item.icon;
            const isActive = apartadoActivo === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setApartadoActivo(item.id)}
                className={`flex items-center gap-2 p-2.5 rounded-lg text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-bold truncate leading-tight">
                    {item.label}
                  </span>
                  <span
                    className={`block text-[10px] truncate leading-tight mt-0.5 ${
                      isActive ? 'text-indigo-100' : 'text-slate-400'
                    }`}
                  >
                    {item.sublabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido del apartado activo */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        {apartadoActivo === 'cursos' && <GestionCursos />}
        {apartadoActivo === 'alumnos' && <GestionAlumnos />}
        {apartadoActivo === 'criterios' && <GestionCriterios />}
        {apartadoActivo === 'secciones' && <GestionSecciones />}
        {apartadoActivo === 'horario_calendario' && <GestionHorarioCalendario />}
        {apartadoActivo === 'instrumentos' && <GestionInstrumentos />}
      </div>
    </div>
  );
};
