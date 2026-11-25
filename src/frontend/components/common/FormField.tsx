import React from 'react';
import { AlertCircle } from 'lucide-react';

interface FormFieldProps {
  label: string;
  id?: string;
  error?: string | null;
  required?: boolean;
  helpText?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  id,
  error,
  required,
  helpText,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
      >
        {label}
        {required && <span className="text-rose-500 ml-1">*</span>}
      </label>

      {children}

      {/* Field-level validation message in red with AlertCircle icon directly below field */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-1.5 text-xs text-rose-600 font-medium pt-0.5 animate-fadeIn"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {!error && helpText && (
        <p className="text-xs text-slate-400">{helpText}</p>
      )}
    </div>
  );
};
