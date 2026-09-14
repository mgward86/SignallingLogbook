# Mobile Deployment Plan — Capacitor Wrap (iOS + Android + Web)

> Companion doc to `PROJECT_OVERVIEW.md`. This is a **plan only** — no code has been changed yet.
> Chosen path: **Option A — Capacitor**, wrapping the existing React/Vite web app to ship real, installable apps to the Apple App Store and Google Play Store while keeping the Web build as-is.

## Decisions (confirmed)
| Decision | Answer |
|---|---|
| Bundle identifier / app name | `com.mward.signallinglogbook` — confirmed |
| Gemini API key migration | **Now**, before any store submission (Phase 0, blocking) |
| V1 scope | **Full scope** — biometric app-lock AND push notifications both included in v1 |
| Push notification provider | **OneSignal** |
| Apple Developer / Google Play accounts | **Personal accounts, not yet created** — needs setup early (see Phase 0.5) |

## Why Capacitor fits this codebase
Capacitor (by the Ionic team) takes an existing web app and runs it inside a native WKWebView (iOS) / Chrome WebView (Android) shell, with a JS bridge to native device APIs. Because your app is a standard Vite/React SPA, this requires **no rewrite of your UI layer** — `LogEntryForm.tsx`, `LogList.tsx`, `UserProfileForm.tsx`, `ConfigManager.tsx`, Tailwind styling, `react-quill-new`, `motion`, and `jspdf` all keep working, since they still run in a browser engine. You get one shared `src/` codebase for all three targets.

## What will NOT need to change
- React component structure, Tailwind styling, routing/view-switching in `App.tsx`.
- Firestore data model, security rules, `useConfig` hook, `constants.ts`.
- Web deployment — the existing `vite build` output continues to work unmodified for the Web target.

## What WILL need to change (and why)

### 1. Google Sign-In (highest-priority change)
**Problem:** `AuthContext.tsx` currently uses `signInWithPopup(auth, new GoogleAuthProvider())`. Native WebViews don't support real browser popups reliably — this flow will fail or behave inconsistently on-device.
**Fix:** Replace with a native Google Sign-In plugin (`@capacitor-firebase/authentication` or `@codetrix-studio/capacitor-google-auth`) that opens the OS-native Google account chooser, returns an ID token, and exchanges it with Firebase Auth via `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`. Keep the existing web `signInWithPopup` path for the Web build (branch on `Capacitor.isNativePlatform()`).

### 2. PDF export / file saving
**Problem:** `jspdf`'s `doc.save()` relies on browser download behavior (creates a Blob URL + triggers an `<a download>` click). This doesn't reliably save files inside a native WebView sandbox.
**Fix:** On native, generate the PDF as a base64 string (`doc.output('datauristring')`), then use the Capacitor `Filesystem` plugin to write it to device storage and the `Share` plugin to let the user save/share/print it (AirDrop, email, Drive, etc.). Keep the current browser download for Web.

### 3. API key exposure (`GEMINI_API_KEY`) — **decided: fix now, before submission**
**Problem:** `vite.config.ts` currently injects `GEMINI_API_KEY` directly into the client bundle via `define`. This is workable for a web app you control, but once shipped as a compiled mobile binary submitted to app stores, the key becomes extractable from the app package.
**Fix:** Create a Firebase Cloud Function (e.g. `generateLogDescription` or similar, callable via `httpsCallable`) that holds the Gemini API key server-side (Cloud Functions config/secret, not committed to the repo). The client calls this authenticated callable function instead of `@google/genai` directly with a client-side key. Remove `GEMINI_API_KEY` from `vite.config.ts`'s `define` block entirely once migrated. **This is now a Phase 0 blocking task**, completed before Capacitor scaffolding begins, since it affects both the eventual mobile binary and the current web deployment.

### 4. Push notifications — **decided: in scope for v1, via OneSignal**
**Why:** Right now, a technician only finds out a supervisor has signed/rejected/cancelled a verification by reopening the app. Push notifications close that loop — useful in both directions:
- Technician gets notified when a supervisor **signs, rejects, or comments** on a pending verification.
- Supervisor could optionally be notified/reminded if they haven't actioned a pending request (nice-to-have, can defer if not needed for v1).

**Key architecture point:** the supervisor typically actions a request via the **web verification link** (`?verifyToken=...`), often in their phone's regular browser — not necessarily inside your native app. This means the "trigger" for a push notification can't just be client-side JS running in the technician's app; it needs a **server-side trigger**:
1. Add a Firebase Cloud Function with a Firestore `onUpdate` trigger on `logEntries/{logId}`, watching for `verificationStatus` changes.
2. When it changes (e.g. `pending_verification` → `verified`/`rejected`), the function looks up the log's `userId`, fetches that user's stored OneSignal subscription/player ID from `users/{uid}`, and calls the OneSignal REST API to push a notification.
3. Store the OneSignal subscription ID on the user profile when the app initializes OneSignal and the user grants permission (extend `UserProfile` with an `oneSignalPlayerId` field, written via the existing `updateProfile()` in `AuthContext.tsx`).

**Client-side integration:**
1. Add `onesignal-cordova-plugin` (Capacitor-compatible) for iOS/Android native push.
2. Initialize OneSignal with your OneSignal App ID at app startup (`main.tsx` or `AuthContext.tsx` after login), request notification permission.
3. For Web, OneSignal also supports web push — worth enabling for parity, though lower priority than native.
4. Apple requires an **APNs Auth Key** (from the Apple Developer account) uploaded to the OneSignal dashboard; Android requires an **FCM Server Key / service account JSON** (from the Firebase project, which you already have) uploaded to OneSignal.

### 5. Biometric app-lock — **decided: in scope for v1**
**Why:** Given this app holds compliance/audit-relevant work records and is signed into a personal work Google account, a biometric app-lock (Face ID / Touch ID / Android biometric prompt) adds a sensible extra layer, gating access to the app on launch/resume without requiring a full re-login.
**Fix:**
1. Add a biometric plugin (`@aparajita/capacitor-biometric-auth` or `capacitor-native-biometric`).
2. Add a user-facing toggle in `UserProfileForm.tsx` ("Require Face ID / Fingerprint to open app") stored as a profile preference.
3. Use Capacitor's `App` plugin `appStateChange` listener to trigger the biometric prompt when the app returns from background (not just cold launch), so a locked phone handed off mid-task still requires re-auth.
4. Fall back gracefully on Web (no biometric API — the toggle simply doesn't apply/is hidden).

### 6. Mobile UX adaptations
- **Safe areas:** add `env(safe-area-inset-*)` CSS padding (notch, Dynamic Island, home indicator) for `Nav.tsx` and modal components.
- **On-screen keyboard:** `react-quill-new` and long forms (`LogEntryForm.tsx`) need the Capacitor `Keyboard` plugin configured (resize behavior) so inputs aren't obscured when the keyboard opens.
- **Status bar:** configure `StatusBar` plugin (color/style) to match the `rail-blue` brand.
- **Touch targets & scrolling:** verify tap target sizes and momentum scrolling inside modals (`SupervisorVerificationModal.tsx`, `SupervisorPortalModal.tsx`) feel native.
- **Splash screen & app icon:** generate full icon/splash asset sets (Capacitor `assets` generator) from a source logo.
- **Push permission + notification tap handling:** tapping a push notification should deep-link into the relevant log entry, not just open the app to the list view — needs a small routing addition in `App.tsx`.

### 7. Firestore offline persistence
Current `persistentLocalCache` + `persistentMultipleTabManager` setup uses IndexedDB, which is available in modern WebViews — should largely work as-is, but needs on-device testing since WebView IndexedDB quirks vary by OS version. No code change expected unless issues surface in testing.

## Step-by-step migration plan

**Phase 0 — Housekeeping (pre-mobile, blocking)**
1. Move Gemini API key usage behind a Cloud Function (see item 3 above). **Do this first — it also improves the current live web app's security.**
2. Add `vite-plugin-pwa` (manifest + service worker) — low effort, gives Web an install prompt and offline support as a side benefit.
3. Confirm `firebase-applet-config.json` only contains the public Firebase web config (expected/safe to ship — Firebase web API keys are not secrets, security is enforced by `firestore.rules`).
4. Extend `UserProfile` type/schema with `oneSignalPlayerId?: string` and `biometricLockEnabled?: boolean` (and update `firestore.rules`'s `isValidUser()` validator accordingly).

**Phase 0.5 — Developer account setup (do in parallel with Phase 0, start early — approval/verification can take time)**
1. Enroll in the **Apple Developer Program** (personal account, ~US$99/yr) — identity verification can take 24–48 hours.
2. Create a **Google Play Console** developer account (personal, ~US$25 one-time) — also has an identity verification step.
3. Create a **OneSignal** account and a new OneSignal App for this project.
4. Reserve the app name on both stores if desired, and confirm `com.mward.signallinglogbook` isn't already taken as a bundle ID.
5. Note: an Apple Developer account is a prerequisite for generating the **APNs Auth Key** needed for OneSignal push on iOS, so this needs to be in place before Phase where push is wired up.

**Phase 1 — Capacitor scaffolding**
1. `npm install @capacitor/core @capacitor/cli`
2. `npx cap init` (app name: "Railway Signalling Logbook", bundle ID `com.mward.signallinglogbook`)
3. `npm install @capacitor/ios @capacitor/android`
4. `npx cap add ios` / `npx cap add android` — generates native `ios/` and `android/` project folders alongside `src/`.
5. Set `webDir: 'dist'` in `capacitor.config.ts` and confirm `vite build` output syncs correctly.
6. Generate icons/splash screens (`@capacitor/assets`).

**Phase 2 — Auth migration**
1. Add `@capacitor-firebase/authentication` (or equivalent).
2. Branch sign-in logic in `AuthContext.tsx`: native platform → native Google Sign-In; web → existing `signInWithPopup`.
3. Register OAuth client IDs for iOS/Android in Firebase Console + Google Cloud Console (separate from the existing Web client ID).
4. Test full sign-in → profile creation → sign-out cycle on both simulators and real devices.

**Phase 3 — File/PDF export adaptation**
1. Add `@capacitor/filesystem` and `@capacitor/share`.
2. Branch PDF save logic (wherever `jspdf`'s `.save()` is called, likely in `LogList.tsx`) by platform.
3. Test PDF generation, save, and share flow on-device.

**Phase 4 — Push notifications (OneSignal)**
1. Install and initialize `onesignal-cordova-plugin`; wire up permission request + player ID capture into `AuthContext.tsx` / profile.
2. Upload APNs Auth Key (iOS) and FCM service account (Android) to the OneSignal dashboard.
3. Write the Firestore `onUpdate` Cloud Function that watches `verificationStatus` changes and calls the OneSignal REST API.
4. Add notification-tap deep-linking into `App.tsx`.
5. Test end-to-end: technician sends verification request → supervisor signs via web link → technician receives push.

**Phase 5 — Biometric app-lock**
1. Install biometric plugin, add profile toggle in `UserProfileForm.tsx`.
2. Wire up `App` plugin `appStateChange` to gate the UI behind a lock screen when enabled.
3. Test on both a device with biometrics enrolled and one without (should fail gracefully / offer passcode fallback per OS behavior).

**Phase 6 — Mobile UX polish**
1. Safe-area CSS, keyboard resize behavior, status bar styling.
2. Responsive pass over `LogEntryForm.tsx`, `LogList.tsx`, `UserProfileForm.tsx`, `ConfigManager.tsx` at phone-sized viewports (these were originally built desktop/tablet-first).
3. Add `@capacitor/app` for back-button handling on Android (hardware/gesture back should map to your in-app view navigation in `App.tsx` rather than exiting the app unexpectedly).

**Phase 7 — Cross-platform testing**
1. iOS: Simulator + at least one physical device (Face ID/Google Sign-In/push behave differently on simulators — push in particular requires a real device).
2. Android: Emulator + at least one physical device (test back-button, keyboard resize, deep links for `?verifyToken=`, push).
3. Web: regression pass to confirm nothing broke from the platform-branching changes.
4. Specifically re-test the **supervisor verification link flow** end-to-end on mobile — a supervisor may open the emailed link in their phone's regular browser (not your native app), so confirm the Web fallback still works correctly for that audience even after native app changes ship.

**Phase 8 — App Store / Play Store submission prep**
1. Confirm Apple Developer Program + Google Play Console accounts are active (from Phase 0.5).
2. Store metadata: app name, description, category, keywords, screenshots (multiple device sizes), privacy policy URL, support URL.
3. **App privacy disclosures** — both stores require declaring what data is collected (here: email, name, work history/log content, potentially location text field, push token, biometric usage) and whether it's linked to identity — relevant given this is a professional/compliance record-keeping tool.
4. Code signing: Apple certificates/provisioning profiles (via Xcode or Fastlane match); Android keystore + Play App Signing.
5. Internal testing tracks first (TestFlight for iOS, Internal Testing track for Android) before public release.
6. Submit for review (Apple typically ~1–3 days, Google ~1–7 days, can vary).

## Rough effort estimate
| Phase | Estimated effort |
|---|---|
| 0. Housekeeping (incl. Gemini key migration) | 2–3 days |
| 0.5. Developer account setup | 0.5–1 day of your time (+ up to 48h waiting on Apple verification, done in parallel) |
| 1. Capacitor scaffolding | 2–3 days |
| 2. Auth migration | 3–5 days |
| 3. PDF/file export | 2–3 days |
| 4. Push notifications (OneSignal) | 3–4 days |
| 5. Biometric app-lock | 1–2 days |
| 6. Mobile UX polish | 3–5 days |
| 7. Cross-platform testing | 4–6 days (larger surface area now with push + biometrics) |
| 8. Store submission prep | 3–5 days (+ store review wait time) |
| **Total (engineering only)** | **~5–6 weeks**, solo developer already familiar with the codebase |

This excludes store review turnaround time and any design/asset work (icons, screenshots, marketing copy) if you want those professionally done rather than generated.

## Immediate next actions
1. **You:** Apple Developer Program + Google Play Console enrollment (Phase 0.5) — deferred, you're handling this yourself later.
2. **Me:** continue with remaining phases (2: Auth migration is the next one that needs real engineering work).

## Progress log

### ✅ Phase 0 — Housekeeping (done, commit `9006d73`)
- Removed the dead `GEMINI_API_KEY` client-bundle injection from `vite.config.ts`. **Finding:** no code in `src/` actually called `@google/genai` — it was unused AI Studio scaffolding, not an active feature. Verified with a full-repo grep before making changes.
- Added `vite-plugin-pwa` (manifest + service worker, `autoUpdate` registration).
- Extended `UserProfile` (`AuthContext.tsx`) and `firestore.rules`' `isValidUser()` with `oneSignalPlayerId?: string` and `biometricLockEnabled?: boolean`.
- Verified: `tsc --noEmit` passes, `vite build` succeeds, confirmed via grep that no `GEMINI_API_KEY` string exists in the built `dist/assets/*.js`.

### ✅ Phase 1 — Capacitor scaffolding (done)
- Installed `@capacitor/core`, `@capacitor/cli` (devDependency), `@capacitor/android`, `@capacitor/ios`.
- `capacitor.config.ts` created: `appId: com.mward.signallinglogbook`, `appName: Railway Signalling Logbook`, `webDir: dist`.
- Added native `android/` and `ios/` projects (`npx cap add android` / `ios`). Both platforms' own `.gitignore`s (auto-generated by Capacitor) correctly exclude build output, Gradle caches, and Pods.
- **Note:** `npx cap add ios` succeeded on this Windows machine without needing CocoaPods — this Capacitor version uses Swift Package Manager (`Package.swift`) for iOS dependencies instead. The `ios/` project structure exists and is committed, but **actually building/running the iOS app still requires a Mac with Xcode** (that hasn't changed - only platform *scaffolding* works cross-platform).
- Generated a placeholder branded icon (`resources/icon.png`, 1024×1024, navy "RSL") and splash (`resources/splash.png`) and ran `npx capacitor-assets generate` to produce all required Android/iOS icon densities + splash screens, and a fuller PWA icon set (`public/icons/icon-{48..512}.webp`) replacing Capacitor's default logo. Also added `public/apple-touch-icon.png` (180×180 PNG).
- Added convenience npm scripts: `cap:sync`, `android:open`, `android:run`, `ios:open`, `ios:run`.
- Verified: `tsc --noEmit` passes, `vite build` + `npx cap sync` both succeed cleanly, native `android/`/`ios/` folders are reasonably sized (~2.6MB each, ~77/40 files).
- **Still a placeholder:** the "RSL" wordmark icon/splash is a functional stand-in, not real branding. Swap `resources/icon.png` + `resources/splash.png` for real artwork and re-run `npx capacitor-assets generate` before any store submission.
- **Not yet possible without local tooling:** actually launching the app in an Android emulator/device (needs Android Studio/SDK) or iOS simulator/device (needs a Mac). Scaffolding is committed and ready for whenever that tooling is available.
