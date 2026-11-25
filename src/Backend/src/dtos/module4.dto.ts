/**
 * Module 4 Data Transfer Objects and Validation Rules
 * Covers: Profile Management, Password Changes, System Settings, Session Revocation
 */

export interface UpdateProfileDto {
  firstName: string;
  lastName: string;
  name?: string;
  phone?: string;
  username?: string;
  avatarUrl?: string;
  themePreference?: 'light' | 'dark' | 'system';
}

export function validateUpdateProfileDto(data: any): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.firstName || typeof data.firstName !== 'string' || !data.firstName.trim()) {
    errors.firstName = 'First name is required.';
  } else if (data.firstName.trim().length > 60) {
    errors.firstName = 'First name cannot exceed 60 characters.';
  }

  if (!data.lastName || typeof data.lastName !== 'string' || !data.lastName.trim()) {
    errors.lastName = 'Last name is required.';
  } else if (data.lastName.trim().length > 60) {
    errors.lastName = 'Last name cannot exceed 60 characters.';
  }

  if (data.phone && typeof data.phone === 'string') {
    const cleanPhone = data.phone.trim();
    if (cleanPhone.length > 0 && !/^[+0-9\s\-()]{7,20}$/.test(cleanPhone)) {
      errors.phone = 'Please enter a valid phone number (e.g. +1 555-0199).';
    }
  }

  if (data.username && typeof data.username === 'string') {
    const cleanUsername = data.username.trim();
    if (cleanUsername.length > 0 && !/^[a-zA-Z0-9._-]{3,30}$/.test(cleanUsername)) {
      errors.username = 'Username must be 3-30 characters (letters, numbers, dots, hyphens, underscores).';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}

export function validateChangePasswordDto(data: any): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.currentPassword || typeof data.currentPassword !== 'string') {
    errors.currentPassword = 'Current password is required.';
  }

  if (!data.newPassword || typeof data.newPassword !== 'string') {
    errors.newPassword = 'New password is required.';
  } else if (data.newPassword.length < 8) {
    errors.newPassword = 'New password must be at least 8 characters long.';
  } else if (data.currentPassword && data.newPassword === data.currentPassword) {
    errors.newPassword = 'New password cannot be identical to your current password.';
  }

  if (data.confirmPassword !== undefined && data.confirmPassword !== data.newPassword) {
    errors.confirmPassword = 'Password confirmation does not match the new password.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface UpdateGeneralSettingsDto {
  clinicName?: string;
  legalName?: string;
  timezone?: string;
  locale?: string;
  dateFormat?: string;
  timeFormat?: string;
  currency?: string;
  phone?: string;
  email?: string;
  address?: string;
  opdSlotDurationMinutes?: number;
  sessionTimeoutMinutes?: number;
  passwordMinLength?: number;
}

export function validateGeneralSettingsDto(data: any): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (data.clinicName !== undefined && (!data.clinicName || !String(data.clinicName).trim())) {
    errors.clinicName = 'Clinic / Application display name cannot be blank.';
  }

  if (data.email !== undefined && data.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(data.email).trim())) {
      errors.email = 'Please provide a valid system contact email address.';
    }
  }

  if (data.passwordMinLength !== undefined) {
    const minLen = Number(data.passwordMinLength);
    if (isNaN(minLen) || minLen < 6 || minLen > 64) {
      errors.passwordMinLength = 'Password minimum length must be between 6 and 64 characters.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
