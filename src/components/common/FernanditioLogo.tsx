/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface FernanditioLogoProps {
  className?: string;
  variant?: 'full' | 'wordmark' | 'badge';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Logotipo oficial de Fernanditio:
 * Colores de marca:
 * - Rojo: #dc2626 / #e11d28
 * - Amarillo/Dorado: #f59e0b / #eab308
 * - Morado: #6b21a8 / #581c87
 */
export const FernanditioLogo: React.FC<FernanditioLogoProps> = ({
  className = '',
  variant = 'wordmark',
  size = 'md',
}) => {
  // Dimensiones según el tamaño solicitado
  const sizeClasses = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-12',
    xl: 'h-20',
  }[size];

  if (variant === 'wordmark') {
    return (
      <div className={`inline-flex flex-col items-start select-none ${className}`}>
        <div className="flex items-baseline font-black tracking-tighter italic text-slate-900 leading-none">
          <span style={{ color: '#dc2626' }} className="font-extrabold tracking-tight">
            Fernan
          </span>
          <span style={{ color: '#f59e0b' }} className="font-extrabold tracking-tight">
            Di
          </span>
          <span style={{ color: '#6b21a8' }} className="font-extrabold tracking-tight">
            Tio
          </span>
        </div>
        {/* Barra tricolor inferior característica del logotipo */}
        <div className="w-full h-1 mt-0.5 rounded-full flex overflow-hidden">
          <div className="w-5/12 h-full bg-[#dc2626]" />
          <div className="w-3/12 h-full bg-[#f59e0b]" />
          <div className="w-4/12 h-full bg-[#6b21a8]" />
        </div>
      </div>
    );
  }

  if (variant === 'badge') {
    return (
      <svg
        viewBox="0 0 160 120"
        className={`${sizeClasses} ${className} w-auto select-none`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Logo Fernanditio"
      >
        {/* Pizarra de fondo con marco de madera */}
        <rect x="25" y="10" width="115" height="75" rx="4" fill="#8d5b32" stroke="#684120" strokeWidth="2" />
        <rect x="30" y="15" width="105" height="65" rx="2" fill="#2d3748" />
        {/* 'abc' en tiza en la pizarra */}
        <text x="110" y="32" fill="#e2e8f0" opacity="0.6" fontSize="13" fontFamily="ui-serif, Georgia, serif" fontStyle="italic">
          abc
        </text>
        <rect x="105" y="74" width="14" height="3" rx="1.5" fill="#ffffff" opacity="0.8" />

        {/* Pila de libros a la izquierda */}
        {/* Libro morado inferior */}
        <rect x="5" y="65" width="42" height="11" rx="2" fill="#6b21a8" />
        <rect x="10" y="67" width="34" height="7" rx="1" fill="#f8fafc" />
        {/* Libro amarillo intermedio */}
        <rect x="7" y="54" width="40" height="11" rx="2" fill="#f59e0b" />
        <rect x="11" y="56" width="33" height="7" rx="1" fill="#f8fafc" />
        {/* Libro rojo superior */}
        <rect x="11" y="43" width="38" height="11" rx="2" fill="#dc2626" />
        <rect x="14" y="45" width="32" height="7" rx="1" fill="#f8fafc" />

        {/* Portalápices a la derecha */}
        <path d="M125 54 L142 54 L138 88 L129 88 Z" fill="#6b21a8" />
        {/* Lápiz amarillo */}
        <polygon points="132,32 134,26 136,32 136,54 132,54" fill="#f59e0b" />
        <polygon points="134,26 133,29 135,29" fill="#292524" />
        {/* Bolígrafo rojo */}
        <polygon points="137,30 139,27 141,30 140,54 137,54" fill="#dc2626" />

        {/* Letras tridimensionales centrales dinámicas: F D T */}
        {/* Sombra suave */}
        <g filter="drop-shadow(0px 3px 2px rgba(0,0,0,0.25))">
          {/* F en rojo */}
          <text
            x="24"
            y="76"
            fontFamily="Arial Black, Impact, sans-serif"
            fontSize="54"
            fontWeight="900"
            fontStyle="italic"
            fill="#dc2626"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinejoin="round"
          >
            F
          </text>
          {/* D en amarillo */}
          <text
            x="52"
            y="76"
            fontFamily="Arial Black, Impact, sans-serif"
            fontSize="54"
            fontWeight="900"
            fontStyle="italic"
            fill="#f59e0b"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinejoin="round"
          >
            D
          </text>
          {/* T en morado */}
          <text
            x="89"
            y="76"
            fontFamily="Arial Black, Impact, sans-serif"
            fontSize="54"
            fontWeight="900"
            fontStyle="italic"
            fill="#6b21a8"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinejoin="round"
          >
            T
          </text>
        </g>

        {/* Texto 'FernanDiTio' en la parte inferior */}
        <g transform="translate(14, 104)">
          <text
            x="0"
            y="0"
            fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
            fontSize="18"
            fontWeight="900"
            fontStyle="italic"
          >
            <tspan fill="#dc2626">Fernan</tspan>
            <tspan fill="#f59e0b">Di</tspan>
            <tspan fill="#6b21a8">Tio</tspan>
          </text>
          {/* Barra tricolor inferior */}
          <rect x="0" y="4" width="56" height="2.5" rx="1" fill="#dc2626" />
          <rect x="58" y="4" width="28" height="2.5" rx="1" fill="#f59e0b" />
          <rect x="88" y="4" width="46" height="2.5" rx="1" fill="#6b21a8" />
        </g>
      </svg>
    );
  }

  // Variant 'full' (con ilustración emblemática y tipografía)
  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <svg
        viewBox="0 0 160 90"
        className={`${sizeClasses} w-auto`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Pizarra de fondo */}
        <rect x="25" y="8" width="115" height="68" rx="4" fill="#8d5b32" stroke="#684120" strokeWidth="2" />
        <rect x="30" y="13" width="105" height="58" rx="2" fill="#2d3748" />
        <text x="110" y="29" fill="#e2e8f0" opacity="0.6" fontSize="12" fontFamily="ui-serif, Georgia, serif" fontStyle="italic">
          abc
        </text>
        <rect x="105" y="66" width="14" height="2.5" rx="1.25" fill="#ffffff" opacity="0.8" />

        {/* Libros */}
        <rect x="6" y="55" width="38" height="10" rx="2" fill="#6b21a8" />
        <rect x="10" y="57" width="31" height="6" rx="1" fill="#f8fafc" />
        <rect x="8" y="45" width="36" height="10" rx="2" fill="#f59e0b" />
        <rect x="11" y="47" width="30" height="6" rx="1" fill="#f8fafc" />
        <rect x="11" y="35" width="34" height="10" rx="2" fill="#dc2626" />
        <rect x="14" y="37" width="28" height="6" rx="1" fill="#f8fafc" />

        {/* Portalápices */}
        <path d="M125 45 L142 45 L138 72 L129 72 Z" fill="#6b21a8" />
        <polygon points="132,26 134,20 136,26 136,45 132,45" fill="#f59e0b" />
        <polygon points="137,24 139,21 141,24 140,45 137,45" fill="#dc2626" />

        {/* Letras 3D F D T */}
        <g filter="drop-shadow(0px 2px 2px rgba(0,0,0,0.2))">
          <text
            x="24"
            y="68"
            fontFamily="Arial Black, Impact, sans-serif"
            fontSize="48"
            fontWeight="900"
            fontStyle="italic"
            fill="#dc2626"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinejoin="round"
          >
            F
          </text>
          <text
            x="52"
            y="68"
            fontFamily="Arial Black, Impact, sans-serif"
            fontSize="48"
            fontWeight="900"
            fontStyle="italic"
            fill="#f59e0b"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinejoin="round"
          >
            D
          </text>
          <text
            x="88"
            y="68"
            fontFamily="Arial Black, Impact, sans-serif"
            fontSize="48"
            fontWeight="900"
            fontStyle="italic"
            fill="#6b21a8"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinejoin="round"
          >
            T
          </text>
        </g>
      </svg>

      {/* Rótulo 'FernanDiTio' con barra tricolor */}
      <div className="mt-1 flex flex-col items-center">
        <div className="flex items-baseline font-black tracking-tight italic text-lg leading-none">
          <span style={{ color: '#dc2626' }}>Fernan</span>
          <span style={{ color: '#f59e0b' }}>Di</span>
          <span style={{ color: '#6b21a8' }}>Tio</span>
        </div>
        <div className="w-full h-1 mt-1 rounded-full flex overflow-hidden">
          <div className="w-5/12 h-full bg-[#dc2626]" />
          <div className="w-3/12 h-full bg-[#f59e0b]" />
          <div className="w-4/12 h-full bg-[#6b21a8]" />
        </div>
      </div>
    </div>
  );
};
