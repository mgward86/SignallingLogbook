import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, Mail, Copy, Check, Lock, Send, Link, ExternalLink, QrCode, AlertCircle, FileText, XCircle, CheckCircle2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface SupervisorVerificationModalProps {
  log: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function SupervisorVerificationModal({ log, onClose, onSuccess }: SupervisorVerificationModalProps) {
  const [supervisorName, setSupervisorName] = useState(log.approvingSupervisor || '');
  const [supervisorRiw, setSupervisorRiw] = useState(log.approvingSupervisorRiw || '');
  const [supervisorEmail, setSupervisorEmail] = useState(log.verificationRequestedTo?.email || '');
  const [pin, setPin] = useState(log.verificationPin || '');
  const [usePin, setUsePin] = useState(Boolean(log.verificationPin));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(log.verificationToken || null);
  const [activeTab, setActiveTab] = useState<'configure' | 'share'>('configure');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const shareUrl = generatedToken
    ? `${window.location.origin}${window.location.pathname}?verifyToken=${generatedToken}`
    : '';

  const handleGenerateAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supervisorName.trim()) {
      setValidationError('Please enter the Supervisor / Verifier Name');
      return;
    }
    setValidationError(null);

    try {
      setIsSubmitting(true);
      const newToken = log.verificationToken || `verif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const reqTimestamp = new Date().toISOString();

      const newAudit = [
        ...(log.auditTrail || []),
        {
          action: 'Verification Requested',
          timestamp: reqTimestamp,
          actor: log.certifierName || 'Technician',
          details: `Verification request generated for ${supervisorName} (${supervisorRiw || 'No RIW'})`
        }
      ];

      const logRef = doc(db, 'logEntries', log.id);
      await updateDoc(logRef, {
        approvingSupervisor: supervisorName,
        approvingSupervisorRiw: supervisorRiw,
        verificationStatus: 'pending_verification',
        verificationToken: newToken,
        verificationPin: usePin ? pin : '',
        verificationRequestedAt: reqTimestamp,
        verificationRequestedTo: {
          name: supervisorName,
          email: supervisorEmail,
          riw: supervisorRiw
        },
        auditTrail: newAudit,
        updatedAt: serverTimestamp()
      });

      setGeneratedToken(newToken);
      setActiveTab('share');
      onSuccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `logEntries/${log.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancelRequest = async () => {
    try {
      setIsSubmitting(true);
      const cancelTimestamp = new Date().toISOString();
      const newAudit = [
        ...(log.auditTrail || []),
        {
          action: 'Verification Request Cancelled',
          timestamp: cancelTimestamp,
          actor: log.certifierName || 'Technician',
          details: 'Technician cancelled the pending verification request'
        }
      ];

      const logRef = doc(db, 'logEntries', log.id);
      await updateDoc(logRef, {
        verificationStatus: 'cancelled',
        updatedAt: serverTimestamp(),
        auditTrail: newAudit
      });

      setIsCancelled(true);
      setShowCancelConfirm(false);
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `logEntries/${log.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Signalling Logbook Verification Request - Log #${log.logNumber}`);
    const body = encodeURIComponent(
      `Hello ${supervisorName},\n\n` +
      `Please review and digitally verify my Signalling Work Log Entry (#${log.logNumber}).\n\n` +
      `Log Details:\n` +
      `- Log Number: ${log.logNumber}\n` +
      `- Work Type: ${log.workType}\n` +
      `- Location: ${log.isLocationNA ? 'N/A' : log.location}\n` +
      `- Date Range: ${log.startDate} to ${log.endDate}\n\n` +
      `Click the secure link below to inspect, digitally sign, and approve this log:\n` +
      `${shareUrl}\n\n` +
      (usePin && pin ? `Security PIN for access: ${pin}\n\n` : '') +
      `Thank you,\n${log.certifierName || 'Technician'}`
    );
    window.open(`mailto:${supervisorEmail}?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-lg w-full overflow-hidden my-8"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-rail-blue to-indigo-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Request Supervisor Verification</h2>
              <p className="text-xs text-rail-blue-100 font-mono">Log #{log.logNumber} • Secure Digital Workflow</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition text-gray-200 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-gray-100 bg-gray-50/50 p-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('configure')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'configure'
                ? 'bg-white text-rail-blue shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            1. Verifier Details & Security
          </button>
          <button
            type="button"
            disabled={!generatedToken}
            onClick={() => setActiveTab('share')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'share'
                ? 'bg-white text-rail-blue shadow-sm'
                : 'text-gray-400 disabled:opacity-50'
            }`}
          >
            2. Share Link & Access
          </button>
        </div>

        <div className="p-6">
          {validationError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              {validationError}
            </div>
          )}

          {log.verificationStatus === 'cancelled' && !isCancelled && (
            <div className="mb-4 p-3.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 text-xs flex items-start gap-2.5">
              <XCircle size={16} className="text-slate-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 block uppercase tracking-wider text-[11px]">Previous Approval Request Cancelled</span>
                <span className="text-slate-600 mt-0.5 block">You can update the verifier details below and re-issue a new supervisor verification link.</span>
              </div>
            </div>
          )}

          {isCancelled ? (
            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
              <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Approval Request Cancelled</h4>
                <p className="text-xs text-emerald-700 mt-0.5">The supervisor verification link has been deactivated. Closing window...</p>
              </div>
            </div>
          ) : activeTab === 'configure' ? (
            <form onSubmit={handleGenerateAndSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Approving Supervisor Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  placeholder="e.g. Chief Engineer John Smith"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-rail-blue focus:border-rail-blue outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Supervisor RIW / ID Number
                  </label>
                  <input
                    type="text"
                    value={supervisorRiw}
                    onChange={(e) => setSupervisorRiw(e.target.value)}
                    placeholder="e.g. RIW-982341"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-rail-blue focus:border-rail-blue outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Supervisor Email
                  </label>
                  <input
                    type="email"
                    value={supervisorEmail}
                    onChange={(e) => setSupervisorEmail(e.target.value)}
                    placeholder="supervisor@rail.gov.au"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-rail-blue focus:border-rail-blue outline-none transition"
                  />
                </div>
              </div>

              {/* Security PIN toggle */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock size={16} className="text-rail-blue" />
                    <div>
                      <span className="text-xs font-bold text-gray-800 block">Require Security Passcode / PIN</span>
                      <span className="text-[11px] text-gray-500">Supervisor must enter PIN before reviewing</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={usePin}
                    onChange={(e) => setUsePin(e.target.checked)}
                    className="w-4 h-4 text-rail-blue rounded border-gray-300 focus:ring-rail-blue"
                  />
                </div>

                {usePin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="pt-2 border-t border-slate-200"
                  >
                    <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                      Set 4-Digit Security PIN
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 2026"
                      className="w-32 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-mono tracking-widest text-center focus:ring-2 focus:ring-rail-blue outline-none"
                    />
                  </motion.div>
                )}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-800 text-xs">
                <AlertCircle size={18} className="shrink-0 text-amber-600 mt-0.5" />
                <p>
                  Generates an official digital verification link. Once signed, this log entry will be cryptographically sealed and locked to guarantee data integrity.
                </p>
              </div>

              {showCancelConfirm ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-rose-900 uppercase">Cancel Verification Request?</h4>
                      <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                        Are you sure you want to cancel the approval request for <strong>Log #{log.logNumber}</strong>?
                        If the supervisor opens the link, they will be notified that the request has been cancelled.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setShowCancelConfirm(false)}
                      className="px-3.5 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-lg transition"
                    >
                      No, Keep Request
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleConfirmCancelRequest}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition shadow-sm flex items-center gap-1.5"
                    >
                      {isSubmitting ? 'Cancelling...' : 'Yes, Cancel Request'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-2 flex items-center justify-between">
                  {(log.verificationStatus === 'pending_verification' || generatedToken) ? (
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={isSubmitting}
                      className="px-3.5 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <XCircle size={15} />
                      Cancel Approval Request
                    </button>
                  ) : <div />}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:text-gray-800 transition"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2.5 bg-rail-blue text-white rounded-xl text-xs font-bold hover:bg-rail-blue/90 transition shadow-md shadow-rail-blue/20 flex items-center gap-2"
                    >
                      {isSubmitting ? (
                        'Generating Request...'
                      ) : (
                        <>
                          <Send size={14} />
                          Generate Verification Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-5">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-center gap-3">
                <ShieldCheck size={24} className="text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">Verification Link Ready!</h4>
                  <p className="text-xs text-emerald-700">
                    Share this secure URL with <strong>{supervisorName}</strong> to review and digitally sign this entry.
                  </p>
                </div>
              </div>

              {/* URL Box */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Secure Access URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-700 outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                      copiedLink
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rail-blue text-white hover:bg-rail-blue/90'
                    }`}
                  >
                    {copiedLink ? (
                      <>
                        <Check size={14} /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              {usePin && pin && (
                <div className="p-3 bg-slate-100 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Security PIN:</span>
                  <span className="font-mono font-bold text-rail-blue tracking-widest bg-white px-2.5 py-1 rounded border border-slate-200">
                    {pin}
                  </span>
                </div>
              )}

              {/* Share buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleEmailShare}
                  className="p-3 bg-white border border-gray-200 rounded-xl hover:border-rail-blue hover:bg-blue-50/50 transition text-xs font-bold text-gray-700 flex items-center justify-center gap-2"
                >
                  <Mail size={16} className="text-rail-blue" />
                  Email Supervisor
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-white border border-gray-200 rounded-xl hover:border-rail-blue hover:bg-blue-50/50 transition text-xs font-bold text-gray-700 flex items-center justify-center gap-2 text-center"
                >
                  <ExternalLink size={16} className="text-rail-blue" />
                  Test Portal
                </a>
              </div>

              {showCancelConfirm ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-rose-900 uppercase">Cancel Verification Request?</h4>
                      <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                        Are you sure you want to cancel the approval request for <strong>Log #{log.logNumber}</strong>?
                        If the supervisor opens the link, they will be notified that the request has been cancelled.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setShowCancelConfirm(false)}
                      className="px-3.5 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-lg transition"
                    >
                      No, Keep Request
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleConfirmCancelRequest}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition shadow-sm flex items-center gap-1.5"
                    >
                      {isSubmitting ? 'Cancelling...' : 'Yes, Cancel Request'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  {(log.verificationStatus === 'pending_verification' || generatedToken) && (
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={isSubmitting}
                      className="px-3.5 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <XCircle size={15} />
                      Cancel Approval Request
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition ml-auto"
                  >
                    Done & Close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
