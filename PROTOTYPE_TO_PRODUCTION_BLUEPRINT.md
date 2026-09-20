# Prototype → Production Blueprint

> **What this file is:** a reusable, stack-agnostic runbook for taking a *new* prototype app (typically something exported/scaffolded from an AI app builder like Google AI Studio) from "just a GitHub repo" through a fully set-up dev environment, a live web deployment, and — if wanted — packaged iOS/Android apps.
>
> **How to use it:** drop this file into the root of a new project and hand it to your Cursor agent with something like *"Follow `PROTOTYPE_TO_PRODUCTION_BLUEPRINT.md` for this project."* Work through the phases in order — most are one-time setup, some (Phase 8 onward) only apply if you actually want native mobile apps. Skip phases that don't apply (e.g. no Firebase → skip Phase 5's Firebase-specific steps) and note the substitution.
>
> This blueprint was distilled from doing this exact journey for a real project (a Vite/React/Firebase web app taken from AI-Studio scaffolding → live on Vercel with a custom domain → mid-flight Capacitor mobile wrap). Commands below assume a similar **Node/npm-based frontend** and a **Windows + Cursor** dev machine, since that's what's been validated — call out and adapt anything that differs for a new stack (different package manager, different backend, macOS/Linux dev machine, etc.).

---

## Phase 0 — Local dev environment: check, then install what's missing

**Do this first, always** — don't assume tooling is present just because a project folder has `node_modules/` or a `.git/` folder already on disk. Folders can survive a machine reset even when the actual installed tools don't.

1. Check what's already available:
   ```powershell
   git --version
   node --version
   npm --version
   ```
2. If any are missing, install via `winget` (Windows):
   ```powershell
   winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
   winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
   ```
3. **⚠️ Known gotcha — do not skip:** after installing new tools via `winget`, **fully quit Cursor (not "Reload Window") and relaunch it.** If Cursor's process already launched before the installer updated the system `PATH`, every terminal spawned inside it — including agent shells — keeps inheriting the old, stale environment snapshot indefinitely. A full quit+relaunch reliably fixes this; "Reload Window" does not. If `git`/`node`/`npm` still don't resolve in a fresh terminal after relaunching, double-check the registry `PATH` actually contains `C:\Program Files\Git\cmd` and `C:\Program Files\nodejs\` (`[Environment]::GetEnvironmentVariable("Path","Machine")`).
4. Re-verify versions after relaunch before moving on.

---

## Phase 1 — Link the GitHub repo

This is the actual starting point for a new project.

**If the repo doesn't exist on GitHub yet** (brand-new prototype, e.g. straight out of AI Studio with no remote):
- Use the `new-repo` / `share` Cursor skill, or manually: create the repo on GitHub, then `git init`, `git remote add origin <url>`, initial commit and push.

**If the repo already exists and just needs cloning locally:**
```powershell
git clone https://github.com/<owner>/<repo>.git "<local path>"
cd "<local path>"
```

**Either way, connect Cursor's GitHub integration** so PR review / SCM-aware features work — call the `ConnectScm` tool with the `owner/repo` pair. Note this connects *Cursor's own* GitHub features; it does **not** automatically configure command-line `git push`/`pull` credentials — that's Phase 3.

---

## Phase 2 — Install dependencies & verify the baseline build

Before changing anything, confirm the project actually builds as-is:
```powershell
npm install
npx tsc --noEmit      # if TypeScript
npm run build          # or the project's actual build script — check package.json
```
If this fails on a fresh clone, fix that *first* — don't layer new setup work on top of an already-broken build. Note the project's real scripts from `package.json` rather than assuming `build`/`dev`/`test` names.

---

## Phase 3 — Git identity + GitHub push access

1. Set global git identity (match whatever the existing commit history uses, if any, via `git log -5 --format='%an <%ae>'`, so authorship stays consistent):
   ```powershell
   git config --global user.name "<name>"
   git config --global user.email "<email>"
   ```
2. Verify both read and write access actually work end-to-end (don't just assume `ConnectScm` succeeding means `git push` will work):
   ```powershell
   git fetch origin
   git status
   git push --dry-run origin HEAD
   ```
3. If `git push`/`fetch` hangs, it's likely waiting on a **Git Credential Manager browser sign-in popup** (bundled with Git for Windows) — this is separate from any Cursor-side GitHub connection and needs the human to complete a browser sign-in the first time. If it hangs indefinitely with no popup visible, kill it and fall back to a Personal Access Token or `gh auth login` (GitHub CLI) instead.

---

## Phase 4 — Housekeeping pass (especially important for AI-Studio-style scaffolding)

Prototypes exported from AI app builders often carry scaffolding that looks load-bearing but isn't. Do a deliberate audit before building on top of it:

1. **Grep the whole repo for any AI/LLM API key wiring** (e.g. `GEMINI_API_KEY`, `OPENAI_API_KEY`) — check whether it's actually called from anywhere in `src/`, or whether it's just injected into the client bundle via a build-tool `define` block (a real security smell if unused, since it'd otherwise ship a key into public JS). If unused, remove the injection; if genuinely needed, make sure it's called server-side (a Cloud Function/API route), never from client code.
2. Check for other AI-Studio-specific leftover files (`metadata.json`, `*-blueprint.json`, `*-applet-config.json`, an `APP_URL` env var that assumes a Cloud Run/AI-Studio hosting target) — decide what's still relevant vs. dead weight given the new hosting target (see Phase 6).
3. Check `.env.example` matches what the code actually reads (`import.meta.env.VITE_*` or equivalent) — delete stale example vars, add missing ones.
4. If there's a PWA opportunity and none exists yet, this is a good point to add a Vite/webpack PWA plugin (manifest, service worker, icons) — cheap win, no architecture change.

---

## Phase 5 — Backend/service setup (adapt to whatever backend the prototype uses)

This project's validated path was **Firebase** (Auth + Firestore). Adjust for Supabase/Postgres/custom API as needed — the *pattern* below (CLI install → login → verify project linkage → test a real read/write) generalizes regardless of backend.

### Firebase-specific
1. Install/verify CLI: `npx firebase-tools --version` (no need to install globally, `npx` is fine).
2. **⚠️ Known gotcha (Windows):** plain interactive `firebase login` crashes with a native libuv assertion (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`) on some Windows machines. Workaround:
   ```powershell
   npx firebase-tools login --no-localhost
   ```
   This prints a **session ID** and a `https://auth.firebase.tools/login?...` URL. Open that URL in a real browser (it's a live Google OAuth flow — no way to complete it headlessly without real credentials) **promptly, as the session expires** (don't reuse a link that's more than ~30–60 minutes old — it'll fail with `{"error":"invalid_request","error_description":"Unable to verify client."}`; if that happens, just regenerate a fresh one). Once signed in, the page shows an **authorization code** — feed it back with:
   ```powershell
   npx firebase-tools login "<authorizationCode>"
   ```
   This may *also* crash on exit with the same libuv assertion — but check for `✔ Success! Logged in as ...` printed just before the crash. The crash is only in process-exit cleanup; the login token is already saved by then. Verify with:
   ```powershell
   npx firebase-tools login:list
   npx firebase-tools projects:list
   ```
3. Add local `.firebaserc` (`{"projects": {"default": "<project-id>"}}`) and `firebase.json`. **Check whether Firestore lives on the `(default)` database or a named database** (common for AI-Studio-provisioned Firebase projects, e.g. `ai-studio-<uuid>`) — if named, `firebase.json`'s `firestore` key needs the array form with an explicit `"database"` field, and deploys need `firebase deploy --only firestore:<databaseId>`, not the bare `firestore` target.
4. After any `firestore.rules` change, deploy and **confirm live** by reading back the deployed ruleset via the Firebase Rules REST API (or the console) rather than trusting the CLI's success message alone.

### If a different backend
Substitute the equivalent CLI login + project-linkage + rules/policy deploy + read-back verification steps.

---

## Phase 6 — Web hosting deployment (Vercel, or adapt to actual host)

1. Login (device-authorization flow, needs a real browser + real credentials — same caveat as Firebase above, can't be done headlessly):
   ```powershell
   npx vercel login
   ```
   This prints a `https://vercel.com/oauth/device?user_code=...` URL — open it, sign in/approve. If it errors with a generic `Error: fetch failed` after a long wait, just retry `npx vercel login` — it may have been a transient network hiccup on the polling request, not a rejection. Verify with:
   ```powershell
   npx vercel whoami
   ```
2. First deploy will prompt to link the local folder to a Vercel project — if the project already exists under a specific **team/scope** (not your personal account), pass it explicitly to avoid a scope-resolution `Not authorized` error:
   ```powershell
   npx vercel --prod --scope <team-slug>
   ```
3. Custom domain (if applicable): attach via the Vercel dashboard or API, and if there's a `www` variant, configure a `www → apex` redirect via the **Vercel project-domains API** (`redirect`/`redirectStatusCode` fields) rather than a `vercel.json` host-conditional rewrite — the latter has known flakiness over HTTPS.
4. **If using Firebase Auth (or similar) with a custom domain:** add the new domain to the auth provider's authorized-domains list (Firebase Console → Authentication → Settings → Authorized domains, or equivalent) — otherwise sign-in will fail with an unauthorized-domain error on the new domain even though it works on the default `*.vercel.app`/`*.web.app` URL. Verify directly via the provider's admin API rather than just trusting "I added it" — config can silently not save.

---

## Phase 7 — Decide: does this app need native iOS/Android apps?

If **no** — stop here, the web app is fully live and the setup is done.

If **yes**, continue below. The validated approach for a React/Vite (or similar SPA) web app wanting native store presence **without a rewrite** is a **Capacitor wrap**, not Flutter/React Native/a full native rewrite — it reuses ~95%+ of the existing codebase, wrapping the built web assets in a native WKWebView (iOS) / WebView (Android) shell with a JS↔native bridge. Only reconsider this if the app needs deep native-feel UI (Capacitor still renders as a webview, which is usually fine for line-of-business/utility apps, less fine for a flagship consumer app with heavy native gestures/animations).

---

## Phase 8 — Capacitor scaffolding

1. Install core + platform packages (check for the current major version, don't blindly copy a version number from an old project):
   ```powershell
   npm install @capacitor/core
   npm install -D @capacitor/cli
   npm install @capacitor/android @capacitor/ios
   ```
2. `npx cap init` (or hand-write `capacitor.config.ts`) — set `appId` (reverse-domain bundle identifier, e.g. `com.company.appname`) and `webDir` (the build output dir, e.g. `dist`).
3. `npx cap add android` and `npx cap add ios`. Note: adding the iOS project (just scaffolding the Xcode project files) can succeed on Windows if the Capacitor version uses Swift Package Manager instead of CocoaPods — but **actually building/running/signing the iOS app still requires a Mac with Xcode**, no way around that.
4. Generate branded icons/splash screens (placeholder is fine initially) and run the Capacitor assets generator to populate every required density for both platforms plus PWA icons — replace before store submission.
5. Verify: `npm run build && npx cap sync` succeeds for both platforms.

---

## Phase 9 — Native-specific feature migration

Anything that assumed a browser context needs a native branch. Common ones, in rough order of how often they bite:

1. **Auth**: if using a provider with a native SDK (e.g. Firebase Auth), add the Capacitor-native plugin and branch sign-in logic on `Capacitor.isNativePlatform()` — native path uses the OS-native flow (e.g. native Google account chooser) then mirrors the resulting credential into the same JS SDK instance so downstream logic (profile creation, Firestore listeners) stays unchanged. Requires registering native (Android/iOS) apps in the backend console and dropping in the generated config files (`google-services.json`, `GoogleService-Info.plist` or equivalents) — can't be tested until this manual console step is done.
2. **File export/download/share**: browser `save`/`download` and `navigator.share` don't work the same (or at all) inside a native WebView sandbox. Add filesystem + native-share Capacitor plugins, and branch download/share helpers: native writes to the app's cache dir then opens the native share sheet; web keeps the original browser behavior.
3. Anything else that touches `window.location`, browser-only APIs, or assumes a top-level browsing context needs the same audit.

---

## Phase 10 — Push notifications (if needed)

- Pick a provider (OneSignal is a reasonable default — Capacitor-compatible plugin, handles both APNs and FCM behind one API).
- **Key architecture question to answer up front:** where does the *trigger* for a notification originate? If it's purely in-app user actions, a client-triggered call may be enough. If the trigger can happen **outside** the native app (e.g. someone actions something via a web link, a webhook, another user's action), the trigger must be **server-side** (a backend function watching for the relevant state change) — don't build a client-only design and discover this gap later.
- Requires provider credentials from both store ecosystems (APNs Auth Key needs an active Apple Developer account; FCM needs the backend project) — often blocked on Phase 12 below.

---

## Phase 11 — Biometric app-lock (if needed)

- Add a Capacitor biometric plugin, gate it behind a user-facing profile toggle, and hook app-resume-from-background (not just cold launch) to re-lock.
- Graceful no-op/hide on web (no biometric API there).

---

## Phase 12 — Mobile UX polish pass

Things that are easy to forget until you're actually testing on a device:
- Safe-area insets (`env(safe-area-inset-*)`) for any fixed nav/header/modal.
- On-screen keyboard resize behavior for text-heavy forms.
- Status bar styling to match brand color.
- Responsive pass over any desktop-first-designed large components at phone viewport widths.
- Android hardware/gesture back-button — map to in-app navigation, don't let it fall through to exiting the app unexpectedly.

---

## Phase 13 — Cross-platform testing

Needs actual devices/emulators/simulators:
- **Android**: needs Android Studio/SDK (or at minimum `adb` + an emulator image).
- **iOS**: needs a Mac + Xcode — no substitute exists for building/signing/running, even though scaffolding could happen on Windows.
- **Web**: full regression pass after all the native-platform branching changes above, since a `Capacitor.isNativePlatform()` check literally executing `false` still runs through code paths that were touched.
- Specifically re-test any flow where a *different kind of user* interacts via a plain browser link rather than the native app (e.g. an external reviewer/approver clicking an emailed link) — the web fallback for that flow must keep working even after native-specific auth/UI changes.

---

## Phase 14 — Developer accounts & store submission

Start this **early and in parallel** with the engineering phases above — account approval/enrollment can be slow and is entirely outside your control:
1. **Apple Developer Program**: paid enrollment, identity verification can take time or hit errors unrelated to this project (an `ITC.signin.error.invalidUser`-type error usually means enrollment itself isn't fully processed yet — check `developer.apple.com/account` directly, it's an Apple-side account state issue, not a code/config problem).
2. **Google Play Console**: account + app listing can be started immediately, but the actual **package name binding** only happens on the *first signed `.aab` upload* to a release track — so the Play Console setup can visually look "in progress" for a long time until a real Android build pipeline exists.
3. Store metadata: description, category, screenshots, privacy policy URL, support URL, and privacy/data-safety disclosures (be honest about every data type actually collected — email, name, location, push token, biometric flag, etc.).
4. Code signing: Apple certs/provisioning profiles; Android keystore + Play App Signing enrollment.
5. Internal testing tracks (TestFlight / Play Internal Testing) before any public release.
6. Submit for review — build in slack for review turnaround (historically hours to a few days on both stores, but treat as variable).

---

## Appendix A — Environment gotchas worth remembering

- **Cursor + stale PATH after installing tools mid-session** → full quit + relaunch, not "Reload Window" (Phase 0).
- **Firebase CLI crashes on Windows on both `login` and the follow-up `login <code>`** due to a native libuv bug — but the crash is in exit-cleanup, *after* the real success message prints. Always verify with `login:list`/`projects:list` rather than trusting the exit code (Phase 5).
- **Device-authorization login links (Firebase, Vercel, similar OAuth-device flows) expire** — don't let one sit unused for hours and then wonder why it fails with an "unable to verify client"/"invalid_request" error; just regenerate.
- **Vercel CLI scope resolution** — if a project lives under a team, not your personal account, pass `--scope <team-slug>` explicitly on every deploy or it'll fail with a `Not authorized` error.
- **`www` → apex redirects** are more reliable configured via the host's domain API than via an app-level config file's host-conditional rewrite rule.
- **Firestore named databases** (common on AI-Studio-provisioned projects) need the array form of `firebase.json`'s `firestore` key plus explicit `--only firestore:<databaseId>` on deploy — the bare `firestore` target silently targets `(default)`, which may not even exist.
- **A folder having `node_modules`/`.git` already present is not proof the toolchain is installed** — always run the Phase 0 version checks explicitly rather than assuming from file presence, especially after any machine reset/reimage.

---

## Appendix B — Quick verification cheat sheet

Run these anytime to sanity-check where a project's environment setup actually stands:
```powershell
git --version; node --version; npm --version
npx vercel whoami
npx firebase-tools login:list
git remote -v
git status
```
