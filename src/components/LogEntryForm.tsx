import React, { useEffect, useState, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '../lib/AuthContext';
import { db, handleFirestoreError, OperationType, removeUndefinedProperties } from '../lib/firebase';
import { collection, doc, getDoc, setDoc, serverTimestamp, updateDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { useConfig, ApprovingSupervisor } from '../hooks/useConfig';
import { Calendar, MapPin, Wrench, AlertTriangle, ChevronLeft, Save, Loader2, Briefcase, Plus, Trash2, CheckCircle2, ChevronDown, Info, Clock, Zap, FileText, Sparkles, Copy, UserCheck, CreditCard, ShieldCheck, UserPlus, Check, Database, Table } from 'lucide-react';

function manipulateTableHtml(
  html: string,
  action: 'addRow' | 'addRowAbove' | 'deleteRow' | 'addCol' | 'addColLeft' | 'deleteCol' | 'deleteTable',
  activeCellInfo?: { tableIdx?: number; rIdx: number; cIdx: number } | null
): { newHtml: string; newActiveCell: { tableIdx: number; rIdx: number; cIdx: number } | null } {
  if (!html) return { newHtml: html, newActiveCell: null };
  const container = document.createElement('div');
  container.innerHTML = html;

  const tables = Array.from(container.querySelectorAll('table'));
  if (tables.length === 0) return { newHtml: html, newActiveCell: null };

  const targetTableIdx = activeCellInfo?.tableIdx !== undefined && activeCellInfo.tableIdx < tables.length ? activeCellInfo.tableIdx : 0;
  const table = tables[targetTableIdx];

  if (action === 'deleteTable') {
    table.remove();
    return { newHtml: container.innerHTML, newActiveCell: null };
  }

  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return { newHtml: html, newActiveCell: null };

  const totalCols = rows[0] ? rows[0].children.length : 1;

  let targetRowIndex = activeCellInfo ? activeCellInfo.rIdx : (action === 'addRowAbove' ? 0 : rows.length - 1);
  let targetColIndex = activeCellInfo ? activeCellInfo.cIdx : (action === 'addColLeft' ? 0 : totalCols - 1);

  if (targetRowIndex < 0) targetRowIndex = 0;
  if (targetRowIndex >= rows.length) targetRowIndex = rows.length - 1;

  if (targetColIndex < 0) targetColIndex = 0;
  if (targetColIndex >= totalCols) targetColIndex = totalCols - 1;

  const refRow = rows[targetRowIndex];
  let nextActiveRow = targetRowIndex;
  let nextActiveCol = targetColIndex;

  if (action === 'addRow' || action === 'addRowAbove') {
    const isAbove = action === 'addRowAbove';
    const newTr = document.createElement('tr');

    for (let c = 0; c < totalCols; c++) {
      const newTd = document.createElement('td');
      newTd.style.cssText = 'border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 13px; color: #334155; vertical-align: top;';
      newTd.innerHTML = `Cell`;
      newTr.appendChild(newTd);
    }

    if (isAbove) {
      refRow.insertAdjacentElement('beforebegin', newTr);
      nextActiveRow = targetRowIndex;
    } else {
      refRow.insertAdjacentElement('afterend', newTr);
      nextActiveRow = targetRowIndex + 1;
    }
  } else if (action === 'deleteRow') {
    if (rows.length <= 1) {
      table.remove();
      return { newHtml: container.innerHTML, newActiveCell: null };
    } else {
      refRow.remove();
      nextActiveRow = Math.max(0, targetRowIndex - 1);
    }
  } else if (action === 'addCol' || action === 'addColLeft') {
    const isLeft = action === 'addColLeft';
    const insertIdx = isLeft ? targetColIndex : targetColIndex + 1;

    rows.forEach((tr, rIdx) => {
      const isHeader = rIdx === 0;
      const cell = document.createElement('td');
      if (isHeader) {
        cell.style.cssText = 'border: 1px solid #cbd5e1; padding: 8px 10px; background-color: #f1f5f9; text-align: left; font-weight: 600; color: #0f172a; font-size: 13px;';
        cell.innerHTML = `Header`;
      } else {
        cell.style.cssText = 'border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 13px; color: #334155; vertical-align: top;';
        cell.innerHTML = `Cell`;
      }

      const children = Array.from(tr.children);
      const refCell = children[targetColIndex];
      if (isLeft) {
        if (refCell) {
          refCell.insertAdjacentElement('beforebegin', cell);
        } else {
          tr.insertBefore(cell, tr.firstChild);
        }
      } else {
        if (refCell) {
          refCell.insertAdjacentElement('afterend', cell);
        } else {
          tr.appendChild(cell);
        }
      }
    });

    nextActiveCol = insertIdx;
  } else if (action === 'deleteCol') {
    if (totalCols <= 1) {
      table.remove();
      return { newHtml: container.innerHTML, newActiveCell: null };
    } else {
      rows.forEach((tr) => {
        const children = Array.from(tr.children);
        const cellToRemove = children[targetColIndex] || children[children.length - 1];
        cellToRemove?.remove();
      });
      nextActiveCol = Math.max(0, targetColIndex - 1);
    }
  }

  return {
    newHtml: container.innerHTML,
    newActiveCell: { tableIdx: targetTableIdx, rIdx: nextActiveRow, cIdx: nextActiveCol },
  };
}
import { format } from 'date-fns';
import { Controller } from 'react-hook-form';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { ACTIVITY_TEMPLATES, ActivityTemplate, QuickPart, DEFAULT_QUICK_PARTS, DEFAULT_SUPERVISORS } from '../constants';

const logSchema = z.object({
  logNumber: z.string().min(1, 'Log number is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  quarter: z.string().default(''),
  location: z.string().default(''),
  isLocationNA: z.boolean().default(false),
  employer: z.string().default(''),
  client: z.string().default(''),
  infrastructureOwner: z.string().default(''),
  projectName: z.string().default(''),
  isProjectNA: z.boolean().default(false),
  role: z.string().default(''),
  approvingSupervisor: z.string().optional().default(''),
  approvingSupervisorRiw: z.string().optional().default(''),
  equipment: z.array(z.object({
    category: z.string().min(1, 'Category is required'),
    subCategories: z.array(z.string()).min(1, 'Select at least one sub-category'),
  })).min(1, 'At least one equipment entry is required'),
  workType: z.string().min(1, 'Work type is required'),
  workDescription: z.string().refine(
    (val) => {
      const plainText = val ? val.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
      return plainText.length >= 10 && plainText.length <= 5000;
    },
    { message: 'Please provide a detailed description (at least 10 characters)' }
  ),
}).refine(data => data.isLocationNA || (data.location && data.location.trim().length > 0), {
  message: 'Location is required when not N/A',
  path: ['location'],
});

type LogFormValues = z.infer<typeof logSchema>;

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  // Remove script tags and content
  let clean = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
  // Remove iframes, embeds, objects, styles, links
  clean = clean.replace(/<(iframe|object|embed|applet|link|style)[^>]*>([\s\S]*?)<\/\1>/gi, '');
  // Remove event handlers starting with on (e.g. onclick, onload, onerror)
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(['"][^'"]*['"]|[^>\s]+)/gi, '');
  // Prevent javascript: protocol links
  clean = clean.replace(/href\s*=\s*['"]\s*javascript:[^'"]*['"]/gi, 'href="#"');
  return clean;
}

function sanitizeForJSON(val: any, seen = new WeakSet()): any {
  if (val === null || val === undefined) {
    return val;
  }
  
  if (typeof val !== 'object') {
    if (typeof val === 'function' || typeof val === 'symbol') {
      return undefined;
    }
    return val;
  }

  if (seen.has(val)) {
    return undefined;
  }

  // Detect and ignore HTML element, FiberNode, Window, Document, etc.
  if (
    (typeof val.nodeType === 'number') || 
    (val.constructor && val.constructor.name && (
      val.constructor.name.includes('Element') || 
      val.constructor.name.includes('Fiber') || 
      val.constructor.name.includes('Node') ||
      val.constructor.name === 'Window' ||
      val.constructor.name === 'Document'
    )) ||
    val.stateNode || 
    val._reactFiber
  ) {
    return undefined;
  }

  seen.add(val);

  if (Array.isArray(val)) {
    return val
      .map(item => sanitizeForJSON(item, seen))
      .filter(item => item !== undefined);
  }

  const cleanObj: Record<string, any> = {};
  for (const key in val) {
    if (Object.prototype.hasOwnProperty.call(val, key)) {
      const cleanVal = sanitizeForJSON(val[key], seen);
      if (cleanVal !== undefined) {
        cleanObj[key] = cleanVal;
      }
    }
  }
  return cleanObj;
}

interface LogEntryFormProps {
  entryId?: string | null;
  duplicateId?: string | null;
  onClose: () => void;
}

export function LogEntryForm({ entryId, duplicateId, onClose }: LogEntryFormProps) {
  const { user, profile, updateProfile } = useAuth();
  const { config, addToConfig } = useConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [isAddingNew, setIsAddingNew] = useState<Record<string, boolean>>({});
  const [draftAvailable, setDraftAvailable] = useState<any | null>(null);
  const [draftStatus, setDraftStatus] = useState<'saving' | 'saved' | null>(null);
  const [templateToast, setTemplateToast] = useState<string | null>(null);
  const [qpCategoryFilter, setQpCategoryFilter] = useState<string>('All');
  const [isQuickPartsExpanded, setIsQuickPartsExpanded] = useState(false);
  const [showSupDropdown, setShowSupDropdown] = useState(false);

  const [isTableDropdownOpen, setIsTableDropdownOpen] = useState(false);
  const [gridHover, setGridHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [customRows, setCustomRows] = useState<number>(2);
  const [customCols, setCustomCols] = useState<number>(3);
  const [activeCellInfo, setActiveCellInfo] = useState<{ tableIdx?: number; rIdx: number; cIdx: number } | null>(null);
  const quillRef = React.useRef<any>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      let node: Node | null = sel.getRangeAt(0).startContainer;
      if (node && node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode;
      }
      const el = node as HTMLElement | null;
      if (!el) return;
      const td = el.closest('td, th');
      const tr = el.closest('tr');
      if (td && tr) {
        const table = tr.closest('table');
        if (table) {
          const tables = Array.from(document.querySelectorAll('.ql-editor table'));
          const tableIdx = Math.max(0, tables.indexOf(table));
          const rows = Array.from(table.querySelectorAll('tr'));
          const rIdx = rows.indexOf(tr as HTMLTableRowElement);
          const cIdx = Array.from(tr.children).indexOf(td as HTMLElement);
          if (rIdx !== -1 && cIdx !== -1) {
            setActiveCellInfo({ tableIdx, rIdx, cIdx });
          }
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const td = target.closest('td, th');
    const tr = target.closest('tr');
    if (td && tr) {
      const table = tr.closest('table');
      if (table) {
        const tables = Array.from(document.querySelectorAll('.ql-editor table'));
        const tableIdx = Math.max(0, tables.indexOf(table));
        const rows = Array.from(table.querySelectorAll('tr'));
        const rIdx = rows.indexOf(tr as HTMLTableRowElement);
        const cIdx = Array.from(tr.children).indexOf(td as HTMLElement);
        if (rIdx !== -1 && cIdx !== -1) {
          setActiveCellInfo({ tableIdx, rIdx, cIdx });
        }
      }
    }
  };

  const handleInsertTable = (cols: number, rows: number) => {
    setIsTableDropdownOpen(false);
    let tableHtml = `<table class="quill-table" style="width: 100%; border-collapse: collapse; margin: 12px 0; border: 1px solid #cbd5e1; table-layout: fixed;"><tbody><tr>`;
    for (let c = 0; c < cols; c++) {
      tableHtml += `<td style="border: 1px solid #cbd5e1; padding: 8px 10px; background-color: #f1f5f9; text-align: left; font-weight: 600; color: #0f172a; font-size: 13px;">Header ${c + 1}</td>`;
    }
    tableHtml += `</tr>`;
    for (let r = 0; r < rows; r++) {
      tableHtml += `<tr>`;
      for (let c = 0; c < cols; c++) {
        tableHtml += `<td style="border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 13px; color: #334155; vertical-align: top;">Cell ${r + 1}-${c + 1}</td>`;
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table><p><br/></p>`;

    const currentVal = watch('workDescription') || '';
    setValue('workDescription', currentVal + tableHtml);
    clearErrors('workDescription');
    setActiveCellInfo({ tableIdx: 0, rIdx: 0, cIdx: 0 });
    setTemplateToast(`Inserted ${cols} × ${rows} Table (Full Width)`);
    setTimeout(() => setTemplateToast(null), 3000);
  };

  const handleTableAction = (
    action: 'addRow' | 'addRowAbove' | 'deleteRow' | 'addCol' | 'addColLeft' | 'deleteCol' | 'deleteTable'
  ) => {
    const editorEl = (quillRef.current?.getEditor ? quillRef.current.getEditor().root : null) || (document.querySelector('.ql-editor') as HTMLElement | null);
    if (!editorEl) return;

    const tables = Array.from(editorEl.querySelectorAll('table'));
    if (tables.length === 0) return;

    // Determine current active cell live from selection or document focus
    let targetTable: HTMLTableElement | null = null;
    let targetTableIdx = 0;
    let targetRowIndex = 0;
    let targetColIndex = 0;

    const sel = window.getSelection();
    let currentTd: HTMLElement | null = null;

    if (sel && sel.rangeCount > 0) {
      let node: Node | null = sel.getRangeAt(0).startContainer;
      if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      if (node && editorEl.contains(node)) {
        currentTd = (node as HTMLElement).closest('td, th');
      }
    }

    if (!currentTd && document.activeElement && editorEl.contains(document.activeElement)) {
      currentTd = (document.activeElement as HTMLElement).closest('td, th');
    }

    if (currentTd) {
      const tr = currentTd.closest('tr');
      const table = tr?.closest('table');
      if (tr && table) {
        targetTable = table as HTMLTableElement;
        targetTableIdx = Math.max(0, tables.indexOf(targetTable));
        targetRowIndex = Math.max(0, Array.from(table.querySelectorAll('tr')).indexOf(tr));
        targetColIndex = Math.max(0, Array.from(tr.children).indexOf(currentTd));
      }
    }

    // If no active cell found via selection, use activeCellInfo state or fallback
    if (!targetTable) {
      targetTableIdx = activeCellInfo?.tableIdx !== undefined && activeCellInfo.tableIdx < tables.length ? activeCellInfo.tableIdx : 0;
      targetTable = tables[targetTableIdx] as HTMLTableElement;
      if (!targetTable) return;

      const rows = Array.from(targetTable.querySelectorAll('tr'));
      if (rows.length === 0) return;
      const totalCols = rows[0] ? rows[0].children.length : 1;

      targetRowIndex = activeCellInfo ? activeCellInfo.rIdx : (action === 'addRowAbove' ? 0 : rows.length - 1);
      targetColIndex = activeCellInfo ? activeCellInfo.cIdx : (action === 'addColLeft' ? 0 : totalCols - 1);

      if (targetRowIndex < 0) targetRowIndex = 0;
      if (targetRowIndex >= rows.length) targetRowIndex = rows.length - 1;

      if (targetColIndex < 0) targetColIndex = 0;
      if (targetColIndex >= totalCols) targetColIndex = totalCols - 1;
    }

    if (action === 'deleteTable') {
      targetTable.remove();
      const newHtml = editorEl.innerHTML;
      setValue('workDescription', newHtml, { shouldValidate: true, shouldDirty: true });
      setActiveCellInfo(null);
      return;
    }

    const rows = Array.from(targetTable.querySelectorAll('tr'));
    if (rows.length === 0) return;

    const totalCols = rows[0] ? rows[0].children.length : 1;
    if (targetRowIndex >= rows.length) targetRowIndex = rows.length - 1;
    if (targetColIndex >= totalCols) targetColIndex = totalCols - 1;

    const refRow = rows[targetRowIndex];
    let nextActiveRow = targetRowIndex;
    let nextActiveCol = targetColIndex;
    let focusCell: HTMLElement | null = null;

    if (action === 'addRowAbove' || action === 'addRow') {
      const isAbove = action === 'addRowAbove';
      const newTr = document.createElement('tr');

      for (let c = 0; c < totalCols; c++) {
        const newTd = document.createElement('td');
        newTd.style.cssText = 'border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 13px; color: #334155; vertical-align: top;';
        newTd.innerHTML = `Cell`;
        newTr.appendChild(newTd);
      }

      if (isAbove) {
        refRow.insertAdjacentElement('beforebegin', newTr);
        nextActiveRow = targetRowIndex;
      } else {
        refRow.insertAdjacentElement('afterend', newTr);
        nextActiveRow = targetRowIndex + 1;
      }

      focusCell = newTr.children[Math.min(targetColIndex, totalCols - 1)] as HTMLElement;
    } else if (action === 'deleteRow') {
      if (rows.length <= 1) {
        targetTable.remove();
        const newHtml = editorEl.innerHTML;
        setValue('workDescription', newHtml, { shouldValidate: true, shouldDirty: true });
        setActiveCellInfo(null);
        return;
      } else {
        refRow.remove();
        nextActiveRow = Math.max(0, targetRowIndex - 1);
        const remainingRows = Array.from(targetTable.querySelectorAll('tr'));
        if (remainingRows[nextActiveRow]) {
          focusCell = remainingRows[nextActiveRow].children[Math.min(targetColIndex, totalCols - 1)] as HTMLElement;
        }
      }
    } else if (action === 'addColLeft' || action === 'addCol') {
      const isLeft = action === 'addColLeft';
      nextActiveCol = isLeft ? targetColIndex : targetColIndex + 1;

      rows.forEach((tr, rIdx) => {
        const isHeader = rIdx === 0;
        const cell = document.createElement('td');
        if (isHeader) {
          cell.style.cssText = 'border: 1px solid #cbd5e1; padding: 8px 10px; background-color: #f1f5f9; text-align: left; font-weight: 600; color: #0f172a; font-size: 13px;';
          cell.innerHTML = `Header`;
        } else {
          cell.style.cssText = 'border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 13px; color: #334155; vertical-align: top;';
          cell.innerHTML = `Cell`;
        }

        const refCell = tr.children[targetColIndex];
        if (isLeft) {
          if (refCell) {
            refCell.insertAdjacentElement('beforebegin', cell);
          } else {
            tr.appendChild(cell);
          }
        } else {
          if (refCell) {
            refCell.insertAdjacentElement('afterend', cell);
          } else {
            tr.appendChild(cell);
          }
        }

        if (rIdx === targetRowIndex) {
          focusCell = cell;
        }
      });
    } else if (action === 'deleteCol') {
      if (totalCols <= 1) {
        targetTable.remove();
        const newHtml = editorEl.innerHTML;
        setValue('workDescription', newHtml, { shouldValidate: true, shouldDirty: true });
        setActiveCellInfo(null);
        return;
      } else {
        rows.forEach((tr) => {
          const cellToRemove = tr.children[targetColIndex] || tr.children[tr.children.length - 1];
          cellToRemove?.remove();
        });
        nextActiveCol = Math.max(0, targetColIndex - 1);
        const remainingRows = Array.from(targetTable.querySelectorAll('tr'));
        if (remainingRows[targetRowIndex]) {
          focusCell = remainingRows[targetRowIndex].children[nextActiveCol] as HTMLElement;
        }
      }
    }

    const updatedHtml = editorEl.innerHTML;
    setValue('workDescription', updatedHtml, { shouldValidate: true, shouldDirty: true });
    setActiveCellInfo({ tableIdx: targetTableIdx, rIdx: nextActiveRow, cIdx: nextActiveCol });

    if (focusCell) {
      setTimeout(() => {
        if (focusCell) {
          focusCell.focus();
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.selectNodeContents(focusCell);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }, 20);
    }
  };

  const availableQuickParts: QuickPart[] = useMemo(() => {
    if (config?.quickParts && config.quickParts.length > 0) {
      return config.quickParts;
    }
    return DEFAULT_QUICK_PARTS;
  }, [config]);

  const quickPartCategories = useMemo(() => {
    const set = new Set<string>();
    availableQuickParts.forEach(qp => {
      if (qp.category) set.add(qp.category);
    });
    return Array.from(set);
  }, [availableQuickParts]);

  const filteredQuickParts = useMemo(() => {
    if (qpCategoryFilter === 'All') return availableQuickParts;
    return availableQuickParts.filter(qp => qp.category === qpCategoryFilter);
  }, [availableQuickParts, qpCategoryFilter]);

  const handleApplyQuickPart = (part: QuickPart) => {
    const currentVal = watch('workDescription') || '';
    const plainText = currentVal.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    
    if (plainText.length > 0) {
      // Cleanly append to existing HTML content
      const separator = currentVal.trim().endsWith('</p>') ? '' : '<br/>';
      setValue('workDescription', currentVal + separator + part.descriptionHtml);
    } else {
      setValue('workDescription', part.descriptionHtml);
    }

    if (part.suggestedWorkType && (!watch('workType') || watch('workType') === '')) {
      setValue('workType', part.suggestedWorkType);
    }

    clearErrors('workDescription');
    setTemplateToast(`Appended Quick Part: "${part.title}"`);
    setTimeout(() => setTemplateToast(null), 3000);
  };

  const handleSaveQuickPartToDatabase = async () => {
    const currentVal = watch('workDescription') || '';
    const plainText = currentVal.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (plainText.length < 5) {
      alert('Please enter a description first before saving it as a Quick Part.');
      return;
    }
    const title = prompt('Enter a Title for this Quick Part (e.g. "TI21 Track Circuit Adjustment"):');
    if (!title || !title.trim()) return;

    const shortLabel = prompt('Enter a short Button Label (e.g. "TI21 Adjustment"):', title.trim().substring(0, 18));
    if (!shortLabel || !shortLabel.trim()) return;

    const categoryPrompt = prompt('Enter a Category (e.g. "Testing & Commissioning", "Maintenance", "Corrective"):', 'Custom');
    const category = (categoryPrompt && categoryPrompt.trim()) ? categoryPrompt.trim() : 'Custom';

    const newQP: QuickPart = {
      id: `qp_${Date.now()}`,
      title: title.trim(),
      shortLabel: shortLabel.trim(),
      category: category,
      suggestedWorkType: watch('workType') || undefined,
      descriptionHtml: currentVal
    };

    try {
      const existingQPs = config?.quickParts && config.quickParts.length > 0 ? config.quickParts : DEFAULT_QUICK_PARTS;
      const updatedQPs = [...existingQPs, newQP];
      await updateDoc(doc(db, 'config', 'main'), removeUndefinedProperties({ quickParts: updatedQPs }));
      setTemplateToast(`Saved "${title.trim()}" to Database Quick Parts!`);
      setTimeout(() => setTemplateToast(null), 3500);
    } catch (err) {
      console.error('Failed to save Quick Part to database:', err);
      alert('Failed to save Quick Part to database. Please try again.');
    }
  };

  const handleSaveSupervisorToDatabase = async () => {
    const name = watch('approvingSupervisor')?.trim();
    const riw = watch('approvingSupervisorRiw')?.trim();
    if (!name || !riw) {
      alert('Please fill in both the Supervisor Name and RIW Number first.');
      return;
    }

    const existing = config?.approvingSupervisors || [];
    const isDup = existing.some(s => s.name.toLowerCase() === name.toLowerCase() && s.riwNumber === riw);
    if (isDup) {
      alert('This supervisor is already registered in your database.');
      return;
    }

    const newSup: ApprovingSupervisor = {
      id: `sup_${Date.now()}`,
      name,
      riwNumber: riw
    };

    try {
      const updated = [...existing, newSup];
      await updateDoc(doc(db, 'config', 'main'), removeUndefinedProperties({ approvingSupervisors: updated }));
      setTemplateToast(`Saved supervisor "${name}" (RIW: ${riw}) to Database!`);
      setTimeout(() => setTemplateToast(null), 3500);
    } catch (err) {
      console.error('Failed to save supervisor to database:', err);
      alert('Failed to save supervisor to database. Please try again.');
    }
  };

  const toggleAddNew = (field: string, show: boolean) => {
    setIsAddingNew(prev => ({ ...prev, [field]: show }));
    if (show) {
      setValue(field as any, '');
    }
  };

  const { register, handleSubmit, control, watch, setValue, reset, clearErrors, formState: { errors } } = useForm<LogFormValues>({
    resolver: zodResolver(logSchema) as any,
    defaultValues: {
      logNumber: '',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
      quarter: '',
      location: '',
      isLocationNA: false,
      employer: '',
      client: '',
      infrastructureOwner: '',
      projectName: '',
      isProjectNA: false,
      role: '',
      approvingSupervisor: '',
      approvingSupervisorRiw: '',
      equipment: [{ category: '', subCategories: [] }],
      workType: '',
      workDescription: '',
    },
  });

  // Load draft on mount or user/entryId change
  useEffect(() => {
    if (user?.uid) {
      const key = `signalling_log_draft_${user.uid}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.values) {
            const draftEntryId = parsed.entryId || null;
            const currentEntryId = entryId || null;
            const draftDuplicateId = parsed.duplicateId || null;
            const currentDuplicateId = duplicateId || null;

            // Offer to restore if it's the exact same context (editing same log, duplicating same log, or both creating new log)
            if (draftEntryId === currentEntryId && draftDuplicateId === currentDuplicateId) {
              setDraftAvailable(parsed);
            }
          }
        } catch (e) {
          console.error('Error parsing draft:', e);
        }
      }
    }
  }, [user, entryId, duplicateId]);

  const handleRestoreDraft = () => {
    if (draftAvailable?.values) {
      reset(draftAvailable.values);
      setDraftAvailable(null);
    }
  };

  const handleDiscardDraft = () => {
    if (user?.uid) {
      localStorage.removeItem(`signalling_log_draft_${user.uid}`);
    }
    setDraftAvailable(null);
  };

  const endDate = watch('endDate');
  const userNumSys = profile?.numberingSystem || { prefix: 'LOG-', nextNumber: 1, enabled: true };
  const userQuarterFormat = profile?.quarterFormat || 'Q1-Q4';

  // Calculate Quarter
  useEffect(() => {
    if (!endDate) return;
    
    const date = new Date(endDate);
    const month = date.getMonth(); // 0-indexed
    
    // AU Financial Year (Starts July)
    // Q1: Jul(6), Aug(7), Sep(8)
    // Q2: Oct(9), Nov(10), Dec(11)
    // Q3: Jan(0), Feb(1), Mar(2)
    // Q4: Apr(3), May(4), Jun(5)
    
    let q = '';
    let months = '';
    
    if (month >= 6 && month <= 8) { q = 'Q1'; months = 'Jul-Sep'; }
    else if (month >= 9 && month <= 11) { q = 'Q2'; months = 'Oct-Dec'; }
    else if (month >= 0 && month <= 2) { q = 'Q3'; months = 'Jan-Mar'; }
    else if (month >= 3 && month <= 5) { q = 'Q4'; months = 'Apr-Jun'; }
    
    const displayValue = userQuarterFormat === 'Q1-Q4' ? q : months;
    setValue('quarter', displayValue);
  }, [endDate, userQuarterFormat, setValue]);

  // Handle Auto-Numbering
  useEffect(() => {
    // Only auto-number if it's a new entry (including duplicates) and enabled
    if (!entryId && userNumSys.enabled && user) {
      const calculateNextNumber = async () => {
        try {
          // Get recent logs to find the highest number
          const q = query(
            collection(db, 'logEntries'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(50)
          );
          
          const snap = await getDocs(q);
          let highestNum = 0;
          const prefix = userNumSys.prefix || '';
          
          // Extract maximum numeric part from recent logs
          snap.docs.forEach(d => {
            const numStr = d.data().logNumber as string;
            if (numStr && numStr.startsWith(prefix)) {
              const numPart = numStr.substring(prefix.length);
              const num = parseInt(numPart, 10);
              if (!isNaN(num) && num > highestNum) {
                highestNum = num;
              }
            }
          });

          // Compare with user profile config and take the higher + 1
          const userNext = userNumSys.nextNumber || 1;
          const finalNext = Math.max(highestNum + 1, userNext);
          
          setValue('logNumber', `${prefix}${finalNext}`);
        } catch (error) {
          console.error('Error calculating next log number:', error);
          // Fallback to basic user profile config
          const num = userNumSys.nextNumber || 1;
          const prefix = userNumSys.prefix || '';
          setValue('logNumber', `${prefix}${num}`);
        }
      };

      calculateNextNumber();
    }
  }, [userNumSys.enabled, userNumSys.prefix, userNumSys.nextNumber, entryId, user, setValue, duplicateId]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'equipment',
  });

  const isProjectNA = watch('isProjectNA');
  const isLocationNA = watch('isLocationNA');

  useEffect(() => {
    if (isLocationNA) {
      clearErrors('location');
      setValue('location', '');
    }
  }, [isLocationNA, clearErrors, setValue]);

  useEffect(() => {
    if (isProjectNA) {
      clearErrors('projectName');
      setValue('projectName', '');
    }
  }, [isProjectNA, clearErrors, setValue]);

  useEffect(() => {
    if (!entryId && !duplicateId && profile) {
      if (profile.isLocationNA) {
        setValue('isLocationNA', true);
      } else if (profile.location && !watch('location')) {
        setValue('location', profile.location);
      }
    }
  }, [profile, entryId, duplicateId, setValue]);

  useEffect(() => {
    const targetId = entryId || duplicateId;
    if (targetId) {
      const fetchEntry = async () => {
        try {
          const entryDoc = await getDoc(doc(db, 'logEntries', targetId));
          if (entryDoc.exists()) {
            const data = entryDoc.data();
            if (user && data.userId && data.userId !== user.uid) {
              console.warn("Attempted to access log entry belonging to another user.");
              return;
            }
            Object.entries(data).forEach(([key, value]) => {
              if (key in logSchema.shape) {
                // If duplicating, reset dates to today and DON'T copy the log number
                if (duplicateId && (key === 'startDate' || key === 'endDate')) {
                  setValue(key as keyof LogFormValues, format(new Date(), 'yyyy-MM-dd'));
                } else if (duplicateId && key === 'logNumber') {
                  // Keep the auto-calculated number for duplicates
                  return;
                } else {
                  setValue(key as keyof LogFormValues, value as any);
                }
              }
            });
          }
        } catch (error) {
          console.error('Error fetching entry:', error);
        }
      };
      fetchEntry();
    }
  }, [entryId, duplicateId, setValue]);

  const formValues = watch();

  const currentSupName = watch('approvingSupervisor')?.trim() || '';
  const currentSupRiw = watch('approvingSupervisorRiw')?.trim() || '';
  const existingSupervisors = useMemo(() => (config?.approvingSupervisors && config.approvingSupervisors.length > 0) ? config.approvingSupervisors : DEFAULT_SUPERVISORS, [config?.approvingSupervisors]);

  const selectedSupId = useMemo(() => {
    if (!currentSupName || !currentSupRiw) return '';
    const found = existingSupervisors.find(
      s => s.name.toLowerCase() === currentSupName.toLowerCase() && s.riwNumber.toLowerCase() === currentSupRiw.toLowerCase()
    );
    return found ? found.id : '';
  }, [currentSupName, currentSupRiw, existingSupervisors]);

  const isMatchedInDb = Boolean(selectedSupId);

  // Auto-save draft on form changes
  useEffect(() => {
    if (!user || isSubmitting) return;

    // Check if the form is substantively dirty or modified to prevent saving empty default states
    const hasContent = 
      (formValues.workDescription && formValues.workDescription.trim().length > 10) ||
      formValues.location ||
      formValues.workType ||
      formValues.role ||
      formValues.employer ||
      formValues.client ||
      formValues.infrastructureOwner ||
      formValues.projectName ||
      (formValues.equipment && formValues.equipment.some((e: any) => e.category || (e.subCategories && e.subCategories.length > 0)));

    if (!hasContent) {
      return;
    }

    setDraftStatus('saving');

    const timer = setTimeout(() => {
      const key = `signalling_log_draft_${user.uid}`;
      const draftData = {
        values: sanitizeForJSON(formValues),
        timestamp: Date.now(),
        entryId: entryId || null,
        duplicateId: duplicateId || null
      };
      localStorage.setItem(key, JSON.stringify(draftData));
      setDraftStatus('saved');
    }, 1000); // 1-second debounce to avoid writing to localStorage too aggressively

    return () => clearTimeout(timer);
  }, [formValues, user, entryId, duplicateId, isSubmitting]);

  const onSubmit = async (data: LogFormValues) => {
    if (!user || !profile) return;
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      const logData = {
        ...data,
        workDescription: sanitizeHtml(data.workDescription),
        userId: user.uid,
        certifierName: profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Unknown User',
        certifierEmail: user.email || 'N/A',
        updatedAt: serverTimestamp(),
      };

      const path = entryId ? `logEntries/${entryId}` : 'logEntries';
      
      if (entryId) {
        try {
          await updateDoc(doc(db, 'logEntries', entryId), removeUndefinedProperties(logData));
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        try {
          const newDocRef = doc(collection(db, 'logEntries'));
          await setDoc(newDocRef, removeUndefinedProperties({
            ...logData,
            createdAt: serverTimestamp(),
          }));

          // Smart incrementing: if the saved number is the current nextNumber, or higher, update user profile
          if (userNumSys.enabled && user) {
            const prefix = userNumSys.prefix || '';
            let savedNum = 0;
            if (data.logNumber.startsWith(prefix)) {
              savedNum = parseInt(data.logNumber.substring(prefix.length), 10);
            }

            if (!isNaN(savedNum) && savedNum >= userNumSys.nextNumber) {
              await updateProfile({
                numberingSystem: {
                  ...userNumSys,
                  nextNumber: savedNum + 1
                }
              });
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      }

      // Add to config in background (swallow errors so main log save doesn't fail if config update fails)
      const configUpdates: Promise<any>[] = [
        data.location && !data.isLocationNA ? addToConfig('locations', data.location) : null,
        data.employer ? addToConfig('employers', data.employer) : null,
        data.client ? addToConfig('clients', data.client) : null,
        data.infrastructureOwner ? addToConfig('infrastructureOwners', data.infrastructureOwner) : null,
        data.projectName && !data.isProjectNA ? addToConfig('projects', data.projectName) : null,
        data.workType ? addToConfig('workTypes', data.workType) : null,
        data.role ? addToConfig('roles', data.role) : null,
      ].filter(Boolean) as Promise<any>[];

      // Auto-save approving supervisor to database if new
      if (data.approvingSupervisor?.trim() && data.approvingSupervisorRiw?.trim()) {
        const supName = data.approvingSupervisor.trim();
        const supRiw = data.approvingSupervisorRiw.trim();
        const existingSups = config?.approvingSupervisors || [];
        const isDupSup = existingSups.some(
          s => s.name.toLowerCase() === supName.toLowerCase() && s.riwNumber.toLowerCase() === supRiw.toLowerCase()
        );
        if (!isDupSup) {
          const newSup: ApprovingSupervisor = {
            id: `sup_${Date.now()}`,
            name: supName,
            riwNumber: supRiw
          };
          const updatedSups = [...existingSups, newSup];
          configUpdates.push(
            updateDoc(doc(db, 'config', 'main'), removeUndefinedProperties({ approvingSupervisors: updatedSups }))
          );
        }
      }

      // We don't await these to keep the UI snappy and avoid blocking if config save is slow
      Promise.allSettled(configUpdates).catch(err => console.error('Config background update error:', err));

      if (user) {
        localStorage.removeItem(`signalling_log_draft_${user.uid}`);
      }
      onClose();
    } catch (error: any) {
      console.error('Submission error:', error);
      let message = 'An unexpected error occurred. Please try again.';
      try {
        const errJson = JSON.parse(error.message);
        message = `Firestore Error: ${errJson.error}. (Operation: ${errJson.operationType}, Path: ${errJson.path})`;
      } catch {
        message = error.message || message;
      }
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 mb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-rail-blue p-6 text-white flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-md transition" type="button">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 className="text-xl font-bold">
              {entryId ? 'Edit Log Entry' : duplicateId ? 'Duplicate Log Entry' : 'New Signalling Log'}
            </h2>
            <p className="text-[10px] uppercase font-mono opacity-60 tracking-widest">Industry Standards Compliant</p>
          </div>
        </div>

        {draftStatus && (
          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-xs font-semibold animate-in fade-in duration-200">
            {draftStatus === 'saving' ? (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                </span>
                <span className="text-white/90 text-[10px] font-mono uppercase tracking-wider">Saving draft...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold text-xs">✓</span>
                <span className="text-white/90 text-[10px] font-mono uppercase tracking-wider">Draft saved</span>
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit, (err) => {
        console.error('Form Validation Errors:', err);
        const fieldLabels: Record<string, string> = {
          logNumber: 'Log Number',
          startDate: 'Start Date',
          endDate: 'End Date',
          location: 'Location',
          workType: 'Type of Work',
          workDescription: 'Scope of Work / Description',
          equipment: 'Equipment Identification',
          projectName: 'Project Name',
          employer: 'Employer',
          client: 'Client',
          infrastructureOwner: 'Infrastructure Owner',
          role: 'Your Role',
        };
        const missingFields = Object.keys(err)
          .map(k => fieldLabels[k] || k)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(', ');
        setSubmitError(`Validation Error: Please check required fields (${missingFields}).`);
      })} className="p-8 space-y-8">
        {submitError && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="text-red-500 shrink-0" size={20} />
            <div className="flex-1">
              <p className="text-xs font-bold text-red-800 uppercase tracking-tight">Submission Failed</p>
              <p className="text-xs text-red-600 mt-0.5">{submitError}</p>
            </div>
            <button onClick={() => setSubmitError(null)} className="text-red-400 hover:text-red-600">×</button>
          </div>
        )}

        {draftAvailable && (
          <div className="bg-rail-blue/5 border border-rail-blue/10 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start sm:items-center gap-3">
              <div className="text-rail-blue bg-rail-blue/10 p-2 rounded-lg shrink-0">
                <Clock size={18} />
              </div>
              <div>
                <p className="text-xs font-bold text-rail-blue">Unsaved Draft Recovered</p>
                <p className="text-[10px] text-gray-500 font-medium">
                  We recovered an unsaved draft from {new Date(draftAvailable.timestamp).toLocaleString()}. Would you like to resume drafting?
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                onClick={handleRestoreDraft}
                className="px-4 py-1.5 bg-rail-blue hover:bg-rail-blue/90 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="px-4 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        )}
        {/* Section 1: Logistics */}
        <div className="space-y-6">
          <SectionHeader icon={<Calendar size={18} />} title="Logistics & Timeline" />
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <FormInput label="Log Number" error={errors.logNumber?.message}>
              <div className="relative">
                 <input 
                  type="text" 
                  {...register('logNumber')} 
                  className="form-input-artc font-mono font-bold text-rail-blue" 
                  placeholder="e.g. LOG-001"
                />
                {!userNumSys.enabled && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Info size={14} className="text-gray-300" title="Auto-numbering disabled in settings" />
                  </div>
                )}
              </div>
            </FormInput>
            <FormInput label="Start Date" error={errors.startDate?.message}>
              <input type="date" {...register('startDate')} className="form-input-artc" style={{ paddingLeft: '7px' }} />
            </FormInput>
            <div className="space-y-1">
              <FormInput label="End Date" error={errors.endDate?.message}>
                <input type="date" {...register('endDate')} className="form-input-artc" style={{ paddingLeft: '7px' }} />
              </FormInput>
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter" style={{ fontSize: '10px' }}>FY Quarter:</span>
                <span className="text-[9px] font-mono font-bold text-rail-blue bg-rail-blue/5 px-2 py-0.5 rounded border border-rail-blue/10">
                  {watch('quarter') || '...'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <FormInput label="Location (e.g. Km, Signal Box, Station)" error={!isLocationNA ? errors.location?.message : undefined}>
              <div className="space-y-2">
                <div className="relative animate-in fade-in duration-300">
                  {!isAddingNew.location ? (
                    <>
                      <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 transition-colors ${isLocationNA ? 'text-gray-300 opacity-50' : 'text-gray-400'}`} size={16} />
                      <select 
                        {...register('location')} 
                        disabled={isLocationNA}
                        onChange={(e) => {
                          if (e.target.value === 'NEW') {
                            toggleAddNew('location', true);
                          } else {
                            // Standard RHF change
                            register('location').onChange(e);
                          }
                        }}
                        className={`form-select-artc transition-all ${isLocationNA ? 'opacity-50 grayscale bg-gray-100 cursor-not-allowed' : ''}`}
                        style={{ paddingLeft: '2.5rem' }}
                      >
                        <option value="">{isLocationNA ? 'Location N/A' : 'Select Location'}</option>
                        {config?.locations?.map(l => <option key={l} value={l}>{l}</option>)}
                        {!isLocationNA && <option value="NEW" className="font-bold text-rail-blue">+ Add New Location...</option>}
                      </select>
                    </>
                  ) : (
                    <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                      <div className="relative flex-1">
                        <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${isLocationNA ? 'text-gray-300 opacity-50' : 'text-gray-400'}`} size={16} />
                        <input 
                          type="text"
                          {...register('location')}
                          disabled={isLocationNA}
                          placeholder={isLocationNA ? 'Location N/A' : 'Enter new location details'}
                          className={`form-input-artc transition-all ${isLocationNA ? 'opacity-50 grayscale bg-gray-100 cursor-not-allowed' : ''}`}
                          style={{ paddingLeft: '2.5rem' }}
                          autoFocus
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => toggleAddNew('location', false)}
                        className="px-3 py-2 text-xs font-bold text-rail-blue hover:bg-rail-blue/5 rounded-lg transition-colors border border-rail-blue/20"
                      >
                        Back
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </FormInput>
            <div className="flex items-center gap-2 mb-2.5 shrink-0">
              <input type="checkbox" id="isLocationNA" {...register('isLocationNA')} className="w-5 h-5 accent-rail-blue cursor-pointer" />
              <label htmlFor="isLocationNA" className="text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none">N/A</label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FormInput label="Employer" error={errors.employer?.message}>
              {!isAddingNew.employer ? (
                <select 
                  {...register('employer')} 
                  onChange={(e) => {
                    if (e.target.value === 'NEW') {
                      toggleAddNew('employer', true);
                    } else {
                      register('employer').onChange(e);
                    }
                  }}
                  className="form-select-artc"
                >
                  <option value="">Select Employer</option>
                  {config?.employers?.map(e => <option key={e} value={e}>{e}</option>)}
                  <option value="NEW" className="font-bold text-rail-blue">+ Add New Employer...</option>
                </select>
              ) : (
                <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                  <input 
                    type="text"
                    {...register('employer')}
                    placeholder="Enter new employer"
                    className="form-input-artc"
                    autoFocus
                  />
                  <button type="button" onClick={() => toggleAddNew('employer', false)} className="px-3 py-2 text-xs font-bold text-rail-blue border border-rail-blue/20 rounded-lg">Back</button>
                </div>
              )}
            </FormInput>
            <FormInput label="Client" error={errors.client?.message}>
              {!isAddingNew.client ? (
                <select 
                  {...register('client')} 
                  onChange={(e) => {
                    if (e.target.value === 'NEW') {
                      toggleAddNew('client', true);
                    } else {
                      register('client').onChange(e);
                    }
                  }}
                  className="form-select-artc"
                >
                  <option value="">Select Client</option>
                  {config?.clients?.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="NEW" className="font-bold text-rail-blue">+ Add New Client...</option>
                </select>
              ) : (
                <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                  <input 
                    type="text"
                    {...register('client')}
                    placeholder="Enter new client"
                    className="form-input-artc"
                    autoFocus
                  />
                  <button type="button" onClick={() => toggleAddNew('client', false)} className="px-3 py-2 text-xs font-bold text-rail-blue border border-rail-blue/20 rounded-lg">Back</button>
                </div>
              )}
            </FormInput>
            <FormInput label="Infrastructure Owner" error={errors.infrastructureOwner?.message}>
              {!isAddingNew.infrastructureOwner ? (
                <select 
                  {...register('infrastructureOwner')} 
                  onChange={(e) => {
                    if (e.target.value === 'NEW') {
                      toggleAddNew('infrastructureOwner', true);
                    } else {
                      register('infrastructureOwner').onChange(e);
                    }
                  }}
                  className="form-select-artc"
                >
                  <option value="">Select Owner</option>
                  {config?.infrastructureOwners?.map(o => <option key={o} value={o}>{o}</option>)}
                  <option value="NEW" className="font-bold text-rail-blue">+ Add New Owner...</option>
                </select>
              ) : (
                <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                  <input 
                    type="text"
                    {...register('infrastructureOwner')}
                    placeholder="Enter new owner"
                    className="form-input-artc"
                    autoFocus
                  />
                  <button type="button" onClick={() => toggleAddNew('infrastructureOwner', false)} className="px-3 py-2 text-xs font-bold text-rail-blue border border-rail-blue/20 rounded-lg">Back</button>
                </div>
              )}
            </FormInput>

            <div className="flex gap-4 items-end">
              <div className="flex-1 w-full">
                <FormInput label="Project Name" error={errors.projectName?.message}>
                  <div className="space-y-2">
                    <div className="relative animate-in fade-in duration-300">
                      {!isAddingNew.projectName ? (
                        <>
                          <Briefcase className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10 ${isProjectNA ? 'opacity-50' : ''}`} size={16} />
                          <select 
                            {...register('projectName')} 
                            disabled={isProjectNA}
                            onChange={(e) => {
                              if (e.target.value === 'NEW') {
                                toggleAddNew('projectName', true);
                              } else {
                                register('projectName').onChange(e);
                              }
                            }}
                            className={`form-select-artc ${isProjectNA ? 'opacity-50 grayscale' : ''}`}
                            style={{ paddingLeft: '2.5rem' }}
                          >
                            <option value="">{isProjectNA ? 'Project N/A' : 'Select Project'}</option>
                            {config?.projects?.map(p => <option key={p} value={p}>{p}</option>)}
                            {!isProjectNA && <option value="NEW" className="font-bold text-rail-blue">+ Add New Project...</option>}
                          </select>
                        </>
                      ) : (
                        <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                          <input 
                            type="text"
                            {...register('projectName')}
                            placeholder="Enter new project"
                            className="form-input-artc"
                            style={{ paddingLeft: '2.5rem' }}
                            autoFocus
                          />
                          <button type="button" onClick={() => toggleAddNew('projectName', false)} className="px-3 py-2 text-xs font-bold text-rail-blue border border-rail-blue/20 rounded-lg">Back</button>
                        </div>
                      )}
                    </div>
                  </div>
                </FormInput>
              </div>
              <div className="flex items-center gap-2 mb-2.5 shrink-0">
                <input type="checkbox" id="isProjectNA" {...register('isProjectNA')} className="w-5 h-5 accent-rail-blue cursor-pointer" />
                <label htmlFor="isProjectNA" className="text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer">N/A</label>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Task Description */}
        <div className="space-y-6">
          <SectionHeader icon={<AlertTriangle size={18} />} title="Task Description" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FormInput label="Type of Work" error={errors.workType?.message}>
              <div className="space-y-2">
                {!isAddingNew.workType ? (
                  <select 
                    {...register('workType')} 
                    onChange={(e) => {
                      if (e.target.value === 'NEW') {
                        toggleAddNew('workType', true);
                      } else {
                        register('workType').onChange(e);
                      }
                    }}
                    className="form-select-artc"
                  >
                    <option value="">Select Work Type</option>
                    {config?.workTypes?.map(w => <option key={w} value={w}>{w}</option>)}
                    <option value="NEW" className="font-bold text-rail-blue">+ Add New Work Type...</option>
                  </select>
                ) : (
                  <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                    <input 
                      type="text"
                      {...register('workType')}
                      placeholder="Enter new work type"
                      className="form-input-artc"
                      autoFocus
                    />
                    <button type="button" onClick={() => toggleAddNew('workType', false)} className="px-3 py-2 text-xs font-bold text-rail-blue border border-rail-blue/20 rounded-lg">Back</button>
                  </div>
                )}
              </div>
            </FormInput>
            <FormInput label="Your Role" error={errors.role?.message}>
              <div className="space-y-2">
                {!isAddingNew.role ? (
                  <select 
                    {...register('role')} 
                    onChange={(e) => {
                      if (e.target.value === 'NEW') {
                        toggleAddNew('role', true);
                      } else {
                        register('role').onChange(e);
                      }
                    }}
                    className="form-select-artc"
                  >
                    <option value="">Select Role</option>
                    {config?.roles?.map(r => <option key={r} value={r}>{r}</option>)}
                    <option value="NEW" className="font-bold text-rail-blue">+ Add New Role...</option>
                  </select>
                ) : (
                  <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                    <input 
                      type="text"
                      {...register('role')}
                      placeholder="Enter new role"
                      className="form-input-artc"
                      autoFocus
                    />
                    <button type="button" onClick={() => toggleAddNew('role', false)} className="px-3 py-2 text-xs font-bold text-rail-blue border border-rail-blue/20 rounded-lg">Back</button>
                  </div>
                )}
              </div>
            </FormInput>
          </div>

          {/* Approving Supervisor / Verifier Selection */}
          <div className="p-5 bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-200/60">
              <div className="flex items-center gap-2">
                <UserCheck size={18} className="text-rail-blue" />
                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Approving Supervisor / Verifier (Optional)
                </h4>
              </div>

              {isMatchedInDb ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/80">
                  <Check size={12} /> Database Record Matched
                </span>
              ) : currentSupName && currentSupRiw ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200/80">
                  <Database size={12} /> Will Auto-Save to Database
                </span>
              ) : null}
            </div>

            <datalist id="approving-supervisors-datalist">
              {existingSupervisors.map(sup => (
                <option key={sup.id} value={sup.name}>
                  RIW: {sup.riwNumber}{sup.title ? ` (${sup.title})` : ''}
                </option>
              ))}
            </datalist>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormInput label="Approving Supervisor Name" error={errors.approvingSupervisor?.message}>
                <div className="relative">
                  <UserCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    list="approving-supervisors-datalist"
                    {...register('approvingSupervisor')}
                    onChange={(e) => {
                      register('approvingSupervisor').onChange(e);
                      const val = e.target.value;
                      const matched = existingSupervisors.find(
                        s => s.name.trim().toLowerCase() === val.trim().toLowerCase()
                      );
                      if (matched) {
                        setValue('approvingSupervisorRiw', matched.riwNumber);
                        clearErrors(['approvingSupervisor', 'approvingSupervisorRiw']);
                      }
                    }}
                    placeholder="e.g. David Miller (type or select)"
                    className="form-input-artc pr-10"
                    style={{ paddingLeft: '2.5rem' }}
                    autoComplete="off"
                  />
                  {existingSupervisors.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSupDropdown(!showSupDropdown)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-rail-blue rounded-md transition cursor-pointer"
                      title="Select supervisor from database"
                    >
                      <ChevronDown size={16} className={`transition-transform duration-200 ${showSupDropdown ? 'rotate-180 text-rail-blue' : ''}`} />
                    </button>
                  )}

                  {/* Dropdown Menu directly on Approving Supervisor Name field */}
                  {showSupDropdown && existingSupervisors.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden py-1 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1">
                      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        <span>Database Supervisors</span>
                        <span className="text-rail-blue font-mono">{existingSupervisors.length} Saved</span>
                      </div>
                      {existingSupervisors.map((sup) => (
                        <button
                          key={sup.id}
                          type="button"
                          onClick={() => {
                            setValue('approvingSupervisor', sup.name);
                            setValue('approvingSupervisorRiw', sup.riwNumber);
                            clearErrors(['approvingSupervisor', 'approvingSupervisorRiw']);
                            setShowSupDropdown(false);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-rail-blue/5 text-xs flex items-center justify-between transition border-b border-gray-50 last:border-b-0 cursor-pointer"
                        >
                          <div>
                            <span className="font-bold text-gray-800">{sup.name}</span>
                            {sup.title && <span className="text-gray-400 text-[11px] ml-1.5">({sup.title})</span>}
                          </div>
                          <span className="text-[11px] font-mono font-semibold text-rail-blue bg-rail-blue/5 px-2 py-0.5 rounded border border-rail-blue/10">
                            RIW: {sup.riwNumber}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FormInput>

              <FormInput label="Supervisor RIW Number" error={errors.approvingSupervisorRiw?.message}>
                <div className="relative">
                  <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    {...register('approvingSupervisorRiw')}
                    placeholder="e.g. RIW-8839210 or 8839210"
                    className="form-input-artc font-mono font-bold"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </FormInput>
            </div>

            {/* Quick Save to Database button if user typed new info */}
            {currentSupName && currentSupRiw && !isMatchedInDb && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 bg-amber-50/50 p-3 rounded-xl border border-amber-200/60">
                <p className="text-[11px] text-amber-800 font-medium">
                  This supervisor will automatically be saved to your database when you save this entry.
                </p>
                <button
                  type="button"
                  onClick={handleSaveSupervisorToDatabase}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs"
                >
                  <UserPlus size={14} />
                  <span>Save to Database Now</span>
                </button>
              </div>
            )}
          </div>
          
          <div className="pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Scope of Work / Description</label>
                {templateToast && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 animate-in fade-in duration-200">
                    ✓ {templateToast}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleSaveQuickPartToDatabase}
                className="text-[10px] font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 bg-amber-50 hover:bg-amber-100/80 border border-amber-200 px-2.5 py-1 rounded-md transition cursor-pointer self-start sm:self-auto shadow-2xs"
                title="Save current work description directly into the database Quick Parts library"
              >
                <Plus size={12} /> Save Current as Quick Part
              </button>
            </div>

            {/* Quick Parts Bar - Expandable */}
            <div className="mb-3 bg-gradient-to-r from-amber-50/50 via-gray-50 to-gray-50 rounded-xl border border-gray-200/80 transition-all overflow-hidden shadow-2xs">
              {/* Header Toggle */}
              <button
                type="button"
                onClick={() => setIsQuickPartsExpanded(!isQuickPartsExpanded)}
                className="w-full p-2.5 px-3.5 flex items-center justify-between gap-2 hover:bg-amber-50/40 transition cursor-pointer text-left select-none"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles size={15} className="text-amber-500 shrink-0 animate-pulse" />
                  <span className="text-xs font-bold text-gray-800 tracking-tight shrink-0">Quick Parts Library</span>
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
                    {availableQuickParts.length} available
                  </span>
                  {!isQuickPartsExpanded && (
                    <span className="text-[10px] text-gray-400 font-normal truncate hidden sm:inline">
                      (Click to expand pre-formatted technical descriptions)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[11px] font-bold text-rail-blue shrink-0 bg-white/90 px-2.5 py-1 rounded-lg border border-gray-200/80 shadow-2xs hover:bg-white hover:border-rail-blue/30 transition">
                  <span>{isQuickPartsExpanded ? 'Collapse' : 'Expand'}</span>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${isQuickPartsExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Expandable Body */}
              {isQuickPartsExpanded && (
                <div className="p-3 pt-2.5 border-t border-gray-200/60 space-y-2.5 animate-in fade-in slide-in-from-top-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="text-[10px] text-gray-500 font-medium">
                      Select a category or click any item to insert pre-formatted text into your scope of work:
                    </p>

                    {/* Category Pills */}
                    {quickPartCategories.length > 0 && (
                      <div className="flex items-center gap-1 overflow-x-auto pb-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setQpCategoryFilter('All')}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition cursor-pointer ${
                            qpCategoryFilter === 'All'
                              ? 'bg-amber-500 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          All
                        </button>
                        {quickPartCategories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setQpCategoryFilter(cat)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition cursor-pointer whitespace-nowrap ${
                              qpCategoryFilter === cat
                                ? 'bg-amber-500 text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick Parts Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {filteredQuickParts.map((qp) => (
                      <button
                        key={qp.id}
                        type="button"
                        onClick={() => handleApplyQuickPart(qp)}
                        className="text-xs px-2.5 py-1 bg-white hover:bg-rail-blue hover:text-white text-gray-800 rounded-lg border border-gray-200 hover:border-rail-blue/40 shadow-2xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer group"
                        title={`${qp.title} (${qp.category}) - Click to insert`}
                      >
                        <Sparkles size={11} className="text-amber-500 group-hover:text-amber-200 transition shrink-0" />
                        <span>{qp.shortLabel}</span>
                      </button>
                    ))}

                    {filteredQuickParts.length === 0 && (
                      <span className="text-xs text-gray-400 italic">No Quick Parts in this category.</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="w-full">
              <Controller
                name="workDescription"
                control={control}
                render={({ field }) => {
                  const hasTableInDesc = Boolean(field.value && field.value.includes('<table'));
                  return (
                    <div className={`quill-container relative overflow-visible ${errors.workDescription ? 'border-red-500' : 'border-gray-200'}`}>
                      {/* Custom Toolbar Header including Standard Formatters + MS Word Table Dropdown */}
                      <div id="quill-toolbar-custom" className="ql-toolbar ql-snow flex flex-wrap items-center justify-between gap-2 bg-gray-50/90 border-b border-gray-200/80 px-3 py-2 relative z-30">
                        <div className="flex items-center flex-wrap gap-1">
                          <span className="ql-formats">
                            <button className="ql-bold" title="Bold" />
                            <button className="ql-italic" title="Italic" />
                            <button className="ql-underline" title="Underline" />
                          </span>
                          <span className="ql-formats">
                            <button className="ql-list" value="ordered" title="Numbered List" />
                            <button className="ql-list" value="bullet" title="Bullet List" />
                          </span>
                          <span className="ql-formats">
                            <button className="ql-clean" title="Clear Formatting" />
                          </span>

                          {/* Vertical Divider */}
                          <div className="h-4 w-[1px] bg-gray-300 mx-1.5 self-center" />

                          {/* MS Word Style Table Button & Dropdown */}
                          <div className="relative inline-block z-50">
                            <button
                              type="button"
                              onClick={() => setIsTableDropdownOpen(!isTableDropdownOpen)}
                              className={`custom-tb-btn flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border transition cursor-pointer ${
                                isTableDropdownOpen
                                  ? 'bg-rail-blue text-white border-rail-blue shadow-xs'
                                  : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-300 shadow-2xs'
                              }`}
                              title="Insert Table (MS Word style grid selector)"
                            >
                              <Table size={14} className={isTableDropdownOpen ? 'text-white' : 'text-rail-blue'} />
                              <span>Table</span>
                              <ChevronDown size={12} className={`transition-transform duration-200 ${isTableDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* MS Word Grid Picker Dropdown Popover */}
                            {isTableDropdownOpen && (
                              <div
                                className="absolute left-0 top-full mt-1.5 z-[100] bg-white border border-gray-200 rounded-xl shadow-2xl p-3.5 w-64 animate-in fade-in slide-in-from-top-1"
                                onMouseLeave={() => setGridHover({ r: 0, c: 0 })}
                              >
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
                                  <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                    <Table size={13} className="text-rail-blue" /> Insert Table
                                  </span>
                                  <span className="text-[11px] font-mono font-bold text-rail-blue bg-rail-blue/10 px-2 py-0.5 rounded">
                                    {gridHover.r > 0 && gridHover.c > 0 ? `${gridHover.c} × ${gridHover.r}` : 'Hover grid'}
                                  </span>
                                </div>

                                {/* 8x8 Grid Squares */}
                                <div className="grid grid-cols-8 gap-1 mb-3 bg-gray-50 p-2 rounded-lg border border-gray-100 justify-items-center">
                                  {Array.from({ length: 8 }).map((_, rIdx) =>
                                    Array.from({ length: 8 }).map((_, cIdx) => {
                                      const r = rIdx + 1;
                                      const c = cIdx + 1;
                                      const isHovered = r <= gridHover.r && c <= gridHover.c;
                                      return (
                                        <button
                                          key={`${r}-${c}`}
                                          type="button"
                                          onMouseEnter={() => setGridHover({ r, c })}
                                          onClick={() => handleInsertTable(c, r)}
                                          className={`grid-cell-square ${isHovered ? 'hovered' : ''}`}
                                          title={`Insert ${c} columns × ${r} rows table`}
                                        />
                                      );
                                    })
                                  )}
                                </div>

                                {/* Live Label / Footer */}
                                <p className="text-[10px] text-gray-500 text-center font-medium mb-3">
                                  {gridHover.r > 0 && gridHover.c > 0
                                    ? `Click to insert a ${gridHover.c} col × ${gridHover.r} row full-width table`
                                    : 'Hover over grid squares to select dimensions'}
                                </p>

                                {/* Custom Rows / Cols Input Option */}
                                <div className="pt-2.5 border-t border-gray-100 space-y-2">
                                  <div className="flex items-center justify-between text-[11px] text-gray-600 font-semibold">
                                    <span>Custom Dimensions:</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                      <label className="text-[9px] text-gray-400 uppercase font-bold block mb-0.5">Cols</label>
                                      <input
                                        type="number"
                                        min="1"
                                        max="15"
                                        value={customCols}
                                        onChange={(e) => setCustomCols(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded text-center font-bold"
                                      />
                                    </div>
                                    <span className="text-gray-400 font-bold self-end pb-1.5">×</span>
                                    <div className="flex-1">
                                      <label className="text-[9px] text-gray-400 uppercase font-bold block mb-0.5">Rows</label>
                                      <input
                                        type="number"
                                        min="1"
                                        max="30"
                                        value={customRows}
                                        onChange={(e) => setCustomRows(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded text-center font-bold"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleInsertTable(customCols, customRows)}
                                      className="self-end px-3 py-1 bg-rail-blue hover:bg-rail-blue/90 text-white rounded text-xs font-bold transition cursor-pointer shrink-0 shadow-2xs"
                                    >
                                      Insert
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Dedicated Table Tools Bar rendered OUTSIDE quill-toolbar-custom so Quill styles don't crush buttons */}
                      {hasTableInDesc && (
                        <div className="bg-amber-50/90 border-b border-amber-200/80 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in">
                          <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
                            <Table size={14} className="text-amber-700 shrink-0" />
                            <span className="text-[11px] uppercase tracking-wider font-bold text-amber-800">Table Tools</span>
                            {activeCellInfo ? (
                              <span className="text-[11px] font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-mono border border-amber-200">
                                Target Cell: Row {activeCellInfo.rIdx + 1}, Col {activeCellInfo.cIdx + 1}
                              </span>
                            ) : (
                              <span className="text-[11px] font-normal text-amber-700/80 italic">
                                (Click any cell to target row/col)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center flex-wrap gap-1.5">
                            <div className="inline-flex rounded-md shadow-2xs border border-amber-300 bg-white overflow-hidden shrink-0">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleTableAction('addRowAbove')}
                                className="px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 border-r border-amber-200 transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                                title="Insert Row Above Selected Cell"
                              >
                                <Plus size={11} /> Row Above
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleTableAction('addRow')}
                                className="px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                                title="Insert Row Below Selected Cell"
                              >
                                <Plus size={11} /> Row Below
                              </button>
                            </div>

                            <div className="inline-flex rounded-md shadow-2xs border border-amber-300 bg-white overflow-hidden shrink-0">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleTableAction('addColLeft')}
                                className="px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 border-r border-amber-200 transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                                title="Insert Column Left of Selected Cell"
                              >
                                <Plus size={11} /> Col Left
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleTableAction('addCol')}
                                className="px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                                title="Insert Column Right of Selected Cell"
                              >
                                <Plus size={11} /> Col Right
                              </button>
                            </div>

                            <div className="inline-flex rounded-md shadow-2xs border border-rose-200 bg-white overflow-hidden shrink-0">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleTableAction('deleteRow')}
                                className="px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 border-r border-rose-100 transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                                title="Delete Selected Row"
                              >
                                <Trash2 size={11} /> Delete Row
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleTableAction('deleteCol')}
                                className="px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                                title="Delete Selected Column"
                              >
                                <Trash2 size={11} /> Delete Col
                              </button>
                            </div>

                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleTableAction('deleteTable')}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[11px] font-bold shadow-2xs transition cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap"
                              title="Remove Table completely"
                            >
                              <Trash2 size={11} /> Remove Table
                            </button>
                          </div>
                        </div>
                      )}

                      <div onClick={handleEditorClick}>
                        <ReactQuill
                          {...({ ref: quillRef } as any)}
                          theme="snow"
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Provide a thorough overview of the task performed..."
                          modules={{
                            toolbar: '#quill-toolbar-custom',
                          }}
                        />
                      </div>
                    </div>
                  );
                }}
              />
              {errors.workDescription?.message && (
                <p className="text-[9px] text-red-500 mt-1 font-medium ml-1">× {errors.workDescription?.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Equipment */}
        <div className="space-y-6">
          <div className="flex justify-between items-center border-b border-gray-100 pb-2">
            <SectionHeader icon={<Wrench size={18} />} title="Equipment Identification" />
            <button 
              type="button" 
              onClick={() => append({ category: '', subCategories: [] })}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rail-blue hover:text-rail-blue/80 transition"
            >
              <Plus size={14} /> Add Equipment
            </button>
          </div>
          
          <div className="space-y-4">
            {fields.map((field, index) => (
              <EquipmentRow 
                key={field.id} 
                index={index} 
                register={register} 
                errors={errors} 
                config={config} 
                onRemove={fields.length > 1 ? () => remove(index) : undefined}
                watch={watch}
                setValue={setValue}
              />
            ))}
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-2 bg-rail-blue text-white rounded-lg text-sm font-medium hover:bg-opacity-90 disabled:opacity-50 transition flex items-center gap-2 shadow-sm"
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            <span>{entryId ? 'Update Entry' : 'Save Log Entry'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

function EquipmentRow({ index, register, errors, config, onRemove, watch, setValue }: any) {
  const selectedCategory = watch(`equipment.${index}.category`);
  const selectedSubCategories = watch(`equipment.${index}.subCategories`) || [];
  const subCategories = config?.categories?.find((c: any) => c.id === selectedCategory)?.subCategories || [];

  const toggleSubCategory = (sub: string) => {
    const current = [...selectedSubCategories];
    const idx = current.indexOf(sub);
    if (idx > -1) {
      current.splice(idx, 1);
    } else {
      current.push(sub);
    }
    setValue(`equipment.${index}.subCategories`, current);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-gray-50/30 p-4 rounded-xl border border-gray-100 relative group animate-in slide-in-from-left-2 duration-300">
      <div className="md:col-span-4">
            <FormInput label="Category" error={errors.equipment?.[index]?.category?.message}>
          <select 
            {...register(`equipment.${index}.category`)} 
            onChange={(e) => {
              register(`equipment.${index}.category`).onChange(e);
              setValue(`equipment.${index}.subCategories`, []);
            }}
            className="form-select-artc"
          >
            <option value="">Select Category</option>
            {config?.categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormInput>
      </div>
      
      <div className="md:col-span-7">
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Sub-Categories</label>
        {!selectedCategory ? (
            <div className="form-input-artc bg-gray-100 text-gray-400 italic">Select category first</div>
        ) : (
            <div className="flex flex-wrap gap-2 p-1">
                {subCategories.map((sub: string) => (
                    <button
                        key={sub}
                        type="button"
                        onClick={() => toggleSubCategory(sub)}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition flex items-center gap-1.5 border ${
                            selectedSubCategories.includes(sub)
                            ? 'bg-rail-blue border-rail-blue text-white'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-rail-blue/50'
                        }`}
                    >
                        {selectedSubCategories.includes(sub) && <CheckCircle2 size={12} />}
                        {sub}
                    </button>
                ))}
            </div>
        )}
        {errors.equipment?.[index]?.subCategories?.message && (
             <p className="text-[9px] text-red-500 mt-1 font-medium ml-1">× {errors.equipment?.[index]?.subCategories?.message}</p>
        )}
      </div>

      <div className="md:col-span-1 flex justify-center pt-8">
        {onRemove && (
          <button 
            type="button" 
            onClick={onRemove}
            className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-gray-100 hover:border-red-100 shadow-sm"
            title="Remove equipment entry"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode, title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-rail-blue bg-rail-blue/10 p-2 rounded-lg">{icon}</div>
      <h3 className="font-bold text-gray-800 tracking-tight uppercase text-[14px]">{title}</h3>
    </div>
  );
}

function FormInput({ label, children, error, labelStyle }: { label: string, children: React.ReactNode, error?: string, labelStyle?: React.CSSProperties }) {
  return (
    <div className="space-y-1 w-full">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 block mb-1.5" style={labelStyle}>{label}</label>
      {children}
      {error && <p className="text-[9px] text-red-500 mt-1 font-medium ml-1">× {error}</p>}
    </div>
  );
}
