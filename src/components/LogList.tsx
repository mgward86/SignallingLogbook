import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, SnapshotMetadata } from 'firebase/firestore';
import { useConfig } from '../hooks/useConfig';
import { Edit2, Trash2, Search, MapPin, Wrench, Briefcase, Plus, Download, FileStack, CheckSquare, Square, Copy, Mail, CloudOff, RefreshCw, ChevronDown, ChevronUp, BookOpen, UserCheck, CreditCard, Calendar, TrendingUp, Layers, Activity, FileText, ShieldCheck, Lock, AlertCircle, Clock, CheckCircle2, Shield, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
      const doc = createPdfInstance();
      generateLogPage(doc, log, true);
      addDocumentFooters(doc);
      const pdfBlob = doc.output('blob');
      const filename = `Signalling_Log_${log.logNumber}.pdf`;
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      const shareData = {
        files: [file],
        title: `Rail Log Entry: ${log.logNumber}`,
        text: `Please find attached the Rail Log Entry summary for ${log.logNumber}.`,
      };

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share(shareData);
        } catch (shareError: any) {
          // If the user cancelled the share, we don't want to show an error alert
          if (shareError.name === 'AbortError' || shareError.name === 'NotAllowedError') {
            console.log('Share was cancelled by user');
            return;
          }
          throw shareError; // Rethrow other errors to be caught by the outer catch
        }
      } else {
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

  const hexToRgb = (hex: string): [number, number, number] => {
    const defaultRgb: [number, number, number] = [0, 48, 87]; // #003057
    if (!hex) return defaultRgb;
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length !== 6) return defaultRgb;
    const num = parseInt(cleanHex, 16);
    return [
      (num >> 16) & 255,
      (num >> 8) & 255,
      num & 255
    ];
  };

  const createPdfInstance = () => {
    const orientation = profile?.pdfConfig?.pageOrientation === 'landscape' ? 'landscape' : 'portrait';
    return new jsPDF({
      orientation: orientation,
      unit: 'mm',
      format: 'a4'
    });
  };

  const addDocumentFooters = (doc: jsPDF, logRef?: string) => {
    const pdfConfig = profile?.pdfConfig;
    const [accentR, accentG, accentB] = hexToRgb(pdfConfig?.accentColor || '#003057');
    const showPageNumbers = pdfConfig?.showPageNumbers !== false;
    const customFooterNote = pdfConfig?.customFooterNote || 'Digital Signalling Logbook Exporter Pro';
    const totalPages = doc.getNumberOfPages();
    const family = pdfConfig?.fontFamily === 'times' ? 'times' : (pdfConfig?.fontFamily === 'courier' ? 'courier' : 'helvetica');
    const margin = pdfConfig?.marginSize === 'narrow' ? 10 : (pdfConfig?.marginSize === 'wide' ? 22 : 15);
    
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Page 2+ Header for Executive Pro
      if (i > 1 && pdfConfig?.headerStyle === 'executive-pro') {
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, 6, pageWidth - margin * 2, 7.5, 'F');
        
        doc.setFillColor(accentR, accentG, accentB);
        doc.rect(margin, 13.5, pageWidth - margin * 2, 0.6, 'F');

        doc.setFont(family, 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text((pdfConfig?.title || 'SIGNALLING LOGBOOK').toUpperCase(), margin + 3, 11);

        if (logRef) {
          doc.setFont(family, 'normal');
          doc.setTextColor(203, 213, 225);
          doc.text(`Log ${logRef}`, pageWidth - margin - 3, 11, { align: 'right' });
        }
      }

      // Bottom Footer
      doc.setFont(family, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      
      // Small bottom accent bar
      doc.setFillColor(accentR, accentG, accentB);
      doc.rect(margin, pageHeight - 12.4, 22, 0.8, 'F');

      doc.text(customFooterNote, margin, pageHeight - 7);
      
      if (logRef) {
        doc.text(`Log ${logRef}`, pageWidth / 2, pageHeight - 7, { align: 'center' });
      }

      if (showPageNumbers) {
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
      }
    }
  };

  const generateLogPage = (doc: jsPDF, log: LogEntry, isFirstPage: boolean) => {
    if (!isFirstPage) doc.addPage();
    
    const pdfConfig = profile?.pdfConfig;
    const [accentR, accentG, accentB] = hexToRgb(pdfConfig?.accentColor || '#003057');
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const family = pdfConfig?.fontFamily === 'times' ? 'times' : (pdfConfig?.fontFamily === 'courier' ? 'courier' : 'helvetica');
    const sizeMod = pdfConfig?.fontSizeModifier === 'sm' ? 0.9 : (pdfConfig?.fontSizeModifier === 'lg' ? 1.1 : 1.0);
    const margin = pdfConfig?.marginSize === 'narrow' ? 10 : (pdfConfig?.marginSize === 'wide' ? 22 : 15);

    const setFont = (style: 'normal' | 'bold' | 'italic', size: number) => {
      doc.setFont(family, style);
      doc.setFontSize(size * sizeMod);
    };
    
    // Helper for formatting FY Quarter cleanly
    const formatFyQuarter = (quarter?: string, startDate?: string, endDate?: string) => {
      if (!quarter && !startDate && !endDate) return 'N/A';
      const q = quarter || '';
      if (q.startsWith('FY')) return q;

      const refDateStr = endDate || startDate;
      let fyPrefix = '';
      if (refDateStr) {
        const d = new Date(refDateStr);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = d.getMonth(); // 0-11 (Jul is 6)
          const startYY = month >= 6 ? year % 100 : (year - 1) % 100;
          const endYY = (startYY + 1) % 100;
          const pad = (n: number) => n.toString().padStart(2, '0');
          fyPrefix = `FY${pad(startYY)}/${pad(endYY)}`;
        }
      }

      if (fyPrefix) {
        return q ? `${fyPrefix} ${q}` : fyPrefix;
      }
      return q || 'N/A';
    };

    // Header Style Render Branching
    const headerStyle = pdfConfig?.headerStyle || 'accent-lines';
    
    if (headerStyle === 'executive-pro') {
      // Executive Modern Pro Layout (Matches Attached Reference PDF)
      const isLandscape = pdfConfig?.pageOrientation === 'landscape';

      // Top Dark Banner
      const bannerHeight = 22;
      doc.setFillColor(30, 41, 59); // Slate-800
      doc.rect(margin, 8, pageWidth - margin * 2, bannerHeight, 'F');

      // Accent bar along bottom edge of banner
      doc.setFillColor(accentR, accentG, accentB);
      doc.rect(margin, 8 + bannerHeight - 0.8, pageWidth - margin * 2, 0.8, 'F');

      // Title & Subtitle Left
      doc.setTextColor(255, 255, 255);
      setFont('bold', 15);
      doc.text(pdfConfig?.title || 'Signalling Logbook', margin + 4, 16.5);

      setFont('normal', 6.5);
      doc.setTextColor(203, 213, 225);
      doc.text((pdfConfig?.subtitle || 'PROFESSIONAL DIGITAL SIGNALLING RECORD').toUpperCase(), margin + 4, 23.5);

      // Right Header Reference
      setFont('normal', 5.5);
      doc.setTextColor(148, 163, 184);
      doc.text('LOG REFERENCE', pageWidth - margin - 4, 13, { align: 'right' });

      setFont('bold', 10);
      doc.setTextColor(255, 255, 255);
      doc.text(log.logNumber || 'LOG-001', pageWidth - margin - 4, 18, { align: 'right' });

      setFont('normal', 6.5);
      doc.setTextColor(203, 213, 225);
      doc.text(`Printed ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - margin - 4, 23.5, { align: 'right' });

      let currentY = 34;

      const drawSectionTitle = (title: string, yPos: number) => {
        doc.setFillColor(accentR, accentG, accentB);
        doc.rect(margin, yPos, 2.5, 2.5, 'F');
        setFont('bold', 10.5);
        doc.setTextColor(30, 41, 59);
        doc.text(title, margin + 4.5, yPos + 2.3);
      };

      // --- SECTION 1: LOG DETAILS ---
      drawSectionTitle('Log Details', currentY);
      currentY += 4.5;

      const certDetails = (pdfConfig?.showCertificationDetails !== false && profile?.displayName)
        ? `${profile.displayName} — ${profile.jobTitle || 'Signal Engineer'}   RIW / ID ${profile.employeeId || 'N/A'}`
        : 'N/A';

      const detailsBodyData = [
        [
          { content: 'DATE RANGE\n' + `${log.startDate} to ${log.endDate}` },
          { content: 'FY QUARTER\n' + formatFyQuarter(log.quarter, log.startDate, log.endDate) },
          { content: 'EMPLOYER\n' + (log.employer || 'N/A') }
        ],
        [
          { content: 'CLIENT\n' + (log.client || 'N/A') },
          { content: 'LOCATION\n' + (log.isLocationNA ? 'N/A' : (log.location || 'N/A')) },
          { content: 'PROJECT\n' + (log.isProjectNA ? 'N/A' : (log.projectName || 'N/A')) }
        ],
        [
          { content: 'WORK TYPE\n' + (log.workType || 'N/A') },
          { content: 'INFRASTRUCTURE OWNER\n' + (log.infrastructureOwner || 'N/A') },
          { content: 'ROLE\n' + (log.role || 'N/A') }
        ]
      ];

      const col3W = (pageWidth - margin * 2) / 3;

      autoTable(doc, {
        startY: currentY,
        head: [[
          {
            content: `LOG ENTRY BY   ${certDetails}`,
            colSpan: 3,
            styles: {
              fillColor: [248, 250, 252],
              textColor: [71, 85, 105],
              fontStyle: 'bold',
              fontSize: 7 * sizeMod,
              cellPadding: 1.2
            }
          }
        ]],
        body: detailsBodyData,
        theme: 'grid',
        styles: {
          fontSize: 7.5 * sizeMod,
          cellPadding: 1.5,
          textColor: [30, 41, 59],
          fillColor: [248, 250, 252],
          lineColor: [226, 232, 240],
          lineWidth: 0.25,
          font: family
        },
        columnStyles: {
          0: { cellWidth: col3W },
          1: { cellWidth: col3W },
          2: { cellWidth: col3W }
        },
        margin: { left: margin, right: margin }
      });

      currentY = (doc as any).lastAutoTable.finalY + 5;

      // --- SECTION 2: WORK DESCRIPTION ---
      drawSectionTitle('Work Description', currentY);
      currentY += 4.5;

      // Parse any embedded HTML tables in workDescription for PDF export
      let embeddedTables: { headers: string[]; rows: string[][] }[] = [];
      if (log.workDescription.includes('<table')) {
        try {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = log.workDescription;
          const tblEls = Array.from(tempDiv.querySelectorAll('table'));
          tblEls.forEach(tbl => {
            const headers: string[] = [];
            const rows: string[][] = [];
            const trs = Array.from(tbl.querySelectorAll('tr'));
            trs.forEach(tr => {
              const ths = Array.from(tr.querySelectorAll('th'));
              const tds = Array.from(tr.querySelectorAll('td'));
              if (ths.length > 0 && headers.length === 0) {
                ths.forEach(th => headers.push(th.textContent?.trim() || ''));
              } else {
                const cellTexts = (ths.length > 0 ? ths : tds).map(c => c.textContent?.trim() || '');
                if (cellTexts.some(Boolean)) {
                  rows.push(cellTexts);
                }
              }
            });
            if (headers.length === 0 && rows.length > 0) {
              const topRow = rows.shift()!;
              headers.push(...topRow);
            }
            if (headers.length > 0 || rows.length > 0) {
              embeddedTables.push({ headers, rows });
            }
          });
        } catch (e) {
          console.error('Error parsing embedded table for PDF:', e);
        }
      }

      const cleanedDescHtml = log.workDescription.replace(/<table[\s\S]*?<\/table>/gi, '');
      const plainTextDesc = cleanedDescHtml
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<\/p>/g, '\n')
        .replace(/<p>/g, '\n')
        .replace(/<li>/g, '\n • ')
        .replace(/<[^>]*>?/gm, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n\s*\n+/g, '\n')
        .trim();

      const lines = plainTextDesc.split('\n').map(l => l.trim()).filter(Boolean);
      const mainDescLines: string[] = [];
      const activityItems: string[] = [];

      for (const line of lines) {
        if (line.startsWith('•') || line.startsWith('■') || line.startsWith('-') || line.match(/^\d+[\.\)]/)) {
          activityItems.push(line.replace(/^[•■\-\d\.\)]\s*/, ''));
        } else {
          mainDescLines.push(line);
        }
      }

      const descText = mainDescLines.join('\n');

      if (descText) {
        autoTable(doc, {
          startY: currentY,
          body: [[descText]],
          theme: 'plain',
          styles: {
            fontSize: 8.5 * sizeMod,
            cellPadding: 0.5,
            textColor: [30, 41, 59],
            overflow: 'linebreak',
            font: family
          },
          margin: { left: margin, right: margin }
        });

        currentY = (doc as any).lastAutoTable.finalY + 4;
      }

      // Render embedded tables in PDF
      if (embeddedTables.length > 0) {
        embeddedTables.forEach(et => {
          const numCols = Math.max(et.headers.length, et.rows[0]?.length || 1);
          const colW = (pageWidth - margin * 2) / numCols;
          const pdfColStyles: any = {};
          for (let c = 0; c < numCols; c++) {
            pdfColStyles[c] = { cellWidth: colW };
          }

          autoTable(doc, {
            startY: currentY,
            head: et.headers.length > 0 ? [et.headers] : undefined,
            body: et.rows,
            headStyles: {
              fillColor: [241, 245, 249],
              textColor: [15, 23, 42],
              fontStyle: 'bold',
              fontSize: 8 * sizeMod
            },
            bodyStyles: {
              textColor: [30, 41, 59],
              fontSize: 8 * sizeMod,
              cellPadding: 1.5
            },
            styles: {
              lineColor: [226, 232, 240],
              lineWidth: 0.25,
              overflow: 'linebreak',
              font: family
            },
            columnStyles: pdfColStyles,
            margin: { left: margin, right: margin }
          });
          currentY = (doc as any).lastAutoTable.finalY + 4;
        });
      }

      if (activityItems.length > 0) {
        setFont('bold', 9);
        doc.setTextColor(30, 41, 59);
        doc.text('Activities carried out ', margin, currentY);
        const actTitleWidth = doc.getTextWidth('Activities carried out ');

        doc.setFillColor(accentR, accentG, accentB);
        doc.rect(margin + actTitleWidth, currentY - 2.8, 14, 3.8, 'F');
        setFont('bold', 6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(`${activityItems.length} items`, margin + actTitleWidth + 1.8, currentY - 0.2);

        currentY += 3.5;

        const numCols = isLandscape ? 3 : 2;
        const actTableBody: any[] = [];
        for (let i = 0; i < activityItems.length; i += numCols) {
          const row = [];
          for (let c = 0; c < numCols; c++) {
            const item = activityItems[i + c];
            row.push(item ? `•  ${item}` : '');
          }
          actTableBody.push(row);
        }

        const colActWidth = (pageWidth - margin * 2) / numCols;
        const actColStyles: any = {};
        for (let c = 0; c < numCols; c++) {
          actColStyles[c] = { cellWidth: colActWidth, valign: 'top' };
        }

        autoTable(doc, {
          startY: currentY,
          body: actTableBody,
          theme: 'plain',
          styles: {
            fontSize: 7.5 * sizeMod,
            cellPadding: { top: 1, bottom: 1.5, left: 1, right: 3 },
            textColor: [51, 65, 85],
            overflow: 'linebreak',
            font: family
          },
          columnStyles: actColStyles,
          margin: { left: margin, right: margin }
        });

        currentY = (doc as any).lastAutoTable.finalY + 5;
      }

      // --- SECTION 3: EQUIPMENT IDENTIFICATION ---
      if (pdfConfig?.showEquipment !== false && log.equipment && log.equipment.length > 0) {
        const pageHeightCheck = doc.internal.pageSize.getHeight();
        if (currentY > pageHeightCheck - 35) {
          doc.addPage();
          currentY = 15;
        }

        drawSectionTitle('Equipment Identification', currentY);
        currentY += 4.5;

        const equipData = log.equipment.map(e => [
          config?.categories?.find(c => c.id === e.category)?.name || e.category,
          e.subCategories.join(', ')
        ]);

        const totalEquipW = pageWidth - margin * 2;

        autoTable(doc, {
          startY: currentY,
          head: [['CATEGORY', 'SUB-CATEGORIES / SPECIFIC EQUIPMENT']],
          body: equipData,
          theme: 'grid',
          headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontSize: 7.5 * sizeMod,
            fontStyle: 'bold',
            font: family,
            cellPadding: 1.5
          },
          bodyStyles: {
            fontSize: 7.5 * sizeMod,
            font: family,
            textColor: [30, 41, 59],
            fillColor: [255, 255, 255],
            cellPadding: 1.2
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          styles: { lineColor: [226, 232, 240], lineWidth: 0.25, overflow: 'linebreak' },
          columnStyles: {
            0: { cellWidth: totalEquipW * 0.38, fontStyle: 'bold' },
            1: { cellWidth: totalEquipW * 0.62 }
          },
          margin: { left: margin, right: margin }
        });

        currentY = (doc as any).lastAutoTable.finalY + 5;
      }

      // --- SECTION 4: CERTIFICATION & VERIFICATION ---
      const pageHeightCheck = doc.internal.pageSize.getHeight();
      const showSup = pdfConfig?.showSupervisor !== false;
      const showOwner = pdfConfig?.showOwnerSignature !== false;

      if (showOwner || showSup) {
        const requiredSpace = (showOwner && showSup) ? 42 : 36;
        if (currentY > pageHeightCheck - requiredSpace - 15) {
          doc.addPage();
          currentY = 15;
        }

        drawSectionTitle('Certification & Verification', currentY);
        currentY += 4.5;

        const totalAvailWidth = pageWidth - margin * 2;
        const isSingle = !(showOwner && showSup);
        const cardGap = 4;
        const cardWidth = isSingle ? totalAvailWidth : Math.floor((totalAvailWidth - cardGap) / 2);

        let leftX = margin;

        // Technician Card
        if (showOwner) {
          const techBoxHeight = 36;
          doc.setFillColor(248, 250, 252);
          doc.rect(leftX, currentY, cardWidth, techBoxHeight, 'F');
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.3);
          doc.rect(leftX, currentY, cardWidth, techBoxHeight, 'S');

          setFont('bold', 8);
          doc.setTextColor(30, 41, 59);
          doc.text('TECHNICIAN SIGN-OFF', leftX + 3, currentY + 4);

          setFont('normal', 6.5);
          doc.setTextColor(100, 116, 139);
          const decLines = doc.splitTextToSize('I hereby certify that the work entered above is a true and accurate record of the tasks undertaken.', cardWidth - 6);
          doc.text(decLines, leftX + 3, currentY + 8);

          doc.setDrawColor(203, 213, 225);
          doc.line(leftX + 3, currentY + 23, leftX + cardWidth - 3, currentY + 23);
          setFont('bold', 6);
          doc.setTextColor(100, 116, 139);
          doc.text('TECHNICIAN SIGNATURE', leftX + 3, currentY + 26);

          if (profile?.displayName) {
            setFont('bold', 6.5);
            doc.setTextColor(15, 23, 42);
            doc.text(profile.displayName, leftX + 3, currentY + 21.5);
          }

          const halfW = Math.floor((cardWidth - 9) / 2);
          doc.line(leftX + 3, currentY + 31, leftX + 3 + halfW, currentY + 31);
          doc.setFont(family, 'bold');
          doc.setFontSize(6 * sizeMod);
          doc.setTextColor(100, 116, 139);
          doc.text('RIW / ID', leftX + 3, currentY + 34);

          if (profile?.employeeId) {
            setFont('bold', 6.5);
            doc.setTextColor(15, 23, 42);
            doc.text(profile.employeeId, leftX + 3, currentY + 29.5);
          }

          doc.line(leftX + 6 + halfW, currentY + 31, leftX + cardWidth - 3, currentY + 31);
          doc.setFont(family, 'bold');
          doc.setFontSize(6 * sizeMod);
          doc.setTextColor(100, 116, 139);
          doc.text('DATE', leftX + 6 + halfW, currentY + 34);

          if (log.startDate) {
            setFont('bold', 6.5);
            doc.setTextColor(15, 23, 42);
            doc.text(log.startDate, leftX + 6 + halfW, currentY + 29.5);
          }

          if (!isSingle) leftX += cardWidth + cardGap;
        }

        // Supervisor Card
        if (showSup) {
          const supBoxHeight = 36;
          doc.setFillColor(248, 250, 252);
          doc.rect(leftX, currentY, cardWidth, supBoxHeight, 'F');
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.3);
          doc.rect(leftX, currentY, cardWidth, supBoxHeight, 'S');

          setFont('bold', 8);
          doc.setTextColor(30, 41, 59);
          let titleToUse = pdfConfig?.supervisorTitle || 'SUPERVISOR VERIFICATION';
          doc.text(titleToUse, leftX + 3, currentY + 4);

          setFont('normal', 6.5);
          doc.setTextColor(100, 116, 139);
          const supDecLines = doc.splitTextToSize(pdfConfig?.supervisorDeclaration || 'I verify that the work described was performed safely and to industry standards.', cardWidth - 6);
          doc.text(supDecLines, leftX + 3, currentY + 8);

          const commentsBoxY = currentY + 12;
          const commentsBoxHeight = 12;
          doc.setFillColor(255, 255, 255);
          doc.rect(leftX + 3, commentsBoxY, cardWidth - 6, commentsBoxHeight, 'F');
          doc.setDrawColor(226, 232, 240);
          doc.rect(leftX + 3, commentsBoxY, cardWidth - 6, commentsBoxHeight, 'S');

          setFont('bold', 5.5);
          doc.setTextColor(148, 163, 184);
          doc.text('SUPERVISOR COMMENTS', leftX + 5, commentsBoxY + 3.5);

          if (log.supervisorComments) {
            setFont('normal', 6);
            doc.setTextColor(30, 41, 59);
            const cmntLines = doc.splitTextToSize(log.supervisorComments, cardWidth - 10);
            doc.text(cmntLines, leftX + 5, commentsBoxY + 7);
          }

          const thirdW = Math.floor((cardWidth - 12) / 3);

          // Embed signature image if available
          if (log.supervisorSignatureDataUrl) {
            try {
              doc.addImage(log.supervisorSignatureDataUrl, 'PNG', leftX + 9 + thirdW * 2, currentY + 22, thirdW - 2, 8);
            } catch (sigErr) {
              console.warn('Could not render signature image in PDF', sigErr);
            }
          }

          doc.setDrawColor(203, 213, 225);
          doc.line(leftX + 3, currentY + 31, leftX + 3 + thirdW, currentY + 31);
          setFont('bold', 6);
          doc.setTextColor(100, 116, 139);
          doc.text('SUPERVISOR NAME', leftX + 3, currentY + 34);

          if (log.approvingSupervisor) {
            setFont('bold', 6.5);
            doc.setTextColor(15, 23, 42);
            doc.text(log.approvingSupervisor, leftX + 3, currentY + 29);
          }

          doc.line(leftX + 6 + thirdW, currentY + 31, leftX + 6 + thirdW * 2, currentY + 31);
          doc.text('RIW / ID', leftX + 6 + thirdW, currentY + 34);

          if (log.approvingSupervisorRiw) {
            setFont('bold', 6.5);
            doc.setTextColor(15, 23, 42);
            doc.text(log.approvingSupervisorRiw, leftX + 6 + thirdW, currentY + 29);
          }

          doc.line(leftX + 9 + thirdW * 2, currentY + 31, leftX + cardWidth - 3, currentY + 31);
          doc.text('SIGNATURE / DATE', leftX + 9 + thirdW * 2, currentY + 34);

          if (log.verificationSignedAt) {
            setFont('bold', 6);
            doc.setTextColor(15, 23, 42);
            doc.text(format(new Date(log.verificationSignedAt), 'dd/MM/yyyy'), leftX + 9 + thirdW * 2, currentY + 29);
          }
        }
      }

      return;
    } else if (headerStyle === 'jmdr-grid') {
      // Competency Work Experience Record (JMDR Grid Layout)
      const plainTextDescription = log.workDescription
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<\/p>/g, '\n')
        .replace(/<p>/g, '\n')
        .replace(/<li>/g, '\n • ')
        .replace(/<[^>]*>?/gm, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n\s*\n+/g, '\n')
        .trim();

      // Top Header Block
      autoTable(doc, {
        startY: 8,
        body: [
          [
            { 
              content: log.employer || 'JMDR', 
              styles: { fontStyle: 'bold', halign: 'center', valign: 'middle', fillColor: [248, 238, 225], textColor: [accentR, accentG, accentB], fontSize: 9.5 * sizeMod } 
            },
            { 
              content: (pdfConfig?.title || 'SIGNALS COMPETENCY WORK EXPERIENCE RECORD').toUpperCase(), 
              styles: { fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 9 * sizeMod, textColor: [0, 0, 0] } 
            },
            { 
              content: 'Version: 1\nEffective from: 1st February 2018', 
              styles: { halign: 'center', valign: 'middle', fontSize: 6.5 * sizeMod, textColor: [60, 60, 60] } 
            }
          ],
          [
            { 
              content: `Work Experience Record Period:   ${log.quarter ? log.quarter + ': ' : ''}${log.startDate} - ${log.endDate}`, 
              colSpan: 3, 
              styles: { fontStyle: 'bold', fillColor: [248, 248, 248], textColor: [accentR, accentG, accentB], fontSize: 8 * sizeMod } 
            }
          ],
          [
            { 
              content: `Name: ${profile?.displayName?.toUpperCase() || 'MATTHEW WARD'}`, 
              colSpan: 2, 
              styles: { fontStyle: 'bold', textColor: [0, 30, 90], fontSize: 8 * sizeMod } 
            },
            { 
              content: `Identification Competency Reference (RIW): ${profile?.employeeId || '20-00069775'}`, 
              styles: { fontStyle: 'bold', halign: 'right', textColor: [0, 30, 90], fontSize: 8 * sizeMod } 
            }
          ]
        ],
        theme: 'grid',
        styles: { font: family, cellPadding: 1.2, lineColor: [0, 0, 0], lineWidth: 0.3 },
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: pageWidth - margin * 2 - 82 },
          2: { cellWidth: 50 }
        }
      });

      const gridStartY = (doc as any).lastAutoTable.finalY + 1.5;

      const datesCell = `${log.startDate} -\n${log.endDate}\n\nFinal Commissioning date: ${log.endDate}`;
      const employerCell = `Employer:\n${log.employer || 'JMDR'}\n\nClient:\n${log.client || 'N/A'}\n\nInfrastructure Owner:\n${log.infrastructureOwner || 'N/A'}`;
      const taskCell = `Role: ${log.role || 'N/A'}\nLocation: ${log.isLocationNA ? 'N/A' : (log.location || 'N/A')}\nProject: ${log.isProjectNA ? 'N/A' : (log.projectName || 'N/A')}\n\n${plainTextDescription}`;
      
      const equipCell = (log.equipment && log.equipment.length > 0)
        ? log.equipment.map(e => {
            const catName = config?.categories?.find(c => c.id === e.category)?.name || e.category;
            return `${catName}:\n${e.subCategories.join(', ')}`;
          }).join('\n\n')
        : 'N/A';

      const verifyCell = pdfConfig?.showSupervisor !== false
        ? `${profile?.displayName || 'Adam Toffolo'}\n${profile?.employeeId || '20-0006492'}\nCommissioning Engineer\nPrincipal Engineer`
        : 'N/A';

      const isLandscape = pdfConfig?.pageOrientation === 'landscape';

      autoTable(doc, {
        startY: gridStartY,
        head: [
          [
            'Dates\n(From/To)',
            'Employer/Client\nand Infrastructure Owner',
            'Description of Task:\n(Description of Role(s) in competencies/levels)',
            'Ref',
            'Equipment or System Types',
            'Verification Signature\n(Name & ID)',
            'Supervisor Observations\n(Assessment / Ref)'
          ]
        ],
        body: [
          [
            datesCell,
            employerCell,
            taskCell,
            log.logNumber || '01',
            equipCell,
            verifyCell,
            'Competence cross-referenced and verified.'
          ]
        ],
        theme: 'grid',
        headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 * sizeMod, halign: 'center', font: family, cellPadding: 1.5 },
        bodyStyles: { fontSize: 7 * sizeMod, font: family, textColor: [20, 20, 20], cellPadding: 2, valign: 'top' },
        styles: { lineColor: [0, 0, 0], lineWidth: 0.3, overflow: 'linebreak' },
        margin: { left: margin, right: margin },
        columnStyles: isLandscape ? {
          0: { cellWidth: 32 },
          1: { cellWidth: 38 },
          2: { cellWidth: Math.max(60, pageWidth - margin * 2 - 182) },
          3: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 42 },
          5: { cellWidth: 30 },
          6: { cellWidth: 28 }
        } : {
          0: { cellWidth: 22 },
          1: { cellWidth: 28 },
          2: { cellWidth: Math.max(40, pageWidth - margin * 2 - 138) },
          3: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 30 },
          5: { cellWidth: 24 },
          6: { cellWidth: 24 }
        }
      });

      const gridEndY = (doc as any).lastAutoTable.finalY + 2;

      // Footer Box
      autoTable(doc, {
        startY: Math.max(gridEndY, doc.internal.pageSize.getHeight() - 25),
        body: [
          [
            { content: 'Approving Manager: Chief Engineer', styles: { halign: 'center' } },
            { content: 'Approval Date: 01/02/2018', styles: { halign: 'center' } },
            { content: 'Next Review Date: 01/02/2019', styles: { halign: 'center' } }
          ],
          [
            { 
              content: 'PRINTOUT MAY NOT BE UP-TO-DATE: REFER TO METRO INTRANET FOR THE LATEST VERSION', 
              colSpan: 3, 
              styles: { fontStyle: 'bold', halign: 'center', textColor: [180, 0, 0], fontSize: 6 * sizeMod } 
            }
          ]
        ],
        theme: 'grid',
        styles: { font: family, fontSize: 6.5 * sizeMod, cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.3, textColor: [80, 80, 80] },
        margin: { left: margin, right: margin }
      });

      return;
    } else if (headerStyle === 'solid-banner') {
      doc.setFillColor(accentR, accentG, accentB);
      doc.rect(margin, 8, pageWidth - margin * 2, 22, 'F');
      
      doc.setTextColor(255, 255, 255);
      setFont('bold', 14);
      doc.text(pdfConfig?.title || 'SIGNALLING LOGBOOK', margin + 4, 17);
      
      setFont('normal', 7.5);
      doc.text(pdfConfig?.subtitle || 'PROFESSIONAL DIGITAL SIGNALLING RECORD', margin + 4, 24);
      
      setFont('bold', 9);
      doc.text(`LOG #: ${log.logNumber}`, pageWidth - margin - 4, 17, { align: 'right' });
      setFont('normal', 6.5);
      doc.text(`PRINTED: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - margin - 4, 24, { align: 'right' });
    } else if (headerStyle === 'bold-left') {
      doc.setDrawColor(accentR, accentG, accentB);
      doc.setLineWidth(2.5);
      doc.line(margin + 1, 8, margin + 1, 30);
      
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(margin, 30, pageWidth - margin, 30);
      
      doc.setTextColor(accentR, accentG, accentB);
      setFont('bold', 16);
      doc.text(pdfConfig?.title || 'SIGNALLING LOGBOOK', margin + 5, 18);
      
      setFont('normal', 7);
      doc.setTextColor(100, 100, 100);
      doc.text(pdfConfig?.subtitle || 'PROFESSIONAL DIGITAL SIGNALLING RECORD', margin + 5, 24);
      
      doc.setTextColor(0, 0, 0);
      setFont('bold', 10);
      doc.text(`LOG #: ${log.logNumber}`, pageWidth - margin, 18, { align: 'right' });
      setFont('normal', 8);
      doc.text(`PRINTED: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - margin, 24, { align: 'right' });
    } else {
      // Default accent-lines
      doc.setDrawColor(accentR, accentG, accentB);
      doc.setLineWidth(0.5);
      doc.line(margin, 8, pageWidth - margin, 8);
      doc.line(margin, 30, pageWidth - margin, 30);
      
      doc.setTextColor(accentR, accentG, accentB);
      setFont('bold', 16);
      doc.text(pdfConfig?.title || 'SIGNALLING LOGBOOK', margin, 18);
      
      setFont('normal', 7);
      doc.setTextColor(100, 100, 100);
      doc.text(pdfConfig?.subtitle || 'PROFESSIONAL DIGITAL SIGNALLING RECORD', margin, 24);
      
      doc.setTextColor(0, 0, 0);
      setFont('bold', 10);
      doc.text(`LOG #: ${log.logNumber}`, pageWidth - margin, 18, { align: 'right' });
      setFont('normal', 8);
      doc.text(`PRINTED: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - margin, 24, { align: 'right' });
    }
    
    const isCompressed = pdfConfig?.layoutSpacing === 'compressed';

    // Unified Executive Log Summary & Personnel Details Card
    const summaryStartY = isCompressed ? 31 : 33;
    const certDetails = (pdfConfig?.showCertificationDetails !== false && profile?.displayName)
      ? `${profile.displayName.toUpperCase()} (ID: ${profile.employeeId || 'N/A'}) — ${profile.jobTitle || 'Signal Engineer'}`
      : 'N/A';

    const detailsBody = [
      [
        { content: 'Name:', styles: { fontStyle: 'bold', textColor: [71, 85, 105] } },
        { content: certDetails, styles: { fontStyle: 'bold', textColor: [accentR, accentG, accentB] } },
        { content: 'STATUS:', styles: { fontStyle: 'bold', textColor: [71, 85, 105] } },
        { content: 'Certified & Recorded', styles: { fontStyle: 'bold', textColor: [16, 185, 129] } }
      ],
      [
        { content: 'Date Range:', styles: { fontStyle: 'bold' } },
        `${log.startDate} to ${log.endDate}`,
        { content: 'Employer:', styles: { fontStyle: 'bold' } },
        log.employer || 'N/A'
      ],
      [
        { content: 'FY Quarter:', styles: { fontStyle: 'bold' } },
        formatFyQuarter(log.quarter, log.startDate, log.endDate),
        { content: 'Client:', styles: { fontStyle: 'bold' } },
        log.client || 'N/A'
      ],
      [
        { content: 'Location:', styles: { fontStyle: 'bold' } },
        log.isLocationNA ? 'N/A' : (log.location || 'N/A'),
        { content: 'Project:', styles: { fontStyle: 'bold' } },
        log.isProjectNA ? 'N/A' : (log.projectName || 'N/A')
      ],
      [
        { content: 'Work Type:', styles: { fontStyle: 'bold' } },
        log.workType || 'N/A',
        { content: 'Asset Owner:', styles: { fontStyle: 'bold' } },
        log.infrastructureOwner || 'N/A'
      ],
      [
        { content: 'Role:', styles: { fontStyle: 'bold' } },
        log.role || 'N/A',
        { content: 'Log Number:', styles: { fontStyle: 'bold' } },
        log.logNumber || 'N/A'
      ]
    ];

    autoTable(doc, {
      startY: summaryStartY,
      head: [[
        {
          content: 'LOG DETAILS & PERSONNEL RECORD',
          colSpan: 4,
          styles: {
            fillColor: [241, 245, 249],
            textColor: [accentR, accentG, accentB],
            fontStyle: 'bold',
            fontSize: 8 * sizeMod,
            halign: 'left',
            cellPadding: 1.2
          }
        }
      ]],
      body: detailsBody as any,
      theme: 'grid',
      styles: {
        fontSize: 7.5 * sizeMod,
        cellPadding: isCompressed ? 0.7 : 1.0,
        textColor: [30, 41, 59],
        lineColor: [218, 224, 233],
        lineWidth: 0.25,
        font: family
      },
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 26, fontStyle: 'bold', textColor: [71, 85, 105] },
        1: { cellWidth: Math.floor((pageWidth - margin * 2 - 58) * 0.5) },
        2: { cellWidth: 32, fontStyle: 'bold', textColor: [71, 85, 105] },
        3: { cellWidth: Math.floor((pageWidth - margin * 2 - 58) * 0.5) }
      }
    });

    let currentY = (doc as any).lastAutoTable.finalY + (isCompressed ? 3 : 5);

    // Work Description Header with Accent Marker
    doc.setFillColor(accentR, accentG, accentB);
    doc.rect(margin, currentY, 2.5, 4.5, 'F');
    setFont('bold', 10);
    doc.setTextColor(30, 41, 59);
    doc.text('WORK DESCRIPTION & ACTIVITIES', margin + 5, currentY + 3.6);

    // Clean html formatting
    const plainTextDescription = log.workDescription
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<\/p>/g, '\n')
      .replace(/<p>/g, '\n')
      .replace(/<li>/g, '\n • ')
      .replace(/<[^>]*>?/gm, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n\s*\n+/g, '\n')
      .trim();

    autoTable(doc, {
      startY: currentY + 5.5,
      body: [[plainTextDescription]],
      theme: 'plain',
      styles: { 
        fontSize: 8.5 * sizeMod, 
        cellPadding: 0.5, 
        textColor: [30, 41, 59],
        overflow: 'linebreak',
        font: family
      },
      margin: { left: margin, right: margin }
    });
    
    currentY = (doc as any).lastAutoTable.finalY + (isCompressed ? 3 : 5);

    // Optional Equipment Table
    if (pdfConfig?.showEquipment !== false && log.equipment && log.equipment.length > 0) {
      doc.setFillColor(accentR, accentG, accentB);
      doc.rect(margin, currentY, 2.5, 4.5, 'F');
      setFont('bold', 10);
      doc.setTextColor(30, 41, 59);
      doc.text('EQUIPMENT & SYSTEM IDENTIFICATION', margin + 5, currentY + 3.6);

      const equipData = log.equipment.map(e => [
        config?.categories?.find(c => c.id === e.category)?.name || e.category,
        e.subCategories.join(', ')
      ]);

      autoTable(doc, {
        startY: currentY + 5.5,
        head: [['Category', 'Sub-Categories / Specific Equipment']],
        body: equipData,
        theme: 'grid',
        headStyles: { fillColor: [241, 245, 249], textColor: [accentR, accentG, accentB], fontSize: 7.5 * sizeMod, fontStyle: 'bold', font: family, cellPadding: 1.2 },
        bodyStyles: { fontSize: 7.5 * sizeMod, font: family, textColor: [30, 41, 59], cellPadding: 1.2 },
        styles: { lineColor: [218, 224, 233], lineWidth: 0.25 },
        margin: { left: margin, right: margin }
      });

      currentY = (doc as any).lastAutoTable.finalY + (isCompressed ? 3 : 5);
    }

    // Dynamic Page Overflow calculation for Sign-off & Verification blocks
    const pageHeightCheck = doc.internal.pageSize.getHeight();
    const showSup = pdfConfig?.showSupervisor !== false;
    const showOwner = pdfConfig?.showOwnerSignature !== false;
    const showComments = pdfConfig?.showSupervisorComments !== false;

    const ownerHeight = showOwner ? 16 : 0;
    const supervisorHeight = showSup ? (showComments ? 28 : 20) : 0;
    const totalSignSpace = ownerHeight + supervisorHeight + 8;

    if (currentY > pageHeightCheck - totalSignSpace) {
      doc.addPage();
      currentY = 15;
    }

    // Technician (Self) Signature Box
    if (showOwner) {
      const boxWidth = pageWidth - margin * 2;
      const boxHeight = isCompressed ? 15 : 18;

      // Fill main card background and header bar first
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, currentY, boxWidth, boxHeight, 'F');

      doc.setFillColor(248, 250, 252);
      doc.rect(margin, currentY, boxWidth, 4.5, 'F');
      
      // Draw crisp outer border stroke AFTER fill so top border is uniform and never clipped
      doc.setDrawColor(218, 224, 233);
      doc.setLineWidth(0.3);
      doc.rect(margin, currentY, boxWidth, boxHeight, 'S');

      setFont('bold', 7.5);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text('SIGN-OFF DECLARATION', margin + 3, currentY + 3.2);

      setFont('normal', 6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('I hereby certify that the work entered above is a true and accurate record of the tasks undertaken.', margin + 3, currentY + 8);

      setFont('normal', 7.5);
      doc.setTextColor(30, 41, 59);
      const leftCol = margin + 3;
      const rightCol = margin + Math.floor(boxWidth * 0.55);

      doc.text('Signature: ________________________________', leftCol, currentY + 13.5);
      doc.text('Date of Certification: ____/____/________', rightCol, currentY + 13.5);

      currentY += boxHeight + (isCompressed ? 3 : 4);
    }

    // Optional Supervisor Verification Panel
    if (showSup) {
      const boxWidth = pageWidth - margin * 2;
      const paneHeight = showComments ? (isCompressed ? 28 : 34) : (isCompressed ? 20 : 23);

      doc.setFillColor(255, 255, 255);
      doc.rect(margin, currentY, boxWidth, paneHeight, 'F');

      doc.setFillColor(241, 245, 249);
      doc.rect(margin, currentY, boxWidth, 4.5, 'F');

      doc.setDrawColor(218, 224, 233);
      doc.setLineWidth(0.3);
      doc.rect(margin, currentY, boxWidth, paneHeight, 'S');

      setFont('bold', 7.5);
      doc.setTextColor(accentR, accentG, accentB);

      let titleToUse = pdfConfig?.supervisorTitle || 'SUPERVISOR VERIFICATION & COMMENTS';
      if (!showComments) {
        titleToUse = titleToUse
          .replace(/\s*(?:&|and)\s*comments\b/gi, '')
          .replace(/\s*-\s*comments\b/gi, '')
          .trim();
      }
      doc.text(titleToUse, margin + 3, currentY + 3.2);

      let lineY = currentY + 8;

      if (showComments) {
        setFont('normal', 7);
        doc.setTextColor(100, 116, 139);
        doc.text('Supervisor Comments:', margin + 3, lineY);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin + 32, lineY, pageWidth - margin - 3, lineY);

        lineY += 4.5;
        doc.line(margin + 3, lineY, pageWidth - margin - 3, lineY);
        lineY += 5;
      }

      // Name and RIW Row
      const col1X = margin + 3;
      const col2X = margin + Math.floor(boxWidth * 0.52);

      setFont('normal', 7.5);
      doc.setTextColor(30, 41, 59);

      doc.text('Supervisor Name:', col1X, lineY);
      if (log.approvingSupervisor) {
        setFont('bold', 8);
        doc.text(log.approvingSupervisor, col1X + 25, lineY - 0.2);
        setFont('normal', 7.5);
      } else {
        doc.setDrawColor(203, 213, 225);
        doc.line(col1X + 24, lineY, col2X - 5, lineY);
      }

      doc.text('RIW ID:', col2X, lineY);
      if (log.approvingSupervisorRiw) {
        setFont('bold', 8);
        doc.text(log.approvingSupervisorRiw, col2X + 13, lineY - 0.2);
        setFont('normal', 7.5);
      } else {
        doc.setDrawColor(203, 213, 225);
        doc.line(col2X + 12, lineY, pageWidth - margin - 3, lineY);
      }

      // Signature and Date Row
      lineY += 5;
      doc.text('Signature:', col1X, lineY);
      doc.setDrawColor(203, 213, 225);
      doc.line(col1X + 15, lineY, col2X - 5, lineY);

      doc.text('Date:', col2X, lineY);
      doc.line(col2X + 9, lineY, pageWidth - margin - 3, lineY);

      // Declaration footer inside box
      lineY += 4.5;
      setFont('italic', 6.5);
      doc.setTextColor(148, 163, 184);
      doc.text(pdfConfig?.supervisorDeclaration || 'I verify that the work described was performed safely and to industry standards.', col1X, lineY);
    }
  };

  const handleExportPDF = (log: LogEntry) => {
    const doc = createPdfInstance();
    generateLogPage(doc, log, true);
    addDocumentFooters(doc, log.logNumber);
    doc.save(`Signalling_Log_${log.logNumber}.pdf`);
  };

  const handleShareBulk = async () => {
    if (selectedLogs.size === 0) return;
    try {
      const doc = createPdfInstance();
      const selectedEntries = logs.filter(l => selectedLogs.has(l.id));
      selectedEntries.forEach((log, index) => {
        generateLogPage(doc, log, index === 0);
      });
      addDocumentFooters(doc);
      
      const pdfBlob = doc.output('blob');
      const filename = `Bulk_Signalling_Logs_${format(new Date(), 'yyyyMMdd')}.pdf`;
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      const shareData = {
        files: [file],
        title: `Rail Logbook: ${selectedEntries.length} Entries`,
        text: `Please find attached the bulk export of ${selectedEntries.length} log entries.`,
      };

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share(shareData);
        } catch (shareError: any) {
          if (shareError.name === 'AbortError' || shareError.name === 'NotAllowedError') {
            setExportStep('none');
            return;
          }
          throw shareError;
        }
      } else {
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

  const handleBulkExport = () => {
    if (selectedLogs.size === 0) return;
    const doc = createPdfInstance();
    const selectedEntries = logs.filter(l => selectedLogs.has(l.id));
    selectedEntries.forEach((log, index) => {
      generateLogPage(doc, log, index === 0);
    });
    addDocumentFooters(doc);
    doc.save(`Bulk_Signalling_Logs_${format(new Date(), 'yyyyMMdd')}.pdf`);
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
