# Railway Signalling Logbook — Status & Roadmap

> Single up-to-date reference: what this project is, what's been done, and what's left.
> Companion docs: `PROJECT_OVERVIEW.md` (deep-dive on the existing web app's architecture) and `MOBILE_DEPLOYMENT_PLAN.md` (original detailed mobile plan + phase-by-phase progress log). This file consolidates both into one current-state summary.
> Repo: https://github.com/mgward86/SignallingLogbook — local clone: `c:\Users\mgwar\Documents\Signalling Logbook`
> Web deployment: **Vercel** project `matt-ward1/signalling-logbook`, live at https://signallinglogbook.com (custom domain, `www` redirects to apex with a 308) and https://signalling-logbook.vercel.app. Deploy with `npx vercel --prod` from the repo root (requires `vercel login` once per machine).

---

## 1. What this project is

A **digital work-logbook web app for railway signalling technicians/engineers**, replacing paper logbooks with a structured, audit-ready, SOP-compliant record of work — including a **supervisor digital sign-off workflow** with cryptographically sealed, locked entries once verified.

**Goal of the current initiative:** take the existing web app (React/Vite/Firebase) and ship real, installable **iOS + Android + Web** apps to the Apple App Store and Google Play Store, via a **Capacitor wrap** (Option A of several considered — see §4 for why).

## 2. Tech stack

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4, `motion` (Framer Motion), `lucide-react`, `react-hook-form` + `zod`, `react-quill-new` (rich text).
- **Backend:** Firebase (Auth + Firestore), `initializeFirestore` with long-polling + persistent multi-tab offline cache.
- **PDF export:** `jspdf` + `jspdf-autotable`.
- **Mobile wrapper (new):** Capacitor 8 (`@capacitor/core`, `/cli`, `/android`, `/ios`).
- **PWA (new):** `vite-plugin-pwa`.
- **Planned:** OneSignal (push notifications), a biometric-auth Capacitor plugin (app-lock).

## 3. Architecture summary (`src/`)

| File | Purpose |
|---|---|
| `App.tsx` | Root shell, view routing (`list \| create \| profile \| config`), online/offline indicator, handles `?verifyToken=` deep link |
| `lib/AuthContext.tsx` | Firebase Auth (Google sign-in), auto-creates `users/{uid}` profile on first login |
| `lib/firebase.ts` | Firebase init, `removeUndefinedProperties()`, `handleFirestoreError()` |
| `components/Landing.tsx` | Sign-in screen |
| `components/Nav.tsx` | Top nav |
| `components/LogEntryForm.tsx` | Core work-log entry form (~96KB) |
| `components/LogList.tsx` | Log history/search/PDF export (~85KB) |
| `components/UserProfileForm.tsx` | Profile + PDF branding config (~95KB) |
| `components/ConfigManager.tsx` | Admin: shared dropdown lists (~69KB) |
| `components/SupervisorPortalModal.tsx` / `SupervisorVerificationModal.tsx` | Digital sign-off workflow |
| `hooks/useConfig.ts` / `useOnlineStatus.ts` | Firestore config subscription, network status |
| `constants.ts` | Equipment categories, work types, quick-part templates, default supervisors |

**Data model (Firestore):** `users/{userId}`, `logEntries/{logId}` (with `verificationStatus: draft → pending_verification → verified/rejected/cancelled`, `auditTrail[]`, `verificationHash`, `isLocked`), `config/main` (shared org-wide lists).

Full field-level schema is in `PROJECT_OVERVIEW.md`.

## 4. Mobile path decision: Capacitor

Four options were evaluated (Capacitor wrap / PWA-only / Expo+react-native-web hybrid / full native rewrite). **Capacitor was chosen** because it reuses ~95%+ of the existing React/Vite codebase — no UI rewrite needed, wraps the app in a native WKWebView (iOS) / WebView (Android) shell with a JS bridge to native APIs (auth, filesystem, push, biometrics).

### Confirmed decisions
| Decision | Answer |
|---|---|
| Bundle identifier / app name | `com.mward.signallinglogbook` / "Railway Signalling Logbook" |
| Gemini API key | Removed from client bundle (see §5 — turned out to be unused) |
| V1 scope | **Full scope**: biometric app-lock AND push notifications both in v1 |
| Push notification provider | **OneSignal** |
| Apple Developer / Google Play accounts | Personal accounts — **not yet created, user is setting these up independently** |

## 5. Environment & tooling set up this session

This machine had **no Git, Node.js, or Firebase CLI** and the repo only existed on GitHub (nothing local). To do real, verified work rather than just describe changes:
- Installed **Git 2.55** and **Node.js 24 LTS** via `winget`.
- Cloned the repo to `c:\Users\mgwar\Documents\Signalling Logbook`.
- `npm install` run; all subsequent changes verified with `tsc --noEmit` and `vite build` before committing.
- Git pushes to `main` require explicit approval each time (protected-branch write) — this has been happening via an approval prompt per push.

## 6. Completed work

### ✅ Phase 0 — Housekeeping (commit `9006d73`)
- **Key finding:** grepped the entire repo — `@google/genai` was a dependency and `GEMINI_API_KEY` was wired into `vite.config.ts`'s client bundle via `define`, but **no code anywhere in `src/` actually calls the Gemini API.** It was leftover Google AI Studio project-template scaffolding, not a real feature. (Corrected an earlier assumption in `PROJECT_OVERVIEW.md` that speculated it powered AI-assisted description drafting.)
- Removed the dead `define` block from `vite.config.ts` — verified with a post-build grep that no `GEMINI_API_KEY` string appears in `dist/assets/*.js`.
- Added `vite-plugin-pwa`: manifest, service worker, `autoUpdate` registration, theme color, icon links in `index.html`.
- Extended `UserProfile` (`AuthContext.tsx`) and `firestore.rules`' `isValidUser()` validator with `oneSignalPlayerId?: string` and `biometricLockEnabled?: boolean`, in prep for later phases.
- Updated `.env.example` to note `GEMINI_API_KEY` is currently unused.

### ✅ Phase 1 — Capacitor scaffolding (commit `e5249d1`)
- Installed `@capacitor/core`, `@capacitor/cli` (dev), `@capacitor/android`, `@capacitor/ios`.
- `capacitor.config.ts`: `appId: com.mward.signallinglogbook`, `webDir: dist`.
- Added native `android/` and `ios/` projects via `npx cap add android` / `ios`.
  - **Notable:** `cap add ios` succeeded on Windows — this Capacitor version uses Swift Package Manager (`Package.swift`), not CocoaPods, so no Mac was needed just to scaffold. **Actually building/running/signing the iOS app still requires a Mac with Xcode** — that constraint is unchanged.
- Generated a placeholder branded icon/splash (navy background, "RSL" wordmark) at `resources/icon.png` / `resources/splash.png`, then ran `npx capacitor-assets generate` to produce every required Android density, iOS asset-catalog entry, and a full PWA icon set (`public/icons/icon-{48,72,96,128,192,256,512}.webp` + `apple-touch-icon.png`), replacing Capacitor's default logo everywhere.
- Added npm scripts: `cap:sync`, `android:open`, `android:run`, `ios:open`, `ios:run`.
- Verified: `tsc --noEmit` passes, `vite build` + `npx cap sync` succeed, native folders reasonably sized (~2.6MB/77 files Android, ~2.6MB/40 files iOS thanks to Capacitor's auto-generated `.gitignore`s).

### 🟡 Phase 2 — Auth migration (code complete, blocked on manual console setup + device testing)
- Added `@capacitor-firebase/authentication` (v8.5.1, matches Capacitor 8).
- `AuthContext.tsx`: `signIn()` now branches on `Capacitor.isNativePlatform()` — native calls `FirebaseAuthentication.signInWithGoogle()` (OS-native account chooser) to get an ID token, then mirrors it into the Firebase JS SDK via `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`, so `onAuthStateChanged`/Firestore/profile-creation logic downstream is unchanged. Web keeps the existing `signInWithPopup` flow untouched. `logOut()` now also calls `FirebaseAuthentication.signOut()` on native before the JS SDK sign-out, to avoid a stale native session silently resuming.
- `firebase.ts`: on native platforms, `auth` is created via `initializeAuth(app, { persistence: indexedDBLocalPersistence })` instead of `getAuth(app)` — per the plugin's docs, this is needed for auth state to reliably survive app restarts inside a native WebView. Web is unaffected.
- `capacitor.config.ts`: added `plugins.FirebaseAuthentication` config (`skipNativeAuth: false`, `providers: ['google.com']`).
- `android/variables.gradle`: added `rgcfaIncludeGoogle = true` and `androidxCredentialsVersion` required by the plugin's native Google Sign-In dependency.
- iOS uses Swift Package Manager (no Podfile), so the `Google` package trait (GoogleSignIn SDK) is included automatically — no manual Xcode/Podfile edit needed for the dependency itself.
- Verified: `tsc --noEmit` and `vite build` pass; `npm run cap:sync` succeeds and correctly picked up the new plugin on both platforms (`ios/App/CapApp-SPM/Package.swift` and `android/capacitor.settings.gradle`/`capacitor.build.gradle` were regenerated to include `@capacitor-firebase/authentication`).

**Cannot be finished from this machine/session — needs you to do the following in the Firebase Console (project `gen-lang-client-0452980140`) before this can actually be tested:**
1. **Auth provider:** Confirm **Google** is enabled under Authentication → Sign-in method (it almost certainly already is, since the existing web popup flow depends on it).
2. **Register an Android app** in Project Settings for package name `com.mward.signallinglogbook`, add your debug keystore's **SHA-1** fingerprint (`keytool -list -v -keystore ~/.android/debug.keystore` — Android Studio's default debug keystore password is `android`), download the generated `google-services.json`, and place it at `android/app/google-services.json` (the Gradle config already conditionally applies the Google Services plugin only if this file exists, so the build won't break in the meantime — see `android/app/build.gradle`).
3. **Register an iOS app** in Project Settings for bundle ID `com.mward.signallinglogbook`, download `GoogleService-Info.plist`, place it at `ios/App/App/GoogleService-Info.plist`, then in Xcode add a URL Type under the App target's Info tab whose **URL Scheme** is the plist's `REVERSED_CLIENT_ID` value (needed for the Google Sign-In redirect to return to the app — SceneDelegate.swift already forwards `openURLContexts` to Capacitor's plugin proxy, so no Swift code changes are needed).
4. **Test on a real device/emulator** (needs Android Studio/SDK or a Mac+Xcode, neither available on this machine): full sign-in → profile creation → sign-out cycle on both platforms, plus a Web regression pass to confirm `signInWithPopup` still works unaffected.

Once you've done steps 1–3 above and have access to Android Studio and/or a Mac, this phase just needs testing/verification — no further code changes are expected unless testing surfaces an issue.

### Known placeholders / follow-ups from completed phases
- `resources/icon.png` / `resources/splash.png` are functional placeholders — replace with real branding and re-run `npx capacitor-assets generate` before store submission.
- No Android Studio/SDK or Mac+Xcode on this machine yet, so the app hasn't been run on an emulator/simulator/device — only scaffolded and built.
- `android/app/google-services.json` and `ios/App/App/GoogleService-Info.plist` don't exist yet (see Phase 2 above) — native Google Sign-In will not work until they're added. These files aren't secrets (like the already-committed `firebase-applet-config.json` web config) so it's fine to commit them once obtained.

## 7. Plan for remaining phases

### ⏭ Phase 0.5 — Developer account setup (deferred to user)
Apple Developer Program (personal, ~US$99/yr, identity verification can take 24–48h) + Google Play Console (personal, ~US$25 one-time) + a OneSignal account/app. **User is handling this independently, on their own timeline.** Needed before: real push notification certificates (APNs key), and before any store submission (Phase 8).

### 🟡 Phase 2 — Auth migration — **code done, see §6 above for manual console steps + testing still needed**

### Phase 3 — PDF/file export adaptation
**Problem:** `jspdf`'s `doc.save()` relies on browser download behavior, unreliable in a native WebView sandbox.
**Plan:** generate PDF as base64 (`doc.output('datauristring')`), use `@capacitor/filesystem` to write it + `@capacitor/share` to let the user save/share it. Keep browser download for Web.

### Phase 4 — Push notifications (OneSignal)
**Key architecture point:** supervisors typically action verification links via their own browser (not the native app), so the notification trigger must be **server-side** — a Firestore `onUpdate` Cloud Function watching `verificationStatus` changes on `logEntries`, which looks up the technician's `oneSignalPlayerId` (already added to `UserProfile` in Phase 0) and calls the OneSignal REST API.
**Plan:**
1. `onesignal-cordova-plugin` (Capacitor-compatible) — init at app startup, capture player ID into the user profile.
2. Upload APNs Auth Key (iOS, needs Apple Developer account) + FCM service account (Android) to OneSignal dashboard.
3. Write the Cloud Function trigger.
4. Add notification-tap deep-linking in `App.tsx`.
5. End-to-end test: technician requests verification → supervisor signs via web link → technician gets push.

### Phase 5 — Biometric app-lock
1. Add a biometric plugin (`@aparajita/capacitor-biometric-auth` or `capacitor-native-biometric`).
2. Add a profile toggle in `UserProfileForm.tsx` (uses `biometricLockEnabled`, already added to schema).
3. Gate the UI via Capacitor `App` plugin's `appStateChange` (lock on resume from background, not just cold launch).
4. Graceful fallback on Web (no biometric API — hide the toggle).

### Phase 6 — Mobile UX polish
- Safe-area CSS (`env(safe-area-inset-*)`) for `Nav.tsx` and modals.
- Keyboard resize behavior (Capacitor `Keyboard` plugin) for `LogEntryForm.tsx` / Quill editor.
- `StatusBar` plugin styling to match `rail-blue` brand.
- Responsive pass over the four large, desktop-first components (`LogEntryForm`, `LogList`, `UserProfileForm`, `ConfigManager`) at phone viewports.
- Android hardware/gesture back-button handling via `@capacitor/app` (map to in-app navigation, not app exit).

### Phase 7 — Cross-platform testing
- iOS: simulator + physical device (push notifications require a real device).
- Android: emulator + physical device (back-button, keyboard, deep links, push).
- Web: regression pass after all the native-platform branching changes.
- **Specifically re-test the supervisor verification link flow** — supervisors often open it in their phone's regular browser, not the native app, so the Web fallback must keep working.

### Phase 8 — App Store / Play Store submission
1. Confirm Apple Developer + Google Play accounts are active (Phase 0.5).
2. Store metadata: description, category, screenshots, privacy policy URL, support URL.
3. App privacy disclosures (email, name, work history, location, push token, biometric usage — relevant given this is a compliance/audit tool).
4. Code signing: Apple certs/provisioning profiles, Android keystore + Play App Signing.
5. Internal testing tracks (TestFlight / Play Internal Testing) before public release.
6. Submit for review (Apple ~1–3 days, Google ~1–7 days, variable).

### Effort estimate (from original plan, engineering time only)
| Phase | Estimate |
|---|---|
| 0. Housekeeping | ✅ done |
| 0.5. Developer accounts | deferred to user |
| 1. Capacitor scaffolding | ✅ done |
| 2. Auth migration | 🟡 code done — pending your Firebase Console setup + device testing |
| 3. PDF/file export | 2–3 days |
| 4. Push notifications | 3–4 days |
| 5. Biometric app-lock | 1–2 days |
| 6. Mobile UX polish | 3–5 days |
| 7. Cross-platform testing | 4–6 days |
| 8. Store submission prep | 3–5 days (+ review wait time) |
| **Remaining total** | **~3–4 weeks** |

## 8. Immediate next step

**Phase 2 (Auth migration) code is done** (see §6). It's now blocked on you: add the Android/iOS apps to the Firebase Console and place the resulting `google-services.json` / `GoogleService-Info.plist` files (steps 1–3 in §6), then test on a device/emulator once you have Android Studio and/or a Mac available.

Meanwhile, **Phase 3 (PDF/file export adaptation)** doesn't depend on any of that and can proceed next.
