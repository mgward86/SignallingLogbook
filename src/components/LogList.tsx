import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, SnapshotMetadata } from 'firebase/firestore';
import { useConfig } from '../hooks/useConfig';
import { Edit2, Trash2, Search, MapPin, Wrench, Briefcase, Plus, Download, FileStack, CheckSquare, Square, Copy, Mail, CloudOff, RefreshCw, ChevronDown, ChevronUp, BookOpen, UserCheck, CreditCard, Calendar, TrendingUp, Layers, Activity, FileText, ShieldCheck, Lock, AlertCircle, Clock, CheckCircle2, Shield, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { downloadPdf, sharePdf } from '../lib/pdfExport';
import { createPdfInstance, addDocumentFooters, generateLogPage } from '../lib/pdfGenerator';
import { format } from 'date-fns';
import { SupervisorVerificationModal } from './SupervisorVerificationModal';
import { SupervisorPortalModal } from './SupervisorPortalModal';

interface Equipment {
  category: string;
  subCategories: string[];
}

interface LogEntry {
  id: string;
  logNumber: string;
  startDate: string;
  endDate: string;
  quarter?: string;
  employer?: string;
  client?: string;
  infrastructureOwner?: string;
  projectName?: string;
  isProjectNA?: boolean;
  role?: string;
  approvingSupervisor?: string;
  approvingSupervisorRiw?: string;
  location: string;
  isLocationNA?: boolean;
  equipment: Equipment[];
  workType: string;
  workDescription: string;
  createdAt: any;
  hasPendingWrites?: boolean;
  // Digital Verification fields
  verificationStatus?: 'draft' | 'pending_verification' | 'verified' | 'rejected' | 'cancelled';
  verificationToken?: string;
  verificationPin?: string;
  verificationRequestedAt?: string;
  verificationSignedAt?: string;
  supervisorSignatureDataUrl?: string;
  supervisorComments?: string;
  supervisorDeclaration?: string;
  pdfHeaderStyle?: string;
  pdfSupervisorDeclaration?: string;
  verificationHash?: string;
  isLocked?: boolean;
  auditTrail?: any[];
}

interface LogListProps {
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function LogList({ onEdit, onDuplicate }: LogListProps) {
  const { user, profile } = useAuth();
  const { config } = useConfig();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [exportStep, setExportStep] = useState<'none' | 'choosing'>('none');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [verifyingLog, setVerifyingLog] = useState<LogEntry | null>(null);
  const [portalTokenForLog, setPortalTokenForLog] = useState<string | null>(null);
  const [isPortalOpen, setIsPortalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'logEntries'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const logData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        hasPendingWrites: doc.metadata.hasPendingWrites
      })) as LogEntry[];
      setLogs(logData);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('LogEntries Snapshot Error:', err);
      setError(`Database sync failed: ${err.message}`);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'logEntries', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'logEntries');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const handleEmailShare = async (log: LogEntry) => {
    try {
      const doc = createPdfInstance(profile?.pdfConfig);
      generateLogPage(doc, log, true, profile?.pdfConfig, profile, config?.categories);
      addDocumentFooters(doc, profile?.pdfConfig);
      const filename = `Signalling_Log_${log.logNumber}.pdf`;

      const shared = await sharePdf(doc, filename, {
        title: `Rail Log Entry: ${log.logNumber}`,
        text: `Please find attached the Rail Log Entry summary for ${log.logNumber}.`,
      });

      if (!shared) {
        // Fallback to mailto if sharing is not supported
        const subject = `Rail Log Entry: ${log.logNumber}`;
        const body = `Rail Log Entry Summary:

Log Number: ${log.logNumber}
Date: ${log.startDate}${log.endDate !== log.startDate ? ` to ${log.endDate}` : ''}
Project: ${log.isProjectNA ? 'N/A' : (log.projectName || 'N/A')}
Role: ${log.role || 'N/A'}
Location: ${log.isLocationNA ? 'N/A' : (log.location || 'N/A')}

Description: ${log.workDescription}

Note: To attach the PDF, please download it manually and attach it to this email.

Sent from Rail Logbook App`;

        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        const link = document.createElement('a');
        link.href = mailtoUrl;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error sharing log:', error);
      window.alert('Unable to complete share. Please try downloading the PDF instead.');
    }
  };

  // PDF generation (hexToRgb, createPdfInstance, addDocumentFooters,
  // generateLogPage) now lives in `../lib/pdfGenerator` — it's the single
  // source of truth shared with the "Preview Real PDF" action in the PDF
  // customiser (`UserProfileForm.tsx`), so the two can never drift.


  const handleExportPDF = async (log: LogEntry) => {
    const doc = createPdfInstance(profile?.pdfConfig);
    generateLogPage(doc, log, true, profile?.pdfConfig, profile, config?.categories);
    addDocumentFooters(doc, profile?.pdfConfig, log.logNumber);
    await downloadPdf(doc, `Signalling_Log_${log.logNumber}.pdf`);
  };

  const handleShareBulk = async () => {
    if (selectedLogs.size === 0) return;
    try {
      const doc = createPdfInstance(profile?.pdfConfig);
      const selectedEntries = logs.filter(l => selectedLogs.has(l.id));
      selectedEntries.forEach((log, index) => {
        generateLogPage(doc, log, index === 0, profile?.pdfConfig, profile, config?.categories);
      });
      addDocumentFooters(doc, profile?.pdfConfig);

      const filename = `Bulk_Signalling_Logs_${format(new Date(), 'yyyyMMdd')}.pdf`;
      const shared = await sharePdf(doc, filename, {
        title: `Rail Logbook: ${selectedEntries.length} Entries`,
        text: `Please find attached the bulk export of ${selectedEntries.length} log entries.`,
      });

      if (!shared) {
        const subject = `Rail Logbook Export: ${selectedEntries.length} Entries`;
        const body = `Bulk Export Summary:
Entries Selected: ${selectedEntries.length}
Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm')}

Note: The combined PDF file could not be attached directly. Please ensure you have downloaded it or use a device that supports file sharing.

Sent from Rail Logbook App`;

        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        const link = document.createElement('a');
        link.href = mailtoUrl;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setExportStep('none');
    } catch (error) {
      console.error('Error sharing bulk logs:', error);
      setExportStep('none');
    }
  };

  const handleBulkExport = async () => {
    if (selectedLogs.size === 0) return;
    const doc = createPdfInstance(profile?.pdfConfig);
    const selectedEntries = logs.filter(l => selectedLogs.has(l.id));
    selectedEntries.forEach((log, index) => {
      generateLogPage(doc, log, index === 0, profile?.pdfConfig, profile, config?.categories);
    });
    addDocumentFooters(doc, profile?.pdfConfig);
    await downloadPdf(doc, `Bulk_Signalling_Logs_${format(new Date(), 'yyyyMMdd')}.pdf`);
    setExportStep('none');
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedLogs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLogs(next);
  };

  const toggleSelectAll = () => {
    if (selectedLogs.size === filteredLogs.length) {
      setSelectedLogs(new Set());
    } else {
      setSelectedLogs(new Set(filteredLogs.map(l => l.id)));
    }
  };


  const filteredLogs = logs.filter(log => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      (log.location || 'N/A').toLowerCase().includes(searchLower) ||
      log.logNumber.toLowerCase().includes(searchLower) ||
      (log.projectName || '').toLowerCase().includes(searchLower);
    
    const matchesType = filterType === 'all' || log.workType.toLowerCase() === filterType.toLowerCase();
    
    return matchesSearch && matchesType;
  });

  const currentMonthName = useMemo(() => format(new Date(), 'MMMM yyyy'), []);

  const entriesThisMonth = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return logs.filter(log => {
      let date: Date | null = null;
      if (log.createdAt) {
        if (typeof log.createdAt.toDate === 'function') {
          date = log.createdAt.toDate();
        } else if (log.createdAt.seconds) {
          date = new Date(log.createdAt.seconds * 1000);
        } else if (log.createdAt instanceof Date) {
          date = log.createdAt;
        } else if (typeof log.createdAt === 'string' || typeof log.createdAt === 'number') {
          date = new Date(log.createdAt);
        }
      }
      if (!date || isNaN(date.getTime())) {
        if (log.startDate) {
          date = new Date(log.startDate);
        }
      }
      if (date && !isNaN(date.getTime())) {
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      }
      return false;
    }).length;
  }, [logs]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="flex flex-col items-center gap-4 opacity-50">
          <div className="w-8 h-8 border-2 border-rail-blue border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-[10px] uppercase tracking-widest">Loading Records...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <CloudOff className="text-amber-500 shrink-0" size={18} />
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Sync Issue Detected</p>
            <p className="text-[10px] text-amber-600 font-medium">{error}. Operating in offline mode.</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="p-1.5 hover:bg-amber-100 rounded-lg transition text-amber-500"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      )}

      {/* Summary Stats Widget */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Total Log Entries Card */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-2xs flex items-center justify-between relative overflow-hidden group hover:border-gray-200 transition">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <BookOpen size={20} className="text-slate-800" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Log Entries</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-bold text-gray-900 font-mono tracking-tight">{logs.length}</span>
                <span className="text-[10px] text-gray-400 font-medium">all time</span>
              </div>
            </div>
          </div>
          <div className="hidden xl:block text-right">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              <FileText size={12} />
              {logs.length === 1 ? '1 Record' : `${logs.length} Records`}
            </span>
          </div>
        </div>

        {/* Entries Created This Month Card */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-2xs flex items-center justify-between relative overflow-hidden group hover:border-gray-200 transition">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Calendar size={20} />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Created This Month</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-bold text-emerald-700 font-mono tracking-tight">{entriesThisMonth}</span>
                <span className="text-[10px] text-emerald-600 font-medium">
                  {currentMonthName}
                </span>
              </div>
            </div>
          </div>
          <div className="hidden xl:block text-right">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
              <TrendingUp size={12} />
              Active Month
            </span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
          <input
            type="text"
            placeholder="Search by location, Project or Log #"
            className="w-full bg-white border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-rail-blue/10 focus:border-rail-blue outline-none transition"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <select
            className="bg-white border border-gray-200 rounded-lg pl-4 pr-10 py-2 text-sm outline-none focus:ring-1 focus:ring-rail-blue/20 focus:border-rail-blue flex-1 sm:flex-none cursor-pointer hover:bg-gray-50/50 appearance-none transition"
            style={{
              backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.75rem center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '1rem 1rem'
            }}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Work Types</option>
            {config?.workTypes?.map(w => <option key={w} value={w.toLowerCase()}>{w}</option>)}
          </select>
          {selectedLogs.size > 0 && (
            <div className="flex gap-2 items-center animate-in zoom-in-95">
              {exportStep === 'choosing' ? (
                <div className="flex bg-rail-blue/5 border border-rail-blue/20 rounded-lg p-1 gap-1">
                  <button
                    onClick={handleBulkExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rail-blue hover:bg-rail-blue/10 rounded-md transition"
                  >
                    <Download size={14} />
                    Download
                  </button>
                  <div className="w-[1px] bg-rail-blue/10 my-1" />
                  <button
                    onClick={handleShareBulk}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rail-blue hover:bg-rail-blue/10 rounded-md transition"
                  >
                    <Mail size={14} />
                    Share
                  </button>
                  <div className="w-[1px] bg-rail-blue/10 my-1" />
                  <button
                   onClick={() => setExportStep('none')}
                    className="px-2 py-1.5 text-xs font-bold text-gray-400 hover:text-gray-600 transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setExportStep('choosing')}
                  className="bg-rail-blue text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-opacity-90 transition shadow-sm animate-in zoom-in-95"
                >
                  <FileStack size={16} />
                  Export Selected ({selectedLogs.size})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grid List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Table Header - Visible on Desktop */}
        <div className="hidden md:grid grid-cols-12 bg-gray-50 border-b border-gray-200 p-4 font-mono text-[10px] uppercase tracking-wider text-gray-500 italic items-center">
          <div className="col-span-1 flex justify-center">
            <button onClick={toggleSelectAll} className="text-gray-400 hover:text-rail-blue transition">
              {selectedLogs.size === filteredLogs.length && filteredLogs.length > 0 ? (
                <CheckSquare size={16} className="text-rail-blue" />
              ) : (
                <Square size={16} />
              )}
            </button>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            Date / Log #
          </div>
          <div className="col-span-2">Location & Equipment</div>
          <div className="col-span-2">Project & Client</div>
          <div className="col-span-3">Description of Work</div>
          <div className="col-span-2 text-right pr-2">Actions</div>
        </div>

        <div className="divide-y divide-gray-100">
          <AnimatePresence>
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`p-4 hover:bg-gray-50/80 transition group relative ${selectedLogs.has(log.id) ? 'bg-blue-50/30' : ''} ${expandedLogId === log.id ? 'bg-gray-50' : ''}`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-1 flex items-center justify-center gap-1 order-first md:order-none">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelection(log.id);
                        }}
                        className={`p-1 rounded-md transition ${selectedLogs.has(log.id) ? 'text-rail-blue' : 'text-gray-300 hover:text-gray-400'}`}
                      >
                        {selectedLogs.has(log.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                      <button
                        onClick={() => toggleExpand(log.id)}
                        className="p-1 text-gray-400 hover:text-rail-blue transition"
                      >
                        {expandedLogId === log.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                    {/* Date/ID */}
                    <div className="col-span-2 flex flex-col cursor-pointer" onClick={() => toggleExpand(log.id)}>
                      <div className="flex items-center gap-1.5">
                        <span className="data-value text-gray-900 font-medium text-sm">{log.startDate}</span>
                        {(log as any).hasPendingWrites && (
                          <motion.div
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="bg-amber-100 p-0.5 rounded"
                            title="Saving changes offline..."
                          >
                            <RefreshCw size={10} className="text-amber-600 animate-spin-slow" />
                          </motion.div>
                        )}
                      </div>
                      {log.endDate !== log.startDate && (
                        <span className="text-[10px] text-gray-400">to {log.endDate}</span>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px] text-rail-blue/60">{log.logNumber}</span>
                        {log.quarter && (
                          <span className="text-[8px] font-bold text-rail-blue bg-rail-blue/5 px-1 py-0 rounded border border-rail-blue/10 uppercase">
                            {log.quarter}
                          </span>
                        )}

                        {/* Verification Badges */}
                        {log.verificationStatus === 'verified' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (log.verificationToken) {
                                setPortalTokenForLog(log.verificationToken);
                                setIsPortalOpen(true);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase hover:bg-emerald-100 transition"
                            title="Digitally Verified & Sealed - Click to view certificate"
                          >
                            <ShieldCheck size={11} className="text-emerald-600" />
                            Verified
                          </button>
                        )}

                        {log.verificationStatus === 'pending_verification' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVerifyingLog(log);
                            }}
                            className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase hover:bg-amber-100 transition"
                            title="Verification Request Sent - Click to copy link"
                          >
                            <Clock size={11} className="text-amber-600" />
                            Pending Sign-off
                          </button>
                        )}

                        {log.verificationStatus === 'rejected' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVerifyingLog(log);
                            }}
                            className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full uppercase hover:bg-rose-100 transition"
                            title="Revisions requested by supervisor"
                          >
                            <AlertCircle size={11} className="text-rose-600" />
                            Revisions
                          </button>
                        )}

                        {log.hasPendingWrites && (
                          <div className="flex items-center gap-1" title="Offline - Waiting to sync">
                            <CloudOff size={10} className="text-amber-500" />
                            <span className="text-[8px] font-bold text-amber-500 uppercase tracking-tighter">Pending Sync</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Location & Equip */}
                    <div className="col-span-2 cursor-pointer" onClick={() => toggleExpand(log.id)}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <MapPin size={14} className="text-gray-400" />
                        <span className="font-bold text-sm truncate">{log.isLocationNA ? 'N/A' : (log.location || '–')}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {log.equipment?.slice(0, expandedLogId === log.id ? undefined : 2).map((e, idx) => (
                          <span 
                            key={idx} 
                            className="inline-block bg-slate-50/90 text-slate-500 border border-slate-200/50 text-[8.5px] font-medium tracking-tight px-1.5 py-0.5 rounded"
                          >
                            {config?.categories?.find(c => c.id === e.category)?.name || e.category}
                          </span>
                        ))}
                        {log.equipment?.length > 2 && expandedLogId !== log.id && (
                          <span className="text-[8.5px] text-slate-400 font-medium tracking-tight px-1 py-0.5">
                            +{log.equipment.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Project & Client */}
                    <div className="col-span-2 cursor-pointer" onClick={() => toggleExpand(log.id)}>
                       <div className="flex items-center gap-2 mb-1">
                        <Briefcase size={14} className="text-gray-400" />
                        <span className="text-sm font-medium truncate">
                            {log.isProjectNA ? 'N/A' : (log.projectName || '–')}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {log.employer && (
                           <div className="text-[10px] uppercase font-mono text-gray-500">
                              <span className="text-gray-400 mr-1.5 font-sans italic">Employer:</span>{log.employer}
                           </div>
                        )}
                      </div>
                    </div>

                    {/* Work Detail Summary */}
                    <div className="col-span-3 cursor-pointer min-w-0" onClick={() => toggleExpand(log.id)}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${getTypeColor(log.workType)}`} />
                        <span className="text-xs font-bold uppercase tracking-wide">{log.workType}</span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-1 italic leading-relaxed">
                        {log.workDescription.replace(/<[^>]*>?/gm, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="col-span-2 flex justify-end gap-1 items-center lg:opacity-60 group-hover:opacity-100 transition-opacity duration-300 pr-1">
                      {deletingId === log.id ? (
                        <div className="flex items-center gap-1 animate-in slide-in-from-right-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(log.id); }}
                            className="text-[9px] font-bold uppercase bg-red-500 text-white px-2 py-1 rounded shadow-sm"
                          >
                            Delete
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                            className="text-[9px] font-bold uppercase bg-gray-200 text-gray-600 px-2 py-1 rounded"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (log.verificationStatus === 'verified' && log.verificationToken) {
                                setPortalTokenForLog(log.verificationToken);
                                setIsPortalOpen(true);
                              } else {
                                setVerifyingLog(log);
                              }
                            }}
                            className={`p-1.5 rounded-lg transition relative ${
                              log.verificationStatus === 'verified'
                                ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                                : log.verificationStatus === 'pending_verification'
                                ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                                : log.verificationStatus === 'rejected'
                                ? 'text-rose-600 bg-rose-50 hover:bg-rose-100'
                                : log.verificationStatus === 'cancelled'
                                ? 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                                : 'text-gray-400 hover:text-rail-blue hover:bg-rail-blue/10'
                            }`}
                            title={
                              log.verificationStatus === 'verified'
                                ? 'Verified Log - View Digital Certificate'
                                : log.verificationStatus === 'pending_verification'
                                ? 'Verification Pending - Click to Manage'
                                : log.verificationStatus === 'rejected'
                                ? 'Revisions Requested - Click to Review'
                                : log.verificationStatus === 'cancelled'
                                ? 'Approval Request Cancelled - Click to Re-issue'
                                : 'Request Supervisor Verification'
                            }
                          >
                            <ShieldCheck size={14} />
                            {log.verificationStatus === 'cancelled' && (
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-slate-400 rounded-full border border-white" />
                            )}
                            {log.verificationStatus === 'pending_verification' && (
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full border border-white animate-pulse" />
                            )}
                            {log.verificationStatus === 'rejected' && (
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-rose-500 rounded-full border border-white" />
                            )}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExportPDF(log); }}
                            className="p-1.5 text-gray-400 hover:text-rail-blue hover:bg-rail-blue/10 rounded-lg transition"
                            title="Download PDF"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEmailShare(log); }}
                            className="p-1.5 text-gray-400 hover:text-rail-blue hover:bg-rail-blue/10 rounded-lg transition"
                            title="Share Entry"
                          >
                            <Mail size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDuplicate(log.id); }}
                            className="p-1.5 text-gray-400 hover:text-rail-blue hover:bg-rail-blue/10 rounded-lg transition"
                            title="Duplicate Entry"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (log.isLocked) {
                                alert(`Log Entry #${log.logNumber} has been verified by supervisor ${log.approvingSupervisor || ''} and is locked to guarantee record compliance.`);
                              } else {
                                onEdit(log.id);
                              }
                            }}
                            className={`p-1.5 rounded-lg transition ${
                              log.isLocked ? 'text-gray-300 hover:text-amber-600' : 'text-gray-400 hover:text-rail-blue hover:bg-rail-blue/10'
                            }`}
                            title={log.isLocked ? 'Record Locked (Verified)' : 'Edit Entry'}
                          >
                            {log.isLocked ? <Lock size={14} /> : <Edit2 size={14} />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (log.isLocked) {
                                alert(`Log Entry #${log.logNumber} is verified & locked. Contact admin to unlock.`);
                              } else {
                                setDeletingId(log.id);
                              }
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Delete Entry"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Section */}
                  <AnimatePresence>
                    {expandedLogId === log.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                          <div className="lg:col-span-8 min-w-0 space-y-4">
                            <div className="flex items-center gap-2 text-rail-blue">
                              <BookOpen size={16} />
                              <h4 className="text-xs font-bold uppercase tracking-widest">Work Description</h4>
                            </div>
                            <div 
                              className="bg-white p-4 rounded-xl border border-gray-100 text-sm text-gray-600 leading-relaxed rich-text-preview min-w-0 overflow-hidden break-words"
                              dangerouslySetInnerHTML={{ __html: log.workDescription }}
                            />
                          </div>
                          
                          <div className="lg:col-span-4 min-w-0 space-y-4">
                            <div className="flex items-center gap-2 text-rail-blue">
                              <Wrench size={16} />
                              <h4 className="text-xs font-bold uppercase tracking-widest">Equipment Identification</h4>
                            </div>
                            <div className="space-y-3">
                              {log.approvingSupervisor && (
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-2.5">
                                  <UserCheck size={16} className="text-rail-blue shrink-0" />
                                  <div className="min-w-0">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Approving Supervisor / Verifier</span>
                                    <p className="text-xs font-bold text-gray-800 truncate">
                                      {log.approvingSupervisor}
                                      {log.approvingSupervisorRiw && <span className="text-rail-blue font-mono ml-1.5 font-semibold text-[11px]">(RIW: {log.approvingSupervisorRiw})</span>}
                                    </p>
                                  </div>
                                </div>
                              )}
                              {log.equipment?.map((e, idx) => (
                                <div key={idx} className="bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                                  <span className="text-[10px] font-bold text-gray-900 uppercase tracking-wider block mb-2">
                                    {config?.categories?.find(c => c.id === e.category)?.name || e.category}
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {e.subCategories?.map(sub => (
                                      <span key={sub} className="text-[9px] bg-white text-rail-blue px-2 py-0.5 rounded border border-rail-blue/10 font-bold uppercase">
                                        {sub}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="pt-4 flex flex-wrap sm:flex-nowrap gap-2">
                               <button
                                onClick={() => onDuplicate(log.id)}
                                className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition"
                              >
                                <Copy size={14} />
                                DUPLICATE
                              </button>
                               <button
                                onClick={() => handleEmailShare(log)}
                                className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-2 bg-rail-blue/10 text-rail-blue rounded-lg text-xs font-bold hover:bg-rail-blue/20 transition"
                              >
                                <Mail size={14} />
                                EMAIL SHARE
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            ) : (
              <div className="py-20 text-center flex flex-col items-center gap-4 opacity-30">
                <Wrench size={40} />
                <p className="font-mono text-xs uppercase tracking-widest">No matching log entries found</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Supervisor Verification Modal for Technician */}
      <AnimatePresence>
        {verifyingLog && (
          <SupervisorVerificationModal
            log={verifyingLog}
            onClose={() => setVerifyingLog(null)}
            onSuccess={() => {
              // Refresh or show confirmation
            }}
          />
        )}
      </AnimatePresence>

      {/* Supervisor Portal Modal */}
      <AnimatePresence>
        {isPortalOpen && (
          <SupervisorPortalModal
            initialToken={portalTokenForLog}
            onClose={() => {
              setIsPortalOpen(false);
              setPortalTokenForLog(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function getTypeColor(type: string) {
  const t = type?.toLowerCase() || '';
  if (t.includes('maintenance')) return 'bg-blue-400';
  if (t.includes('repair')) return 'bg-amber-500';
  if (t.includes('fault')) return 'bg-red-500';
  if (t.includes('testing')) return 'bg-green-400';
  return 'bg-gray-400';
}
