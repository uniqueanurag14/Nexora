import React, { useState, useEffect } from 'react';
import { getDisplayName, getUserInitials, resolveProfileImageUrl, UserNameLike } from '../utils/userUtils';

export interface UserAvatarProps {
  user?: (UserNameLike & { profile_picture?: string | null }) | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  shape?: 'rounded' | 'circle' | 'square';
  alt?: string;
}

const sizeClasses: Record<string, { container: string; text: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]' },
  sm: { container: 'w-7 h-7 sm:w-8 sm:h-8', text: 'text-xs' },
  md: { container: 'w-9 h-9 sm:w-10 sm:h-10', text: 'text-sm font-semibold' },
  lg: { container: 'w-12 h-12', text: 'text-base font-bold' },
  xl: { container: 'w-16 h-16', text: 'text-xl font-bold' },
  '2xl': { container: 'w-20 h-20 sm:w-24 sm:h-24', text: 'text-2xl sm:text-3xl font-black' },
};

const shapeClasses: Record<string, string> = {
  rounded: 'rounded-xl',
  circle: 'rounded-full',
  square: 'rounded-lg',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  size = 'md',
  className = '',
  shape = 'rounded',
  alt,
}) => {
  const [imageError, setImageError] = useState(false);
  const resolvedUrl = resolveProfileImageUrl(user?.profile_picture);
  const initials = getUserInitials(user);
  const displayName = alt || getDisplayName(user);

  // Reset imageError if the URL changes
  useEffect(() => {
    setImageError(false);
  }, [resolvedUrl]);

  const sizeStyle = sizeClasses[size] || sizeClasses.md;
  const shapeStyle = shapeClasses[shape] || shapeClasses.rounded;

  if (resolvedUrl && !imageError) {
    return (
      <img
        src={resolvedUrl}
        alt={displayName}
        onError={() => setImageError(true)}
        className={`${sizeStyle.container} ${shapeStyle} object-cover shrink-0 shadow-xs border border-slate-200/50 ${className}`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={`${sizeStyle.container} ${shapeStyle} ${sizeStyle.text} bg-linear-to-br from-[#0084CC] to-[#101B32] text-white flex items-center justify-center tracking-tight select-none shrink-0 shadow-xs border border-white/20 ${className}`}
      title={displayName}
      aria-label={displayName}
    >
      {initials}
    </div>
  );
};
