/**
 * Single source of truth for turning a log entry into a branded PDF page.
 *
 * IMPORTANT: this used to be duplicated in two places — the real generator
 * (previously inline in `LogList.tsx`) and a hand-built CSS approximation
 * used purely for the "live preview" inside the PDF customiser modal
 * (`UserProfileForm.tsx`). Those two implementations could (and did) drift
 * out of sync, so the customiser's preview was not a reliable guide to what
 * the actual exported PDF would look like.
 *
 * Extracting this into a standalone module lets both `LogList.tsx` (real
 * exports) AND the customiser (a "Preview Real PDF" action, generating an
 * actual PDF from the in-progress settings) call the *exact same* rendering
 * code, so there is only ever one implementation to keep correct.
 *
 * Every function here is a pure function of its arguments (no reads from
 * `useAuth()`/`useConfig()` closures), which is what makes it reusable from
 * a settings form that hasn't saved its draft config yet.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { UserProfile } from './AuthContext';

export type PdfConfig = NonNullable<UserProfile['pdfConfig']>;

export const APP_NAME = 'Railway Signalling Logbook';

export type HeaderStyle = 'accent-lines' | 'solid-banner' | 'bold-left' | 'condensed-table' | 'executive-pro';

/** Maps stored/legacy header-style values (incl. old `jmdr-grid`) onto the current set. */
export function resolveHeaderStyle(style?: string): HeaderStyle {
  if (style === 'jmdr-grid' || style === 'condensed-table') return 'condensed-table';
  if (style === 'solid-banner' || style === 'bold-left' || style === 'executive-pro') return style;
  return 'accent-lines';
}

export interface PdfEquipment {
  category: string;
  subCategories: string[];
}

/** Minimal shape of a log entry needed to render a PDF page. */
export interface PdfLogEntry {
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
  equipment: PdfEquipment[];
  workType: string;
  workDescription: string;
  supervisorComments?: string;
  supervisorSignatureDataUrl?: string;
  verificationSignedAt?: string;
}

/** Minimal shape of the signed-in technician's profile needed for a PDF. */
export interface PdfProfileInfo {
  displayName?: string | null;
  jobTitle?: string;
  employeeId?: string;
}

export interface PdfCategoryLookup {
  id: string;
  name: string;
}

export function hexToRgb(hex?: string): [number, number, number] {
  const defaultRgb: [number, number, number] = [0, 48, 87]; // #003057
  if (!hex) return defaultRgb;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6 || /[^0-9a-fA-F]/.test(cleanHex)) return defaultRgb;
  const num = parseInt(cleanHex, 16);
  return [
    (num >> 16) & 255,
    (num >> 8) & 255,
    num & 255
  ];
}

/** Is `hex` a valid, fully-specified 6-digit hex colour (e.g. "#003057")? */
export function isValidHex(hex?: string): boolean {
  return !!hex && /^#[0-9a-fA-F]{6}$/.test(hex);
}

/**
 * WCAG relative-luminance-based contrast ratio between two hex colours.
 * Returns a value from 1 (no contrast) to 21 (max contrast, black on white).
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = hexToRgb(hex).map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const lA = luminance(hexA) + 0.05;
  const lB = luminance(hexB) + 0.05;
  return lA > lB ? lA / lB : lB / lA;
}

/**
 * Header-style/setting combinations that the real generator below
 * currently ignores. Surfaced so the customiser UI can grey out or annotate
 * controls instead of silently doing nothing when toggled.
 *
 * Keep this in sync with the `generateLogPage` branches below — if you make
 * a header style respect a setting it previously ignored, remove it here.
 */
export const HEADER_STYLE_UNSUPPORTED_KEYS: Record<string, (keyof PdfConfig)[]> = {
  'condensed-table': ['layoutSpacing', 'showEquipment', 'showCertificationDetails', 'showOwnerSignature'],
  'executive-pro': ['showSupervisorComments'],
};

/** Header styles that force a fixed page orientation, ignoring the toggle. */
export const HEADER_STYLE_LOCKED_ORIENTATION: Record<string, 'portrait' | 'landscape'> = {
  'condensed-table': 'landscape',
};

export function resolveFamily(pdfConfig?: PdfConfig): 'helvetica' | 'times' | 'courier' {
  return pdfConfig?.fontFamily === 'times' ? 'times' : (pdfConfig?.fontFamily === 'courier' ? 'courier' : 'helvetica');
}

export function resolveMargin(pdfConfig?: PdfConfig): number {
  return pdfConfig?.marginSize === 'narrow' ? 10 : (pdfConfig?.marginSize === 'wide' ? 22 : 15);
}

export function resolveSizeMod(pdfConfig?: PdfConfig): number {
  return pdfConfig?.fontSizeModifier === 'sm' ? 0.9 : (pdfConfig?.fontSizeModifier === 'lg' ? 1.1 : 1.0);
}

export function createPdfInstance(pdfConfig?: PdfConfig): jsPDF {
  const locked = HEADER_STYLE_LOCKED_ORIENTATION[resolveHeaderStyle(pdfConfig?.headerStyle)];
  const orientation = locked ?? (pdfConfig?.pageOrientation === 'landscape' ? 'landscape' : 'portrait');
  return new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4'
  });
}

export function addDocumentFooters(doc: jsPDF, pdfConfig?: PdfConfig, logRef?: string): void {
  const [accentR, accentG, accentB] = hexToRgb(pdfConfig?.accentColor || '#003057');
  const showPageNumbers = pdfConfig?.showPageNumbers !== false;
  const customFooterNote = pdfConfig?.customFooterNote || APP_NAME;
  const totalPages = doc.getNumberOfPages();
  const family = resolveFamily(pdfConfig);
  const margin = resolveMargin(pdfConfig);

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Page 2+ Header for Executive Pro
    if (i > 1 && resolveHeaderStyle(pdfConfig?.headerStyle) === 'executive-pro') {
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
}

export function generateLogPage(
  doc: jsPDF,
  log: PdfLogEntry,
  isFirstPage: boolean,
  pdfConfig: PdfConfig | undefined,
  profile: PdfProfileInfo | undefined,
  categories: PdfCategoryLookup[] | undefined
): void {
  if (!isFirstPage) doc.addPage();

  const [accentR, accentG, accentB] = hexToRgb(pdfConfig?.accentColor || '#003057');

  const pageWidth = doc.internal.pageSize.getWidth();
  const family = resolveFamily(pdfConfig);
  const sizeMod = resolveSizeMod(pdfConfig);
  const margin = resolveMargin(pdfConfig);

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
  const headerStyle = resolveHeaderStyle(pdfConfig?.headerStyle);

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
        categories?.find(c => c.id === e.category)?.name || e.category,
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
  } else if (headerStyle === 'condensed-table') {
    // Condensed Table — landscape competency grid, styled to match the other layouts
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

    const bannerY = 8;
    const bannerHeight = 20;
    const bannerW = pageWidth - margin * 2;
    const thirdW = bannerW / 3;

    doc.setFillColor(30, 41, 59);
    doc.rect(margin, bannerY, bannerW, bannerHeight, 'F');
    doc.setFillColor(accentR, accentG, accentB);
    doc.rect(margin, bannerY + bannerHeight - 0.8, bannerW, 0.8, 'F');

    setFont('normal', 5.5);
    doc.setTextColor(148, 163, 184);
    doc.text('EMPLOYER', margin + 4, bannerY + 6.5);
    setFont('bold', 10);
    doc.setTextColor(255, 255, 255);
    const employerLines = doc.splitTextToSize(log.employer || 'N/A', thirdW - 8);
    doc.text(employerLines, margin + 4, bannerY + 12.5);

    setFont('bold', 10);
    const titleLines = doc.splitTextToSize((pdfConfig?.title || 'SIGNALLING LOGBOOK').toUpperCase(), thirdW - 4);
    doc.text(titleLines, pageWidth / 2, bannerY + 11.5, { align: 'center' });

    setFont('normal', 5.5);
    doc.setTextColor(148, 163, 184);
    doc.text('LOG NUMBER', pageWidth - margin - 4, bannerY + 6.5, { align: 'right' });
    setFont('bold', 11);
    doc.setTextColor(255, 255, 255);
    doc.text(log.logNumber || 'N/A', pageWidth - margin - 4, bannerY + 13.5, { align: 'right' });

    autoTable(doc, {
      startY: bannerY + bannerHeight + 1.5,
      body: [[
        {
          content: `Work Experience Record Period:  ${log.quarter ? log.quarter + ': ' : ''}${log.startDate} – ${log.endDate}`,
          styles: { textColor: [accentR, accentG, accentB] }
        },
        { content: `Name: ${profile?.displayName?.toUpperCase() || 'N/A'}` },
        {
          content: `Identification Competency Reference (RIW): ${profile?.employeeId || 'N/A'}`,
          styles: { halign: 'right' }
        }
      ]],
      theme: 'grid',
      styles: {
        font: family,
        fontSize: 7.5 * sizeMod,
        fontStyle: 'bold',
        textColor: [30, 41, 59],
        fillColor: [248, 250, 252],
        lineColor: [226, 232, 240],
        lineWidth: 0.25,
        cellPadding: 1.8
      },
      columnStyles: {
        0: { cellWidth: bannerW * 0.42 },
        1: { cellWidth: bannerW * 0.28 },
        2: { cellWidth: bannerW * 0.30 }
      },
      margin: { left: margin, right: margin }
    });

    const gridStartY = (doc as any).lastAutoTable.finalY + 2.5;

    const datesCell = `${log.startDate} –\n${log.endDate}\n\nFinal Commissioning date:\n${log.endDate}`;
    const employerCell = `Employer:\n${log.employer || 'N/A'}\n\nClient:\n${log.client || 'N/A'}\n\nInfrastructure Owner:\n${log.infrastructureOwner || 'N/A'}`;
    const taskCell = `Role: ${log.role || 'N/A'}\nLocation: ${log.isLocationNA ? 'N/A' : (log.location || 'N/A')}\nProject: ${log.isProjectNA ? 'N/A' : (log.projectName || 'N/A')}\n\n${plainTextDescription}`;

    const equipCell = (log.equipment && log.equipment.length > 0)
      ? log.equipment.map(e => {
          const catName = categories?.find(c => c.id === e.category)?.name || e.category;
          return `${catName}:\n${e.subCategories.join(', ')}`;
        }).join('\n\n')
      : 'N/A';

    const verifyParts: string[] = [];
    if (pdfConfig?.showSupervisor !== false) {
      if (log.approvingSupervisor) verifyParts.push(log.approvingSupervisor);
      if (log.approvingSupervisorRiw) verifyParts.push(log.approvingSupervisorRiw);
      if (log.verificationSignedAt) {
        try {
          verifyParts.push(format(new Date(log.verificationSignedAt), 'dd/MM/yyyy'));
        } catch {
          /* ignore unparseable dates */
        }
      }
    }
    const verifyCell = verifyParts.length > 0 ? verifyParts.join('\n') : '—';

    const showObservations = pdfConfig?.showSupervisorComments !== false;
    const observationsCell = (log.supervisorComments || '').trim() || '—';

    const headRow = [
      'Dates\n(From/To)',
      'Employer/Client\nand Infrastructure Owner',
      'Description of Task:\n(Description of Role(s) in competencies/levels)',
      'Ref',
      'Equipment or System Types',
      'Verification Signature\n(Name & ID)',
      ...(showObservations ? ['Supervisor Observations\n(Assessment / Ref)'] : [])
    ];
    const bodyRow = [
      datesCell,
      employerCell,
      taskCell,
      log.logNumber || 'N/A',
      equipCell,
      verifyCell,
      ...(showObservations ? [observationsCell] : [])
    ];

    const obsW = showObservations ? 36 : 0;
    const fixedW = 28 + 36 + 18 + 40 + 32 + obsW;
    const taskW = Math.max(50, pageWidth - margin * 2 - fixedW);

    autoTable(doc, {
      startY: gridStartY,
      head: [headRow],
      body: [bodyRow],
      theme: 'grid',
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [accentR, accentG, accentB],
        fontStyle: 'bold',
        fontSize: 7 * sizeMod,
        halign: 'center',
        font: family,
        cellPadding: 1.5
      },
      bodyStyles: {
        fontSize: 7 * sizeMod,
        font: family,
        textColor: [30, 41, 59],
        fillColor: [255, 255, 255],
        cellPadding: 2,
        valign: 'top'
      },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.25, overflow: 'linebreak' },
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 36 },
        2: { cellWidth: taskW },
        3: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 40 },
        5: { cellWidth: 32 },
        ...(showObservations ? { 6: { cellWidth: obsW } } : {})
      }
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
      categories?.find(c => c.id === e.category)?.name || e.category,
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
}

/** A realistic, clearly-fictitious sample log entry used for previewing PDF settings before any real logs exist (or without querying the user's real data). */
export function buildSamplePdfLogEntry(overrides?: Partial<PdfLogEntry>): PdfLogEntry {
  return {
    logNumber: 'LOG-0125',
    startDate: format(new Date(), 'dd/MM/yyyy'),
    endDate: format(new Date(), 'dd/MM/yyyy'),
    quarter: 'Q2',
    employer: 'Sample Rail Services',
    client: 'Transport for Tomorrow',
    infrastructureOwner: 'Sydney Trains',
    projectName: 'Enfield Remodelling',
    isProjectNA: false,
    role: 'Signal Electrician',
    approvingSupervisor: 'David Miller',
    approvingSupervisorRiw: '8839210',
    location: 'Enfield Hub',
    isLocationNA: false,
    equipment: [
      { category: 'signal-relay', subCategories: ['Q-Style', 'Miniature Bi-Bias'] },
      { category: 'points', subCategories: ['EP Clamplock'] }
    ],
    workType: 'Commissioning',
    workDescription:
      '<p>Tested signal interlocking mechanism at Location A. Verified contact pressure, relays, and power supply. Certified all signals are functioning safely and reliably.</p><ul><li>Audited construction documentation against as-built drawings</li><li>Performed signal sighting and focusing checks</li><li>Closed out final commissioning package</li></ul>',
    supervisorComments: 'Work reviewed and verified on site — no outstanding issues.',
    ...overrides
  };
}
