import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { validateEmail } from '../utils/validation';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, ArrowRight } from 'lucide-react';

interface LoginPageProps {
  onNavigate: (view: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Field validation errors
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate email or username
    const cleanId = identifier.trim();
    if (!cleanId) {
      setIdentifierError('Email address or username is required.');
      return;
    }
    if (cleanId.includes('@')) {
      const emailValidation = validateEmail(cleanId);
      if (!emailValidation.valid) {
        setIdentifierError(emailValidation.error || 'Please enter a valid email address.');
        return;
      }
    } else if (cleanId.length < 3) {
      setIdentifierError('Username must be at least 3 characters.');
      return;
    }
    setIdentifierError(null);

    if (!password) {
      setPasswordError('Password is required.');
      return;
    }
    setPasswordError(null);

    setIsLoading(true);
    try {
      const result = await login(cleanId, password);
      if (result.success) {
        onNavigate('dashboard');
      } else {
        setFormError(result.message);
      }
    } catch {
      setFormError(
        'Authentication service is currently unavailable. Please verify PostgreSQL status.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-slate-50/60">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 text-sky-400 mb-4 shadow-md">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sign In to Nexora
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your email or username to access your account
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-6 sm:p-8">
          {formError && (
            <div
              role="alert"
              className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium leading-snug flex items-center gap-2.5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email or Username Field */}
            <div>
              <label
                htmlFor="login-identifier"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Email Address or Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="login-identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (identifierError) setIdentifierError(null);
                  }}
                  className={`block w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border transition-all placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                    identifierError
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                      : 'border-slate-300 hover:border-slate-400 focus:border-sky-500 focus:ring-sky-100'
                  }`}
                  placeholder="name@example.com or username"
                  aria-invalid={!!identifierError}
                  aria-describedby={
                    identifierError ? 'login-identifier-error' : undefined
                  }
                />
              </div>
              {identifierError && (
                <p
                  id="login-identifier-error"
                  className="mt-1.5 text-xs font-medium text-rose-600"
                >
                  {identifierError}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => onNavigate('forgot-password')}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-800 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  className={`block w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border transition-all placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                    passwordError
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                      : 'border-slate-300 hover:border-slate-400 focus:border-sky-500 focus:ring-sky-100'
                  }`}
                  placeholder="••••••••••••"
                  aria-invalid={!!passwordError}
                  aria-describedby={
                    passwordError ? 'login-password-error' : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {passwordError && (
                <p
                  id="login-password-error"
                  className="mt-1.5 text-xs font-medium text-rose-600"
                >
                  {passwordError}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4 text-sky-400" />
                </>
              )}
            </button>
          </form>

          {/* Security Notice Footer */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Protected by PostgreSQL persistent security layer
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
