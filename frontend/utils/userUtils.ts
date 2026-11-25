/**
 * Nexora Centralized User Name and Profile Utilities
 * Standardizes display name formatting, initials generation, image URL resolution, and name validation.
 */

export interface UserNameLike {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  username?: string | null;
}

/**
 * Returns formatted full display name: firstName + " " + lastName.
 * Falls back to legacy name or username, and finally 'User'.
 */
export function getDisplayName(user?: UserNameLike | null): string {
  if (!user) return 'User';

  const first = (user.first_name || '').trim();
  const last = (user.last_name || '').trim();

  if (first && last) {
    return `${first} ${last}`;
  }
  if (first) return first;
  if (last) return last;
  if (user.name && user.name.trim()) return user.name.trim();
  if (user.username && user.username.trim()) return user.username.trim();

  return 'User';
}

/**
 * Returns 1-2 letter initials for user avatars.
 */
export function getUserInitials(user?: UserNameLike | null): string {
  if (!user) return 'U';

  const first = (user.first_name || '').trim();
  const last = (user.last_name || '').trim();

  if (first && last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  }
  if (first) {
    return first.slice(0, 2).toUpperCase();
  }
  if (user.name && user.name.trim()) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (user.username) {
    return user.username.charAt(0).toUpperCase();
  }

  return 'U';
}

/**
 * Resolves a profile picture URL safely:
 * - If null/empty -> returns null
 * - If http:// or https:// or data: -> returns as-is
 * - If /uploads/... -> returns normalized absolute path
 * - Never double-appends base URLs or duplicates slashes
 */
export function resolveProfileImageUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Relative upload path: ensure leading slash
  if (trimmed.startsWith('/uploads/')) {
    return trimmed;
  }
  if (trimmed.startsWith('uploads/')) {
    return `/${trimmed}`;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Validates First Name or Last Name according to enterprise requirements:
 * - Mandatory, non-empty, trimmed
 * - Supports Unicode/international characters (e.g., José, René, Müller, 李)
 * - 1 to 100 characters in length
 */
export function validateName(value: string, fieldLabel = 'Name'): { valid: boolean; error?: string } {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: `${fieldLabel} is required.` };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: `${fieldLabel} cannot be empty or blank.` };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: `${fieldLabel} must not exceed 100 characters.` };
  }

  return { valid: true };
}
