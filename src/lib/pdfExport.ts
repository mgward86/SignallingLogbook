/**
 * Cross-platform PDF export/share helpers.
 *
 * `jsPDF`'s `doc.save()` triggers a browser file-download, which works fine
 * on Web but does nothing useful inside a Capacitor native WebView sandbox
 * (there's no "Downloads" folder UI reachable that way). Likewise, the Web
 * Share API (`navigator.share`) that the app used for "Share" buttons isn't
 * reliably available inside a native WKWebView/Android WebView.
 *
 * On native platforms we instead write the PDF to the app's cache directory
 * via `@capacitor/filesystem` and hand it to the OS's native share sheet via
 * `@capacitor/share`, which lets the user save it to Files/Drive, print it,
 * AirDrop it, attach it to an email, etc. Web behavior is unchanged.
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type jsPDF from 'jspdf';

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function sanitizeFilename(filename: string): string {
  // Capacitor Filesystem paths shouldn't contain characters that are
  // invalid on some native filesystems.
  return filename.replace(/[\\/:*?"<>|]/g, '_');
}

async function writePdfToCache(pdfDoc: jsPDF, filename: string): Promise<string> {
  const dataUri = pdfDoc.output('datauristring');
  const base64 = dataUri.substring(dataUri.indexOf(',') + 1);
  const result = await Filesystem.writeFile({
    path: sanitizeFilename(filename),
    data: base64,
    directory: Directory.Cache,
  });
  return result.uri;
}

/**
 * "Download" a PDF - the closest native-mobile equivalent to a browser file
 * download.
 * - Web: triggers the standard browser save-file behavior via `doc.save()`.
 * - Native: writes the PDF into the app's cache dir and opens the native
 *   share sheet so the user can save it wherever they like.
 */
export async function downloadPdf(pdfDoc: jsPDF, filename: string): Promise<void> {
  if (!isNative()) {
    pdfDoc.save(filename);
    return;
  }

  const uri = await writePdfToCache(pdfDoc, filename);
  await Share.share({ url: uri, dialogTitle: filename });
}

/**
 * Explicitly share a PDF (e.g. "Email"/"Share" actions) via the platform's
 * native share/send UI.
 *
 * Returns `true` if a native/Web share UI was invoked (including if the
 * user then cancelled it), or `false` if sharing files isn't supported at
 * all on this platform/browser - in which case the caller should fall back
 * to something like a `mailto:` link.
 */
export async function sharePdf(
  pdfDoc: jsPDF,
  filename: string,
  meta: { title: string; text: string }
): Promise<boolean> {
  if (isNative()) {
    try {
      const uri = await writePdfToCache(pdfDoc, filename);
      await Share.share({
        title: meta.title,
        text: meta.text,
        url: uri,
        dialogTitle: meta.title,
      });
    } catch (error: any) {
      // The native Share plugin rejects if the user dismisses the share
      // sheet - treat that the same as a Web Share API "AbortError": the
      // share UI was successfully shown, so no mailto fallback is needed.
    }
    return true;
  }

  const canShareFiles = typeof navigator.canShare === 'function' && typeof navigator.share === 'function';
  if (canShareFiles) {
    const blob = pdfDoc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: meta.title, text: meta.text });
      } catch (error: any) {
        if (error?.name !== 'AbortError' && error?.name !== 'NotAllowedError') {
          throw error;
        }
      }
      return true;
    }
  }

  return false;
}
