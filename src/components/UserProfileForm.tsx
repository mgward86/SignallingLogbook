import React, { useState, useEffect } from 'react';
import { useAuth, type UserProfile } from '../lib/AuthContext';
import { useConfig } from '../hooks/useConfig';
import { Settings, BadgeCheck, MapPin, Briefcase, Mail, Save, Loader2, Sparkles, Settings2, ShieldCheck, Info, X, Palette, Eye, RotateCcw, Check, Trash2, AlertTriangle, ShieldAlert, FileText, LayoutGrid, ListChecks } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, writeBatch, doc, deleteDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import {
  createPdfInstance,
  addDocumentFooters,
  generateLogPage,
  buildSamplePdfLogEntry,
  isValidHex,
  contrastRatio,
  HEADER_STYLE_UNSUPPORTED_KEYS,
  HEADER_STYLE_LOCKED_ORIENTATION,
  APP_NAME,
  resolveHeaderStyle,
  type PdfConfig,
} from '../lib/pdfGenerator';
import { downloadPdf } from '../lib/pdfExport';

/** Shared accessible toggle switch used throughout the PDF customiser — also carries a "why is this disabled" note for settings the current header style ignores. */
function ToggleSwitch({
  label,
  description,
  disabledNote,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  disabledNote?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100 transition ${disabled ? 'opacity-40' : ''}`}>
      <div>
        <p className="text-xs font-bold text-gray-800">{label}</p>
        <p className={`text-[10px] font-medium ${disabled ? 'text-amber-600' : 'text-gray-400'}`}>
          {disabled && disabledNote ? disabledNote : description}
        </p>
      </div>
      <label className={`relative inline-flex items-center shrink-0 ml-4 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rail-blue peer-disabled:opacity-60"></div>
      </label>
    </div>
  );
}

const HEADER_STYLE_LABELS: Record<string, string> = {
  'condensed-table': 'Condensed Table',
  'executive-pro': 'Executive Modern',
  'accent-lines': 'Accent Lines',
  'bold-left': 'Left Accent Border',
  'solid-banner': 'Solid Banner',
};

export function UserProfileForm() {
  const { user, profile, updateProfile, logOut } = useAuth();
  const { config } = useConfig();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'identity' | 'system'>('identity');
  
  // Danger Zone deletion states
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingState, setDeletingState] = useState<'idle' | 'deleting-logs' | 'deleting-profile' | 'cleaning-up'>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    displayName: profile?.displayName || '',
    employeeId: profile?.employeeId || '',
    jobTitle: profile?.jobTitle || '',
    location: profile?.location || '',
    isLocationNA: profile?.isLocationNA || false,
  });

  const [userNumbering, setUserNumbering] = useState({
    prefix: profile?.numberingSystem?.prefix || 'LOG-',
    nextNumber: profile?.numberingSystem?.nextNumber || 1,
    enabled: profile?.numberingSystem?.enabled !== false,
  });
  const [userQuarterFormat, setUserQuarterFormat] = useState<'Q1-Q4' | 'Months'>(profile?.quarterFormat || 'Q1-Q4');

  useEffect(() => {
    if (profile) {
      setFormData({
        displayName: profile.displayName || '',
        employeeId: profile.employeeId || '',
        jobTitle: profile.jobTitle || '',
        location: profile.location || '',
        isLocationNA: profile.isLocationNA || false,
      });
      if (profile.numberingSystem) {
        setUserNumbering(profile.numberingSystem);
      }
      if (profile.quarterFormat) {
        setUserQuarterFormat(profile.quarterFormat);
      }
    }
  }, [profile]);
  const [zoomLevel, setZoomLevel] = useState(1.0);

  const canvasContainerRef = React.useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = React.useRef({ startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, [data-no-pan="true"]')) {
      return;
    }
    if (!canvasContainerRef.current) return;

    setIsPanning(true);
    panStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: canvasContainerRef.current.scrollLeft,
      scrollTop: canvasContainerRef.current.scrollTop
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, [data-no-pan="true"]')) {
      return;
    }
    if (!canvasContainerRef.current) return;

    setIsPanning(true);
    const touch = e.touches[0];
    panStartRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      scrollLeft: canvasContainerRef.current.scrollLeft,
      scrollTop: canvasContainerRef.current.scrollTop
    };
  };

  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasContainerRef.current) return;
      const dx = e.clientX - panStartRef.current.startX;
      const dy = e.clientY - panStartRef.current.startY;
      canvasContainerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      canvasContainerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!canvasContainerRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - panStartRef.current.startX;
      const dy = touch.clientY - panStartRef.current.startY;
      canvasContainerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      canvasContainerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
    };

    const handlePanEnd = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handlePanEnd);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handlePanEnd);
    window.addEventListener('touchcancel', handlePanEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handlePanEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handlePanEnd);
      window.removeEventListener('touchcancel', handlePanEnd);
    };
  }, [isPanning]);

  const DEFAULT_PDF_CONFIG: PdfConfig = {
    title: 'SIGNALLING LOGBOOK',
    subtitle: 'PROFESSIONAL DIGITAL SIGNALLING RECORD',
    accentColor: '#003057',
    showSupervisor: true,
    supervisorTitle: 'SUPERVISOR VERIFICATION & COMMENTS',
    supervisorDeclaration: 'I verify that the work described was performed safely and to industry standards.',
    showEquipment: true,
    showCertificationDetails: true,
    pageOrientation: 'portrait',
    marginSize: 'standard',
    fontFamily: 'helvetica',
    fontSizeModifier: 'md',
    headerStyle: 'accent-lines',
    layoutSpacing: 'relaxed',
    showOwnerSignature: false,
    showPageNumbers: true,
    customFooterNote: '',
    showSupervisorComments: true
  };

  const buildPdfConfigFromProfile = (source?: UserProfile['pdfConfig']): PdfConfig => ({
    title: source?.title || DEFAULT_PDF_CONFIG.title,
    subtitle: source?.subtitle || DEFAULT_PDF_CONFIG.subtitle,
    accentColor: source?.accentColor || DEFAULT_PDF_CONFIG.accentColor,
    showSupervisor: source?.showSupervisor !== false,
    supervisorTitle: source?.supervisorTitle || DEFAULT_PDF_CONFIG.supervisorTitle,
    supervisorDeclaration: source?.supervisorDeclaration || DEFAULT_PDF_CONFIG.supervisorDeclaration,
    showEquipment: source?.showEquipment !== false,
    showCertificationDetails: source?.showCertificationDetails !== false,
    pageOrientation: HEADER_STYLE_LOCKED_ORIENTATION[resolveHeaderStyle(source?.headerStyle)] || source?.pageOrientation || DEFAULT_PDF_CONFIG.pageOrientation,
    marginSize: source?.marginSize || DEFAULT_PDF_CONFIG.marginSize,
    fontFamily: source?.fontFamily || DEFAULT_PDF_CONFIG.fontFamily,
    fontSizeModifier: source?.fontSizeModifier || DEFAULT_PDF_CONFIG.fontSizeModifier,
    headerStyle: resolveHeaderStyle(source?.headerStyle),
    layoutSpacing: source?.layoutSpacing || DEFAULT_PDF_CONFIG.layoutSpacing,
    showOwnerSignature: source?.showOwnerSignature || false,
    showPageNumbers: source?.showPageNumbers !== false,
    customFooterNote: source?.customFooterNote || '',
    showSupervisorComments: source?.showSupervisorComments !== false
  });

  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [isSavingPdfConfig, setIsSavingPdfConfig] = useState(false);
  const [customizerTab, setCustomizerTab] = useState<'design' | 'layout' | 'content'>('design');
  const [pdfConfig, setPdfConfig] = useState<PdfConfig>(() => buildPdfConfigFromProfile(profile?.pdfConfig));

  // Snapshot of pdfConfig taken when the customiser is opened (or right after
  // a successful save) — compared against the live state to know whether
  // there are unsaved changes, so we can warn before discarding them.
  const savedPdfConfigRef = React.useRef<PdfConfig>(pdfConfig);
  const isDirty = JSON.stringify(pdfConfig) !== JSON.stringify(savedPdfConfigRef.current);

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const fontScale = pdfConfig.fontSizeModifier === 'sm' ? 0.9 : (pdfConfig.fontSizeModifier === 'lg' ? 1.1 : 1.0);
  const fs = (px: number) => ({ fontSize: `${(px * fontScale).toFixed(2)}px` });

  // Track profile changes to update pdfConfig on load or auth changes
  useEffect(() => {
    if (profile?.pdfConfig) {
      const next = buildPdfConfigFromProfile(profile.pdfConfig);
      setPdfConfig(next);
      savedPdfConfigRef.current = next;
    }
  }, [profile?.pdfConfig]);

  // Escape key closes the customiser (routed through the same
  // dirty-check as every other close affordance).
  useEffect(() => {
    if (!isCustomizerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else if (showResetConfirm) {
          setShowResetConfirm(false);
        } else {
          requestCloseCustomizer();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustomizerOpen, showDiscardConfirm, showResetConfirm, isDirty]);

  const openCustomizer = () => {
    savedPdfConfigRef.current = pdfConfig;
    setCustomizerTab('design');
    setShowDiscardConfirm(false);
    setShowResetConfirm(false);
    setPreviewError(null);
    setIsCustomizerOpen(true);
  };

  /** Any attempt to close the modal (X, backdrop, Cancel, Escape) routes through here so unsaved edits aren't silently lost. */
  const requestCloseCustomizer = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    setIsCustomizerOpen(false);
  };

  const confirmDiscardAndClose = () => {
    setPdfConfig(savedPdfConfigRef.current);
    setShowDiscardConfirm(false);
    setIsCustomizerOpen(false);
  };

  const handleSavePdfConfig = async () => {
    setIsSavingPdfConfig(true);
    try {
      await updateProfile({ pdfConfig });
      savedPdfConfigRef.current = pdfConfig;
      setIsCustomizerOpen(false);
    } catch (error) {
      console.error('Failed to save PDF custom settings: ', error);
    } finally {
      setIsSavingPdfConfig(false);
    }
  };

  const handleResetPdfConfig = () => {
    setPdfConfig(DEFAULT_PDF_CONFIG);
    setShowResetConfirm(false);
  };

  /**
   * Generates the real, final PDF from the in-progress (not-yet-saved)
   * settings using the exact same engine as the actual export flow
   * (`../lib/pdfGenerator`), against a clearly-labelled sample entry. This
   * exists because the mockup canvas to the right is a fast CSS
   * approximation for instant feedback while dragging sliders — it is not
   * pixel-accurate to the real PDF. This button is the guarantee: what you
   * see here is byte-for-byte what technicians will get.
   */
  const handlePreviewRealPdf = async () => {
    setIsGeneratingPreview(true);
    setPreviewError(null);
    try {
      const sampleLog = buildSamplePdfLogEntry();
      const doc = createPdfInstance(pdfConfig);
      generateLogPage(doc, sampleLog, true, pdfConfig, profile, config?.categories);
      addDocumentFooters(doc, pdfConfig, sampleLog.logNumber);

      if (Capacitor.isNativePlatform()) {
        await downloadPdf(doc, 'PDF_Template_Preview.pdf');
      } else {
        const blobUrl = doc.output('bloburl');
        const win = window.open(blobUrl as unknown as string, '_blank');
        if (!win) {
          setPreviewError('Your browser blocked the preview pop-up. Please allow pop-ups for this site and try again.');
        }
      }
    } catch (error) {
      console.error('Failed to generate real PDF preview:', error);
      setPreviewError('Could not generate the preview PDF. Please check your settings and try again.');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Settings the *currently selected* header style silently ignores — used
  // to grey out + annotate those controls instead of letting them appear to
  // do nothing when toggled. Keep in sync with `pdfGenerator.ts`.
  const resolvedHeaderStyle = resolveHeaderStyle(pdfConfig.headerStyle);
  const unsupportedKeys = HEADER_STYLE_UNSUPPORTED_KEYS[resolvedHeaderStyle] || [];
  const isSettingUnsupported = (key: keyof PdfConfig) => unsupportedKeys.includes(key);
  const lockedOrientation = HEADER_STYLE_LOCKED_ORIENTATION[resolvedHeaderStyle];
  const activeHeaderStyleLabel = HEADER_STYLE_LABELS[resolvedHeaderStyle] || 'this layout';

  // Accent colour validation + a plain-English readability check against a
  // white page background (every current header style renders this colour
  // either as text-on-white or as a solid fill with white text on top).
  const isHexValid = isValidHex(pdfConfig.accentColor);
  const accentContrastOnWhite = isHexValid ? contrastRatio(pdfConfig.accentColor, '#FFFFFF') : null;
  const showLowContrastWarning = accentContrastOnWhite !== null && accentContrastOnWhite < 2.5;

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (deleteConfirmText !== 'DELETE MY DATA') {
      setDeleteError('Please type the exact phrase to confirm deletion.');
      return;
    }

    try {
      setDeleteError(null);
      
      // 1. Delete all user log entries in Firestore
      setDeletingState('deleting-logs');
      const q = query(collection(db, 'logEntries'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }

      // 2. Delete user profile document
      setDeletingState('deleting-profile');
      await deleteDoc(doc(db, 'users', user.uid));

      // 3. Clean up local drafts
      setDeletingState('cleaning-up');
      localStorage.removeItem(`signalling_log_draft_${user.uid}`);

      // 4. Delete user auth if possible, or fallback to logOut
      try {
        await user.delete();
      } catch (authErr: any) {
        console.warn('Auth user deletion requires recent login, falling back to sign out:', authErr);
        await logOut();
      }

      setIsConfirmingDelete(false);
      setDeleteConfirmText('');
      setDeletingState('idle');
    } catch (err: any) {
      console.error('Failed to fully delete account:', err);
      setDeleteError(err.message || 'Failed to complete data deletion. Please try again.');
      setDeletingState('idle');
    }
  };

  const handleSubmitIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile(formData);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSystem = async () => {
    setIsSaving(true);
    try {
      await updateProfile({
        numberingSystem: userNumbering,
        quarterFormat: userQuarterFormat,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isSystemSettingsChanged = 
    JSON.stringify(userNumbering) !== JSON.stringify(profile?.numberingSystem || { prefix: 'LOG-', nextNumber: 1, enabled: true }) ||
    userQuarterFormat !== (profile?.quarterFormat || 'Q1-Q4');

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-rail-blue text-white shadow-xl border-4 border-white mb-4">
          <Settings size={40} />
        </div>
        <h2 className="text-3xl font-bold text-rail-blue tracking-tight">Application Settings</h2>
        <p className="text-sm text-gray-500 font-mono italic">Configuration & User Profile</p>
      </div>

      {/* PDF Customisation Callout Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 border border-rail-blue/10 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex items-start gap-4 text-left">
          <div className="bg-rail-blue text-white p-3 rounded-xl shadow-md shrink-0">
            <Palette size={24} />
          </div>
          <div>
            <h3 className="font-bold text-rail-blue text-base">Customise PDF Export Template</h3>
            <p className="text-xs text-gray-500 max-w-lg mt-1">
              Adapt document headings, primary branding accent colours, toggle the supervisor verification panel, and specify declaration text.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCustomizer}
          className="bg-rail-blue text-white hover:bg-opacity-95 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all select-none shadow hover:shadow-md shrink-0"
        >
          Open Customiser Window
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-2xl w-full max-w-sm mx-auto">
        <button
          onClick={() => setActiveTab('identity')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeTab === 'identity' ? 'bg-white text-rail-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Identity
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeTab === 'system' ? 'bg-white text-rail-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          System
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'identity' ? (
          <motion.form 
            key="identity"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            onSubmit={handleSubmitIdentity} 
            className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <ProfileInput 
                label="Full Name" 
                icon={<Settings size={16} />}
                value={formData.displayName}
                onChange={(v: string) => setFormData(f => ({ ...f, displayName: v }))}
              />
              <ProfileInput 
                label="Credential ID / Employee ID" 
                icon={<BadgeCheck size={16} />}
                value={formData.employeeId}
                onChange={(v: string) => setFormData(f => ({ ...f, employeeId: v }))}
                placeholder="e.g. 10012345"
              />
              <ProfileInput 
                label="Standard Job Title" 
                icon={<Briefcase size={16} />}
                value={formData.jobTitle}
                onChange={(v: string) => setFormData(f => ({ ...f, jobTitle: v }))}
                placeholder="e.g. Signal Electrician"
              />
              <div className="flex items-end gap-3 flex-1">
                <ProfileInput 
                  label="Home Depot / Location" 
                  icon={<MapPin size={16} />}
                  value={formData.location}
                  onChange={(v: string) => setFormData(f => ({ ...f, location: v }))}
                  placeholder="e.g. Enfield Hub"
                  disabled={formData.isLocationNA}
                />
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <input 
                    type="checkbox" 
                    id="profileIsLocationNA" 
                    checked={formData.isLocationNA || false}
                    onChange={(e) => setFormData(f => ({ ...f, isLocationNA: e.target.checked }))}
                    className="w-5 h-5 accent-rail-blue cursor-pointer" 
                  />
                  <label htmlFor="profileIsLocationNA" className="text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none">N/A</label>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 space-y-4">
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <Mail className="text-rail-blue" size={20} />
                <div>
                  <p className="text-[10px] uppercase font-bold text-rail-blue tracking-widest opacity-60">Verified Email</p>
                  <p className="text-sm font-medium text-rail-blue">{profile?.email}</p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl flex items-start gap-3">
                <Sparkles className="text-amber-500 shrink-0 mt-0.5" size={18} />
                <p className="text-[10px] text-gray-500 leading-relaxed italic">
                  These details will be used to automatically certify your log entries. Ensure your details match your official certification records.
                </p>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="pt-6 border-t border-red-100 space-y-4 text-left">
              <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert size={16} className="text-red-500" />
                Danger Zone
              </h4>
              <div className="p-5 border border-red-100 rounded-2xl bg-red-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="space-y-1">
                  <p className="font-bold text-sm text-gray-900">Delete Your Account & Data</p>
                  <p className="text-xs text-gray-500 leading-relaxed max-w-xl">
                    Permanently purge your signalling logbook profile, all your draft settings, and erase all your log entries from the database. This action is irreversible.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="px-5 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold uppercase tracking-wider transition shrink-0 select-none flex items-center gap-2 border border-red-200/50"
                >
                  <Trash2 size={14} />
                  Delete Account
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={isSaving}
                className="px-10 py-3 bg-rail-blue text-white rounded-xl font-bold flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition shadow-lg disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                Save Identity
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.div 
            key="system"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Log Numbering System */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                <div className="flex items-center gap-2 text-rail-blue pb-2 border-b border-gray-50">
                  <Settings2 size={18} />
                  <h3 className="font-bold text-xs uppercase tracking-widest">Entry Numbering</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Enable Auto-Numbering</label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={userNumbering.enabled}
                        onChange={(e) => setUserNumbering({...userNumbering, enabled: e.target.checked})}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rail-blue"></div>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Prefix</label>
                    <input 
                      type="text"
                      value={userNumbering.prefix}
                      onChange={(e) => setUserNumbering({...userNumbering, prefix: e.target.value})}
                      className="w-full bg-gray-50 border border-transparent rounded-xl px-4 py-2.5 text-sm outline-none focus:bg-white focus:border-rail-blue transition"
                      placeholder="e.g. LOG-"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Next Number</label>
                    <input 
                      type="number"
                      value={userNumbering.nextNumber}
                      onChange={(e) => setUserNumbering({...userNumbering, nextNumber: parseInt(e.target.value) || 1})}
                      className="w-full bg-gray-50 border border-transparent rounded-xl px-4 py-2.5 text-sm outline-none focus:bg-white focus:border-rail-blue transition"
                    />
                  </div>
                  
                  <p className="text-[10px] text-gray-400 italic bg-gray-50 p-3 rounded-lg">
                    Example Preview: <span className="font-bold text-rail-blue">{userNumbering.prefix}{userNumbering.nextNumber}</span>
                  </p>
                </div>
              </div>

              {/* Quarter Formatting */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                <div className="flex items-center gap-2 text-rail-blue pb-2 border-b border-gray-50">
                  <Settings2 size={18} />
                  <h3 className="font-bold text-xs uppercase tracking-widest">Quarter Display Format</h3>
                </div>
                
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 font-medium">Choose how the financial year quarter is displayed in logs.</p>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      type="button"
                      onClick={() => setUserQuarterFormat('Q1-Q4')}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        userQuarterFormat === 'Q1-Q4'
                        ? 'border-rail-blue bg-rail-blue/5 ring-1 ring-rail-blue'
                        : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}
                    >
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900">Quarter Name</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Example: Q1, Q2, Q3, Q4</p>
                      </div>
                      {userQuarterFormat === 'Q1-Q4' && <ShieldCheck className="text-rail-blue" size={20} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setUserQuarterFormat('Months')}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        userQuarterFormat === 'Months'
                        ? 'border-rail-blue bg-rail-blue/5 ring-1 ring-rail-blue'
                        : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}
                    >
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900">Abbreviated Months</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Example: Jul-Sep, Oct-Dec</p>
                      </div>
                      {userQuarterFormat === 'Months' && <ShieldCheck className="text-rail-blue" size={20} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={handleSaveSystem}
                disabled={isSaving || !isSystemSettingsChanged}
                className="px-10 py-3 bg-rail-blue text-white rounded-xl font-bold flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition shadow-lg disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                Save System Settings
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF Export Template Customiser Modal Window */}
      <AnimatePresence>
        {isCustomizerOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8 overflow-y-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={requestCloseCustomizer}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              id="pdf-customizer-backdrop"
            />

            {/* Window Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className="relative bg-white rounded-3xl shadow-2xl flex flex-col w-full max-w-5xl h-[90vh] lg:h-[85vh] max-h-[90vh] overflow-hidden border border-gray-100 z-10"
              id="pdf-customizer-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pdf-customizer-title"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3 text-left">
                  <div className="bg-rail-blue p-2 rounded-lg text-white">
                    <Palette size={20} />
                  </div>
                  <div>
                    <h3 id="pdf-customizer-title" className="font-bold text-gray-900 text-base flex items-center gap-2">
                      Customise PDF Export Template
                      {isDirty && (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                          Unsaved changes
                        </span>
                      )}
                    </h3>
                    <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">Document Designer Window</p>
                  </div>
                </div>
                <button
                  onClick={requestCloseCustomizer}
                  className="p-1.5 hover:bg-gray-200 text-gray-400 hover:text-gray-600 rounded-lg transition"
                  type="button"
                  id="close-customizer-btn"
                  aria-label="Close PDF template customiser"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Discard-unsaved-changes confirmation banner */}
              <AnimatePresence>
                {showDiscardConfirm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden shrink-0"
                  >
                    <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 text-amber-800">
                        <AlertTriangle size={16} className="shrink-0" />
                        <p className="text-xs font-semibold">You have unsaved changes. Discard them and close?</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowDiscardConfirm(false)}
                          className="px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 rounded-lg transition"
                        >
                          Keep Editing
                        </button>
                        <button
                          type="button"
                          onClick={confirmDiscardAndClose}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition"
                        >
                          Discard Changes
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Design / Layout / Content Tabs */}
              <div className="flex items-center gap-1 px-6 pt-3 border-b border-gray-100 bg-gray-50/50 shrink-0" role="tablist" aria-label="PDF template settings sections">
                {([
                  { id: 'design', label: 'Design', icon: <Palette size={13} /> },
                  { id: 'layout', label: 'Layout', icon: <LayoutGrid size={13} /> },
                  { id: 'content', label: 'Content & Signatures', icon: <ListChecks size={13} /> },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={customizerTab === tab.id}
                    onClick={() => setCustomizerTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2.5 -mb-px text-xs font-bold rounded-t-lg border-b-2 transition ${
                      customizerTab === tab.id
                        ? 'text-rail-blue border-rail-blue bg-white'
                        : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-100/60'
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              {/* Main Content Area: Left Controls & Right Real-Time Mockup */}
              <div className="flex-1 overflow-y-auto lg:overflow-hidden min-h-0 p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
                {/* Form Controls (Left panel) */}
                <div className="lg:col-span-6 space-y-6 lg:h-full lg:overflow-y-auto lg:pl-2 lg:pr-2">
                  {customizerTab === 'design' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  {/* Document Identity Section */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-rail-blue uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center gap-2">
                      <Settings2 size={14} /> Headings & Titles
                    </h4>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Document Title</label>
                      <input
                        type="text"
                        value={pdfConfig.title}
                        onChange={(e) => setPdfConfig(c => ({ ...c, title: e.target.value }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-4 focus:ring-rail-blue/5 focus:border-rail-blue transition"
                        placeholder="e.g. SIGNALLING LOGBOOK"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Document Subtitle</label>
                      <input
                        type="text"
                        value={pdfConfig.subtitle}
                        onChange={(e) => setPdfConfig(c => ({ ...c, subtitle: e.target.value }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-4 focus:ring-rail-blue/5 focus:border-rail-blue transition"
                        placeholder="e.g. PROFESSIONAL SIGNALLING RECORD"
                      />
                    </div>
                  </div>

                  {/* Header Style — the biggest single visual decision, so it lives with the other Design controls */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-rail-blue uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center gap-2">
                      <LayoutGrid size={14} /> Header Style
                    </h4>
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { value: 'condensed-table', name: 'Condensed Table' },
                          { value: 'executive-pro', name: 'Executive Modern' },
                          { value: 'accent-lines', name: 'Accent Lines' },
                          { value: 'bold-left', name: 'Left Accent Border' },
                          ...(resolvedHeaderStyle === 'solid-banner' ? [{ value: 'solid-banner', name: 'Solid Banner' }] : []),
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPdfConfig(c => ({
                              ...c,
                              headerStyle: opt.value as any,
                              ...(HEADER_STYLE_LOCKED_ORIENTATION[opt.value] ? { pageOrientation: HEADER_STYLE_LOCKED_ORIENTATION[opt.value] } : {})
                            }))}
                            className={`py-2 px-1 rounded-xl border text-[11px] font-bold transition text-center cursor-pointer ${
                              resolvedHeaderStyle === opt.value
                                ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-2 ring-rail-blue/30 shadow-sm'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {opt.name}
                          </button>
                        ))}
                      </div>
                      {unsupportedKeys.length > 0 && (
                        <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-1.5 mt-1.5">
                          <Info size={12} className="shrink-0 mt-0.5" />
                          <span>The <strong>{activeHeaderStyleLabel}</strong> style has a fixed layout — a few controls below are greyed out because it doesn't use them.</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Themes & Accent Colours */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-rail-blue uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center gap-2">
                      <Palette size={14} /> Header Accent Colour
                    </h4>
                    
                    <div className="flex flex-wrap gap-2.5">
                      {[
                        { hex: '#003057', label: 'Classic Rail Blue' },
                        { hex: '#1b4332', label: 'Forest Green' },
                        { hex: '#85182a', label: 'Crimson Red' },
                        { hex: '#343a40', label: 'Charcoal Grey' },
                        { hex: '#5e35b1', label: 'Royal Purple' },
                        { hex: '#d97706', label: 'Safety Amber' },
                      ].map((preset) => (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => setPdfConfig(c => ({ ...c, accentColor: preset.hex }))}
                          style={{ backgroundColor: preset.hex }}
                          title={preset.label}
                          aria-label={`Use ${preset.label} accent colour`}
                          className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${
                            pdfConfig.accentColor.toLowerCase() === preset.hex.toLowerCase()
                              ? 'ring-2 ring-offset-2 ring-rail-blue scale-110 border-white'
                              : 'border-transparent hover:scale-105'
                          }`}
                        >
                          {pdfConfig.accentColor.toLowerCase() === preset.hex.toLowerCase() && (
                            <Check size={14} className="text-white" />
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="space-y-1 flex-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Custom Hex Code</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={pdfConfig.accentColor}
                            onChange={(e) => setPdfConfig(c => ({ ...c, accentColor: e.target.value }))}
                            aria-invalid={!isHexValid}
                            className={`w-full bg-gray-50 border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-4 transition font-mono ${
                              isHexValid ? 'border-gray-200 focus:ring-rail-blue/5 focus:border-rail-blue' : 'border-red-300 focus:ring-red-500/10 focus:border-red-400'
                            }`}
                            placeholder="#003057"
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-gray-200 shadow-sm" style={{ backgroundColor: isHexValid ? pdfConfig.accentColor : '#e5e7eb' }} />
                        </div>
                      </div>
                      <div className="space-y-1 shrink-0">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block text-center">Picker</label>
                        <input
                          type="color"
                          aria-label="Pick a custom accent colour"
                          value={isHexValid ? pdfConfig.accentColor : '#003057'}
                          onChange={(e) => setPdfConfig(c => ({ ...c, accentColor: e.target.value }))}
                          className="w-12 h-10 bg-gray-50 border border-gray-200 rounded-xl p-1 cursor-pointer"
                        />
                      </div>
                    </div>
                    {!isHexValid && (
                      <p className="text-[10px] text-red-600 flex items-center gap-1.5">
                        <AlertTriangle size={11} /> Enter a valid 6-digit hex code, e.g. #003057. Using the default colour until this is fixed.
                      </p>
                    )}
                    {showLowContrastWarning && (
                      <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span>This colour is quite pale — it may be hard to read as text or as a background fill. Consider a darker shade for better legibility.</span>
                      </p>
                    )}
                  </div>
                  </motion.div>
                  )}

                  {customizerTab === 'layout' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  {/* Page Setup & Typography Layout Controls */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-rail-blue uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center gap-2">
                      <Settings2 size={14} /> Page Setup & Typography
                    </h4>

                    {/* Layout Spacing (Relaxed vs Compressed) */}
                    <fieldset disabled={isSettingUnsupported('layoutSpacing')} className="space-y-1.5 disabled:opacity-40">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                        Spacing
                        {isSettingUnsupported('layoutSpacing') && <span className="text-amber-600 font-normal normal-case">— fixed by {activeHeaderStyleLabel}</span>}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isSettingUnsupported('layoutSpacing')}
                          onClick={() => setPdfConfig(c => ({ ...c, layoutSpacing: 'relaxed' }))}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                            pdfConfig.layoutSpacing === 'relaxed' || !pdfConfig.layoutSpacing
                              ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-1 ring-rail-blue'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          Relaxed
                        </button>
                        <button
                          type="button"
                          disabled={isSettingUnsupported('layoutSpacing')}
                          onClick={() => setPdfConfig(c => ({ ...c, layoutSpacing: 'compressed' }))}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                            pdfConfig.layoutSpacing === 'compressed'
                              ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-1 ring-rail-blue'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          Compressed
                        </button>
                      </div>
                    </fieldset>

                    {/* Page Orientation */}
                    <fieldset disabled={!!lockedOrientation} className="space-y-1.5 disabled:opacity-40">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                        Page Orientation
                        {lockedOrientation && <span className="text-amber-600 font-normal normal-case">— locked to {lockedOrientation} by {activeHeaderStyleLabel}</span>}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!!lockedOrientation}
                          onClick={() => setPdfConfig(c => ({ ...c, pageOrientation: 'portrait' }))}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                            pdfConfig.pageOrientation === 'portrait'
                              ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-1 ring-rail-blue'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          Portrait
                        </button>
                        <button
                          type="button"
                          disabled={!!lockedOrientation}
                          onClick={() => setPdfConfig(c => ({ ...c, pageOrientation: 'landscape' }))}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                            pdfConfig.pageOrientation === 'landscape'
                              ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-1 ring-rail-blue'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          Landscape
                        </button>
                      </div>
                    </fieldset>

                    {/* Margin Size selection */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Margins</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'narrow', name: 'Narrow (10mm)' },
                          { value: 'standard', name: 'Standard (15mm)' },
                          { value: 'wide', name: 'Wide (22mm)' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPdfConfig(c => ({ ...c, marginSize: opt.value as any }))}
                            className={`py-2 px-1 rounded-xl border text-[11px] font-bold transition ${
                              pdfConfig.marginSize === opt.value
                                ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-1 ring-rail-blue'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {opt.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Font Family selection */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Font Typeface</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'helvetica', name: 'Helvetica (Sans)' },
                          { value: 'times', name: 'Times (Serif)' },
                          { value: 'courier', name: 'Courier (Mono)' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPdfConfig(c => ({ ...c, fontFamily: opt.value as any }))}
                            className={`py-2 px-1 rounded-xl border text-[11px] font-bold transition ${
                              pdfConfig.fontFamily === opt.value
                                ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-1 ring-rail-blue'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {opt.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Font Size modifier */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Font Size</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'sm', name: 'Compact (90%)' },
                          { value: 'md', name: 'Standard (100%)' },
                          { value: 'lg', name: 'Expanded (110%)' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPdfConfig(c => ({ ...c, fontSizeModifier: opt.value as any }))}
                            className={`py-2 px-1 rounded-xl border text-[11px] font-bold transition cursor-pointer ${
                              pdfConfig.fontSizeModifier === opt.value
                                ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-2 ring-rail-blue/30 shadow-sm'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {opt.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  </motion.div>
                  )}

                  {customizerTab === 'content' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  {/* Section Toggles */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-rail-blue uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center gap-2">
                      <Info size={14} /> Optional Form Sections & Signatures
                    </h4>

                    <ToggleSwitch
                      label="Equipment Identification Table"
                      description="Include category & sub-category item mappings"
                      disabledNote={`Always shown in the ${activeHeaderStyleLabel} layout`}
                      checked={pdfConfig.showEquipment}
                      disabled={isSettingUnsupported('showEquipment')}
                      onChange={(v) => setPdfConfig(c => ({ ...c, showEquipment: v }))}
                    />

                    <ToggleSwitch
                      label="Logbook Owner Header Details"
                      description="Add your name, RIW ID & job title to the header"
                      disabledNote={`Not used by the ${activeHeaderStyleLabel} layout`}
                      checked={pdfConfig.showCertificationDetails}
                      disabled={isSettingUnsupported('showCertificationDetails')}
                      onChange={(v) => setPdfConfig(c => ({ ...c, showCertificationDetails: v }))}
                    />

                    <ToggleSwitch
                      label="Technician Sign-Off Box"
                      description="Include a self-certification signature line below the description"
                      disabledNote={`Not used by the ${activeHeaderStyleLabel} layout`}
                      checked={pdfConfig.showOwnerSignature}
                      disabled={isSettingUnsupported('showOwnerSignature')}
                      onChange={(v) => setPdfConfig(c => ({ ...c, showOwnerSignature: v }))}
                    />

                    <ToggleSwitch
                      label="Page Numbers"
                      description="Add sequential page numbers to the document footer"
                      checked={pdfConfig.showPageNumbers}
                      onChange={(v) => setPdfConfig(c => ({ ...c, showPageNumbers: v }))}
                    />

                    <ToggleSwitch
                      label="Supervisor Verification Panel"
                      description="Include a supervisor sign-off block with name, RIW ID, signature & date"
                      checked={pdfConfig.showSupervisor}
                      onChange={(v) => setPdfConfig(c => ({ ...c, showSupervisor: v }))}
                    />

                    <AnimatePresence>
                      {pdfConfig.showSupervisor && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-4 pl-4 border-l-2 border-rail-blue/20 overflow-hidden pt-2"
                        >
                          <ToggleSwitch
                            label="Supervisor Comments / Observations"
                            description="Print the supervisor's comments (or observations, on Condensed Table) on the export"
                            disabledNote={`Always shown in the ${activeHeaderStyleLabel} layout`}
                            checked={pdfConfig.showSupervisorComments !== false}
                            disabled={isSettingUnsupported('showSupervisorComments')}
                            onChange={(v) => setPdfConfig(c => ({ ...c, showSupervisorComments: v }))}
                          />

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Panel Title</label>
                            <input
                              type="text"
                              value={pdfConfig.supervisorTitle}
                              onChange={(e) => setPdfConfig(c => ({ ...c, supervisorTitle: e.target.value }))}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs outline-none focus:ring-4 focus:ring-rail-blue/5 focus:border-rail-blue transition"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Declaration Text</label>
                            <textarea
                              rows={2}
                              value={pdfConfig.supervisorDeclaration}
                              onChange={(e) => setPdfConfig(c => ({ ...c, supervisorDeclaration: e.target.value }))}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs outline-none focus:ring-4 focus:ring-rail-blue/5 focus:border-rail-blue transition resize-none"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Custom Audit Footnotes Reference Codes input */}
                    <div className="space-y-1.5 pt-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Info size={12} /> Footer Note
                      </label>
                      <input
                        type="text"
                        value={pdfConfig.customFooterNote}
                        onChange={(e) => setPdfConfig(c => ({ ...c, customFooterNote: e.target.value }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs outline-none focus:ring-4 focus:ring-rail-blue/5 focus:border-rail-blue transition"
                        placeholder="e.g. Reference Signal Interlocking Code AS7637 / Approved RTO 109"
                      />
                      <p className="text-[10px] text-gray-400">Shown on every page footer — handy for audit references or approved RTO/compliance codes.</p>
                    </div>
                  </div>
                  </motion.div>
                  )}
                </div>

                {/* Live Mockup/Preview (Right panel) */}
                <div className="lg:col-span-6 flex flex-col h-full lg:overflow-hidden">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase tracking-wider">
                      <Eye size={14} className="text-rail-blue" /> Quick Preview
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-rail-blue/10 text-rail-blue px-2.5 py-0.5 rounded-full font-mono uppercase font-bold">A4 Page Representation</span>
                      <button
                        type="button"
                        onClick={handlePreviewRealPdf}
                        disabled={isGeneratingPreview}
                        className="flex items-center gap-1.5 bg-rail-blue text-white px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-opacity-90 transition disabled:opacity-60"
                        title="Generate the exact PDF these settings will produce, using a sample entry"
                      >
                        {isGeneratingPreview ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
                        Preview Real PDF
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-400 leading-relaxed mb-2 flex items-start gap-1.5">
                    <Info size={11} className="shrink-0 mt-0.5" />
                    <span>The canvas below is a fast, approximate sketch for quick tweaking — it can differ slightly from the real PDF. Click <strong className="text-gray-500">Preview Real PDF</strong> above to generate the exact file (using a sample entry) before saving.</span>
                  </p>

                  {previewError && (
                    <p className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2 flex items-start gap-1.5">
                      <AlertTriangle size={11} className="shrink-0 mt-0.5" /> {previewError}
                    </p>
                  )}
                  
                  <div className="flex-1 bg-gray-100 rounded-2xl border border-gray-200/60 shadow-inner relative flex flex-col min-h-[300px] lg:min-h-0 overflow-hidden">
                    {/* Zoom Slider Control */}
                    <div 
                      className="absolute top-3 right-3 z-20 bg-white/90 backdrop-blur-sm border border-gray-200/80 rounded-xl px-3 py-1.5 shadow-sm flex items-center gap-2 text-[10px] font-bold text-gray-600 select-none"
                      data-no-pan="true"
                    >
                      <span className="text-gray-500 font-semibold">Zoom:</span>
                      <input 
                        type="range" 
                        min="0.5" 
                        max="2.0" 
                        step="0.05" 
                        value={zoomLevel} 
                        onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                        aria-label="Zoom preview canvas"
                        className="w-16 accent-rail-blue cursor-pointer h-1 rounded-lg bg-gray-200 appearance-none"
                      />
                      <span className="font-mono text-gray-700 w-8 text-right">{Math.round(zoomLevel * 100)}%</span>
                      {zoomLevel !== 1 && (
                        <button 
                          onClick={() => setZoomLevel(1)} 
                          className="text-gray-400 hover:text-rail-blue transition ml-0.5 cursor-pointer"
                          title="Reset Zoom"
                          aria-label="Reset zoom to 100%"
                        >
                          <RotateCcw size={10} />
                        </button>
                      )}
                    </div>

                    <div 
                      ref={canvasContainerRef}
                      onMouseDown={handleMouseDown}
                      onTouchStart={handleTouchStart}
                      className={`flex-1 overflow-auto w-full h-full min-h-0 relative select-none ${
                        isPanning ? 'cursor-grabbing' : 'cursor-grab'
                      }`}
                    >
                      {/* Outer flex container to handle overflow-safe centering */}
                      <div className="min-w-full min-h-full flex p-6">
                        {/* Scaled wrapper representing actual DOM layout size with m-auto */}
                        <div 
                          className="m-auto relative flex-shrink-0 transition-all duration-150"
                          style={{
                            width: pdfConfig.pageOrientation === 'landscape' ? `${594 * zoomLevel}px` : `${420 * zoomLevel}px`,
                            height: pdfConfig.pageOrientation === 'landscape' ? `${420 * zoomLevel}px` : `${594 * zoomLevel}px`,
                          }}
                        >
                          {/* Visual A4 paper rendering */}
                          <div 
                            id="live-mockup-page"
                            className={`bg-white rounded-lg shadow-xl border border-gray-200/80 flex flex-col justify-between absolute top-0 left-0 shadow-indigo-100/40 select-none origin-top-left
                              ${pdfConfig.fontFamily === 'times' ? 'font-serif' : pdfConfig.fontFamily === 'courier' ? 'font-mono' : 'font-sans'}
                            `}
                            style={{
                              width: pdfConfig.pageOrientation === 'landscape' ? '594px' : '420px',
                              height: pdfConfig.pageOrientation === 'landscape' ? '420px' : '594px',
                              transform: `scale(${zoomLevel})`,
                              padding: pdfConfig.marginSize === 'narrow' ? '12px' : pdfConfig.marginSize === 'wide' ? '28px' : '20px',
                              ...fs(7)
                            }}
                          >
                            {resolvedHeaderStyle === 'condensed-table' ? (
                              <div className="flex flex-col justify-between h-full font-sans overflow-hidden leading-tight text-slate-800">
                                <div className="space-y-1.5">
                                  <div className="flex gap-2.5 mb-1 pl-2.5 border-l-4 text-left py-0.5" style={{ borderLeftColor: pdfConfig.accentColor || '#003057' }}>
                                    <div className="flex-1 min-w-0">
                                      <span className="font-extrabold tracking-tight block" style={{ color: pdfConfig.accentColor || '#003057', ...fs(9) }}>
                                        {pdfConfig.title || 'SIGNALLING LOGBOOK'}
                                      </span>
                                      <span className="text-gray-400 block tracking-widest font-medium leading-none mt-0.5" style={fs(5)}>
                                        Sample Rail Services
                                      </span>
                                    </div>
                                    <div className="text-right leading-none shrink-0 font-mono" style={fs(6)}>
                                      <span className="font-bold" style={{ color: pdfConfig.accentColor || '#003057' }}>LOG #: LOG-0125</span>
                                    </div>
                                  </div>

                                  <div className="flex justify-between gap-2 bg-slate-50 border border-slate-200 px-2 py-1 font-semibold" style={fs(4)}>
                                    <span style={{ color: pdfConfig.accentColor || '#003057' }}>Work Experience Record Period: Q2: 17/09/2026 – 17/09/2026</span>
                                    <span>Name: {profile?.displayName?.toUpperCase() || 'MATTHEW WARD'}</span>
                                    <span>RIW: {profile?.employeeId || '20-00069775'}</span>
                                  </div>

                                  <div className="border border-slate-200 overflow-hidden" style={fs(3.8)}>
                                    <div className="grid grid-cols-12 bg-slate-100 font-extrabold text-center border-b border-slate-200" style={{ color: pdfConfig.accentColor || '#003057' }}>
                                      <div className="col-span-2 border-r border-slate-200 p-0.5">Dates<br/><span className="font-normal text-slate-400" style={fs(3.2)}>(From/To)</span></div>
                                      <div className="col-span-2 border-r border-slate-200 p-0.5">Employer/Client and<br/><span className="font-normal text-slate-400" style={fs(3.2)}>Infrastructure Owner</span></div>
                                      <div className="col-span-3 border-r border-slate-200 p-0.5 text-left">Description of Task</div>
                                      <div className="col-span-1 border-r border-slate-200 p-0.5 flex items-center justify-center">Ref</div>
                                      <div className="col-span-2 border-r border-slate-200 p-0.5 text-left flex items-center">Equipment or System Types</div>
                                      <div className="col-span-1 border-r border-slate-200 p-0.5">Verification Signature<br/><span className="font-normal text-slate-400" style={fs(3)}>(Name &amp; ID)</span></div>
                                      {pdfConfig.showSupervisorComments !== false && (
                                        <div className="col-span-1 p-0.5">Supervisor Observations<br/><span className="font-normal text-slate-400" style={fs(3)}>(Assessment)</span></div>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-12 bg-white text-slate-700">
                                      <div className="col-span-2 border-r border-slate-200 p-1 font-semibold space-y-0.5">
                                        <div>17/09/2026 – 17/09/2026</div>
                                        <div className="text-slate-500">Final Commissioning date: 17/09/2026</div>
                                      </div>
                                      <div className="col-span-2 border-r border-slate-200 p-1 space-y-0.5">
                                        <div><strong className="text-slate-500">Employer:</strong><br/>Sample Rail Services</div>
                                        <div><strong className="text-slate-500">Client:</strong><br/>Transport for Tomorrow</div>
                                        <div><strong className="text-slate-500">Infrastructure Owner:</strong><br/>Sydney Trains</div>
                                      </div>
                                      <div className="col-span-3 border-r border-slate-200 p-1 space-y-0.5">
                                        <div><strong>Role:</strong> Signal Electrician</div>
                                        <div><strong>Location:</strong> Enfield Hub</div>
                                        <div><strong>Project:</strong> Enfield Remodelling</div>
                                        <p className="text-slate-500 mt-0.5">
                                          Tested signal interlocking mechanism at Location A. Verified contact pressure, relays, and power supply.
                                        </p>
                                      </div>
                                      <div className="col-span-1 border-r border-slate-200 p-1 text-center font-bold" style={fs(4.5)}>
                                        LOG-0125
                                      </div>
                                      <div className="col-span-2 border-r border-slate-200 p-1 space-y-0.5">
                                        <div><strong>Signal Relay:</strong> Q-Style, Miniature Bi-Bias</div>
                                        <div><strong>Points:</strong> EP Clamplock</div>
                                      </div>
                                      <div className="col-span-1 border-r border-slate-200 p-1 space-y-0.5">
                                        <div className="font-bold text-slate-900">David Miller</div>
                                        <div className="font-mono text-slate-500">8839210</div>
                                      </div>
                                      {pdfConfig.showSupervisorComments !== false && (
                                        <div className="col-span-1 p-1 text-slate-600">
                                          Work reviewed and verified on site — no outstanding issues.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-auto flex justify-between items-center text-gray-400 pt-1 border-t border-gray-100 font-mono" style={fs(4)}>
                                  <span className="truncate max-w-[70%]">{pdfConfig.customFooterNote || APP_NAME}</span>
                                  {pdfConfig.showPageNumbers !== false ? (
                                    <span>Page 1 of 1</span>
                                  ) : (
                                    <span className="opacity-0">No Numbering</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* Document Header Section */}
                      <div className={`text-left ${pdfConfig.layoutSpacing === 'compressed' ? 'space-y-1' : 'space-y-2'}`}>
                        {/* Dynamic Header Styles */}
                        {pdfConfig.headerStyle === 'executive-pro' ? (
                          // Executive Modern Pro Header
                          <div className="bg-slate-800 text-white p-2.5 rounded-t-lg mb-2 shadow-xs border-b-2 flex justify-between items-center" style={{ borderBottomColor: pdfConfig.accentColor || '#d97706' }}>
                            <div>
                              <span className="font-extrabold tracking-tight block text-white" style={fs(9.5)}>
                                {pdfConfig.title || 'Signalling Logbook'}
                              </span>
                              <span className="text-slate-300 block tracking-wider leading-none mt-0.5 uppercase font-medium" style={fs(4.5)}>
                                {pdfConfig.subtitle || 'PROFESSIONAL DIGITAL SIGNALLING RECORD'}
                              </span>
                            </div>
                            <div className="text-right leading-none shrink-0" style={fs(5.5)}>
                              <span className="text-slate-400 block tracking-widest font-semibold uppercase" style={fs(3.8)}>LOG REFERENCE</span>
                              <span className="font-bold block text-white font-mono mt-0.5" style={fs(6.5)}>MWard-FY2425-LOG-1</span>
                              <span className="text-slate-300 block mt-0.5" style={fs(4)}>Printed 29/07/2026 21:42</span>
                            </div>
                          </div>
                        ) : pdfConfig.headerStyle === 'solid-banner' ? (
                          // Solid Banner Style
                          <div className="p-2 rounded-lg text-white mb-2 shadow-sm flex justify-between items-center" style={{ backgroundColor: pdfConfig.accentColor || '#003057' }}>
                            <div>
                              <span className="font-extrabold tracking-tight block uppercase text-white" style={fs(9)}>
                                {pdfConfig.title || 'SIGNALLING LOGBOOK'}
                              </span>
                              <span className="opacity-80 block tracking-wider leading-none mt-0.5 uppercase" style={fs(4.5)}>
                                {pdfConfig.subtitle || 'PROFESSIONAL DIGITAL SIGNALLING RECORD'}
                              </span>
                            </div>
                            <div className="text-right leading-none shrink-0 font-mono" style={fs(6)}>
                              <span className="font-bold block text-white/90">LOG #: LOG-00125</span>
                              <span className="opacity-70 block mt-0.5" style={fs(4)}>25/05/2026</span>
                            </div>
                          </div>
                        ) : pdfConfig.headerStyle === 'bold-left' ? (
                          // Bold Left Style
                          <div className="flex gap-2.5 mb-2 pl-2.5 border-l-4 text-left py-0.5" style={{ borderLeftColor: pdfConfig.accentColor || '#003057' }}>
                            <div className="flex-1">
                              <span className="font-extrabold tracking-tight block" style={{ color: pdfConfig.accentColor || '#003057', ...fs(9) }}>
                                {pdfConfig.title || 'SIGNALLING LOGBOOK'}
                              </span>
                              <span className="text-gray-400 block tracking-widest font-medium leading-none mt-0.5" style={fs(5)}>
                                {pdfConfig.subtitle || 'PROFESSIONAL DIGITAL SIGNALLING RECORD'}
                              </span>
                            </div>
                            <div className="text-right leading-none shrink-0 font-mono self-neutral-center" style={fs(6)}>
                              <span className="font-bold" style={{ color: pdfConfig.accentColor || '#003057' }}>LOG #: LOG-00125</span>
                              <span className="block text-gray-400 mt-1" style={fs(4)}>25/05/2026</span>
                            </div>
                          </div>
                        ) : (
                          // Default Accent Lines Layout
                          <>
                            <div className="h-0.5 rounded-sm mb-1.5" style={{ backgroundColor: pdfConfig.accentColor || '#003057' }} />
                            <div className="flex justify-between items-start">
                              <div className="text-left">
                                <span className="font-extrabold tracking-tight block" style={{ color: pdfConfig.accentColor || '#003057', ...fs(9) }}>
                                  {pdfConfig.title || 'SIGNALLING LOGBOOK'}
                                </span>
                                <span className="text-gray-400 block tracking-widest font-mono font-medium leading-none mt-0.5" style={fs(5)}>
                                  {pdfConfig.subtitle || 'PROFESSIONAL DIGITAL SIGNALLING RECORD'}
                                </span>
                              </div>
                              <div className="text-right leading-none">
                                <span className="font-bold font-mono" style={{ color: pdfConfig.accentColor || '#003057', ...fs(7) }}>LOG #: LOG-00125</span>
                                <span className="block text-gray-400 mt-1 uppercase font-mono" style={fs(4)}>PRINTED: 25/05/2026</span>
                              </div>
                            </div>
                            <div className="h-[0.5px] bg-gray-100 my-1.5" />
                          </>
                        )}

                        {/* Unified Executive Summary Card in settings preview */}
                        <div className={`text-left ${pdfConfig.layoutSpacing === 'compressed' ? 'space-y-1' : 'space-y-1.5'}`}>
                          <div className="border border-slate-200 rounded overflow-hidden shadow-xs bg-white text-left" style={fs(4.5)}>
                            <div className="bg-slate-100 px-1.5 py-1 border-b border-slate-200 font-extrabold flex justify-between items-center" style={{ color: pdfConfig.accentColor || '#003057' }}>
                              <span>LOG DETAILS & PERSONNEL RECORD</span>
                              <span className="text-emerald-600 font-mono text-[8px]">Certified & Recorded</span>
                            </div>
                            <div className="p-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 font-sans leading-tight text-slate-700">
                              <div className="col-span-2 border-b border-slate-100 pb-0.5 mb-0.5 flex justify-between">
                                <span className="font-bold text-slate-500">Name: <strong style={{ color: pdfConfig.accentColor || '#003057' }}>{profile?.displayName?.toUpperCase() || 'MATT W'} (ID: {profile?.employeeId || '100123'})</strong></span>
                                <span className="text-slate-500">Role: <strong className="text-slate-800">{profile?.jobTitle || 'Signal Engineer'}</strong></span>
                              </div>
                              <div><strong className="text-slate-500">Date Range:</strong> 25/05/2026 to 25/05/2026</div>
                              <div><strong className="text-slate-500">Employer:</strong> Sample Rail Services</div>
                              <div><strong className="text-slate-500">FY Quarter:</strong> FY25/26 Q2</div>
                              <div><strong className="text-slate-500">Client:</strong> Transport for Tomorrow</div>
                              <div><strong className="text-slate-500">Location:</strong> Enfield Hub</div>
                              <div><strong className="text-slate-500">Project:</strong> Enfield Remodelling</div>
                              <div><strong className="text-slate-500">Work Type:</strong> Commissioning</div>
                              <div><strong className="text-slate-500">Asset Owner:</strong> Sydney Trains</div>
                            </div>
                          </div>

                          {/* Dummy Work Description */}
                          <div className={`text-left ${pdfConfig.layoutSpacing === 'compressed' ? 'space-y-0.5 mt-1' : 'space-y-1 mt-1.5'}`}>
                            <div className="flex items-center gap-1">
                              <div className="w-1 h-3 rounded-full shrink-0" style={{ backgroundColor: pdfConfig.accentColor || '#003057' }} />
                              <span className="font-extrabold text-slate-800 uppercase tracking-tight block" style={fs(5.5)}>WORK DESCRIPTION & ACTIVITIES</span>
                            </div>
                            <p className="text-slate-600 leading-tight pl-2" style={fs(4.8)}>
                              Tested signal interlocking mechanism at Location A. Verified contact pressure, relays, and power supply. Certified all signals are functioning as safe and reliable.
                            </p>
                          </div>

                          {/* Optional Equipment Table */}
                          {pdfConfig.showEquipment && (
                            <div className={`text-left ${pdfConfig.layoutSpacing === 'compressed' ? 'space-y-0.5 mt-1' : 'space-y-1 mt-1.5'}`}>
                              <div className="flex items-center gap-1">
                                <div className="w-1 h-3 rounded-full shrink-0" style={{ backgroundColor: pdfConfig.accentColor || '#003057' }} />
                                <span className="font-extrabold text-slate-800 uppercase tracking-tight block" style={fs(5.5)}>EQUIPMENT & SYSTEM IDENTIFICATION</span>
                              </div>
                              <div className="border border-slate-200 rounded overflow-hidden" style={fs(4.2)}>
                                <div className="bg-slate-100 font-extrabold p-1 grid grid-cols-2 border-b border-slate-200" style={{ color: pdfConfig.accentColor || '#003057' }}>
                                  <span>Category</span>
                                  <span>Sub-categories</span>
                                </div>
                                <div className="p-1 grid grid-cols-2 bg-white text-slate-700">
                                  <span className="font-medium">Signal Relay</span>
                                  <span className="font-mono">Q-Style, Miniature Bi-bias</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Technician/Owner Custom Signature Section */}
                          {pdfConfig.showOwnerSignature && (
                            <div className={`border border-slate-200 rounded p-1 space-y-0.5 text-left bg-white ${pdfConfig.layoutSpacing === 'compressed' ? 'mt-1' : 'mt-1.5'}`}>
                              <div className="font-extrabold text-slate-700 bg-slate-50 -m-1 p-1 border-b border-slate-100 flex justify-between" style={{ color: pdfConfig.accentColor || '#003057', ...fs(4.5) }}>
                                <span>SIGN-OFF DECLARATION</span>
                              </div>
                              <div className="text-slate-500 pt-1" style={fs(4)}>
                                I hereby certify that the work entered above is a true and accurate record of the tasks undertaken.
                              </div>
                              <div className="flex justify-between pt-1 font-medium text-slate-700" style={fs(4.2)}>
                                <span>Signature: _______________________</span>
                                <span>Date: ____/____/________</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Optional Supervisor Box at the bottom */}
                        <div className="space-y-1 mt-1">
                          {pdfConfig.showSupervisor && (
                            <div className="border border-slate-200 rounded text-slate-600 overflow-hidden bg-white text-left shadow-xs" style={fs(4.5)}>
                              <div className="bg-slate-100 px-1.5 py-0.5 border-b border-slate-200 font-extrabold" style={{ color: pdfConfig.accentColor || '#003057', ...fs(4.5) }}>
                                {pdfConfig.supervisorTitle || 'SUPERVISOR VERIFICATION & COMMENTS'}
                              </div>
                              
                              <div className={`p-1.5 leading-tight ${pdfConfig.layoutSpacing === 'compressed' ? 'space-y-0.5' : 'space-y-1'}`} style={fs(4.2)}>
                                {pdfConfig.showSupervisorComments !== false && (
                                  <div className={`select-none ${pdfConfig.layoutSpacing === 'compressed' ? 'space-y-0.5 pb-0.5' : 'space-y-1 pb-1'}`}>
                                    <div className="flex gap-2 items-center text-slate-400" style={fs(4)}>
                                      <span className="shrink-0 font-bold">Supervisor Comments:</span>
                                      <div className="flex-1 border-b border-slate-200 h-[6px]" />
                                    </div>
                                    <div className="border-b border-slate-200 h-[6px] w-full" />
                                  </div>
                                )}
                                <div className="flex gap-4">
                                  <span className="flex-1 border-b border-slate-200 h-2">Supervisor Name: <strong className="text-slate-900">David Miller</strong></span>
                                  <span className="w-24 border-b border-slate-200 h-2">RIW ID: <strong className="text-slate-900">8839210</strong></span>
                                </div>
                                <div className="flex gap-4">
                                  <span className="flex-1 border-b border-slate-200 h-2">Signature:</span>
                                  <span className="w-24 border-b border-slate-200 h-2">Date:</span>
                                </div>
                                <p className="text-slate-400 italic leading-tight mt-0.5 pt-0.5 border-t border-slate-50" style={fs(3.8)}>
                                  {pdfConfig.supervisorDeclaration || 'I verify that the work described was performed safely and to industry standards.'}
                                </p>
                              </div>
                            </div>
                          )}

                        {/* Document Footer (with dynamic Page Numbering & Footer Note) */}
                        <div className="flex justify-between items-center text-gray-400 pt-1 border-t border-gray-50 font-mono" style={fs(4)}>
                          <span className="truncate max-w-[70%]">
                            {pdfConfig.customFooterNote || APP_NAME}
                          </span>
                          {pdfConfig.showPageNumbers !== false ? (
                            <span>Page 1 of 1</span>
                          ) : (
                            <span className="opacity-0">No Numbering</span>
                          )}
                        </div>
                      </div>
                      </div>
                      </>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

              {/* Action Buttons */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between relative">
                <AnimatePresence>
                  {showResetConfirm && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute bottom-full left-6 mb-2 bg-white border border-amber-200 shadow-xl rounded-xl p-3 w-72 z-20 text-left"
                    >
                      <p className="text-xs font-bold text-gray-800 mb-1">Reset all customisation?</p>
                      <p className="text-[10px] text-gray-500 mb-3">This clears every field on this form — including custom wording — back to the default template. It cannot be undone (unless you Cancel without saving).</p>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowResetConfirm(false)}
                          className="px-3 py-1.5 text-[11px] font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition"
                        >
                          Keep Current
                        </button>
                        <button
                          type="button"
                          onClick={handleResetPdfConfig}
                          className="px-3 py-1.5 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition"
                        >
                          Reset Everything
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-1.5 px-4 py-2 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition select-none disabled:opacity-50"
                  id="reset-customizer-btn"
                >
                  <RotateCcw size={14} />
                  Reset Defaults
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={requestCloseCustomizer}
                    className="px-4 py-2 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 rounded-xl text-xs font-bold transition select-none"
                    id="cancel-customizer-btn"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSavingPdfConfig || !isDirty}
                    onClick={handleSavePdfConfig}
                    className="bg-rail-blue text-white hover:bg-opacity-90 px-6 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition select-none disabled:opacity-50"
                    id="save-customizer-btn"
                    title={!isDirty ? 'No changes to save yet' : undefined}
                  >
                    {isSavingPdfConfig ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Customisation
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Account Deletion Confirmation Modal */}
      <AnimatePresence>
        {isConfirmingDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 space-y-6 text-left"
            >
              <div className="flex items-start gap-4">
                <div className="bg-red-50 text-red-600 p-3 rounded-xl shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Are you absolutely sure?</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    This will permanently delete your profile and purge all log entries from the database. There is no way to recover this data.
                  </p>
                </div>
              </div>

              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-mono">
                  {deleteError}
                </div>
              )}

              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-700">
                  To confirm, type <span className="font-mono bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-100 font-bold">DELETE MY DATA</span> below:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE MY DATA"
                  disabled={deletingState !== 'idle'}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-red-500/5 focus:border-red-500 transition font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingDelete(false);
                    setDeleteConfirmText('');
                    setDeleteError(null);
                    setDeletingState('idle');
                  }}
                  disabled={deletingState !== 'idle'}
                  className="px-4 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-xs font-bold transition select-none disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE MY DATA' || deletingState !== 'idle'}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition select-none disabled:opacity-50 cursor-pointer"
                >
                  {deletingState !== 'idle' ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {deletingState === 'deleting-logs' && 'Purging Logs...'}
                      {deletingState === 'deleting-profile' && 'Deleting Profile...'}
                      {deletingState === 'cleaning-up' && 'Cleaning Up...'}
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      Permanently Delete
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileInput({ label, icon, value, onChange, placeholder, disabled }: any) {
  return (
    <div className="space-y-1.5 flex-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative">
        <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${disabled ? 'text-gray-300' : 'text-gray-400'}`}>
          {icon}
        </div>
        <input
          type="text"
          value={disabled ? 'N/A' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full border rounded-xl pl-11 pr-4 py-3 outline-none transition ${
            disabled 
              ? 'bg-gray-100/80 border-gray-200 text-gray-400 cursor-not-allowed opacity-60 grayscale' 
              : 'bg-gray-50/50 border-gray-200 text-gray-800 focus:ring-4 focus:ring-rail-blue/5 focus:border-rail-blue'
          }`}
        />
      </div>
    </div>
  );
}
