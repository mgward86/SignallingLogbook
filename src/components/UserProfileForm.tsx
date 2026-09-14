import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Settings, BadgeCheck, MapPin, Briefcase, Mail, Save, Loader2, Sparkles, Settings2, ShieldCheck, Info, X, Palette, Eye, RotateCcw, Check, Trash2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, writeBatch, doc, deleteDoc } from 'firebase/firestore';

export function UserProfileForm() {
  const { user, profile, updateProfile, logOut } = useAuth();
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

  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [isSavingPdfConfig, setIsSavingPdfConfig] = useState(false);
  const [pdfConfig, setPdfConfig] = useState({
    title: profile?.pdfConfig?.title || 'SIGNALLING LOGBOOK',
    subtitle: profile?.pdfConfig?.subtitle || 'PROFESSIONAL DIGITAL SIGNALLING RECORD',
    accentColor: profile?.pdfConfig?.accentColor || '#003057',
    showSupervisor: profile?.pdfConfig?.showSupervisor !== false,
    supervisorTitle: profile?.pdfConfig?.supervisorTitle || 'SUPERVISOR VERIFICATION & COMMENTS',
    supervisorDeclaration: profile?.pdfConfig?.supervisorDeclaration || 'I verify that the work described was performed safely and to industry standards.',
    showEquipment: profile?.pdfConfig?.showEquipment !== false,
    showCertificationDetails: profile?.pdfConfig?.showCertificationDetails !== false,
    pageOrientation: profile?.pdfConfig?.pageOrientation || 'portrait',
    marginSize: profile?.pdfConfig?.marginSize || 'standard',
    fontFamily: profile?.pdfConfig?.fontFamily || 'helvetica',
    fontSizeModifier: profile?.pdfConfig?.fontSizeModifier || 'md',
    headerStyle: profile?.pdfConfig?.headerStyle || 'accent-lines',
    layoutSpacing: profile?.pdfConfig?.layoutSpacing || 'relaxed',
    showOwnerSignature: profile?.pdfConfig?.showOwnerSignature || false,
    showPageNumbers: profile?.pdfConfig?.showPageNumbers !== false,
    customFooterNote: profile?.pdfConfig?.customFooterNote || '',
    showSupervisorComments: profile?.pdfConfig?.showSupervisorComments !== false
  });

  const fontScale = pdfConfig.fontSizeModifier === 'sm' ? 0.9 : (pdfConfig.fontSizeModifier === 'lg' ? 1.1 : 1.0);
  const fs = (px: number) => ({ fontSize: `${(px * fontScale).toFixed(2)}px` });

  // Track profile changes to update pdfConfig on load or auth changes
  useEffect(() => {
    if (profile?.pdfConfig) {
      setPdfConfig({
        title: profile.pdfConfig.title || 'SIGNALLING LOGBOOK',
        subtitle: profile.pdfConfig.subtitle || 'PROFESSIONAL DIGITAL SIGNALLING RECORD',
        accentColor: profile.pdfConfig.accentColor || '#003057',
        showSupervisor: profile.pdfConfig.showSupervisor !== false,
        supervisorTitle: profile.pdfConfig.supervisorTitle || 'SUPERVISOR VERIFICATION & COMMENTS',
        supervisorDeclaration: profile.pdfConfig.supervisorDeclaration || 'I verify that the work described was performed safely and to industry standards.',
        showEquipment: profile.pdfConfig.showEquipment !== false,
        showCertificationDetails: profile.pdfConfig.showCertificationDetails !== false,
        pageOrientation: profile.pdfConfig.pageOrientation || 'portrait',
        marginSize: profile.pdfConfig.marginSize || 'standard',
        fontFamily: profile.pdfConfig.fontFamily || 'helvetica',
        fontSizeModifier: profile.pdfConfig.fontSizeModifier || 'md',
        headerStyle: profile.pdfConfig.headerStyle || 'accent-lines',
        layoutSpacing: profile.pdfConfig.layoutSpacing || 'relaxed',
        showOwnerSignature: profile.pdfConfig.showOwnerSignature || false,
        showPageNumbers: profile.pdfConfig.showPageNumbers !== false,
        customFooterNote: profile.pdfConfig.customFooterNote || '',
        showSupervisorComments: profile.pdfConfig.showSupervisorComments !== false
      });
    }
  }, [profile?.pdfConfig]);

  const handleSavePdfConfig = async () => {
    setIsSavingPdfConfig(true);
    try {
      await updateProfile({ pdfConfig });
      setIsCustomizerOpen(false);
    } catch (error) {
      console.error('Failed to save PDF custom settings: ', error);
    } finally {
      setIsSavingPdfConfig(false);
    }
  };

  const handleResetPdfConfig = () => {
    setPdfConfig({
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
    });
  };

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
          onClick={() => setIsCustomizerOpen(true)}
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
              onClick={() => setIsCustomizerOpen(false)}
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
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3 text-left">
                  <div className="bg-rail-blue p-2 rounded-lg text-white">
                    <Palette size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">Customise PDF Export Template</h3>
                    <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">Document Designer Window</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCustomizerOpen(false)}
                  className="p-1.5 hover:bg-gray-200 text-gray-400 hover:text-gray-600 rounded-lg transition"
                  type="button"
                  id="close-customizer-btn"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Main Content Area: Left Controls & Right Real-Time Mockup */}
              <div className="flex-1 overflow-y-auto lg:overflow-hidden min-h-0 p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
                {/* Form Controls (Left panel) */}
                <div className="lg:col-span-6 space-y-6 lg:h-full lg:overflow-y-auto lg:pl-2 lg:pr-2">
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
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-4 focus:ring-rail-blue/5 focus:border-rail-blue transition font-mono"
                            placeholder="#003057"
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-gray-200 shadow-sm" style={{ backgroundColor: pdfConfig.accentColor || '#000' }} />
                        </div>
                      </div>
                      <div className="space-y-1 shrink-0">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block text-center">Picker</label>
                        <input
                          type="color"
                          value={pdfConfig.accentColor.startsWith('#') && pdfConfig.accentColor.length === 7 ? pdfConfig.accentColor : '#003057'}
                          onChange={(e) => setPdfConfig(c => ({ ...c, accentColor: e.target.value }))}
                          className="w-12 h-10 bg-gray-50 border border-gray-200 rounded-xl p-1 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Page Setup & Typography Layout Controls */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-rail-blue uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center gap-2">
                      <Settings2 size={14} /> Page Setup & Typography
                    </h4>

                    {/* Layout Spacing (Relaxed vs Compressed) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Layout Spacing Mode</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPdfConfig(c => ({ ...c, layoutSpacing: 'relaxed' }))}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                            pdfConfig.layoutSpacing === 'relaxed' || !pdfConfig.layoutSpacing
                              ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-1 ring-rail-blue'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          Relaxed Formatting
                        </button>
                        <button
                          type="button"
                          onClick={() => setPdfConfig(c => ({ ...c, layoutSpacing: 'compressed' }))}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                            pdfConfig.layoutSpacing === 'compressed'
                              ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-1 ring-rail-blue'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          Compressed Formatting
                        </button>
                      </div>
                    </div>

                    {/* Page Orientation */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Page Layout Orientation</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPdfConfig(c => ({ ...c, pageOrientation: 'portrait' }))}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                            pdfConfig.pageOrientation === 'portrait'
                              ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-1 ring-rail-blue'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          Portrait Layout
                        </button>
                        <button
                          type="button"
                          onClick={() => setPdfConfig(c => ({ ...c, pageOrientation: 'landscape' }))}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                            pdfConfig.pageOrientation === 'landscape'
                              ? 'border-rail-blue bg-rail-blue/5 text-rail-blue ring-1 ring-rail-blue'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          Landscape Layout
                        </button>
                      </div>
                    </div>

                    {/* Margin Size selection */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Document Margin Width</label>
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
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Document Font Typeface</label>
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
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Global Font Scaling Scale</label>
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

                    {/* Header Layout Styles */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Header &amp; Layout Style Variant</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                        {[
                          { value: 'executive-pro', name: 'Executive Modern Pro' },
                          { value: 'accent-lines', name: 'Accent Lines' },
                          { value: 'solid-banner', name: 'Solid Banner' },
                          { value: 'bold-left', name: 'Left Accent Border' },
                          { value: 'jmdr-grid', name: 'Competency Grid (JMDR)' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPdfConfig(c => ({
                              ...c,
                              headerStyle: opt.value as any,
                              ...(opt.value === 'jmdr-grid' ? { pageOrientation: 'landscape' } : {})
                            }))}
                            className={`py-2 px-1 rounded-xl border text-[11px] font-bold transition text-center cursor-pointer ${
                              pdfConfig.headerStyle === opt.value
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

                  {/* Section Toggles */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-rail-blue uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center gap-2">
                      <Info size={14} /> Optional Form Sections & Signatures
                    </h4>

                    {/* Show Equipment Table */}
                    <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                      <div>
                        <p className="text-xs font-bold text-gray-800">Equipment Identification Table</p>
                        <p className="text-[10px] text-gray-400 font-medium">Include category & sub-category item mappings</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                        <input
                          type="checkbox"
                          checked={pdfConfig.showEquipment}
                          onChange={(e) => setPdfConfig(c => ({ ...c, showEquipment: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rail-blue"></div>
                      </label>
                    </div>

                    {/* Show Personal Identity Certification Details */}
                    <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                      <div>
                        <p className="text-xs font-bold text-gray-800">Logbook Owner Header Details</p>
                        <p className="text-[10px] text-gray-400 font-medium">Add signature name, RIW ID & certification metrics to header</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                        <input
                          type="checkbox"
                          checked={pdfConfig.showCertificationDetails}
                          onChange={(e) => setPdfConfig(c => ({ ...c, showCertificationDetails: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rail-blue"></div>
                      </label>
                    </div>

                    {/* Show Technician Owner Custom Signature */}
                    <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                      <div>
                        <p className="text-xs font-bold text-gray-800">Self Technician Signature Block</p>
                        <p className="text-[10px] text-gray-400 font-medium">Include technician sign-off box line below description</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                        <input
                          type="checkbox"
                          checked={pdfConfig.showOwnerSignature}
                          onChange={(e) => setPdfConfig(c => ({ ...c, showOwnerSignature: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rail-blue"></div>
                      </label>
                    </div>

                    {/* Show Page Numbers */}
                    <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                      <div>
                        <p className="text-xs font-bold text-gray-800">Automatic Page Numbering</p>
                        <p className="text-[10px] text-gray-400 font-medium">Add sequential page indexing to the document footers</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                        <input
                          type="checkbox"
                          checked={pdfConfig.showPageNumbers}
                          onChange={(e) => setPdfConfig(c => ({ ...c, showPageNumbers: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rail-blue"></div>
                      </label>
                    </div>

                    {/* Show Supervisor Section */}
                    <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100">
                      <div>
                        <p className="text-xs font-bold text-gray-800">Supervisor Verification Panel</p>
                        <p className="text-[10px] text-gray-400 font-medium font-sans">Include signature box lines & custom verification checklists</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                        <input
                          type="checkbox"
                          checked={pdfConfig.showSupervisor}
                          onChange={(e) => setPdfConfig(c => ({ ...c, showSupervisor: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rail-blue"></div>
                      </label>
                    </div>

                    <AnimatePresence>
                      {pdfConfig.showSupervisor && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-4 pl-4 border-l-2 border-rail-blue/20 overflow-hidden pt-2"
                        >
                          {/* Toggle for supervisor comments */}
                          <div className="flex items-center justify-between p-2.5 bg-gray-50/50 rounded-xl border border-gray-100">
                            <div>
                              <p className="text-xs font-bold text-gray-800">Supervisor Comments Space</p>
                              <p className="text-[10px] text-gray-400 font-medium">Include space for supervisor hand-written comments</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                              <input
                                type="checkbox"
                                checked={pdfConfig.showSupervisorComments !== false}
                                onChange={(e) => {
                                  const enabled = e.target.checked;
                                  setPdfConfig(c => {
                                    let newTitle = c.supervisorTitle;
                                    if (!enabled) {
                                      newTitle = newTitle
                                        .replace(/\s*(?:&|and)\s*comments\b/gi, '')
                                        .replace(/\s*-\s*comments\b/gi, '')
                                        .trim();
                                    } else {
                                      if (!/comments/i.test(newTitle)) {
                                        const isAllCaps = newTitle === newTitle.toUpperCase();
                                        newTitle = newTitle + (isAllCaps ? ' & COMMENTS' : ' & Comments');
                                      }
                                    }
                                    return {
                                      ...c,
                                      showSupervisorComments: enabled,
                                      supervisorTitle: newTitle
                                    };
                                  });
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rail-blue"></div>
                            </label>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Verification Header Title</label>
                            <input
                              type="text"
                              value={pdfConfig.supervisorTitle}
                              onChange={(e) => setPdfConfig(c => ({ ...c, supervisorTitle: e.target.value }))}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs outline-none focus:ring-4 focus:ring-rail-blue/5 focus:border-rail-blue transition"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Declaration Text Statement</label>
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
                        <Info size={12} /> Custom Footer Audit Notes / compliance codes
                      </label>
                      <input
                        type="text"
                        value={pdfConfig.customFooterNote}
                        onChange={(e) => setPdfConfig(c => ({ ...c, customFooterNote: e.target.value }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs outline-none focus:ring-4 focus:ring-rail-blue/5 focus:border-rail-blue transition"
                        placeholder="e.g. Reference Signal Interlocking Code AS7637 / Approved RTO 109"
                      />
                    </div>
                  </div>
                </div>

                {/* Live Mockup/Preview (Right panel) */}
                <div className="lg:col-span-6 flex flex-col h-full lg:overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase tracking-wider animate-pulse">
                      <Eye size={14} className="text-rail-blue" /> Live Designer Canvas Mockup
                    </div>
                    <span className="text-[10px] bg-rail-blue/10 text-rail-blue px-2.5 py-0.5 rounded-full font-mono uppercase font-bold">A4 Page Representation</span>
                  </div>
                  
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
                        className="w-16 accent-rail-blue cursor-pointer h-1 rounded-lg bg-gray-200 appearance-none"
                      />
                      <span className="font-mono text-gray-700 w-8 text-right">{Math.round(zoomLevel * 100)}%</span>
                      {zoomLevel !== 1 && (
                        <button 
                          onClick={() => setZoomLevel(1)} 
                          className="text-gray-400 hover:text-rail-blue transition ml-0.5 cursor-pointer"
                          title="Reset Zoom"
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
                            {pdfConfig.headerStyle === 'jmdr-grid' ? (
                              <div className="border border-gray-900 text-gray-900 bg-white text-[4px] leading-tight flex flex-col justify-between h-full font-sans overflow-hidden">
                                {/* Header Grid Box */}
                                <div>
                                  {/* Row 1: Logo | Main Title | Version Box */}
                                  <div className="grid grid-cols-12 border-b border-gray-800 text-center items-stretch font-bold">
                                    <div className="col-span-2 border-r border-gray-800 p-1 flex items-center justify-center bg-amber-100/60 min-h-[22px]">
                                      <span className="text-[7.5px] font-black tracking-wider uppercase" style={{ color: pdfConfig.accentColor || '#003057', ...fs(7.5) }}>
                                        JMDR
                                      </span>
                                    </div>
                                    <div className="col-span-7 border-r border-gray-800 p-1 font-extrabold uppercase tracking-tight flex items-center justify-center min-h-[22px] text-gray-900" style={fs(6.5)}>
                                      {pdfConfig.title || 'SIGNALS COMPETENCY WORK EXPERIENCE RECORD'}
                                    </div>
                                    <div className="col-span-3 text-[3.8px] font-normal leading-tight flex flex-col justify-center">
                                      <div className="border-b border-gray-800 py-0.5 text-center font-medium" style={fs(3.8)}>Version: 1</div>
                                      <div className="py-0.5 text-center font-medium" style={fs(3.8)}>Effective from: 1st February 2018</div>
                                    </div>
                                  </div>

                                  {/* Row 2: Record Period */}
                                  <div className="border-b border-gray-800 px-1.5 py-0.5 flex gap-2 font-bold bg-gray-50/80" style={fs(4.5)}>
                                    <span>Work Experience Record Period:</span>
                                    <span className="text-blue-900 font-extrabold" style={{ color: pdfConfig.accentColor || '#003057' }}>FY2425 Q2: October 2024 - December 2024</span>
                                  </div>

                                  {/* Row 3: User Name & RIW Ref */}
                                  <div className="border-b-2 border-gray-900 px-1.5 py-0.5 flex justify-between font-bold bg-white" style={fs(4.5)}>
                                    <div>Name: <span className="text-blue-900 font-extrabold">{profile?.displayName?.toUpperCase() || 'MATTHEW WARD'}</span></div>
                                    <div>Identification Competency Reference (RIW): <span className="text-blue-900 font-extrabold">{profile?.employeeId || '20-00069775'}</span></div>
                                  </div>

                                  {/* Table Column Headers */}
                                  <div className="grid grid-cols-12 border-b border-gray-800 bg-gray-100/90 font-extrabold text-center text-[3.8px] leading-tight">
                                    <div className="col-span-2 border-r border-gray-800 p-0.5 flex flex-col justify-center">Dates<br/><span className="font-normal text-gray-500 text-[3.2px]">(From/To)</span></div>
                                    <div className="col-span-2 border-r border-gray-800 p-0.5 flex flex-col justify-center">Employer/Client and<br/><span className="font-normal text-gray-500 text-[3.2px]">Infrastructure Owner</span></div>
                                    <div className="col-span-3 border-r border-gray-800 p-0.5 text-left flex flex-col justify-center">Description of Task:<br/><span className="font-normal text-gray-500 text-[3.2px]">(Description of Role(s) in competencies/levels)</span></div>
                                    <div className="col-span-1 border-r border-gray-800 p-0.5 flex items-center justify-center">Ref</div>
                                    <div className="col-span-2 border-r border-gray-800 p-0.5 text-left flex items-center">Equipment or System Types</div>
                                    <div className="col-span-1 border-r border-gray-800 p-0.5 flex flex-col justify-center">Verification Signature<br/><span className="font-normal text-gray-500 text-[3px]">(Name &amp; ID)</span></div>
                                    <div className="col-span-1 p-0.5 flex flex-col justify-center">Supervisor Observations<br/><span className="font-normal text-gray-500 text-[3px]">(Assessment)</span></div>
                                  </div>

                                  {/* Main Grid Content Row */}
                                  <div className="grid grid-cols-12 border-b border-gray-800 text-[3.8px] leading-tight bg-white">
                                    {/* Col 1: Dates */}
                                    <div className="col-span-2 border-r border-gray-800 p-1 font-bold space-y-1">
                                      <div>October 2024 - December 2024</div>
                                      <div className="font-extrabold text-gray-900 mt-1">Final Commissioning date: 31/12/24</div>
                                    </div>

                                    {/* Col 2: Employer / Client / Owner */}
                                    <div className="col-span-2 border-r border-gray-800 p-1 space-y-1 font-sans">
                                      <div><strong className="font-bold text-gray-800">Employer:</strong><br/>JMDR</div>
                                      <div><strong className="font-bold text-gray-800">Client:</strong><br/>Transport for Tomorrow</div>
                                      <div><strong className="font-bold text-gray-800">Infrastructure Owner:</strong><br/>Sydney Trains</div>
                                    </div>

                                    {/* Col 3: Task Description */}
                                    <div className="col-span-3 border-r border-gray-800 p-1 space-y-0.5">
                                      <div><strong className="font-bold">Role:</strong> Signalling Tester in Charge</div>
                                      <div><strong className="font-bold">Location:</strong> Sydney - Sydney Terminal</div>
                                      <div><strong className="font-bold">Project:</strong> MTMS3ASP2 - STAR2</div>
                                      <p className="text-gray-600 mt-0.5">
                                        Ongoing management of STAR2 programme of works as Signalling Tester in Charge leading commissioning event...
                                      </p>
                                      <ul className="list-disc pl-2 space-y-0.2 mt-0.5 text-gray-700">
                                        <li>Audit Construction Documentation</li>
                                        <li>Perform Signal Sighting &amp; Focusing</li>
                                        <li>Management &amp; Closure of Package</li>
                                      </ul>
                                    </div>

                                    {/* Col 4: Ref */}
                                    <div className="col-span-1 border-r border-gray-800 p-1 text-center font-bold text-[4.5px]">
                                      01
                                    </div>

                                    {/* Col 5: Equipment Types */}
                                    <div className="col-span-2 border-r border-gray-800 p-1 space-y-0.5 text-[3.5px]">
                                      <div><strong className="font-bold">Interlockings:</strong> Route Relay, Microlok MKII</div>
                                      <div><strong className="font-bold">Signals:</strong> Colour light LED &amp; Incandescent</div>
                                      <div><strong className="font-bold">Rail Connections:</strong> 1500VDC Traction Bonding</div>
                                      <div><strong className="font-bold">Trainstops:</strong> EP JA</div>
                                      <div><strong className="font-bold">Points:</strong> EP Spherolock, EP Clawlock</div>
                                      <div><strong className="font-bold">ETCS:</strong> Alstom Fixed ATP &amp; ASDO Balises</div>
                                    </div>

                                    {/* Col 6: Verification Signature */}
                                    <div className="col-span-1 border-r border-gray-800 p-1 text-[3.5px] space-y-0.5">
                                      <div className="font-bold text-gray-900">Adam Toffolo</div>
                                      <div className="text-gray-600 font-mono">20-0006492</div>
                                      <div className="text-gray-500">Commissioning Engineer</div>
                                      <div className="text-gray-400 italic mt-0.5 text-[3px]">Principal Engineer</div>
                                    </div>

                                    {/* Col 7: Supervisor Observations */}
                                    <div className="col-span-1 p-1 text-[3.5px] text-gray-500 italic">
                                      Competence cross-referenced &amp; verified.
                                    </div>
                                  </div>
                                </div>

                                {/* Footer Table Bar */}
                                <div className="mt-auto">
                                  <div className="grid grid-cols-3 border-t border-b border-gray-800 bg-gray-50 text-[3.5px] p-0.5 font-medium text-center text-gray-700">
                                    <div>Approving Manager: Chief Engineer</div>
                                    <div>Approval Date: 01/02/2018</div>
                                    <div>Next Review Date: 01/02/2019</div>
                                  </div>
                                  <div className="flex justify-between items-center p-0.5 text-[3.2px] font-mono">
                                    <span className="text-red-600 font-bold tracking-tight">PRINTOUT MAY NOT BE UP-TO-DATE: REFER TO METRO INTRANET FOR THE LATEST VERSION</span>
                                    <span className="text-gray-500">Page 1 of 2</span>
                                  </div>
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
                              <div><strong className="text-slate-500">Employer:</strong> JMDR</div>
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
                            {pdfConfig.customFooterNote || 'Digital Signalling Logbook Exporter Pro'}
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
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleResetPdfConfig}
                  className="flex items-center gap-1.5 px-4 py-2 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition select-none disabled:opacity-50"
                  id="reset-customizer-btn"
                >
                  <RotateCcw size={14} />
                  Reset Defaults
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCustomizerOpen(false)}
                    className="px-4 py-2 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 rounded-xl text-xs font-bold transition select-none"
                    id="cancel-customizer-btn"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSavingPdfConfig}
                    onClick={handleSavePdfConfig}
                    className="bg-rail-blue text-white hover:bg-opacity-90 px-6 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition select-none disabled:opacity-50"
                    id="save-customizer-btn"
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
