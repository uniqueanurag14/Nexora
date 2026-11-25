import React, { useState, useEffect } from 'react';
import {
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Mail,
  Send,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Info,
  Shield,
  Check,
  Server,
  Activity,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { EffectiveSettingItem, CategorySummary } from '../../types';

interface CategoryConfigPageProps {
  categorySlug: string;
  categorySummary?: CategorySummary;
  onNavigateOverview?: () => void;
  onReloadMenu?: () => void;
}

export const CategoryConfigPage: React.FC<CategoryConfigPageProps> = ({
  categorySlug,
  categorySummary,
  onNavigateOverview,
  onReloadMenu,
}) => {
  const { notify, user } = useAuth();
  const [settings, setSettings] = useState<EffectiveSettingItem[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [initialData, setInitialData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingCategory, setIsResettingCategory] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // SMTP Test Email state
  const [testEmailRecipient, setTestEmailRecipient] = useState(user?.email || '');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isVerifyingConnection, setIsVerifyingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  // Normalize category slug for backend queries
  const backendCategory = categorySlug === 'email-smtp' ? 'email_smtp' : categorySlug.replace(/-/g, '_');

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const res = await api.getEffectiveSettings(backendCategory);
      if (res.success && res.data) {
        setSettings(res.data.settings);
        const map: Record<string, any> = {};
        for (const s of res.data.settings) {
          if (s.type === 'boolean') {
            map[s.key] = s.value === 'true';
          } else if (s.type === 'number') {
            map[s.key] = s.value;
          } else {
            map[s.key] = s.value;
          }
        }
        setFormData(map);
        setInitialData(map);
      }
    } catch (err: any) {
      notify('error', `Failed to load settings for ${categorySummary?.name || categorySlug}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    if (user?.email && !testEmailRecipient) {
      setTestEmailRecipient(user.email);
    }
  }, [categorySlug]);

  const handleChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await api.updateCategorySettings(backendCategory, formData);
      if (res.success) {
        notify('success', `${categorySummary?.name || 'Category'} settings saved successfully.`);
        await loadSettings();
        window.dispatchEvent(new CustomEvent('branding:updated'));
        if (onReloadMenu) onReloadMenu();
      } else {
        notify('error', res.message || 'Failed to save settings.');
      }
    } catch {
      notify('error', 'Network error while updating settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetSingleKey = async (key: string, label: string) => {
    try {
      const res = await api.resetSettingKey(key);
      if (res.success) {
        notify('success', `Reset '${label}' to original .env default.`);
        await loadSettings();
        window.dispatchEvent(new CustomEvent('branding:updated'));
      } else {
        notify('error', res.message || 'Failed to reset setting.');
      }
    } catch {
      notify('error', 'Network error.');
    }
  };

  const handleResetCategory = async () => {
    if (!window.confirm(`Are you sure you want to reset all settings in '${categorySummary?.name || categorySlug}' to .env defaults? All database overrides in this category will be deleted.`)) {
      return;
    }

    setIsResettingCategory(true);
    try {
      const res = await api.resetCategorySettings(backendCategory);
      if (res.success) {
        notify('success', `${categorySummary?.name || 'Category'} has been reset to original .env defaults.`);
        await loadSettings();
        window.dispatchEvent(new CustomEvent('branding:updated'));
      } else {
        notify('error', res.message || 'Failed to reset category.');
      }
    } catch {
      notify('error', 'Network error while resetting category.');
    } finally {
      setIsResettingCategory(false);
    }
  };

  const handleTestConnection = async () => {
    setIsVerifyingConnection(true);
    setConnectionStatus(null);
    try {
      const res = await api.testSmtpConnection();
      if (res.success) {
        setConnectionStatus({
          success: true,
          message: res.message || 'SMTP Handshake verified successfully! Mail server connection is healthy.',
          details: res.data,
        });
        notify('success', 'SMTP handshake verified successfully!');
      } else {
        setConnectionStatus({
          success: false,
          message: res.message || 'Failed to establish connection to SMTP server.',
        });
        notify('error', res.message || 'SMTP connection verification failed.');
      }
    } catch (err: any) {
      setConnectionStatus({
        success: false,
        message: err.message || 'Network error occurred while connecting to SMTP server.',
      });
      notify('error', 'Failed to test SMTP connection.');
    } finally {
      setIsVerifyingConnection(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailRecipient)) {
      notify('error', 'Please enter a valid recipient email address.');
      return;
    }

    setIsSendingTestEmail(true);
    setTestEmailStatus(null);
    try {
      const res = await api.sendTestEmail(testEmailRecipient);
      if (res.success) {
        setTestEmailStatus({ success: true, message: res.message || 'Test email dispatched successfully! Please check your inbox.' });
        notify('success', 'Test email dispatched successfully!');
      } else {
        setTestEmailStatus({ success: false, message: res.message || 'Failed to send test email.' });
        notify('error', res.message || 'Failed to send test email.');
      }
    } catch (err: any) {
      setTestEmailStatus({ success: false, message: err.message || 'Network error occurred while sending test email.' });
      notify('error', 'Failed to dispatch test email.');
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const isFormDirty = JSON.stringify(formData) !== JSON.stringify(initialData);
  const overriddenCount = settings.filter(s => s.is_overridden).length;

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-12 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-[#0084CC] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Loading configuration parameters...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold text-[#0084CC] uppercase tracking-wider">
                Configuration Category
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-mono">
                {settings.length} fields
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#101B32]">
              {categorySummary?.name || 'Category Configuration'}
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              {categorySummary?.description || 'Adjust and fine-tune operational parameters. Settings with active overrides take precedence over .env file defaults.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {overriddenCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span>{overriddenCount} Database Override{overriddenCount > 1 ? 's' : ''}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>All .env Defaults Active</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs divide-y divide-slate-100">
          {settings.map(setting => {
            const isOverridden = setting.is_overridden;
            const currentValue = formData[setting.key];
            const isPassword = setting.type === 'password' || setting.isSensitive;
            const showPass = showPasswords[setting.key] || false;

            return (
              <div
                key={setting.key}
                className={`p-5 sm:p-6 transition-colors ${
                  isOverridden ? 'bg-amber-50/20' : 'bg-white'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Label & Description */}
                  <div className="max-w-xl">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <label
                        htmlFor={setting.key}
                        className="text-xs font-bold text-[#101B32]"
                      >
                        {setting.label}
                      </label>

                      {/* Source Status Badge */}
                      {isOverridden ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>Database Override</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-100">
                          <span>Default (.env)</span>
                        </span>
                      )}

                      {setting.envKey && (
                        <span className="text-[10px] font-mono text-slate-400">
                          [{setting.envKey}]
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {setting.description}
                    </p>
                  </div>

                  {/* Input Control & Reset Key Button */}
                  <div className="flex items-center gap-3 w-full lg:w-auto shrink-0 justify-end">
                    {/* Render by setting type */}
                    {setting.type === 'boolean' ? (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleChange(setting.key, !currentValue)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0084CC] ${
                            currentValue ? 'bg-[#0084CC]' : 'bg-slate-300'
                          }`}
                          role="switch"
                          aria-checked={Boolean(currentValue)}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              currentValue ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span className="text-xs font-semibold text-slate-700 w-12 text-left">
                          {currentValue ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    ) : setting.type === 'select' ? (
                      <select
                        id={setting.key}
                        value={currentValue ?? ''}
                        onChange={e => handleChange(setting.key, e.target.value)}
                        className="w-full sm:w-64 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                      >
                        {setting.options?.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : setting.type === 'number' ? (
                      <input
                        id={setting.key}
                        type="number"
                        value={currentValue ?? ''}
                        onChange={e => handleChange(setting.key, e.target.value)}
                        className="w-full sm:w-64 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                      />
                    ) : isPassword ? (
                      <div className="relative w-full sm:w-64">
                        <input
                          id={setting.key}
                          type={showPass ? 'text' : 'password'}
                          value={currentValue ?? ''}
                          onChange={e => handleChange(setting.key, e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowPasswords(prev => ({
                              ...prev,
                              [setting.key]: !prev[setting.key],
                            }))
                          }
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          title={showPass ? 'Hide secret' : 'Show secret'}
                        >
                          {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <input
                        id={setting.key}
                        type="text"
                        value={currentValue ?? ''}
                        onChange={e => handleChange(setting.key, e.target.value)}
                        className="w-full sm:w-64 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                      />
                    )}

                    {/* Single Setting Reset to Default Button */}
                    {isOverridden && (
                      <button
                        type="button"
                        onClick={() => handleResetSingleKey(setting.key, setting.label)}
                        className="p-2 rounded-lg text-amber-700 hover:bg-amber-100 border border-amber-300 transition-colors shrink-0"
                        title="Revert this parameter to original .env default"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Toolbar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNavigateOverview}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Overview</span>
            </button>

            {overriddenCount > 0 && (
              <button
                type="button"
                onClick={handleResetCategory}
                disabled={isResettingCategory}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-semibold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Category to Defaults</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isFormDirty && (
              <span className="text-[11px] font-medium text-amber-600 animate-pulse">
                Unsaved modifications pending
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0084CC] hover:bg-sky-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Configuration Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Special Module Feature: Email & SMTP Gateway Live Verification */}
      {backendCategory === 'email_smtp' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          {/* Header & Handshake Test */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-[#0084CC] flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#101B32]">
                    SMTP Server Connectivity & Diagnostics
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Test connection handshake and dispatch verification messages via {formData['smtp_host'] || 'configured SMTP host'}:{formData['smtp_port'] || '587'}.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isVerifyingConnection}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#101B32] text-xs font-bold transition-all disabled:opacity-50 shrink-0 border border-slate-200"
              >
                {isVerifyingConnection ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[#101B32] border-t-transparent rounded-full animate-spin" />
                    <span>Testing Handshake...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5 text-[#0084CC]" />
                    <span>Test SMTP Connection</span>
                  </>
                )}
              </button>
            </div>

            {connectionStatus && (
              <div
                className={`mt-4 p-4 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 animate-in fade-in duration-200 ${
                  connectionStatus.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {connectionStatus.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold block">
                    {connectionStatus.success ? 'SMTP Handshake Verified' : 'SMTP Connection Failed'}
                  </span>
                  <span>{connectionStatus.message}</span>
                </div>
              </div>
            )}
          </div>

          {/* Test Email Dispatch Form */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Send Test Email Dispatch
            </h4>
            <form onSubmit={handleSendTestEmail}>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="Enter recipient email (e.g. admin@nexora.com)..."
                    value={testEmailRecipient}
                    onChange={e => setTestEmailRecipient(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0084CC]/20 focus:border-[#0084CC]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSendingTestEmail}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-[#101B32] hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 shrink-0"
                >
                  {isSendingTestEmail ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Dispatching...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Verification Email</span>
                    </>
                  )}
                </button>
              </div>

              {testEmailStatus && (
                <div
                  className={`mt-4 p-4 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 animate-in fade-in duration-200 ${
                    testEmailStatus.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {testEmailStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold block">
                      {testEmailStatus.success ? 'Email Dispatched Successfully' : 'Email Dispatch Failed'}
                    </span>
                    <span>{testEmailStatus.message}</span>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
