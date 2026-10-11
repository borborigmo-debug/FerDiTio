/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Cargando...',
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  }[size];

  return (
    <div
      className="flex flex-col items-center justify-center p-6 text-slate-600"
      role="status"
      aria-live="polite"
    >
      <div
        className={`${sizeClasses} border-slate-200 border-t-indigo-600 rounded-full animate-spin`}
        aria-hidden="true"
      />
      {message && <p className="mt-3 text-sm font-medium text-slate-600">{message}</p>}
      <span className="sr-only">{message}</span>
    </div>
  );
};
