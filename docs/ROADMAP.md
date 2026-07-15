# Roadmap — Build one step at a time

Rules for using this file:
- Work top to bottom. Always pick the **first unchecked step**.
- Each step is sized to be doable (and reviewable by the human) in a single focused session.
- Check a box (`[x]`) only once the step is actually working, not just written.
- After finishing a step, add an entry to `docs/PROGRESS.md` before ending the session.
- If a step turns out to be too big once you're in it, it's fine to split it further and update this file — just note that in PROGRESS.md.

---

## Phase 0 — Project scaffold

- [x] **0.1** Initialize Next.js (App Router) + TypeScript + Tailwind project. Basic folder structure (`app/`, `components/`, `lib/`, `types/`). Set up Husky + lint-staged (`next lint` + `tsc --noEmit` on staged `.ts`/`.tsx` files, activated automatically via `prepare` script on `npm install`). Confirm it runs locally with `npm run dev` and that the pre-commit hook fires on a test commit.
- [x] **0.2** Add Firebase client SDK. Create `lib/firebase.ts` with config read from environment variables (`.env.local`, and a `.env.example` with dummy placeholders committed to the repo). Enable Firestore offline persistence (`persistentLocalCache`) at init time. Do not hardcode any keys in source.
- [x] **0.3** PWA setup: `manifest.json` (with `display: standalone`, `start_url`, `background_color`, `theme_color`, icons at 192×192 and 512×512 minimum), `@serwist/next` config with Workbox runtime caching. Critically: exclude all Firebase/Firestore/FCM endpoints from SW caching (`firestore.googleapis.com`, `firebase.googleapis.com`, `fcmregistrations.googleapis.com`) so realtime listeners are never intercepted. Verify "Add to Home Screen" prompt appears on iOS Safari and Chrome Android.

## Phase 1 — Auth & household

- [x] **1.1** Google Sign-In via Firebase Auth. Login page + an auth context/hook (`useAuth()`) that exposes the current user across the app. Logged-out users get redirected to login.
- [x] **1.2** Firestore data model + security rules for `households` and `households/{id}/members` (per `PROJECT_PLAN.md` §6). Rules should enforce: only members of a household can read/write its bills; only `admin` role can modify the members subcollection.
- [x] **1.3** Household creation/join flow: first-time login prompts to create a household or accept an invite. Store role (`admin` for creator, assignable later for others).
- [x] **1.4** Admin-only household management screen: list members, change role, remove a member/guest. Guests should not be able to see/access this screen at all (not just UI-hidden — enforce in Firestore rules too). Reworked into a 3-tier Creator/Admin/Guest hierarchy mid-step (see `docs/PROGRESS.md`).
- [x] **1.5** Household deletion (creator-only): wipes all members, bills, and bill data. Typed-name confirmation in the UI; `firestore.rules` restrict it to the creator.

## Phase 2 — Bill upload & AI parsing

- [x] **2.1** Bill upload UI: camera capture or file picker. Image is sent directly (not persisted to any storage) to the parsing API route; create a `bills/{id}` doc with status `pending_review` once parsing succeeds.
- [x] **2.2** Next.js API route that takes the uploaded image in the request body, calls the Google Gemini API (vision, free tier) with a prompt to extract structured JSON (items with name/price, tax, tip, service charge, total). Store the raw parsed result on the bill doc. Image itself is never written to storage/disk — discarded after the API call returns. Keep `maxDuration` and image size in mind to fit Vercel's Hobby-plan 10s function limit (no Storage/Pro plan needed — see CLAUDE.md).

## Phase 3 — UI design system & modernization

Moved up ahead of further feature work, per user request — see `PROJECT_PLAN.md` §12 for the full design decision (component library, visual identity, navigation shell). Restyles what already exists; no new data features land in this phase.

- [x] **3.1** Design system foundation: install/configure shadcn/ui on the existing Tailwind v4 setup, light mode only (remove existing `dark:`/`prefers-color-scheme` handling). Define theme tokens per `PROJECT_PLAN.md` §12 — amber accent (`#C6893A`)/soft tint, background/surface/ink/muted/border/success, Geist Sans for UI text + Geist Mono w/ tabular figures for all money/quantity values — as real shadcn theme config, not hardcoded per-component classes. Add base primitives (Button, Input, Label, Card) — no visible page changes yet.
- [x] **3.2** Shared app shell: persistent mobile-first bottom tab nav (Home / Bills / Household) for authenticated routes, wired into the root layout, each tab with its own line icon (house / receipt / people per `PROJECT_PLAN.md` §12) instead of a text-only or placeholder-block tab. Login/onboarding stay shell-less.
- [x] **3.3** Restyle auth & onboarding screens (`/login`, `/onboarding`) against the new design system and primitives.
- [ ] **3.4** Restyle the home page and household management screen (`/household`) against the new shell/primitives.
- [ ] **3.5** Restyle the bill upload screen (`/bills/new`) against the new shell/primitives.
- [ ] **3.6** Replace the placeholder solid-color app icons (`public/icon-192.png`, `icon-512.png`) with the amber "S"-wordmark icon per `PROJECT_PLAN.md` §12, and update `theme_color`/`themeColor` in `public/manifest.json` and `src/app/layout.tsx` from indigo (`#4f46e5`) to amber (`#C6893A`).

## Phase 4 — Bill review & confirm

- [ ] **4.1** Review/edit screen: uploader sees parsed items in an editable list (edit name/price, delete, add a missed item), with any AI-flagged low-confidence items visually marked.
- [ ] **4.2** Confirm action: on confirm, write final `items` and `sharedCharges` subcollections, set bill status to `open`, and (stub for now, wire up real push in Phase 7) trigger a placeholder notification event.

## Phase 5 — Realtime selection screen

- [ ] **5.1** Item list UI with a realtime Firestore listener: checkbox column + shares column per item, default `included: true, shares: 1`.
- [ ] **5.2** Shared charges (tax/tip/service charge) rendered as locked, always-checked rows in the same screen — visually distinct from editable items, no controls to change them.
- [ ] **5.3** Wire up writes: toggling a checkbox or changing a share count for the current user updates their `selections` map on that item in Firestore, and every other open client sees it update live.
- [ ] **5.4** Simple per-user "done" indicator (e.g. a "confirm my selections" button) so others can see who's finished vs still deciding — informational only, doesn't block others from viewing/editing their own.

## Phase 6 — Final grid & calculations

- [ ] **6.1** Grid UI: items (rows) × members (columns), showing each person's share count per item, `-` for not-included.
- [ ] **6.2** Split calculation module (pure function, unit-testable): item costs divided by shares, tax/tip/service equally split, correct cent-accurate rounding (per §5 of PROJECT_PLAN.md). Write a few test cases including an uneven-split example.
- [ ] **6.3** Final per-person total summary displayed below the grid, visible to anyone who has interacted with the bill.

## Phase 7 — Notifications

- [ ] **7.1** FCM setup: request notification permission, register device token, store token(s) on the member doc.
- [ ] **7.2** Trigger a push notification (Cloud Function or API route) when a bill moves from `pending_review` → `open`, to all household members except the uploader.

## Phase 8 — History & dashboard

- [ ] **8.1** Home dashboard: list of bills needing the current user's input (no selection made yet on an `open` bill), plus quick stats (e.g. "2 bills pending").
- [ ] **8.2** Bill history view limited to the last 2 weeks, with the older-than-2-weeks bills simply excluded from the default query (no need to delete data unless storage becomes a concern later).

## Phase 9 — Splitwise integration

- [ ] **9.1** Settings screen to connect a Splitwise API key + select/enter the target group.
- [ ] **9.2** "Push to Splitwise" button on the final grid screen that sends the computed per-person totals as an expense to the connected group.

## Phase 10 — Polish & v2 features

- [ ] **10.1** Manual fallback entry: skip AI parsing entirely and type items directly.
- [ ] **10.2** Reminder nudges for members who haven't responded to an open bill after a set time.
- [ ] **10.3** Smart defaults: auto-uncheck items a given user has consistently opted out of historically.
- [ ] **10.4** Per-bill notes field (e.g. "I'm paying for the wine separately, don't include me").
- [ ] **10.5** General mobile polish pass, offline/error state handling, loading states.
