import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, CheckCircle2, XCircle, RefreshCw, PenTool, Eraser, AlertCircle, FileText, Calendar, MapPin, UserCheck, Search, Shield, Download, Check, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface SupervisorPortalModalProps {
  initialToken?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SupervisorPortalModal({ initialToken, onClose, onSuccess }: SupervisorPortalModalProps) {
  const [tokenInput, setTokenInput] = useState(initialToken || '');
  const [log, setLog] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Security PIN gate
  const [pinInput, setPinInput] = useState('');
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [pinError, setPinError] = useState(false);

  // Form State for Supervisor Sign-off
  const [supervisorName, setSupervisorName] = useState('');
  const [supervisorRiw, setSupervisorRiw] = useState('');
  const [supervisorComments, setSupervisorComments] = useState('');
  const [acceptedDeclaration, setAcceptedDeclaration] = useState(false);
  const [signatureType, setSignatureType] = useState<'draw' | 'type'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [completedHash, setCompletedHash] = useState<string | null>(null);

  // Canvas Ref & State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Auto-lookup if initialToken is provided
  useEffect(() => {
    if (initialToken) {
      lookupLogByToken(initialToken);
    }
  }, [initialToken]);

  const lookupLogByToken = async (tokenToFind: string) => {
    if (!tokenToFind.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const q = query(
        collection(db, 'logEntries'),
        where('verificationToken', '==', tokenToFind.trim())
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setError('No log entry found matching this verification code/token.');
        setLog(null);
      } else {
        const foundDoc = snapshot.docs[0];
        const data: any = { id: foundDoc.id, ...foundDoc.data() };
        setLog(data);
        setSupervisorName(data.approvingSupervisor || data.verificationRequestedTo?.name || '');
        setSupervisorRiw(data.approvingSupervisorRiw || data.verificationRequestedTo?.riw || '');
        setSupervisorComments(data.supervisorComments || '');
        if (!data.verificationPin) {
          setIsPinVerified(true);
        }
      }
    } catch (err) {
      setError('Error retrieving log entry. Please verify connection.');
      handleFirestoreError(err, OperationType.GET, 'logEntries');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (log && log.verificationPin) {
      if (pinInput.trim() === log.verificationPin.trim()) {
        setIsPinVerified(true);
        setPinError(false);
      } else {
        setPinError(true);
      }
    } else {
      setIsPinVerified(true);
    }
  };

  // Canvas Signature Methods
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F172A';
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // Generate SHA-256 Cryptographic Verification Hash
  const generateHash = async (contentStr: string): Promise<string> => {
    try {
      const msgUint8 = new TextEncoder().encode(contentStr);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return `SHA256-${hashHex.substring(0, 24).toUpperCase()}`;
    } catch {
      return `VERIF-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }
  };

  // Convert Typed Signature or Drawn Canvas to Data URL
  const getSignatureDataUrl = (): string => {
    if (signatureType === 'draw') {
      if (canvasRef.current && hasSignature) {
        return canvasRef.current.toDataURL('image/png');
      }
    }
    // Typed Signature Fallback: Draw text on offscreen canvas
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 400;
    offCanvas.height = 120;
    const ctx = offCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 400, 120);
      ctx.font = 'italic 28px "Playfair Display", Georgia, serif';
      ctx.fillStyle = '#0F172A';
      ctx.fillText(typedSignature || supervisorName || 'Authorized Signatory', 30, 70);
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(25, 85);
      ctx.lineTo(370, 85);
      ctx.stroke();
    }
    return offCanvas.toDataURL('image/png');
  };

  const handleApproveAndSign = async () => {
    if (!supervisorName.trim()) {
      alert('Please enter Supervisor Name');
      return;
    }
    if (!acceptedDeclaration) {
      alert('Please accept the Railway Compliance Declaration to sign off.');
      return;
    }
    if (signatureType === 'draw' && !hasSignature) {
      alert('Please draw your digital signature on the canvas pad.');
      return;
    }
    if (signatureType === 'type' && !typedSignature.trim()) {
      alert('Please type your digital signature.');
      return;
    }

    try {
      setSubmitting(true);
      const signedAt = new Date().toISOString();
      const sigDataUrl = getSignatureDataUrl();

      // Compute verification hash
      const hashDataString = `${log.id}-${log.logNumber}-${supervisorName}-${supervisorRiw}-${signedAt}`;
      const hashHex = await generateHash(hashDataString);

      const newAudit = [
        ...(log.auditTrail || []),
        {
          action: 'Digitally Verified & Signed',
          timestamp: signedAt,
          actor: `${supervisorName} (${supervisorRiw || 'RIW N/A'})`,
          details: `Log approved and locked with verification hash: ${hashHex}`
        }
      ];

      const logRef = doc(db, 'logEntries', log.id);
      await updateDoc(logRef, {
        approvingSupervisor: supervisorName,
        approvingSupervisorRiw: supervisorRiw,
        verificationStatus: 'verified',
        verificationSignedAt: signedAt,
        supervisorSignatureDataUrl: sigDataUrl,
        supervisorComments: supervisorComments,
        verificationHash: hashHex,
        isLocked: true,
        auditTrail: newAudit,
        updatedAt: serverTimestamp()
      });

      setCompletedHash(hashHex);
      setVerificationComplete(true);
      if (onSuccess) onSuccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `logEntries/${log.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectWithComments = async () => {
    if (!supervisorComments.trim()) {
      alert('Please provide feedback notes explaining what revisions are required.');
      return;
    }

    try {
      setSubmitting(true);
      const rejectedAt = new Date().toISOString();

      const newAudit = [
        ...(log.auditTrail || []),
        {
          action: 'Revisions Requested',
          timestamp: rejectedAt,
          actor: supervisorName || 'Supervisor',
          details: `Comments: ${supervisorComments}`
        }
      ];

      const logRef = doc(db, 'logEntries', log.id);
      await updateDoc(logRef, {
        verificationStatus: 'rejected',
        supervisorComments: supervisorComments,
        auditTrail: newAudit,
        updatedAt: serverTimestamp()
      });

      alert('Revisions requested. The technician will be notified of your feedback.');
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `logEntries/${log.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-3xl w-full overflow-hidden my-6 flex flex-col max-h-[90vh]"
      >
        {/* Top Branding Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-rail-blue to-indigo-950 px-6 py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl backdrop-blur-md">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">Supervisor Verification Portal</h2>
                <span className="text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  Official Record
                </span>
              </div>
              <p className="text-xs text-slate-300 font-mono">Digital Signalling Competency Audit System</p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close portal window"
            className="p-2 rounded-xl hover:bg-white/10 transition text-gray-300 hover:text-white cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Step 1: Token Input if no log selected */}
          {!log && (
            <div className="max-w-md mx-auto py-8 text-center space-y-6">
              <div className="p-4 bg-rail-blue/5 rounded-full w-16 h-16 mx-auto flex items-center justify-center text-rail-blue">
                <Search size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Enter Verification Access Code</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Enter the verification token or code provided by the technician to inspect and digitally sign the log entry.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  lookupLogByToken(tokenInput);
                }}
                className="space-y-3"
              >
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="e.g. verif_172255_a8f9x2"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center font-mono text-sm uppercase tracking-wider focus:ring-2 focus:ring-rail-blue outline-none"
                />
                {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !tokenInput.trim()}
                  className="w-full py-3 bg-rail-blue text-white rounded-xl text-xs font-bold hover:bg-rail-blue/90 transition shadow-lg shadow-rail-blue/20 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    'Searching Record...'
                  ) : (
                    <>
                      <Search size={16} /> Look Up Log Entry
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Step 2: Request Cancelled Notice */}
          {log && log.verificationStatus === 'cancelled' && (
            <div className="max-w-md mx-auto py-10 text-center space-y-6">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={36} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Approval Request Cancelled</h3>
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                  The technician (<strong>{log.certifierName || 'Signal Technician'}</strong>) has cancelled the approval request for Log Entry <strong>#{log.logNumber}</strong>.
                </p>
                <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium">
                  This shared verification link is no longer active. If you believe this is an error, please contact the technician directly.
                </div>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
                >
                  Close Portal
                </button>
              </div>
            </div>
          )}

          {/* Step 2b: PIN Gate if log requires PIN */}
          {log && log.verificationStatus !== 'cancelled' && !isPinVerified && (
            <div className="max-w-md mx-auto py-8 text-center space-y-6">
              <div className="p-4 bg-amber-500/10 rounded-full w-16 h-16 mx-auto flex items-center justify-center text-amber-600">
                <Lock size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Passcode Protected Record</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Technician <strong>{log.certifierName || 'Signal Engineer'}</strong> protected Log #{log.logNumber} with a Security PIN.
                </p>
              </div>

              <form onSubmit={handleVerifyPin} className="space-y-4">
                <input
                  type="password"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter PIN"
                  className="w-40 mx-auto px-4 py-3 border border-gray-200 rounded-xl text-center font-mono text-lg tracking-widest focus:ring-2 focus:ring-rail-blue outline-none"
                />
                {pinError && <p className="text-xs font-bold text-rose-600">Incorrect Security PIN. Please check with technician.</p>}
                <button
                  type="submit"
                  className="w-full py-3 bg-rail-blue text-white rounded-xl text-xs font-bold hover:bg-rail-blue/90 transition"
                >
                  Unlock & Review Record
                </button>
              </form>
            </div>
          )}

          {/* Step 3: Success Screen */}
          {verificationComplete && (
            <div className="py-10 text-center space-y-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto"
              >
                <CheckCircle2 size={48} />
              </motion.div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Sign-Off Complete & Sealed</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  Log entry #{log.logNumber} has been verified by {supervisorName} and cryptographically locked against tamper.
                </p>
              </div>

              {completedHash && (
                <div className="p-4 bg-slate-900 text-emerald-400 rounded-2xl max-w-md mx-auto font-mono text-xs text-left border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Cryptographic Stamp Token:</div>
                  <div className="break-all font-bold">{completedHash}</div>
                  <div className="text-[10px] text-slate-400 mt-2">Verified At: {new Date().toLocaleString('en-AU')}</div>
                </div>
              )}

              <div className="pt-4 flex justify-center gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition shadow-lg"
                >
                  Close Supervisor Portal
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Full Log Review & Digital Signing */}
          {log && log.verificationStatus !== 'cancelled' && isPinVerified && !verificationComplete && (
            <div className="space-y-6">
              {/* Record Snapshot Card */}
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rail-blue block">Log Reference</span>
                    <h3 className="text-base font-bold text-slate-900">{log.logNumber}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">Status</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase ${
                      log.verificationStatus === 'verified'
                        ? 'bg-emerald-100 text-emerald-800'
                        : log.verificationStatus === 'rejected'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {log.verificationStatus || 'Pending Verification'}
                    </span>
                  </div>
                </div>

                {/* Grid details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="font-bold text-slate-500 block">Technician:</span>
                    <span className="font-semibold text-slate-900">{log.certifierName || 'Signal Engineer'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 block">Work Type:</span>
                    <span className="font-semibold text-slate-900">{log.workType}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 block">Dates:</span>
                    <span className="font-semibold text-slate-900">{log.startDate} to {log.endDate}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 block">Location:</span>
                    <span className="font-semibold text-slate-900">{log.isLocationNA ? 'N/A' : log.location}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 block">Project:</span>
                    <span className="font-semibold text-slate-900">{log.isProjectNA ? 'N/A' : log.projectName}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 block">Infrastructure Owner:</span>
                    <span className="font-semibold text-slate-900">{log.infrastructureOwner || 'N/A'}</span>
                  </div>
                </div>

                {/* Work description */}
                <div className="pt-2 border-t border-slate-200/80">
                  <span className="font-bold text-xs text-slate-600 block mb-1">Work Description & Activities:</span>
                  <div
                    className="text-xs text-slate-800 bg-white p-3 rounded-xl border border-slate-200 max-h-40 overflow-y-auto prose prose-sm"
                    dangerouslySetInnerHTML={{ __html: log.workDescription || '<em>No description provided</em>' }}
                  />
                </div>

                {/* Equipment items */}
                {log.equipment && log.equipment.length > 0 && (
                  <div className="pt-2">
                    <span className="font-bold text-xs text-slate-600 block mb-1">Equipment / Category Breakdown:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {log.equipment.map((eq: any, idx: number) => (
                        <span key={idx} className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700">
                          {eq.category}: {eq.subCategories?.join(', ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Digital Signature Canvas Block */}
              <div className="p-5 border border-gray-200 rounded-2xl space-y-4 bg-white">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <PenTool size={16} className="text-rail-blue" />
                    Supervisor Digital Signature & Certification
                  </h4>
                  <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setSignatureType('draw')}
                      className={`px-3 py-1 rounded-lg transition ${signatureType === 'draw' ? 'bg-white text-rail-blue shadow-sm' : 'text-gray-500'}`}
                    >
                      Draw Canvas
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignatureType('type')}
                      className={`px-3 py-1 rounded-lg transition ${signatureType === 'type' ? 'bg-white text-rail-blue shadow-sm' : 'text-gray-500'}`}
                    >
                      Type Name
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Supervisor Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={supervisorName}
                      onChange={(e) => setSupervisorName(e.target.value)}
                      placeholder="e.g. John Smith"
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-rail-blue outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Supervisor RIW / Assessor ID
                    </label>
                    <input
                      type="text"
                      value={supervisorRiw}
                      onChange={(e) => setSupervisorRiw(e.target.value)}
                      placeholder="e.g. RIW-982341"
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-rail-blue outline-none"
                    />
                  </div>
                </div>

                {signatureType === 'draw' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-gray-600 uppercase">
                        Draw Touch Signature Below
                      </label>
                      {hasSignature && (
                        <button
                          type="button"
                          onClick={clearCanvas}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                        >
                          <Eraser size={12} /> Clear Canvas
                        </button>
                      )}
                    </div>
                    <div className="border-2 border-dashed border-gray-300 rounded-2xl bg-slate-50 relative overflow-hidden">
                      <canvas
                        ref={canvasRef}
                        width={600}
                        height={160}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="w-full h-36 cursor-crosshair touch-none"
                      />
                      {!hasSignature && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-gray-400 text-xs font-medium">
                          Sign here with finger, stylus, or mouse
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Type Digital Sign-off Name
                    </label>
                    <input
                      type="text"
                      value={typedSignature}
                      onChange={(e) => setTypedSignature(e.target.value)}
                      placeholder="Type signature..."
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl font-serif italic text-lg text-slate-900 focus:ring-2 focus:ring-rail-blue outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Supervisor Observations (Assessment / Ref)
                  </label>
                  <p className="text-[10px] text-gray-500 mb-1.5">
                    This text is printed on the exported log in the Supervisor Observations column. Edit it as needed before signing.
                  </p>
                  <textarea
                    rows={3}
                    value={supervisorComments}
                    onChange={(e) => setSupervisorComments(e.target.value)}
                    placeholder="e.g. Competence cross-referenced and verified."
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-rail-blue outline-none"
                  />
                </div>

                {/* Compliance Checkbox */}
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="declaration-check"
                    checked={acceptedDeclaration}
                    onChange={(e) => setAcceptedDeclaration(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-rail-blue rounded border-gray-300 focus:ring-rail-blue"
                  />
                  <label htmlFor="declaration-check" className="text-xs text-blue-950 font-medium leading-relaxed select-none">
                    I, <strong>{supervisorName || '[Supervisor Name]'}</strong>, confirm that I have reviewed this work experience log entry and verify that the described signalling activities were performed safely and to standard.
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleRejectWithComments}
                  disabled={submitting}
                  className="px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition flex items-center gap-1.5"
                >
                  <XCircle size={16} /> Request Changes
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApproveAndSign}
                    disabled={submitting}
                    className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                  >
                    {submitting ? (
                      'Sealing & Signing...'
                    ) : (
                      <>
                        <ShieldCheck size={16} /> Approve & Digitally Sign
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
