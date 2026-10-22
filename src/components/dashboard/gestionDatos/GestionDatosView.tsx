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
  Database,
} from 'lucide-react';
import { useCuaderno } from '../../../context/CuadernoContext';
import { GestionCursos } from './GestionCursos';
import { GestionAlumnos } from './GestionAlumnos';
import { GestionCriterios } from './GestionCriterios';
import { GestionSecciones } from './GestionSecciones';

export type SubApartadoGestion = 'cursos' | 'alumnos' | 'criterios' | 'secciones';

export const GestionDatosView: React.FC = () => {
  const { selectedGrupo } = useCuaderno();
  const [apartadoActivo, setApartadoActivo] = useState<SubApartadoGestion>('cursos');

  const apartados: Array<{
    id: SubApartadoGestion;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
  }> = [
    {
      id: 'cursos',
      label: 'Cursos',
      icon: Folder,
      description: 'Gestión de grupos escolares y cursos docentes',
    },
    {
      id: 'alumnos',
      label: 'Alumnos',
      icon: Users,
      description: 'Expediente, altas, bajas e importación Word/Excel',
    },
    {
      id: 'criterios',
      label: 'Criterios de evaluación',
      icon: Award,
      description: 'Criterios LOMLOE, ponderaciones e importación de programaciones',
    },
    {
      id: 'secciones',
      label: 'Secciones',
      icon: Layers,
      description: 'Bloques temáticos e instrumentos de evaluación del curso',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Subnavegación de los 4 apartados */}
      <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
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
                    {item.id === 'cursos'
                      ? 'Todos los cursos'
                      : selectedGrupo?.nombre || 'Selecciona curso'}
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
      </div>
    </div>
  );
};
