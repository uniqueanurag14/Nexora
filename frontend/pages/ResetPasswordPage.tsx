import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { validatePassword, validatePasswordConfirmation } from '../utils/validation';
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock, ShieldAlert, ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react';

interface ResetPasswordPageProps {
  onNavigate: (view: string) => void;
  initialToken?: string;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({
  onNavigate,
  initialToken = '',
}) => {
  const [token, setToken] = useState(() => {
    if (initialToken) return initialToken;
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('token') || '';
    }
    return '';
  });

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Token Verification States
  const [isVerifyingToken, setIsVerifyingToken] = useState<boolean>(false);
  const [tokenVerificationError, setTokenVerificationError] = useState<string | null>(null);
  const [associatedEmail, setAssociatedEmail] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);

  // Validate Token with server on mount or when token changes
  useEffect(() => {
    if (!token.trim()) return;

    let isMounted = true;
    setIsVerifyingToken(true);
    setTokenVerificationError(null);

    api.verifyResetToken(token.trim())
      .then((res: any) => {
        if (!isMounted) return;
        if (res.success && res.valid) {
          setAssociatedEmail(res.data?.email || null);
          setTokenExpiresAt(res.data?.expires_at || null);
        } else {
          setTokenVerificationError(res.message || 'This password reset link is invalid or has expired.');
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setTokenVerificationError(err.message || 'Unable to connect to recovery service.');
      })
      .finally(() => {
        if (isMounted) setIsVerifyingToken(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Client-side validations
  const pwValidation = validatePassword(password);
  const confirmValidation = validatePasswordConfirmation(password, confirmPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token.trim()) {
      setErrorMessage('Reset token is required.');
      return;
    }

    if (!pwValidation.valid) {
      setErrorMessage(pwValidation.error || 'Password does not meet complexity requirements.');
      return;
    }

    if (!confirmValidation.valid) {
      setErrorMessage(confirmValidation.error || 'Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.resetPassword(token.trim(), password);
      if (res.success) {
        setSuccessMessage(res.message);
      } else {
        setErrorMessage(res.message || 'Failed to update password.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to connect to reset service.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-slate-50/60">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 text-sky-400 mb-4 shadow-md">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Set New Password
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose a secure, strong password for your Nexora account
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-6 sm:p-8">
          {/* State 1: Verifying Token Spinner */}
          {isVerifyingToken ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-600">Verifying secure recovery token...</p>
            </div>
          ) : tokenVerificationError ? (
            /* State 2: Invalid or Expired Token */
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Link Invalid or Expired</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {tokenVerificationError}
              </p>
              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 border border-slate-100 text-left space-y-1">
                <p>• Password recovery links expire after <strong>60 minutes</strong>.</p>
                <p>• Recovery links can only be used once to maintain account security.</p>
              </div>
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => onNavigate('forgot-password')}
                  className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
                >
                  Request a New Reset Link
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            </div>
          ) : successMessage ? (
            /* State 3: Password Successfully Reset */
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Password Reset Complete</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{successMessage}</p>
              <div className="p-3 bg-emerald-50 rounded-xl text-xs text-emerald-800 border border-emerald-200">
                All prior active sessions have been safely invalidated. You can now sign in with your new credentials.
              </div>
              <button
                onClick={() => onNavigate('login')}
                className="w-full mt-4 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
              >
                Proceed to Sign In
              </button>
            </div>
          ) : (
            /* State 4: Reset Form */
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {errorMessage && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {associatedEmail && (
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-center gap-2 text-xs text-sky-900 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>Verified link for account: <strong>{associatedEmail}</strong></span>
                </div>
              )}

              {/* Reset Token Input (Hidden when token was passed via URL and validated, or editable if manually entered) */}
              {!initialToken && (
                <div>
                  <label
                    htmlFor="reset-token"
                    className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    Reset Token
                  </label>
                  <input
                    id="reset-token"
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="block w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-500 font-mono text-xs"
                    placeholder="Paste your 64-character reset token"
                  />
                </div>
              )}

              {/* New Password */}
              <div>
                <label
                  htmlFor="reset-new-password"
                  className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
                >
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="reset-new-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-500"
                    placeholder="Min 8 characters (Upper, lower, digit, symbol)"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1 h-1">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`flex-1 rounded-full transition-colors ${
                            pwValidation.score >= step
                              ? pwValidation.score === 4
                                ? 'bg-emerald-500'
                                : pwValidation.score >= 3
                                ? 'bg-sky-500'
                                : 'bg-amber-500'
                              : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="text-[11px] text-slate-500 flex justify-between">
                      <span>Requires: Upper, lower, number, symbol</span>
                      <span className="font-semibold capitalize text-slate-700">
                        {pwValidation.strength}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="reset-confirm-password"
                  className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
                >
                  Confirm New Password
                </label>
                <input
                  id="reset-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`block w-full px-3.5 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 ${
                    confirmPassword && !confirmValidation.valid
                      ? 'border-rose-300 focus:ring-rose-100 focus:border-rose-500'
                      : 'border-slate-300 focus:ring-sky-100 focus:border-sky-500'
                  }`}
                  placeholder="Repeat new password"
                />
                {confirmPassword && !confirmValidation.valid && (
                  <p className="mt-1 text-[11px] font-medium text-rose-600">
                    {confirmValidation.error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || isVerifyingToken}
                className="w-full mt-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-md disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? 'Updating Password...' : 'Reset Password & Invalidate Sessions'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Cancel and Return to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
