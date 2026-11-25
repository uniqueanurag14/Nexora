/**
 * Nexora Client-Side Validation Utilities
 * Pure decoupled logic for form checks and password strength verification.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface PasswordStrengthResult extends ValidationResult {
  score: number; // 0 to 4
  strength: 'weak' | 'fair' | 'good' | 'strong';
}

export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, error: 'Email address is required.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  return { valid: true };
}

export function validatePassword(password: string): PasswordStrengthResult {
  if (!password) {
    return { valid: false, error: 'Password is required.', score: 0, strength: 'weak' };
  }

  if (password.length < 8) {
    return {
      valid: false,
      error: 'Password must be at least 8 characters long.',
      score: 1,
      strength: 'weak',
    };
  }

  let score = 0;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[@$!%*?&#^+=_\-~`()<>{}[\]|:;,.]/.test(password)) score++;

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one lowercase letter.', score, strength: 'weak' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one uppercase letter.', score, strength: 'weak' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must include at least one digit.', score, strength: 'weak' };
  }
  if (!/[@$!%*?&#^+=_\-~`()<>{}[\]|:;,.]/.test(password)) {
    return { valid: false, error: 'Password must include at least one special character.', score, strength: 'fair' };
  }

  let strength: 'weak' | 'fair' | 'good' | 'strong' = 'fair';
  if (score >= 4 && password.length >= 12) strength = 'strong';
  else if (score >= 4) strength = 'good';

  return { valid: true, score, strength };
}

export function validateName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Full name is required.' };
  }
  if (trimmed.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters long.' };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Name cannot exceed 100 characters.' };
  }
  return { valid: true };
}

export function validateFirstName(firstName: string): ValidationResult {
  const trimmed = firstName.trim();
  if (!trimmed) {
    return { valid: false, error: 'First name is required.' };
  }
  if (trimmed.length < 1) {
    return { valid: false, error: 'First name must contain at least 1 character.' };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: 'First name cannot exceed 50 characters.' };
  }
  return { valid: true };
}

export function validateLastName(lastName: string): ValidationResult {
  const trimmed = lastName.trim();
  if (!trimmed) {
    return { valid: false, error: 'Last name is required.' };
  }
  if (trimmed.length < 1) {
    return { valid: false, error: 'Last name must contain at least 1 character.' };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: 'Last name cannot exceed 50 characters.' };
  }
  return { valid: true };
}

export function validateRoleCode(code: string): ValidationResult {
  const trimmed = code.trim();
  if (!trimmed) {
    return { valid: false, error: 'Role code is required.' };
  }
  if (!/^[a-z0-9_-]{2,30}$/.test(trimmed)) {
    return { valid: false, error: 'Role code must be 2-30 lowercase characters with letters, numbers, underscores, or hyphens.' };
  }
  return { valid: true };
}

export function validateRoleSelection(roles: string[]): ValidationResult {
  if (!Array.isArray(roles) || roles.length === 0) {
    return { valid: false, error: 'At least one role must be assigned to the user.' };
  }
  return { valid: true };
}

export function validatePasswordConfirmation(password: string, confirmation: string): ValidationResult {
  if (!confirmation) {
    return { valid: false, error: 'Please confirm your new password.' };
  }
  if (password !== confirmation) {
    return { valid: false, error: 'Passwords do not match.' };
  }
  return { valid: true };
}

export function validateSupplierCode(code: string): ValidationResult {
  const trimmed = code.trim();
  if (!trimmed) {
    return { valid: false, error: 'Supplier code is required.' };
  }
  if (!/^[A-Za-z0-9_-]{2,50}$/.test(trimmed)) {
    return { valid: false, error: 'Supplier code must be 2-50 alphanumeric characters (hyphens and underscores allowed).' };
  }
  return { valid: true };
}

export function validateSupplierName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Supplier name is required.' };
  }
  if (trimmed.length < 2) {
    return { valid: false, error: 'Supplier name must be at least 2 characters.' };
  }
  if (trimmed.length > 255) {
    return { valid: false, error: 'Supplier name cannot exceed 255 characters.' };
  }
  return { valid: true };
}

export function validatePhone(phone: string): ValidationResult {
  const trimmed = phone.trim();
  if (!trimmed) {
    return { valid: true }; // optional
  }
  if (!/^[+0-9()\s-]{7,25}$/.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid phone number format (7-25 digits/symbols).' };
  }
  return { valid: true };
}

