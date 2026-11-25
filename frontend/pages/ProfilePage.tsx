import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { FormField } from '../components/FormField';
import { UserAvatar } from '../components/UserAvatar';
import { getDisplayName, validateName } from '../utils/userUtils';
import { UserSessionItem } from '../types';
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
  Camera,
  Laptop,
  LogOut,
  RefreshCw,
  AlertTriangle,
  KeyRound,
  ShieldCheck,
  Send,
  X,
  Upload,
  Link as LinkIcon,
  Check,
  Trash2,
} from 'lucide-react';

interface ProfilePageProps {
  onNavigate?: (route: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigate }) => {
  const { user, updateUser, notify } = useAuth();

  // Profile Identity & Contact form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [profilePicture, setProfilePicture] = useState('');

  // Image Upload & Source states
  const [imageSourceMode, setImageSourceMode] = useState<'upload' | 'url'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Email change state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailStep, setEmailStep] = useState<'request' | 'verify'>('request');
  const [verificationCode, setVerificationCode] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailModalError, setEmailModalError] = useState<string | null>(null);

  // Sessions state
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingOthers, setRevokingOthers] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setPhone(user.phone || '');
      setDepartment(user.department || 'Executive');
      setProfilePicture(user.profile_picture || '');
      setFilePreview(null);
      setSelectedFile(null);
      setFileBase64(null);
      setImageError(null);
      setFormErrors({});
    }
  }, [user, isEditing]);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await api.getMySessions();
      if (res.success && res.data) {
        setSessions(res.data);
      }
    } catch {
      // Non-critical fallback
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  if (!user) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate mime and extension (JPEG, JPG, PNG, WEBP)
    const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['jpg', 'jpeg', 'png', 'webp'];

    if (!validMimes.includes(file.type) && (!ext || !validExts.includes(ext))) {
      setImageError('Unsupported image format. Allowed formats: JPEG, JPG, PNG, WEBP.');
      return;
    }

    // Validate maximum file size (5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setImageError('Image file exceeds the 5 MB maximum size limit.');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setFilePreview(result);
      setFileBase64(result);
    };
    reader.onerror = () => {
      setImageError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleClearSelectedFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setFileBase64(null);
    setImageError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setImageError(null);

    // Validate mandatory First Name and Last Name
    const errors: Record<string, string> = {};
    const firstCheck = validateName(firstName, 'First Name');
    if (!firstCheck.valid) {
      errors.first_name = firstCheck.error || 'First Name is required.';
    }

    const lastCheck = validateName(lastName, 'Last Name');
    if (!lastCheck.valid) {
      errors.last_name = lastCheck.error || 'Last Name is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSaving(true);

    try {
      let finalPictureUrl = profilePicture.trim();

      // If user uploaded a local file via upload mode, save it via the dedicated picture upload endpoint
      if (imageSourceMode === 'upload' && fileBase64 && selectedFile) {
        const uploadRes = await api.uploadProfilePicture({
          image_data: fileBase64,
          file_name: selectedFile.name,
        });

        if (uploadRes.success && uploadRes.data) {
          finalPictureUrl = uploadRes.data.profile_picture;
        } else {
          setImageError(uploadRes.message || 'Failed to upload profile picture.');
          setIsSaving(false);
          return;
        }
      }

      const res = await api.updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        department: department.trim(),
        profile_picture: finalPictureUrl,
      });

      if (res.success && res.data) {
        updateUser(res.data);
        setIsEditing(false);
        handleClearSelectedFile();
        notify('success', 'Profile and identity details updated successfully.');
      } else {
        setGeneralError(res.message || 'Failed to update profile.');
      }
    } catch (err: any) {
      setGeneralError(err?.message || 'Failed to communicate with profile update service.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailModalError(null);

    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailModalError('Please enter a valid email address.');
      return;
    }

    setEmailLoading(true);
    try {
      const res = await api.requestEmailChange(newEmail.trim());
      if (res.success) {
        setEmailStep('verify');
        notify('info', `Verification code dispatched to ${newEmail.trim()}. Check inbox or spam.`);
      } else {
        setEmailModalError(res.message);
      }
    } catch {
      setEmailModalError('Failed to send verification email. Please check server SMTP configuration.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailModalError(null);

    if (!verificationCode.trim()) {
      setEmailModalError('Please enter the 6-digit verification code.');
      return;
    }

    setEmailLoading(true);
    try {
      const res = await api.verifyEmailChange(verificationCode.trim());
      if (res.success && res.data?.new_email) {
        updateUser({ ...user, email: res.data.new_email });
        setShowEmailModal(false);
        setNewEmail('');
        setVerificationCode('');
        setEmailStep('request');
        notify('success', 'Email address successfully updated and verified.');
      } else {
        setEmailModalError(res.message || 'Verification code is invalid or has expired.');
      }
    } catch {
      setEmailModalError('Verification service failed. Please try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setRevokingOthers(true);
    try {
      const res = await api.revokeOtherSessions();
      if (res.success) {
        notify('success', res.message || 'Successfully signed out from all other active sessions.');
        loadSessions();
      } else {
        notify('error', res.message || 'Failed to revoke other sessions.');
      }
    } catch {
      notify('error', 'Network error revoking active sessions.');
    } finally {
      setRevokingOthers(false);
    }
  };

  const handleRevokeSingleSession = async (sessionId: number) => {
    try {
      const res = await api.revokeMySession(sessionId);
      if (res.success) {
        notify('success', 'Session revoked.');
        loadSessions();
      } else {
        notify('error', res.message || 'Could not revoke session.');
      }
    } catch {
      notify('error', 'Network error.');
    }
  };

  const avatarInitial = (user.first_name?.[0] || user.name?.[0] || 'U').toUpperCase();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <PageHeader
        title="My Profile & Security"
        description="Manage your verified personal identity, contact preferences, and account active sessions."
        icon={<UserIcon className="w-5 h-5 text-sky-600" />}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate && onNavigate('/change-password')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <KeyRound className="w-3.5 h-3.5 text-slate-500" />
              Change Password
            </button>
          </div>
        }
      />

      {/* Main Profile Identity Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Banner Section */}
        <div className="p-6 sm:p-8 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              <UserAvatar
                user={{
                  first_name: isEditing ? firstName : user.first_name,
                  last_name: isEditing ? lastName : user.last_name,
                  profile_picture: filePreview || (isEditing ? profilePicture : user.profile_picture),
                  username: user.username,
                }}
                size="2xl"
                shape="rounded"
                className="w-20 h-20 rounded-2xl border-2 border-white/20 shadow-lg"
              />
              {isEditing && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 p-2 rounded-lg bg-[#0084CC] hover:bg-sky-600 text-white shadow-md transition-colors"
                  title="Upload profile picture"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {isEditing ? `${firstName} ${lastName}`.trim() || 'Your Name' : getDisplayName(user)}
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  Active Account
                </span>
              </div>
              <p className="text-xs text-slate-300 font-mono mt-1">@{user.username}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-white/10 text-slate-200 capitalize">
                  <Shield className="w-3 h-3 text-sky-400" />
                  Role: {user.role.replace('_', ' ')}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-md bg-white/5 text-slate-300">
                  <Briefcase className="w-3 h-3 text-slate-400" />
                  {user.department || 'Executive Team'}
                </span>
              </div>
            </div>
          </div>

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-white text-slate-900 hover:bg-slate-100 transition-colors shadow-xs"
            >
              Edit Profile
            </button>
          )}
        </div>

        {/* Profile Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {generalError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {isEditing ? (
            <form onSubmit={handleSave} noValidate className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Editable First Name */}
                <div>
                  <label htmlFor="profile-first-name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>First Name <span className="text-rose-500">*</span></span>
                  </label>
                  <input
                    id="profile-first-name"
                    name="first_name"
                    type="text"
                    required
                    value={firstName}
                    onChange={e => {
                      setFirstName(e.target.value);
                      if (formErrors.first_name) {
                        setFormErrors(prev => ({ ...prev, first_name: '' }));
                      }
                    }}
                    placeholder="e.g. Alexander"
                    className={`block w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border ${
                      formErrors.first_name ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-300 focus:border-[#0084CC] focus:ring-sky-100'
                    } focus:ring-2 transition-all font-medium`}
                  />
                  {formErrors.first_name && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium">{formErrors.first_name}</p>
                  )}
                </div>

                {/* Editable Last Name */}
                <div>
                  <label htmlFor="profile-last-name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Last Name <span className="text-rose-500">*</span></span>
                  </label>
                  <input
                    id="profile-last-name"
                    name="last_name"
                    type="text"
                    required
                    value={lastName}
                    onChange={e => {
                      setLastName(e.target.value);
                      if (formErrors.last_name) {
                        setFormErrors(prev => ({ ...prev, last_name: '' }));
                      }
                    }}
                    placeholder="e.g. Vance"
                    className={`block w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border ${
                      formErrors.last_name ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-300 focus:border-[#0084CC] focus:ring-sky-100'
                    } focus:ring-2 transition-all font-medium`}
                  />
                  {formErrors.last_name && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium">{formErrors.last_name}</p>
                  )}
                </div>

                {/* Account Username (System ID) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Account Username</span>
                    <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> System ID
                    </span>
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user.username}
                    className="block w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed font-mono"
                  />
                </div>

                {/* Editable Phone */}
                <FormField id="profile-phone" label="Mobile / Contact Phone">
                  <input
                    id="profile-phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 (555) 234-5678"
                    className="block w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-[#0084CC] focus:ring-2 focus:ring-sky-100"
                  />
                </FormField>

                {/* Editable Department */}
                <div className="sm:col-span-2">
                  <FormField id="profile-department" label="Department / Functional Unit">
                    <input
                      id="profile-department"
                      name="department"
                      type="text"
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      placeholder="Operations, IT, Logistics, Finance"
                      className="block w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-[#0084CC] focus:ring-2 focus:ring-sky-100"
                    />
                  </FormField>
                </div>
              </div>

              {/* Profile Picture Management Section */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Profile Picture Avatar</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Upload an image file (JPEG, PNG, WEBP max 5MB) or specify an image URL</p>
                  </div>
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl text-xs">
                    <button
                      type="button"
                      onClick={() => setImageSourceMode('upload')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                        imageSourceMode === 'upload' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-[#0084CC]" />
                      Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageSourceMode('url')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                        imageSourceMode === 'url' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <LinkIcon className="w-3.5 h-3.5 text-[#0084CC]" />
                      Image URL
                    </button>
                  </div>
                </div>

                {imageError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{imageError}</span>
                  </div>
                )}

                {imageSourceMode === 'upload' ? (
                  <div className="space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {filePreview ? (
                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-200">
                        <div className="flex items-center gap-3">
                          <img
                            src={filePreview}
                            alt="Preview"
                            className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-xs"
                          />
                          <div>
                            <div className="text-xs font-bold text-slate-900">{selectedFile?.name}</div>
                            <div className="text-[11px] text-slate-500">
                              {(selectedFile?.size ? (selectedFile.size / 1024).toFixed(1) : '0')} KB • Ready to save
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700"
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            onClick={handleClearSelectedFile}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Remove preview"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer border-2 border-dashed border-slate-300 hover:border-[#0084CC] rounded-xl p-6 text-center bg-white hover:bg-sky-50/40 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full bg-sky-50 text-[#0084CC] flex items-center justify-center mx-auto mb-2">
                          <Upload className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          Click to browse or drop an avatar image
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Supports JPEG, JPG, PNG, WEBP up to 5 MB
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      id="profile-picture-url"
                      name="profile_picture"
                      type="url"
                      value={profilePicture}
                      onChange={e => {
                        setProfilePicture(e.target.value);
                        setImageError(null);
                      }}
                      placeholder="https://images.example.com/avatar.jpg"
                      className="block w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-[#0084CC] focus:ring-2 focus:ring-sky-100 bg-white"
                    />
                    <p className="text-[11px] text-slate-500">
                      Enter a direct image link (HTTP or HTTPS). You'll see an immediate preview in the avatar banner above.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    handleClearSelectedFile();
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#0084CC] hover:bg-sky-600 text-white transition-colors disabled:opacity-50 shadow-xs"
                >
                  {isSaving ? 'Saving Profile...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Profile Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* First Name */}
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5" /> First Name
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" /> Verified
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{user.first_name}</div>
                </div>

                {/* Last Name */}
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5" /> Last Name
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" /> Verified
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{user.last_name}</div>
                </div>

                {/* Username */}
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <AtSign className="w-3.5 h-3.5" /> Account Username
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> System ID
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 font-mono">{user.username}</div>
                </div>

                {/* Email Address with Change Action */}
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" /> Email Address
                    </span>
                    <button
                      onClick={() => setShowEmailModal(true)}
                      className="text-[11px] font-bold text-sky-600 hover:text-sky-800 transition-colors"
                    >
                      Update Email
                    </button>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{user.email}</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Updates require email verification to ensure account security.
                  </div>
                </div>

                {/* Mobile Phone */}
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                    <Phone className="w-3.5 h-3.5" /> Contact Phone
                  </span>
                  <div className="text-sm font-semibold text-slate-800">{user.phone || 'Not provided'}</div>
                </div>

                {/* Department */}
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                    <Briefcase className="w-3.5 h-3.5" /> Department
                  </span>
                  <div className="text-sm font-semibold text-slate-800">{user.department || 'Executive'}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account Security & Active Sessions Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Account Security & Active Sessions
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Review current devices signed into your account. You can safely terminate unfamiliar or stale sessions.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadSessions}
              disabled={loadingSessions}
              className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              title="Refresh sessions"
            >
              <RefreshCw className={`w-4 h-4 ${loadingSessions ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleRevokeOtherSessions}
              disabled={revokingOthers}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              {revokingOthers ? 'Signing Out...' : 'Sign Out Other Sessions'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3.5">Device & Browser</th>
                <th className="px-6 py-3.5">IP Address</th>
                <th className="px-6 py-3.5">Sign-In Time</th>
                <th className="px-6 py-3.5">Last Activity</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No active session records found.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className={s.is_current ? 'bg-sky-50/30' : 'hover:bg-slate-50/50'}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-lg ${s.is_current ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {s.user_agent.includes('Chrome') ? 'Google Chrome' : s.user_agent.includes('Firefox') ? 'Mozilla Firefox' : s.user_agent.includes('Safari') ? 'Safari' : 'Web Browser'}
                            {s.is_current && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-xs">{s.user_agent}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700">{s.ip_address}</td>
                    <td className="px-6 py-4 text-slate-600">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 text-slate-600">{new Date(s.last_active_at).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      {s.is_revoked ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                          Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!s.is_current && !s.is_revoked && (
                        <button
                          onClick={() => handleRevokeSingleSession(s.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                      {s.is_current && (
                        <span className="text-[11px] font-medium text-slate-400 italic">This Device</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Email Change Verification Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-sky-600" />
                Update Email Address
              </h3>
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setEmailStep('request');
                  setEmailModalError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {emailModalError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {emailModalError}
              </div>
            )}

            {emailStep === 'request' ? (
              <form onSubmit={handleRequestEmailChange} className="mt-5 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Enter your new email address. A 6-digit confirmation code will be dispatched to verify your ownership. Your current email remains active until confirmed.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Current Verified Email
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user.email}
                    className="block w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    New Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="new.email@company.com"
                    className="block w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowEmailModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-sky-600 text-white hover:bg-sky-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {emailLoading ? 'Sending Code...' : 'Send Verification Code'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyEmail} className="mt-5 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  We sent a 6-digit verification code to <strong className="text-slate-800">{newEmail}</strong>. Enter the code below to complete the email update:
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 text-center">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="block w-full text-center tracking-widest text-2xl font-mono py-3 rounded-xl border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="flex items-center justify-between pt-3">
                  <button
                    type="button"
                    onClick={() => setEmailStep('request')}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Back to edit email
                  </button>
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {emailLoading ? 'Verifying...' : 'Confirm & Update Email'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
