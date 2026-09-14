# Railway Signalling Logbook — Project Overview

> Source of truth for AI/agent context on this project. Repo: https://github.com/mgward86/SignallingLogbook

## What it is
A **professional digital work-logbook web app for railway signalling technicians/engineers**, designed to replace paper logbooks with a structured, audit-ready, SOP-compliant record of work performed — complete with a **supervisor digital sign-off workflow**.

The sign-in screen presents the app as:
- **SOP Compliance** — Structured data entry following current railway & network safety standards.
- **Real-time Logging** — Automatic high-precision timestamps, duration checking, and drafting.
- **Audit Ready** — Instant beautifully branded PDF export and complete history search.

Auth is via "Sign in with Work Account" (Google Workspace). Footer note: "Authorised personnel only. Access is monitored and logged."

## Tech stack
- **Frontend**: React 19 + TypeScript, Vite 6, Tailwind CSS 4, `motion` (Framer Motion) for animation, `lucide-react` icons, `react-hook-form` + `zod` for form validation, `react-quill-new` for rich-text descriptions.
- **Backend**: Firebase (Auth + Firestore), with `initializeFirestore` configured for long-polling and persistent multi-tab offline cache.
- **PDF export**: `jspdf` + `jspdf-autotable`.
- **AI**: `@google/genai` was listed as a dependency but **confirmed unused** (verified by full-repo grep, Sep 2026) — leftover AI Studio scaffolding, not an active feature. `GEMINI_API_KEY` injection was removed from `vite.config.ts` accordingly (see `MOBILE_DEPLOYMENT_PLAN.md`).

## Architecture (`src/`)
- `App.tsx` — root shell with view routing (`list | create | profile | config`), online/offline indicator, and a "Supervisor Portal" entry point that also auto-opens if a `?verifyToken=` URL param is present (for supervisors clicking an emailed link).
- `lib/AuthContext.tsx` — Google Workspace sign-in via Firebase Auth (`signInWithPopup`), auto-creates a `users/{uid}` profile document on first login, with friendly error handling for popup/iframe auth issues.
- `lib/firebase.ts` — Firebase init + a `handleFirestoreError` helper that logs rich structured error context (auth state, operation type, path) for debugging.
- `components/Landing.tsx` — the sign-in screen (SOP Compliance / Real-time Logging / Audit Ready feature callouts + "Sign in with Work Account").
- `components/Nav.tsx` — top nav (Logbook / New Entry / Database / Profile) with user-initials avatar.
- `components/LogEntryForm.tsx` (~96KB, the biggest file) — the core work-log entry form.
- `components/LogList.tsx` (~85KB) — log history/search/list view, presumably including PDF export.
- `components/UserProfileForm.tsx` (~95KB) — user profile + extensive **custom PDF branding config** (title, accent colour, header style, fonts, margins, page orientation, supervisor declaration text, etc.).
- `components/ConfigManager.tsx` (~69KB) — admin screen for managing shared dropdown lists (clients, employers, roles, equipment categories, quick-part templates, supervisors).
- `components/SupervisorPortalModal.tsx` / `SupervisorVerificationModal.tsx` — the **digital sign-off workflow** (see below).
- `hooks/useConfig.ts` / `useOnlineStatus.ts` — live Firestore config subscription with sensible defaults, and network status detection.
- `constants.ts` — rich domain data seeded by default: 9 equipment categories (Signals, Points, Track Detection, Train Protection, Interlocking, Power, Level Crossings, Wayside Monitoring, Enclosures) each with real-world sub-equipment (e.g. Microlok II, Westrace, TI21, ETCS balises), 11 work types, and 6 "quick part" activity templates with pre-written scope-of-work HTML for common jobs (commissioning, PM, fault rectification, level crossing testing, etc.).

## Core features

1. **Structured log entries** — date range, location, employer/client/infrastructure owner, project, role, multiple equipment items (category + sub-category), work type, rich-text work description, log numbering (auto-incrementing prefix like `LOG-0001`), and quarter/month grouping.
2. **Supervisor digital verification workflow** (the standout feature):
   - Technician generates a unique verification token + shareable link (optionally protected by a 4-digit PIN).
   - Link can be emailed directly (`mailto:` with pre-filled subject/body) or copied/shared.
   - Supervisor opens the link, reviews, and digitally signs (signature captured as a data URL) with comments.
   - Once signed, the entry is **cryptographically hashed and locked** (`verificationHash`, `isLocked`) to guarantee integrity — no further edits possible.
   - Full **audit trail** array logs every state change (requested, signed, cancelled, rejected) with actor/timestamp.
   - Requests can be cancelled/re-issued.
3. **Configurable PDF export** — highly customizable branded PDF output (5 header styles, font/margin/spacing options, optional supervisor signature block, page numbers, custom footer).
4. **Offline-first** — persistent Firestore local cache with multi-tab support and a visible "Offline" badge.
5. **Admin/config management** — org-wide shared lists (clients, work types, equipment, supervisors, quick-part templates) editable via `config/main` document, live-synced to all users.
6. **Security** — strict Firestore rules: users can only read/write their own profile and log entries; a log becomes readable/writable by a non-owner *only* via a valid `verificationToken` (enabling the supervisor-portal flow without full account access); server-side field validation on every write (type/length checks on every field).

## Data model (Firestore)

| Collection | Purpose |
|---|---|
| `users/{userId}` | Profile: name, employee ID, job title, location, numbering system, PDF branding config |
| `logEntries/{logId}` | The work log itself — dates, equipment, work type/description, verification status (`draft → pending_verification → verified/rejected/cancelled`), audit trail |
| `config/main` | Shared org-wide dropdown data (categories, work types, clients, supervisors, quick parts, numbering, quarter format) |

### `UserProfile` (from `AuthContext.tsx`)
```ts
interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  employeeId?: string;
  jobTitle?: string;
  location?: string;
  isLocationNA?: boolean;
  numberingSystem?: { prefix: string; nextNumber: number; enabled: boolean };
  quarterFormat?: 'Q1-Q4' | 'Months';
  pdfConfig?: {
    title?: string;
    subtitle?: string;
    accentColor?: string;
    showSupervisor?: boolean;
    supervisorTitle?: string;
    supervisorDeclaration?: string;
    showEquipment?: boolean;
    showCertificationDetails?: boolean;
    pageOrientation?: 'portrait' | 'landscape';
    marginSize?: 'narrow' | 'standard' | 'wide';
    fontFamily?: 'helvetica' | 'times' | 'courier';
    fontSizeModifier?: 'sm' | 'md' | 'lg';
    headerStyle?: 'accent-lines' | 'solid-banner' | 'bold-left' | 'jmdr-grid' | 'executive-pro';
    layoutSpacing?: 'relaxed' | 'compressed';
    showOwnerSignature?: boolean;
    showPageNumbers?: boolean;
    customFooterNote?: string;
    showSupervisorComments?: boolean;
  };
}
```

### `LogEntry` (from `firebase-blueprint.json`)
Key fields: `logNumber`, `startDate`, `endDate`, `quarter`, `location`/`isLocationNA`, `employer`, `client`, `infrastructureOwner`, `projectName`/`isProjectNA`, `role`, `equipment: [{ category, subCategories[] }]`, `workType`, `workDescription`, `approvingSupervisor`, `approvingSupervisorRiw`, `verificationStatus` (`draft | pending_verification | verified | rejected | cancelled`), `verificationToken`, `verificationPin`, `verificationRequestedAt`, `verificationRequestedTo`, `verificationSignedAt`, `supervisorSignatureDataUrl`, `supervisorComments`, `verificationHash`, `auditTrail[]`, `isLocked`, `userId`, `createdAt`, `updatedAt`.

### `AppConfig`
`categories`, `workTypes`, `clients`, `employers`, `infrastructureOwners`, `roles`, `locations`, `projects`, `quickParts`, `approvingSupervisors`, `numberingSystem`, `quarterFormat`.

## Repo file map (top-level)
```
.env.example
.gitignore
DRAFT_firestore.rules
firebase-applet-config.json
firebase-blueprint.json
firestore.rules
index.html
metadata.json
package.json / package-lock.json
tsconfig.json
vite.config.ts
src/
  App.tsx
  main.tsx
  index.css
  constants.ts
  components/
    ConfigManager.tsx
    Landing.tsx
    LogEntryForm.tsx
    LogList.tsx
    Nav.tsx
    SupervisorPortalModal.tsx
    SupervisorVerificationModal.tsx
    UserProfileForm.tsx
  hooks/
    useConfig.ts
    useOnlineStatus.ts
  lib/
    AuthContext.tsx
    firebase.ts
```

## Notable implementation details
- `firebase.ts` exposes `removeUndefinedProperties()` (recursively strips `undefined` before Firestore writes, while preserving `FieldValue`/`Date` instances) and `handleFirestoreError()` (logs structured error + auth context, then re-throws).
- Firestore is initialized with `experimentalForceLongPolling: true` — likely to handle connectivity issues in sandboxed/preview environments (e.g. iframes, corporate proxies).
- Google sign-in has custom friendly error messages for common failure modes: popup blocked, popup closed by user, cancelled popup request, and iframe/preview-specific "INTERNAL ASSERTION FAILED" issues (suggests this was originally built/tested inside an iframe-based AI Studio-style preview).
- Two firestore rules files exist: `firestore.rules` (active) and `DRAFT_firestore.rules` (presumably a WIP/next-iteration ruleset).

## Open questions / follow-ups (for future sessions)
- What's in `SupervisorPortalModal.tsx` in full (the counterpart to the verification modal — likely the supervisor-facing review/sign screen)?
- ~~What does `LogEntryForm.tsx` / `LogList.tsx` do with `@google/genai`?~~ **Resolved:** nothing currently — it's unused. What does the PDF export logic (`jspdf`) in `LogList.tsx` actually look like (not yet reviewed in detail)?
- Purpose/differences of `DRAFT_firestore.rules` vs `firestore.rules`.
- Deployment target — is this deployed anywhere (Firebase Hosting, Vercel, etc.)?
