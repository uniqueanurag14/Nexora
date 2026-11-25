import React, { useState } from 'react';
import { api } from '../services/api';
import { validateEmail } from '../utils/validation';
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from 'lucide-react';

interface ForgotPasswordPageProps {
  onNavigate: (view: string) => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const val = validateEmail(email);
    if (!val.valid) {
      setEmailError(val.error || 'Invalid email');
      return;
    }
    setEmailError(null);

    setIsLoading(true);
    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch {
      // Return generic confirmation regardless of failure to preserve privacy
      setSubmitted(true);
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
            Recover Account Password
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Submit your registered email address to receive password reset instructions
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-6 sm:p-8">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-900">
                Instructions Dispatched
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                If an active account is associated with <strong>{email}</strong>, a secure, single-use password recovery link has been sent.
              </p>
              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 border border-slate-100">
                The link expires in 60 minutes. Please check your spam or inbox folders.
              </div>
              <button
                onClick={() => onNavigate('login')}
                className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Return to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
                >
                  Account Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    className={`block w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border transition-all placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                      emailError
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                        : 'border-slate-300 hover:border-slate-400 focus:border-sky-500 focus:ring-sky-100'
                    }`}
                    placeholder="name@example.com"
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'forgot-email-error' : undefined}
                  />
                </div>
                {emailError && (
                  <p id="forgot-email-error" className="mt-1.5 text-xs font-medium text-rose-600">
                    {emailError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 shadow-md transition-all disabled:opacity-60"
              >
                {isLoading ? 'Processing Request...' : 'Send Recovery Link'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
