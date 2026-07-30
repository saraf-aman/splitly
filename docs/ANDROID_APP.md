# Android App (Google Play) — Notes & Plan

Captured from a planning discussion on 2026-07-29. Nothing here has been built yet — pick this up as its own mini-roadmap, separate from `ROADMAP.md`'s phases, whenever the core app work is in a good place to pause.

## The big picture

- **Feasible, and smaller than it sounds.** Splitly is already a working PWA — Play Store shipping does NOT mean rewriting the app. It means wrapping the existing deployed site in a native shell.
- **iOS is a separate, harder decision — deliberately deferred.** Apple is stricter about "thin web wrapper" apps (App Review Guideline 4.2). The realistic path there is Capacitor, not a TWA-equivalent, and it's more setup than Android. iOS users can already install Splitly to their home screen via Safari today and push already works (see `project_arch_decisions` memory). Revisit only if Android gets real traction.

## Android approach: TWA (Trusted Web Activity)

- Wrap the existing deployed PWA in a **TWA** — a thin native shell that opens the site full-screen with no browser chrome. No app logic gets duplicated/rewritten.
- Tooling: **Bubblewrap** (Google's official CLI) or **PWABuilder** (bubblewrap.dev / pwabuilder.com) — generates the Android project from the existing web manifest in minutes.
- **Is it a separate project?** Yes, a small generated Android/Gradle wrapper repo — but it contains almost none of "our" code. It just points at the production URL.
- Needs an `assetlinks.json` file hosted on our domain (Digital Asset Links) so Android trusts the wrapper and hides the URL bar.
- **Cost:** $25 one-time Google Play developer registration fee.
- **New-developer catch:** Google requires new personal Play accounts to run a **closed test with 12+ testers for 14 continuous days** before going to production — adds ~2 weeks of lead time, not effort.
- Rough effort estimate: a focused day or two of actual work; most of the calendar time is Play Console review/testing wait, not code.

## Cleanup checklist before a public Play Store listing

- [x] **Privacy policy** — built as `/privacy` (plus `/terms` and `/data-deletion`), as part of `ROADMAP.md` Phase 15 rather than saved for this checklist — see `PROJECT_PLAN.md` §17. Not lawyer-reviewed; worth a pass before public submission.
- [ ] **Play Data Safety form** — declares data collection/sharing in Play Console; needs to match reality (e.g. "photos not stored" is a good, honest answer given our current design).
- [x] **Account/data deletion flow** — built as `ROADMAP.md` Phase 15 (`/profile` → Delete account, `POST /api/account/delete`, silent household-ownership auto-transfer).
- [ ] **Store listing assets** — icon (already have the amber "S" wordmark per Phase 3.6), feature graphic, phone screenshots, short/long description, content rating questionnaire.
- [ ] **Currency handling** — checked the codebase: only a hardcoded `"USD"` found in `src/app/api/splitwise/push/route.ts`. Not a blocker for a first release, but worth revisiting if non-US households are ever expected.
- [ ] **Firebase branding fix** (see below) — worth doing before a public listing; looks unprofessional to strangers in a way it doesn't to our own household.

## Firebase OAuth branding fix

Currently, Google Sign-In shows: *"Sign in to continue to splitly-e8c08.firebaseapp.com"* — the default Firebase `authDomain`, which looks unprofessional for a public-facing app.

**Fix:** point Firebase Auth at a **custom domain** (e.g. `auth.splitly.app`) via Firebase Hosting:
1. Add the custom domain to Firebase Hosting.
2. Add it to Firebase Auth's authorized domains.
3. Update `authDomain` in the Firebase client config to the custom domain.

**Blocker:** requires owning a domain for Splitly — need to confirm whether one exists yet or needs to be bought.

## Database sustainability (Firestore)

No redesign needed — current structure already scales horizontally:

- Firestore Spark (free) tier: 50K reads / 20K writes / 1GB storage per day — comfortably covers many households at casual bill-splitting volume.
- Data is already isolated per `households/{id}`, so adding more households is horizontal scaling, not a schema change.
- Even on paid Blaze pricing later, expected cost at low-thousands of households is a few dollars/month — not a real risk.
- Gemini receipt parsing stays free-tier regardless of user count until the daily quota ceiling is hit — worth monitoring once past a household or two of volume, not urgent now.

## Open questions for next session

- Do we already own a domain for Splitly, or does one need to be bought first (blocks the Firebase branding fix)?
- Confirm whether to start with the Bubblewrap/TWA setup or the Firebase custom-domain fix first.
