import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PageHeader } from '../../components/common/PageHeader';
import { FormField } from '../../components/common/FormField';
import { useToast } from '../../components/common/Toast';
import {
  User,
  Shield,
  Building2,
  Lock,
  Save,
  CheckCircle2,
  KeyRound,
  Mail,
  Phone,
  Calendar,
  AlertCircle,
  Eye,
} from 'lucide-react';

interface MyProfilePageProps {
  onNavigate?: (path: string) => void;
}

export const MyProfilePage: React.FC<MyProfilePageProps> = ({ onNavigate }) => {
  const { currentUser, currentRole, refreshUser, updateUserProfile } = useAuth();
  const { preference, setPreference } = useTheme();
  const toast = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [themePref, setThemePref] = useState<'light' | 'dark' | 'system'>('system');

  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Populate from currentUser on load
  useEffect(() => {
    if (currentUser) {
      setFirstName(currentUser.firstName || currentUser.name?.split(' ')[0] || '');
      setLastName(currentUser.lastName || currentUser.name?.split(' ').slice(1).join(' ') || '');
      setUsername(currentUser.username || currentUser.email?.split('@')[0] || '');
      setPhone(currentUser.phone || '');
      setAvatarUrl(currentUser.avatarUrl || currentUser.avatar || '');
      setThemePref((currentUser.themePreference as any) || preference || 'system');
    }
  }, [currentUser, preference]);

  // Client-side validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!firstName.trim()) {
      errors.firstName = 'First name is required.';
    } else if (firstName.trim().length > 60) {
      errors.firstName = 'First name cannot exceed 60 characters.';
    }

    if (!lastName.trim()) {
      errors.lastName = 'Last name is required.';
    } else if (lastName.trim().length > 60) {
      errors.lastName = 'Last name cannot exceed 60 characters.';
    }

    if (phone.trim()) {
      const cleanPhone = phone.trim();
      if (!/^[+0-9\s\-()]{7,20}$/.test(cleanPhone)) {
        errors.phone = 'Please enter a valid phone number (e.g. +1 555-0199).';
      }
    }

    if (username.trim()) {
      const cleanUser = username.trim();
      if (!/^[a-zA-Z0-9._-]{3,30}$/.test(cleanUser)) {
        errors.username = 'Username must be 3-30 alphanumeric characters, dots, or underscores.';
      }
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessBanner(null);

    if (!validateForm()) {
      toast.error('Please fix validation errors in the profile form.');
      return;
    }

    setSubmitting(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    try {
      const token = localStorage.getItem('mediera_auth_token') || localStorage.getItem('clinic_crm_auth_token');
      const res = await fetch('/api/v1/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          name: fullName,
          phone: phone.trim(),
          username: username.trim(),
          avatarUrl: avatarUrl.trim(),
          themePreference: themePref,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || (json && !json.success)) {
        if (json?.errors) {
          setClientErrors(json.errors);
        }
        throw new Error(json?.error || 'Failed to update profile.');
      }

      // Sync local context and storage
      updateUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        phone: phone.trim(),
        username: username.trim(),
        avatarUrl: avatarUrl.trim(),
        themePreference: themePref,
      });

      setPreference(themePref);
      setSuccessBanner('Profile details have been successfully updated and saved in PostgreSQL.');
      toast.success('Your profile changes have been saved.');
      await refreshUser();
    } catch (err: any) {
      toast.error(err.message || 'Unable to save profile changes.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="My Profile"
        subtitle="View and manage your personal details, credentials, and preferences"
        breadcrumbs={[
          { label: 'Workspace', href: '/erp/dashboard' },
          { label: 'My Profile', active: true },
        ]}
        actions={
          onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('/change-password')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-teal-600" />
              <span>Change Password</span>
            </button>
          )
        }
        onNavigate={onNavigate}
      />

      {successBanner && (
        <div
          role="status"
          className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3 text-xs text-emerald-800 dark:text-emerald-300 font-medium animate-in fade-in"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Account & Security Summary Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="text-center space-y-3">
            <div className="relative inline-block">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 text-white flex items-center justify-center font-bold text-2xl mx-auto shadow-md">
                {firstName?.[0] || currentUser.name?.[0] || 'U'}
              </div>
            </div>

            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {firstName} {lastName}
              </h3>
              <p className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                {currentUser.roleName || currentRole}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{currentUser.email}</p>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <span>Account Role</span>
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                {currentUser.role || currentRole}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Organization</span>
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                {currentUser.organizationName || 'MediEra Health'}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Member Since</span>
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString() : 'Active'}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-bold mb-1">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              <span>Role & Permission Security</span>
            </div>
            Roles, permissions, and account statuses are centrally governed by administrative policies and cannot be modified via self-service profile.
          </div>
        </div>

        {/* Right Column: Editable Profile Form */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            Personal & Contact Information
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Keep your account information current for notification and audit purposes.
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Separate First Name & Last Name Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="First Name"
                htmlFor="firstName"
                required
                error={clientErrors.firstName}
              >
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (clientErrors.firstName) {
                      setClientErrors((prev) => ({ ...prev, firstName: '' }));
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 transition-colors focus:bg-white dark:focus:bg-slate-800 focus:outline-teal-600 ${
                    clientErrors.firstName ? 'border-rose-500 dark:border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                  placeholder="e.g. John"
                />
              </FormField>

              <FormField
                label="Last Name"
                htmlFor="lastName"
                required
                error={clientErrors.lastName}
              >
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (clientErrors.lastName) {
                      setClientErrors((prev) => ({ ...prev, lastName: '' }));
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 transition-colors focus:bg-white dark:focus:bg-slate-800 focus:outline-teal-600 ${
                    clientErrors.lastName ? 'border-rose-500 dark:border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                  placeholder="e.g. Doe"
                />
              </FormField>
            </div>

            {/* Email (Read-Only) & Username */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Account Email"
                htmlFor="email"
                hint="System identifier used for account authentication"
              >
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    disabled
                    value={currentUser.email || ''}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 cursor-not-allowed"
                  />
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </FormField>

              <FormField
                label="Username"
                htmlFor="username"
                error={clientErrors.username}
                hint="Unique handle for system logins"
              >
                <input
                  id="username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (clientErrors.username) {
                      setClientErrors((prev) => ({ ...prev, username: '' }));
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 transition-colors focus:bg-white dark:focus:bg-slate-800 focus:outline-teal-600 ${
                    clientErrors.username ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                  placeholder="e.g. john.doe"
                />
              </FormField>
            </div>

            {/* Contact Phone Number */}
            <FormField
              label="Contact Phone"
              htmlFor="phone"
              error={clientErrors.phone}
              hint="Required for two-factor recovery and SMS notification alerts"
            >
              <div className="relative">
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (clientErrors.phone) {
                      setClientErrors((prev) => ({ ...prev, phone: '' }));
                    }
                  }}
                  className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 transition-colors focus:bg-white dark:focus:bg-slate-800 focus:outline-teal-600 ${
                    clientErrors.phone ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                  placeholder="+91 98765 43210"
                />
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </FormField>

            {/* Theme Preference Selection */}
            <FormField label="Theme Interface Preference" htmlFor="themePref">
              <select
                id="themePref"
                value={themePref}
                onChange={(e) => setThemePref(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-teal-600 cursor-pointer"
              >
                <option value="system">Follow System Theme (Automatic)</option>
                <option value="light">Light Theme (Clinical Standard)</option>
                <option value="dark">Dark Theme (Low-light Night Mode)</option>
              </select>
            </FormField>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? 'Saving Changes...' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
