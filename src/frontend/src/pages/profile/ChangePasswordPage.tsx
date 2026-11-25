import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/common/PageHeader';
import { FormField } from '../../components/common/FormField';
import { useToast } from '../../components/common/Toast';
import {
  Lock,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface ChangePasswordPageProps {
  onNavigate?: (path: string) => void;
}

export const ChangePasswordPage: React.FC<ChangePasswordPageProps> = ({ onNavigate }) => {
  const { currentUser, logout } = useAuth();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Client validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!currentPassword) {
      errors.currentPassword = 'You must enter your current password.';
    }

    if (!newPassword) {
      errors.newPassword = 'New password is required.';
    } else if (newPassword.length < 8) {
      errors.newPassword = 'New password must be at least 8 characters long.';
    } else if (currentPassword && newPassword === currentPassword) {
      errors.newPassword = 'New password cannot be identical to your current password.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'You must confirm your new password.';
    } else if (newPassword && confirmPassword !== newPassword) {
      errors.confirmPassword = 'Password confirmation does not match the new password.';
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessBanner(null);

    if (!validateForm()) {
      toast.error('Please fix the errors in the password change form.');
      return;
    }

    setSubmitting(true);

    try {
      const token = localStorage.getItem('mediera_auth_token') || localStorage.getItem('clinic_crm_auth_token');
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || (json && !json.success)) {
        if (json?.errors) {
          setClientErrors(json.errors);
        } else if (json?.error) {
          if (json.error.toLowerCase().includes('current')) {
            setClientErrors({ currentPassword: json.error });
          } else if (json.error.toLowerCase().includes('identical')) {
            setClientErrors({ newPassword: json.error });
          }
        }
        throw new Error(json?.error || 'Failed to change password.');
      }

      // Reset fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setClientErrors({});

      const msg = json?.message || 'Password has been updated successfully. Other active login sessions have been terminated.';
      setSuccessBanner(msg);
      toast.success('Your password has been changed.');
    } catch (err: any) {
      toast.error(err.message || 'Password change request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Change Password"
        subtitle="Update your system password and revoke previous active sessions"
        breadcrumbs={[
          { label: 'Workspace', href: '/erp/dashboard' },
          { label: 'My Profile', href: '/profile' },
          { label: 'Change Password', active: true },
        ]}
        actions={
          onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('/profile')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
            >
              <span>Back to Profile</span>
            </button>
          )
        }
        onNavigate={onNavigate}
      />

      {successBanner && (
        <div
          role="status"
          className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3 text-xs text-emerald-800 dark:text-emerald-300 font-medium animate-in fade-in"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm">Password Successfully Changed</p>
            <p className="leading-relaxed">{successBanner}</p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs">
        {/* Security Policy Information */}
        <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
            <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>Enterprise Password Standards</span>
          </div>
          <ul className="grid sm:grid-cols-2 gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 pl-1">
            <li className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <span>Minimum 8 characters in length</span>
            </li>
            <li className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <span>Cannot be identical to current password</span>
            </li>
            <li className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <span>Hashed with strong bcrypt (12 rounds)</span>
            </li>
            <li className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <span>Revokes other active sessions on success</span>
            </li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Current Password Field */}
          <FormField
            label="Current Password"
            htmlFor="currentPassword"
            required
            error={clientErrors.currentPassword}
            hint="Enter your existing account password to verify authorization"
          >
            <div className="relative">
              <input
                id="currentPassword"
                name="currentPassword"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (clientErrors.currentPassword) {
                    setClientErrors((prev) => ({ ...prev, currentPassword: '' }));
                  }
                }}
                className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl border text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 transition-colors focus:bg-white dark:focus:bg-slate-800 focus:outline-teal-600 ${
                  clientErrors.currentPassword ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                }`}
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                title={showCurrent ? 'Hide password' : 'Show password'}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </FormField>

          {/* New Password Field */}
          <FormField
            label="New Password"
            htmlFor="newPassword"
            required
            error={clientErrors.newPassword}
            hint="Choose a secure passphrase with at least 8 characters"
          >
            <div className="relative">
              <input
                id="newPassword"
                name="newPassword"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (clientErrors.newPassword) {
                    setClientErrors((prev) => ({ ...prev, newPassword: '' }));
                  }
                }}
                className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl border text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 transition-colors focus:bg-white dark:focus:bg-slate-800 focus:outline-teal-600 ${
                  clientErrors.newPassword ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                }`}
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                title={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </FormField>

          {/* Confirm New Password Field */}
          <FormField
            label="Confirm New Password"
            htmlFor="confirmPassword"
            required
            error={clientErrors.confirmPassword}
            hint="Re-type your new password to verify match"
          >
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (clientErrors.confirmPassword) {
                    setClientErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }
                }}
                className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl border text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 transition-colors focus:bg-white dark:focus:bg-slate-800 focus:outline-teal-600 ${
                  clientErrors.confirmPassword ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                }`}
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                title={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </FormField>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              <span>{submitting ? 'Verifying & Updating...' : 'Update Password & Revoke Sessions'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
