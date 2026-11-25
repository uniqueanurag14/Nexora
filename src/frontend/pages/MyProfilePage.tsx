import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { FormField } from '../components/common/FormField';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  User as UserIcon,
  Mail,
  Shield,
  Phone,
  KeyRound,
  CheckCircle2,
  Calendar,
  Save,
  AtSign,
  Palette,
  AlertCircle,
} from 'lucide-react';

interface MyProfilePageProps {
  onNavigate: (view: string) => void;
}

export const MyProfilePage: React.FC<MyProfilePageProps> = ({ onNavigate }) => {
  const { user, updateUser, notify } = useAuth();

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [themePref, setThemePref] = useState<'light' | 'dark' | 'system'>('system');

  // Validation & Submission State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || user.name?.split(' ')[0] || '');
      setLastName(user.last_name || user.name?.split(' ').slice(1).join(' ') || '');
      setUsername(user.username || user.email?.split('@')[0] || '');
      setPhone(user.phone || '');
      setThemePref((user.theme_preference as 'dark' | 'light' | 'system') || 'system');
    }
  }, [user]);

  // Client-side validation
  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    if (!firstName.trim()) {
      errs.firstName = 'First name is required.';
    } else if (firstName.trim().length < 2) {
      errs.firstName = 'First name must be at least 2 characters.';
    } else if (firstName.trim().length > 50) {
      errs.firstName = 'First name cannot exceed 50 characters.';
    }

    if (!lastName.trim()) {
      errs.lastName = 'Last name is required.';
    } else if (lastName.trim().length < 1) {
      errs.lastName = 'Last name must be at least 1 character.';
    } else if (lastName.trim().length > 50) {
      errs.lastName = 'Last name cannot exceed 50 characters.';
    }

    if (username.trim()) {
      const u = username.trim().toLowerCase();
      if (u.length < 3) {
        errs.username = 'Username must be at least 3 characters.';
      } else if (!/^[a-zA-Z0-9_-]+$/.test(u)) {
        errs.username = 'Username can only contain alphanumeric characters, underscores, and hyphens.';
      }
    }

    if (phone.trim() && !/^[+0-9()\s-]{7,25}$/.test(phone.trim())) {
      errs.phone = 'Please enter a valid phone number format.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessBanner(null);

    if (!validateForm()) {
      notify('error', 'Please correct the highlighted form errors before saving.');
      return;
    }

    setIsSubmitting(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const res = await api.updateProfile({
        name: fullName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: username.trim().toLowerCase(),
        phone: phone.trim(),
        theme_preference: themePref,
      });

      if (res.success && res.data) {
        updateUser(res.data);
        setSuccessBanner('Your profile details have been successfully updated and persisted in PostgreSQL.');
        notify('success', 'Profile updated successfully.');
      } else {
        notify('error', res.message || 'Failed to update profile.');
        if (res.errors) {
          const fieldErrs: Record<string, string> = {};
          res.errors.forEach((err) => {
            fieldErrs[err.field] = err.message;
          });
          setErrors(fieldErrs);
        }
      }
    } catch (err: any) {
      notify('error', err?.message || 'Unable to update profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="My Profile"
        subtitle="View and update your permitted personal details and account preferences."
        breadcrumbs={['My Profile']}
        onHomeClick={() => onNavigate('dashboard')}
      />

      {successBanner && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Profile Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 sm:p-8 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-sky-600 text-white flex items-center justify-center text-2xl font-extrabold shadow-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{user.name}</h2>
                <StatusBadge status="Verified" variant="verified" />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 capitalize">
                  Role: {user.role.replace('_', ' ')}
                </span>
                {user.username && (
                  <span className="text-[11px] font-medium text-slate-500">
                    @{user.username}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('change-password')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs transition-colors self-start sm:self-auto"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            Change Password
          </button>
        </div>

        {/* Profile Edit Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Separate First Name Field */}
            <FormField
              label="First Name"
              id="firstName"
              required
              error={errors.firstName}
              helpText="Your official legal first name."
            >
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: '' }));
                  }}
                  className={`w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border bg-white focus:outline-hidden transition-all ${
                    errors.firstName
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 bg-rose-50/20'
                      : 'border-slate-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500'
                  }`}
                  placeholder="e.g. John"
                />
              </div>
            </FormField>

            {/* Separate Last Name Field */}
            <FormField
              label="Last Name"
              id="lastName"
              required
              error={errors.lastName}
              helpText="Your family or legal last name."
            >
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: '' }));
                  }}
                  className={`w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border bg-white focus:outline-hidden transition-all ${
                    errors.lastName
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 bg-rose-50/20'
                      : 'border-slate-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500'
                  }`}
                  placeholder="e.g. Doe"
                />
              </div>
            </FormField>

            {/* Username Field */}
            <FormField
              label="Username"
              id="username"
              error={errors.username}
              helpText="Unique system identifier for mentions and login."
            >
              <div className="relative">
                <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errors.username) setErrors((prev) => ({ ...prev, username: '' }));
                  }}
                  className={`w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border bg-white focus:outline-hidden transition-all ${
                    errors.username
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 bg-rose-50/20'
                      : 'border-slate-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500'
                  }`}
                  placeholder="e.g. john_doe"
                />
              </div>
            </FormField>

            {/* Account Email (Protected per account policy) */}
            <FormField
              label="Account Email"
              id="email"
              helpText="Primary login email address. Managed by organizational security."
            >
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-100/70 text-slate-500 cursor-not-allowed select-none"
                />
              </div>
            </FormField>

            {/* Phone Number Field */}
            <FormField
              label="Contact Phone"
              id="phone"
              error={errors.phone}
              helpText="Optional telephone or mobile number."
            >
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="phone"
                  type="text"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                  }}
                  className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </FormField>

            {/* Theme Preference */}
            <FormField
              label="Interface Theme Preference"
              id="themePref"
              helpText="Customized visual styling across the application."
            >
              <div className="relative">
                <Palette className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <select
                  id="themePref"
                  value={themePref}
                  onChange={(e) => setThemePref(e.target.value as any)}
                  className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                >
                  <option value="system">System Default</option>
                  <option value="light">Light Mode</option>
                  <option value="dark">Dark Mode</option>
                </select>
              </div>
            </FormField>
          </div>

          {/* Read-Only Account Security Policy Notice */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-500 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Shield className="w-4 h-4 text-sky-600" />
              <span>Role & Permission Security Policy</span>
            </div>
            <p>
              Users cannot alter their own roles, administrative privileges, or access control rules through the profile interface. Administrative assignments require explicit authorization.
            </p>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-200/80 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {isSubmitting ? 'Saving Changes...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
