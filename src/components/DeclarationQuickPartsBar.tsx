import React, { useEffect, useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, removeUndefinedProperties } from '../lib/firebase';
import { DeclarationQuickPart, certifierQuickPartsDocId } from '../constants';

interface DeclarationQuickPartsBarProps {
  riw: string;
  currentText: string;
  onInsert: (text: string) => void;
}

export function DeclarationQuickPartsBar({ riw, currentText, onInsert }: DeclarationQuickPartsBarProps) {
  const [parts, setParts] = useState<DeclarationQuickPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const docId = certifierQuickPartsDocId(riw);

  useEffect(() => {
    if (!docId) {
      setParts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, 'certifierQuickParts', docId));
        if (cancelled) return;
        const loaded = snap.exists() && Array.isArray(snap.data().parts) ? snap.data().parts : [];
        setParts(loaded.filter((p: DeclarationQuickPart) => p && p.id && p.label && p.text));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `certifierQuickParts/${docId}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  const persist = async (next: DeclarationQuickPart[]) => {
    await setDoc(doc(db, 'certifierQuickParts', docId), removeUndefinedProperties({
      riw: riw.trim(),
      parts: next,
      updatedAt: serverTimestamp()
    }));
    setParts(next);
  };

  const handleSaveCurrent = async () => {
    const text = currentText.trim();
    if (!text) {
      alert('Enter some declaration text first, then save it as a Quick Part.');
      return;
    }
    if (!docId) {
      alert('Enter your RIW / Assessor ID first so Quick Parts can be saved to your profile.');
      return;
    }
    const label = prompt('Short label for this declaration Quick Part:');
    if (!label?.trim()) return;
    const newPart: DeclarationQuickPart = {
      id: `dqp_${Date.now()}`,
      label: label.trim().slice(0, 64),
      text
    };
    try {
      await persist([...parts, newPart].slice(0, 50));
      setToast(`Saved “${newPart.label}”`);
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `certifierQuickParts/${docId}`);
      alert('Could not save this Quick Part. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!docId) return;
    try {
      await persist(parts.filter(p => p.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `certifierQuickParts/${docId}`);
    }
  };

  if (!riw.trim()) {
    return (
      <p className="text-[10px] text-gray-400">
        Enter your RIW / Assessor ID above to load and save your personal declaration Quick Parts.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles size={12} className="text-amber-500 shrink-0" />
          <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Declaration Quick Parts</span>
          {toast && <span className="text-[10px] font-bold text-emerald-600 truncate">{toast}</span>}
        </div>
        <button
          type="button"
          onClick={handleSaveCurrent}
          className="text-[10px] font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md transition shrink-0"
        >
          <Plus size={11} /> Save current
        </button>
      </div>
      {loading ? (
        <p className="text-[10px] text-gray-400">Loading your phrases…</p>
      ) : parts.length === 0 ? (
        <p className="text-[10px] text-gray-400">No saved phrases yet. Write a declaration, then save it for next time.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {parts.map(part => (
            <span
              key={part.id}
              className="inline-flex items-center gap-0.5 bg-white border border-amber-200 rounded-lg overflow-hidden"
            >
              <button
                type="button"
                onClick={() => onInsert(part.text)}
                title={part.text}
                className="text-[10px] font-bold text-amber-800 px-2 py-1 hover:bg-amber-50 transition"
              >
                {part.label}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(part.id)}
                aria-label={`Remove ${part.label}`}
                className="px-1 py-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
