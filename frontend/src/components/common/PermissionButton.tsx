import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Lock } from 'lucide-react';

interface PermissionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  permission: string;
  hideIfUnauthorized?: boolean;
  unauthorizedTooltip?: string;
  children: React.ReactNode;
}

export const PermissionButton: React.FC<PermissionButtonProps> = ({
  permission,
  hideIfUnauthorized = false,
  unauthorizedTooltip = 'You do not have permission to perform this action.',
  children,
  className = '',
  disabled,
  onClick,
  ...rest
}) => {
  const { hasPermission } = useAuth();
  const allowed = hasPermission(permission);

  if (!allowed) {
    if (hideIfUnauthorized) return null;
    return (
      <button
        type="button"
        disabled
        title={unauthorizedTooltip}
        className={`opacity-50 cursor-not-allowed inline-flex items-center gap-1.5 ${className}`}
        {...rest}
      >
        <Lock className="w-3 h-3 text-slate-400" />
        {children}
      </button>
    );
  }

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 cursor-pointer ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};
