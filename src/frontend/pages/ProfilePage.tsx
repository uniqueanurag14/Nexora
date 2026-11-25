import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { FormField } from '../components/FormField';
import {
  User as UserIcon,
  Mail,
  Shield,
  Clock,
  Phone,
  Briefcase,
  AtSign,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface ProfilePageProps {
  onNavigate?: (route: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigate }) => {
  const { user, updateUser, notify } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Field errors
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || user.name.split(' ')[0] || '');
      setLastName(user.last_name || user.name.split(' ').slice(1).join(' ') || '');
      setPhone(user.phone || '');
      setDepartment(user.department || 'Executive');
    }
  }, [user]);

  if (!user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFirstNameError(null);
    setLastNameError(null);
    setGeneralError(null);

    let hasError = false;
    if (!firstName.trim() || firstName.trim().length < 2) {
      setFirstNameError('First name must be at least 2 characters.');
      hasError = true;
    }
    if (!lastName.trim() || lastName.trim().length < 2) {
      setLastNameError('Last name must be at least 2 characters.');
      hasError = true;
    }

    if (hasError) return;

    setIsSaving(true);
    try {
      const res = await api.updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        department: department.trim(),
      });

      if (res.success && res.data) {
        updateUser(res.data);
        setIsEditing(false);
        notify('success', 'Profile details updated successfully.');
      } else {
        if (res.errors) {
          res.errors.forEach(err => {
            if (err.field === 'first_name') setFirstNameError(err.message);
            else if (err.field === 'last_name') setLastNameError(err.message);
            else setGeneralError(err.message);
          });
        } else {
          setGeneralError(res.message);
        }
      }
    } catch {
      setGeneralError('Failed to communicate with profile update service.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="My Profile"
        description="View and manage your account identity, personal details, and security roles."
        icon={<UserIcon className="w-5 h-5 text-sky-600" />}
        actions={
          onNavigate && (
            <button
              onClick={() => onNavigate('/change-password')}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            >
              Change Password
            </button>
          )
        }
      />

      {/* Main Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Banner Section */}
        <div className="p-6 sm:p-8 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-sky-600 text-white flex items-center justify-center text-2xl font-black shadow-md">
              {(firstName.charAt(0) || user.name.charAt(0)).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {user.first_name || firstName} {user.last_name || lastName}
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3 h-3" />
                  Verified
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-slate-200/80 text-slate-800 capitalize">
                <Shield className="w-3 h-3 text-sky-600" />
                Role: {user.role.replace('_', ' ')}
              </div>
            </div>
          </div>

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
            >
              Edit Personal Info
            </button>
          )}
        </div>

        {/* Profile Content / Form */}
        <div className="p-6 sm:p-8">
          {generalError && (
            <div
              role="alert"
              className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {isEditing ? (
            <form onSubmit={handleSave} noValidate className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* First Name */}
                <FormField
                  id="profile-first-name"
                  label="First Name"
                  required
                  error={firstNameError}
                >
                  <input
                    id="profile-first-name"
                    name="first_name"
                    type="text"
                    required
                    value={firstName}
                    onChange={e => {
                      setFirstName(e.target.value);
                      if (firstNameError) setFirstNameError(null);
                    }}
                    className={`block w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border transition-all ${
                      firstNameError
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 bg-rose-50/20'
                        : 'border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
                    }`}
                  />
                </FormField>

                {/* Last Name */}
                <FormField
                  id="profile-last-name"
                  label="Last Name"
                  required
                  error={lastNameError}
                >
                  <input
                    id="profile-last-name"
                    name="last_name"
                    type="text"
                    required
                    value={lastName}
                    onChange={e => {
                      setLastName(e.target.value);
                      if (lastNameError) setLastNameError(null);
                    }}
                    className={`block w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border transition-all ${
                      lastNameError
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 bg-rose-50/20'
                        : 'border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
                    }`}
                  />
                </FormField>

                {/* Phone */}
                <FormField id="profile-phone" label="Contact Phone">
                  <input
                    id="profile-phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1-555-0100"
                    className="block w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </FormField>

                {/* Department */}
                <FormField id="profile-department" label="Department / Unit">
                  <input
                    id="profile-department"
                    name="department"
                    type="text"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    placeholder="Operations, IT, Logistics"
                    className="block w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </FormField>
              </div>

              {/* Locked Administrative Notice */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-start gap-3">
                <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  Account username, registered email, and system roles are immutable by users. Role elevation requires administrative approval.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Separate First Name & Last Name */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/40">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <UserIcon className="w-3.5 h-3.5" />
                  First Name
                </span>
                <div className="text-sm font-bold text-slate-900">{firstName || '—'}</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/40">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <UserIcon className="w-3.5 h-3.5" />
                  Last Name
                </span>
                <div className="text-sm font-bold text-slate-900">{lastName || '—'}</div>
              </div>

              {/* Username */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/40">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <AtSign className="w-3.5 h-3.5" />
                  Account Username
                </span>
                <div className="text-sm font-bold text-slate-900 font-mono">
                  {user.username || 'user' + user.id}
                </div>
              </div>

              {/* Email */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/40">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  Registered Email
                </span>
                <div className="text-sm font-bold text-slate-900">{user.email}</div>
              </div>

              {/* Contact Phone */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/40">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  Contact Phone
                </span>
                <div className="text-sm font-semibold text-slate-800">{phone || 'Not provided'}</div>
              </div>

              {/* Department */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/40">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <Briefcase className="w-3.5 h-3.5" />
                  Department
                </span>
                <div className="text-sm font-semibold text-slate-800">{department || 'General'}</div>
              </div>

              {/* Security & Dates */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/40 md:col-span-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5" />
                  Session & Audit History
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span>Last Login:</span>
                    <span className="font-semibold text-slate-800">
                      {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Current Session'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span>Registered Date:</span>
                    <span className="font-semibold text-slate-800">
                      {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
