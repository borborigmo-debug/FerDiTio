/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CursoColorTheme {
  primary: string;      // Color hex principal (ej: borde superior)
  border: string;       // Color para bordes
  lightBg: string;      // Fondo suave con tinte
  badgeBg: string;      // Fondo para badges
  badgeText: string;    // Texto de badges
  name: string;
}

const PALETA_CURSOS: CursoColorTheme[] = [
  {
    name: 'indigo',
    primary: '#4f46e5',
    border: '#6366f1',
    lightBg: '#eef2ff',
    badgeBg: '#e0e7ff',
    badgeText: '#3730a3',
  },
  {
    name: 'emerald',
    primary: '#059669',
    border: '#10b981',
    lightBg: '#ecfdf5',
    badgeBg: '#d1fae5',
    badgeText: '#065f46',
  },
  {
    name: 'sky',
    primary: '#0284c7',
    border: '#0ea5e9',
    lightBg: '#f0f9ff',
    badgeBg: '#e0f2fe',
    badgeText: '#075985',
  },
  {
    name: 'violet',
    primary: '#7c3aed',
    border: '#8b5cf6',
    lightBg: '#f5f3ff',
    badgeBg: '#ede9fe',
    badgeText: '#5b21b6',
  },
  {
    name: 'amber',
    primary: '#d97706',
    border: '#f59e0b',
    lightBg: '#fffbeb',
    badgeBg: '#fef3c7',
    badgeText: '#92400e',
  },
  {
    name: 'rose',
    primary: '#e11d48',
    border: '#f43f5e',
    lightBg: '#fff1f2',
    badgeBg: '#ffe4e6',
    badgeText: '#9f1239',
  },
  {
    name: 'teal',
    primary: '#0d9488',
    border: '#14b8a6',
    lightBg: '#f0fdfa',
    badgeBg: '#ccfbf1',
    badgeText: '#115e59',
  },
  {
    name: 'pink',
    primary: '#db2777',
    border: '#ec4899',
    lightBg: '#fdf2f8',
    badgeBg: '#fce7f3',
    badgeText: '#9d174d',
  },
];

/**
 * Resuelve de forma determinista y consistente un tema de color único para cada curso
 * a partir de su ID o nombre, garantizando que el color no cambie aleatoriamente entre recargas.
 */
export function getCursoColorTheme(
  grupoId?: string | null,
  grupoNombre?: string | null
): CursoColorTheme {
  const seed = (grupoId || grupoNombre || 'default').trim().toLowerCase();
  if (!seed || seed === 'default') {
    return PALETA_CURSOS[0];
  }

  // Hash determinista (djb2)
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }

  const index = Math.abs(hash) % PALETA_CURSOS.length;
  return PALETA_CURSOS[index];
}
