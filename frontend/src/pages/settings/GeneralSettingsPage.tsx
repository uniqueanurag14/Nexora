import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/common/PageHeader';
import { FormField } from '../../components/common/FormField';
import { useToast } from '../../components/common/Toast';
import {
  SlidersHorizontal,
  Save,
  CheckCircle2,
  Globe,
  Clock,
  Shield,
  Building2,
  Lock,
} from 'lucide-react';

interface GeneralSettingsProps {
  onNavigate?: (path: string) => void;
}

export const GeneralSettingsPage: React.FC<GeneralSettingsProps> = ({ onNavigate }) => {
  const { isSuperAdmin, hasPermission } = useAuth();
  const toast = useToast();

  const [clinicName, setClinicName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [locale, setLocale] = useState('en-IN');
  const [currency, setCurrency] = useState('INR');
  const [dateFormat, setDateFormat] = useState('DD-MM-YYYY');
  const [timeFormat, setTimeFormat] = useState('12h');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [opdSlotDuration, setOpdSlotDuration] = useState(15);
  const [sessionTimeout, setSessionTimeout] = useState(120);
  const [passwordMinLength, setPasswordMinLength] = useState(8);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const canEdit = isSuperAdmin || hasPermission('settings.general') || hasPermission('settings.view');

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('mediera_auth_token') || localStorage.getItem('clinic_crm_auth_token');
        const res = await fetch('/api/v1/settings/general', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const d = json.data;
            setClinicName(d.clinicName || '');
            setLegalName(d.legalName || '');
            setTimezone(d.timezone || 'Asia/Kolkata');
            setLocale(d.locale || 'en-IN');
            setCurrency(d.currency || 'INR');
            setDateFormat(d.dateFormat || 'DD-MM-YYYY');
            setTimeFormat(d.timeFormat || '12h');
            setPhone(d.phone || '');
            setEmail(d.email || '');
            setAddress(d.address || '');
            setOpdSlotDuration(d.opdSlotDurationMinutes || 15);
            setSessionTimeout(d.sessionTimeoutMinutes || 120);
            setPasswordMinLength(d.passwordMinLength || 8);
          }
        }
      } catch {
        // Fallback defaults
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!clinicName.trim()) {
      errs.clinicName = 'Application / Clinic display name is required.';
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Please provide a valid support email address.';
    }
    if (passwordMinLength < 6 || passwordMinLength > 64) {
      errs.passwordMinLength = 'Password minimum length must be between 6 and 64 characters.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessBanner(null);

    if (!canEdit) {
      toast.error('You do not have permission to alter system settings.');
      return;
    }

    if (!validate()) {
      toast.error('Please resolve configuration validation errors.');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('mediera_auth_token') || localStorage.getItem('clinic_crm_auth_token');
      const res = await fetch('/api/v1/settings/general', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          clinicName: clinicName.trim(),
          legalName: legalName.trim(),
          timezone,
          locale,
          currency,
          dateFormat,
          timeFormat,
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          opdSlotDurationMinutes: Number(opdSlotDuration),
          sessionTimeoutMinutes: Number(sessionTimeout),
          passwordMinLength: Number(passwordMinLength),
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || (json && !json.success)) {
        if (json?.errors) setErrors(json.errors);
        throw new Error(json?.error || 'Failed to update system settings.');
      }

      setSuccessBanner('General settings have been validated and persisted in PostgreSQL.');
      toast.success('System configuration saved.');
    } catch (err: any) {
      toast.error(err.message || 'Settings update failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="General Settings"
        subtitle="Configure organization display, localized formats, and operational rules"
        breadcrumbs={[
          { label: 'Workspace', href: '/erp/dashboard' },
          { label: 'Settings', href: '/settings' },
          { label: 'General Settings', active: true },
        ]}
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

      {/* Sensitive Environment Note */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
        <Shield className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-900 dark:text-white">Protected Environment Isolation: </span>
          Database credentials, secret signing keys, and cloud infrastructure tokens remain securely encapsulated in protected environment configuration and are not exposed in the client UI.
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs">
        <form onSubmit={handleSave} noValidate className="space-y-6">
          {/* Display & Branding */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-600" />
              <span>Application & Practice Identity</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Branding information displayed on invoices, tokens, and patient communications.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Application / Clinic Name"
                htmlFor="clinicName"
                required
                error={errors.clinicName}
              >
                <input
                  id="clinicName"
                  type="text"
                  disabled={!canEdit}
                  value={clinicName}
                  onChange={(e) => {
                    setClinicName(e.target.value);
                    if (errors.clinicName) setErrors((prev) => ({ ...prev, clinicName: '' }));
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-teal-600 ${
                    errors.clinicName ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                  placeholder="MediEra Healthcare"
                />
              </FormField>

              <FormField label="Legal Business Entity Name" htmlFor="legalName">
                <input
                  id="legalName"
                  type="text"
                  disabled={!canEdit}
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-teal-600"
                  placeholder="MediEra ERP Ltd"
                />
              </FormField>
            </div>
          </div>

          {/* Localization & Formats */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Globe className="w-4 h-4 text-teal-600" />
              <span>Timezone & Regional Formats</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Standardize scheduling clocks and appointment timestamps.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="System Timezone" htmlFor="timezone">
                <select
                  id="timezone"
                  disabled={!canEdit}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-teal-600"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                  <option value="UTC">UTC (Universal Coordinated)</option>
                  <option value="America/New_York">America/New York (EST/EDT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
                </select>
              </FormField>

              <FormField label="Date Format" htmlFor="dateFormat">
                <select
                  id="dateFormat"
                  disabled={!canEdit}
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-teal-600"
                >
                  <option value="DD-MM-YYYY">DD-MM-YYYY (e.g. 18-10-2026)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (ISO Standard)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (US Standard)</option>
                </select>
              </FormField>

              <FormField label="Currency Symbol" htmlFor="currency">
                <select
                  id="currency"
                  disabled={!canEdit}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-teal-600"
                >
                  <option value="INR">INR (₹ Indian Rupee)</option>
                  <option value="USD">USD ($ United States Dollar)</option>
                  <option value="EUR">EUR (€ Euro)</option>
                  <option value="GBP">GBP (£ British Pound)</option>
                </select>
              </FormField>
            </div>
          </div>

          {/* Operational Policy Rules */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              <span>Operational & Security Rules</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Governance parameters governing clinical consultations and sessions.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                label="OPD Consultation Slot (Min)"
                htmlFor="opdSlotDuration"
                hint="Default doctor appointment duration"
              >
                <input
                  id="opdSlotDuration"
                  type="number"
                  disabled={!canEdit}
                  min={5}
                  max={120}
                  value={opdSlotDuration}
                  onChange={(e) => setOpdSlotDuration(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-teal-600"
                />
              </FormField>

              <FormField
                label="Session Inactivity Timeout (Min)"
                htmlFor="sessionTimeout"
                hint="Auto-logout period on idle terminal"
              >
                <input
                  id="sessionTimeout"
                  type="number"
                  disabled={!canEdit}
                  min={15}
                  max={1440}
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-teal-600"
                />
              </FormField>

              <FormField
                label="Password Policy Min Length"
                htmlFor="passwordMinLength"
                error={errors.passwordMinLength}
                hint="Enforced on user onboarding & resets"
              >
                <input
                  id="passwordMinLength"
                  type="number"
                  disabled={!canEdit}
                  min={6}
                  max={64}
                  value={passwordMinLength}
                  onChange={(e) => setPasswordMinLength(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-teal-600"
                />
              </FormField>
            </div>
          </div>

          {canEdit && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Validating & Persisting...' : 'Save General Settings'}</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
