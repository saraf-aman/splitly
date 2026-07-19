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
- [x] **3.4** Restyle the home page and household management screen (`/household`) against the new shell/primitives.
- [x] **3.5** Restyle the bill upload screen (`/bills/new`) against the new shell/primitives.
- [x] **3.6** Replace the placeholder solid-color app icons (`public/icon-192.png`, `icon-512.png`) with the amber "S"-wordmark icon per `PROJECT_PLAN.md` §12, and update `theme_color`/`themeColor` in `public/manifest.json` and `src/app/layout.tsx` from indigo (`#4f46e5`) to amber (`#C6893A`).

## Phase 4 — Bill review & confirm

- [x] **4.1** Review/edit screen: uploader sees parsed items in an editable list (edit name/price, delete, add a missed item), with any AI-flagged low-confidence items visually marked.
- [x] **4.2** Confirm action: on confirm, write final `items` and `sharedCharges` subcollections, set bill status to `open`, and (stub for now, wire up real push in Phase 7) trigger a placeholder notification event.

## Phase 5 — Realtime selection screen

- [x] **5.1** Item list UI with a realtime Firestore listener: checkbox column + shares column per item, default `included: true, shares: 1`.
- [x] **5.2** Shared charges (tax/tip/service charge) rendered as locked, always-checked rows in the same screen — visually distinct from editable items, no controls to change them.
- [x] **5.3** Wire up writes: toggling a checkbox or changing a share count for the current user updates their `selections` map on that item in Firestore, and every other open client sees it update live. Write shape is `selections[uid] = { included, shares, setBy: uid }` — the `setBy` field (who actually wrote this entry) is self-only at this phase, but exists from the first write onward so Phase 6.4's owner-override can render real attribution history rather than only newly-overridden entries.
- [x] **5.4** Simple per-user "done" indicator (e.g. a "confirm my selections" button) so others can see who's finished vs still deciding — informational only, doesn't block others from viewing/editing their own.
- [x] **5.5** Replace the always-visible shares stepper on the select screen with a vertical `⋮` (kebab) icon at the end of each item row. Tapping it opens a bottom sheet/popover containing the stepper (− / count / +) and a short explanation: *"Increase this if you're covering someone outside the household — e.g. set to 2 if you brought a friend and are splitting their share too."* When shares > 1 the icon shows a `×N` badge so the non-default state is visible at a glance. The `⋮` icon is greyed out and non-interactive when the item is unchecked. The select screen column header "Shares" is removed since the stepper is no longer always visible.

## Phase 6 — Final grid & calculations

- [x] **6.1** Grid UI: items (rows) × members (columns). Always accessible — no gate on confirmation status. Visual design:
  - **Status banner** at the top: "X of Y confirmed" with a first-name chip per member — confirmed chips solid/teal, pending chips greyed.
  - **Column treatment** for unconfirmed members: subtle grey background tint on the whole column + a small pending badge (e.g. clock icon) next to their name in the column header. Confirmed members' columns are normal.
  - **Cells**: show `✓` for included (1 share), `✓ ×N` for included with N>1 shares, `—` for not-included. No stepper in the grid — edits go back to the select screen (grid is read-only display).
  - **Edit access**: regular members can only edit their own column (enforced in 6.4); bill uploader can edit any column regardless of that member's confirmation status.
- [x] **6.2** Split calculation module (pure function, unit-testable): item costs divided by shares, tax/tip/service equally split, correct cent-accurate rounding (per §5 of PROJECT_PLAN.md). Write a few test cases including an uneven-split example.
- [x] **6.3** Final per-person total summary row below the grid. For confirmed members show the exact total; for unconfirmed members show `~$X.XX` (tilde prefix) to signal the number may still change.
- [x] **6.4** Bill-owner override: tighten `items` Firestore rules (`update`) so a write only succeeds if the only `selections` keys being changed belong to the caller themself, *or* the caller is the bill's `uploadedBy` (who may touch any member's key) — via `.diff().affectedKeys()` on the nested `selections` map, not a per-entry loop. Grid cells for other members become interactive only for the uploader (checkbox + share count). Visually distinguish self-set vs. uploader-set entries (e.g. a different checkmark color) driven by each entry's `setBy` field from 5.3.

## Phase 7 — Notifications

- [x] **7.1** FCM setup: request notification permission, register device token, store token(s) on the member doc.
- [x] **7.2** Trigger a push notification (Cloud Function or API route) when a bill moves from `pending_review` → `open`, to all household members except the uploader.

## Phase 8 — Multi-household support

A user currently belongs to exactly one household forever (`users/{uid}.householdId` is a single string), and every screen assumes that single global context. This phase generalizes to multiple households *before* Phase 9 builds the real home dashboard, so that dashboard is built once against a picker that already exists rather than retrofitted later. Every data-fetching hook except `useUserHousehold` (`src/lib/household.ts`) already takes `householdId` as an explicit parameter, and Firestore rules already gate everything per-household via the `members` subcollection (never via the `users/{uid}` doc) — so this is additive routing + a data-shape change, not a rewrite of Phases 1-7.

- [x] **8.1** Data model: `users/{uid}.householdId: string` → `householdIds: string[]`. Update `createHousehold`/`joinHousehold` to append (`arrayUnion`) instead of overwrite.
- [x] **8.2** `leaveHousehold` action + rule change: today even self-removal requires `isHouseholdAdmin`, so a guest cannot leave on their own. Add a rule clause letting any non-creator member delete their own `members/{uid}` doc regardless of role, then remove that id from their own `householdIds` array client-side — multi-household makes leaving a normal action, not an exceptional one.
- [x] **8.3** Hooks rework: replace `useUserHousehold()` with `useUserHouseholds()` (returns the list the user belongs to). Every other hook (`useHousehold`, `useMembers`, `useMembershipStatus`, `updateMemberRole`, `removeMember`, `deleteHousehold`) is unchanged.
- [x] **8.4** Routing rework: flat routes (`/`, `/bills/new`, `/household`) become `/households/[householdId]/...`.
- [x] **8.5** Picker/landing screen: lists all of the user's households (reuses the existing create/join UI as "add another household"); if the user belongs to exactly one, auto-enter it directly rather than forcing an extra tap.
- [x] **8.6** `HouseholdGate` rework: binary onboarding/home redirect becomes three-way — 0 households → `/onboarding`; exactly 1 → straight into that household; 2+ → the picker. Generalize the existing removed-while-viewing detection (currently keyed off one global `householdId`) to work per-household.

## Phase 9 — Navigation shell redesign + dashboard

Full design spec in `docs/PROJECT_PLAN.md §14`. This phase replaces the bottom tab bar with a top-bar + hamburger drawer pattern and builds the home bills feed.

- [x] **9.1** Navigation shell rework: replace `AppShell` bottom tabs with a top bar (`Splitly` wordmark → picker on left, hamburger `≡` on right). Add liquid glass `← ⌂` pill below the top bar on inner household screens (bill review/select/grid) — absent on household home. Add sign-out icon on picker screen header instead of hamburger. Remove all bottom tab nav. See `PROJECT_PLAN.md §14` for exact CSS and layout spec.
- [x] **9.2** Hamburger drawer component: slides in from right, contains Home / Manage (admin+creator only, hidden for guests) / Switch Household / Sign out. Wired into the top bar hamburger button from 9.1.
- [x] **9.3** Household home page redesign: replace the current placeholder content with a bills feed (scrollable bill cards per `PROJECT_PLAN.md §14` Bills feed section) + floating camera FAB bottom-right (`#2E6E6E`, links to `/bills/new`). Empty state when no bills. Also fix the UI gap from Phase 8: add a "Join or create another household" entry point on the household home or management screen so single-household users can reach the picker's create/join form without going through the auto-redirect.
- [x] **9.4** Bill history: settled bills older than 1 month are excluded from the default feed query (no deletion — they still exist in Firestore, just hidden). Non-settled bills (needs input / in progress) always appear regardless of age. No "show older" toggle needed.

## Phase 10 — Splitwise integration

- [ ] **10.1** Settings screen to connect a Splitwise API key + select/enter the target group.
- [ ] **10.2** "Push to Splitwise" button on the final grid screen that sends the computed per-person totals as an expense to the connected group.

## Phase 11 — Polish & v2 features

- [ ] **11.1** Manual fallback entry: skip AI parsing entirely and type items directly.
- [ ] **11.2** Reminder nudges for members who haven't responded to an open bill after a set time.
- [ ] **11.3** Smart defaults: auto-uncheck items a given user has consistently opted out of historically.
- [ ] **11.4** Per-bill notes field (e.g. "I'm paying for the wine separately, don't include me").
- [ ] **11.5** General mobile polish pass, offline/error state handling, loading states.
