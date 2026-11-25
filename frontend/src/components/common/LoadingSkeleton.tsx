import React from 'react';

export const LoadingSkeleton: React.FC<{ rows?: number; className?: string }> = ({
  rows = 4,
  className = '',
}) => {
  return (
    <div className={`space-y-3 animate-pulse ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-full"></div>
        </div>
      ))}
    </div>
  );
};
