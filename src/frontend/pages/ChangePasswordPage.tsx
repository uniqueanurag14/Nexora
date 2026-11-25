import React, { useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { FormField } from '../components/FormField';
import { validatePassword, validatePasswordConfirmation } from '../utils/validation';
import { KeyRound, Lock, Eye, EyeOff, CheckCircle2, ShieldCheck } from 'lucide-react';

export const ChangePasswordPage: React.FC = () => {
  const { notify } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Field-level error states
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentError(null);
    setNewError(null);
    setConfirmError(null);
    setGeneralError(null);

    let hasError = false;

    if (!currentPassword) {
      setCurrentError('Current password is required.');
      hasError = true;
    }

    const pwVal = validatePassword(newPassword);
    if (!pwVal.valid) {
      setNewError(pwVal.error || 'Password does not meet complexity requirements.');
      hasError = true;
    }

    if (currentPassword && newPassword && currentPassword === newPassword) {
      setNewError('New password must be different from current password.');
      hasError = true;
    }

    const confirmVal = validatePasswordConfirmation(newPassword, confirmPassword);
    if (!confirmVal.valid) {
      setConfirmError(confirmVal.error || 'Passwords do not match.');
      hasError = true;
    }

    if (hasError) return;

    setIsLoading(true);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      if (res.success) {
        setIsSuccess(true);
        notify('success', 'Your password was updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        if (res.errors && res.errors.length > 0) {
          res.errors.forEach(err => {
            if (err.field === 'current_password') setCurrentError(err.message);
            else if (err.field === 'new_password') setNewError(err.message);
            else setGeneralError(err.message);
          });
        } else {
          setGeneralError(res.message);
        }
      }
    } catch {
      setGeneralError('An unexpected network error occurred while updating your password.');
    } finally {
      setIsLoading(false);
    }
  };

  const pwStrength = validatePassword(newPassword);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="Change Password"
        description="Update your account credentials. All other active sessions will be safely terminated."
        icon={<KeyRound className="w-5 h-5 text-sky-600" />}
      />

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        {isSuccess ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Password Changed Successfully</h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              Your password has been securely updated in the database. All other active sessions have been invalidated.
            </p>
            <button
              onClick={() => setIsSuccess(false)}
              className="mt-4 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              Update Again
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-5 max-w-xl">
            {generalError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
                <span>{generalError}</span>
              </div>
            )}

            {/* Current Password Field */}
            <FormField
              id="current-password"
              label="Current Password"
              required
              error={currentError}
              hint="Required to verify identity"
            >
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="current-password"
                  name="current_password"
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={e => {
                    setCurrentPassword(e.target.value);
                    if (currentError) setCurrentError(null);
                  }}
                  className={`block w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm rounded-xl border transition-all ${
                    currentError
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 bg-rose-50/20'
                      : 'border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
                  }`}
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  aria-label={showCurrent ? 'Hide password' : 'Show password'}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FormField>

            {/* New Password Field */}
            <FormField
              id="new-password"
              label="New Password"
              required
              error={newError}
              hint="Min 8 characters with symbols"
            >
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="new-password"
                  name="new_password"
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={e => {
                    setNewPassword(e.target.value);
                    if (newError) setNewError(null);
                  }}
                  className={`block w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm rounded-xl border transition-all ${
                    newError
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 bg-rose-50/20'
                      : 'border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
                  }`}
                  placeholder="Min 8 chars, Aa1!"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Strength Meter */}
              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1 h-1">
                    {[1, 2, 3, 4].map(step => (
                      <div
                        key={step}
                        className={`flex-1 rounded-full transition-colors ${
                          pwStrength.score >= step
                            ? pwStrength.score === 4
                              ? 'bg-emerald-500'
                              : pwStrength.score >= 3
                              ? 'bg-sky-500'
                              : 'bg-amber-500'
                            : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>Upper, lower, digit & special symbol</span>
                    <span className="font-semibold capitalize text-slate-700">{pwStrength.strength}</span>
                  </div>
                </div>
              )}
            </FormField>

            {/* Confirm New Password Field */}
            <FormField
              id="confirm-password"
              label="Confirm New Password"
              required
              error={confirmError}
            >
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="confirm-password"
                  name="confirm_password"
                  type={showNew ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value);
                    if (confirmError) setConfirmError(null);
                  }}
                  className={`block w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border transition-all ${
                    confirmError
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 bg-rose-50/20'
                      : 'border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
                  }`}
                  placeholder="Repeat new password"
                />
              </div>
            </FormField>

            <div className="pt-2 flex items-center justify-between">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Bcrypt encrypted & hashed</span>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
              >
                {isLoading ? 'Updating Password...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
