# Roadmap — Build one step at a time

Rules for using this file:
- Work top to bottom. Always pick the **first unchecked step**.
- Each step is sized to be doable (and reviewable by the human) in a single focused session.
- Check a box (`[x]`) only once the step is actually working, not just written.
- After finishing a step, add an entry to `docs/PROGRESS.md` before ending the session.
- If a step turns out to be too big once you're in it, it's fine to split it further and update this file — just note that in PROGRESS.md.

Completed phases below are intentionally terse (one line each) — the code is the source of truth for how a shipped feature works. Unchecked phases keep full detail since they still need to guide the build.

---

## Phase 0 — Project scaffold
- [x] **0.1** Next.js + TypeScript + Tailwind scaffold, Husky + lint-staged pre-commit (`next lint` + `tsc --noEmit`).
- [x] **0.2** Firebase client SDK (`lib/firebase.ts`), Firestore offline persistence (`persistentLocalCache`).
- [x] **0.3** PWA setup (`manifest.json`, `@serwist/next`), Firebase/FCM endpoints excluded from SW caching.

## Phase 1 — Auth & household
- [x] **1.1** Google Sign-In via Firebase Auth, `useAuth()` context, logged-out redirect.
- [x] **1.2** `households`/`households/{id}/members` data model + Firestore rules.
- [x] **1.3** Household creation/join flow.
- [x] **1.4** Admin household management screen; reworked mid-step into the 3-tier Creator/Admin/Guest hierarchy (`CLAUDE.md` roles section).
- [x] **1.5** Household deletion (creator-only, typed-name confirmation).

## Phase 2 — Bill upload & AI parsing
- [x] **2.1** Bill upload UI (camera/file picker), creates `bills/{id}` with status `pending_review`.
- [x] **2.2** Gemini vision API route — structured JSON extraction (items/tax/tip/service/total), image never persisted, fits Vercel Hobby's 10s limit.

## Phase 3 — UI design system & modernization
Full design decision in `PROJECT_PLAN.md` §12.
- [x] **3.1** shadcn/ui + Tailwind theme tokens, light mode only, Geist Sans/Mono.
- [x] **3.2** Shared app shell — bottom tab nav (later superseded by Phase 9's top-bar redesign).
- [x] **3.3**–**3.5** Restyled auth/onboarding, home/household, bill-upload screens against the new system.
- [x] **3.6** Real app icon (teal "S" wordmark) replacing placeholder.

## Phase 4 — Bill review & confirm
- [x] **4.1** Review/edit screen — editable parsed items, low-confidence flags.
- [x] **4.2** Confirm action — writes final `items`/`sharedCharges`, sets status `open`.

## Phase 5 — Realtime selection screen
- [x] **5.1** Realtime item list, checkbox + shares per item.
- [x] **5.2** Locked always-checked shared-charge rows.
- [x] **5.3** Live writes to `selections[uid] = { included, shares, setBy }`.
- [x] **5.4** Per-user "confirm my selections" indicator.
- [x] **5.5** Shares control moved into a kebab-menu popover (`×N` badge when >1).

## Phase 6 — Final grid & calculations
- [x] **6.1** Grid UI (items × members), status banner, per-column confirm state.
- [x] **6.2** Split calculation module (unit-tested, cent-accurate rounding).
- [x] **6.3** Per-person total row (`~$X.XX` for still-pending members).
- [x] **6.4** Bill-owner override — uploader can edit any member's column; rules scoped via `.diff().affectedKeys()` on `selections`; `setBy` distinguishes self vs. override visually.

## Phase 7 — Notifications
- [x] **7.1** FCM setup — permission, token registration, stored on member doc.
- [x] **7.2** Push on bill `pending_review` → `open`, to all members except uploader.

## Phase 8 — Multi-household support
Generalized `users/{uid}.householdId` (single) → `householdIds: string[]` — additive since rules already gated per-household and hooks already took `householdId` as a param.
- [x] **8.1** Data model + `arrayUnion`-based create/join.
- [x] **8.2** `leaveHousehold` self-service action for non-creator members.
- [x] **8.3** `useUserHouseholds()` hook rework.
- [x] **8.4** Routing under `/households/[householdId]/...`.
- [x] **8.5** Household picker screen (auto-enter if exactly one).
- [x] **8.6** `HouseholdGate` three-way redirect (0 / 1 / 2+ households).

## Phase 9 — Navigation shell redesign + dashboard
Full design spec in `PROJECT_PLAN.md` §14.
- [x] **9.1** Top-bar + hamburger drawer, replacing bottom tabs; liquid-glass `← ⌂` pill on inner screens.
- [x] **9.2** Hamburger drawer (Home / Manage / Switch Household / Sign out).
- [x] **9.3** Household home redesign — bills feed + camera FAB; added picker entry point on home/manage screen.
- [x] **9.4** Settled bills older than 1 month hidden from default feed (not deleted).

## Phase 10 — Splitwise integration
- [x] **10.1** OAuth connect/disconnect (per-user); group link/unlink (owner-only).
- [x] **10.2** "Push to Splitwise" button + grid UX overhaul. Full spec `PROJECT_PLAN.md` §8.

## Phase 11 — UI refinements
- [x] **11.1** *(released by user — UI changes outside Claude Code)*
- [x] **11.2** Group name header on home screen.
- [x] **11.3** Delete bill from home screen (uploader-only, server-side cascade delete).
- [x] **11.4** Color-graded bill cards + section grouping (Needs Attention / In Progress / Settled).
- [x] **11.4.1** "(you)" label on grid's own column.
- [x] **11.5** Floating home FAB replaced with inline `← Home` link.
- [x] **11.6** Google profile photos throughout (member chips, grid headers, settle dialog), with initial-letter fallback.
- [x] **11.7** Fixed duplicate push notifications — WebPush `tag` field for browser-side de-dup + token de-duplication at send time.
- [x] **11.8** Splitwise button alignment fix on grid page (removed `ResizeObserver` spacer, plain right-aligned block).

## Phase 12 — Participant scoping, manual entry & completion notifications
Full design spec in `docs/PROJECT_PLAN.md` §15.
- [x] **12.1** `bills/{billId}.participantIds` + upload-time picker; rules and home feed scoped to it.
- [x] **12.2** Add/remove participants after creation (uploader-only, via grid page "Manage participants"), blocked if the member already has non-default selections.
- [x] **12.3** Manual bill entry (skips Gemini, same downstream flow).
- [x] **12.4** "Everyone's done" push to uploader when the last participant confirms.
- [x] **12.5** Automated reminder cron (24h then every 72h, capped at 3).
- [x] **12.6** Manual per-member "Remind" action (24h cooldown per member).
- [x] **12.7** Group retention policy (`retentionMonths` on household doc, 1/3/6/12/Never, creator-only, in Manage). New groups default to 6 months (changed post-launch per user direction — was originally "Never" by default).
- [x] **12.8** Vercel cron `cleanup-bills` — server-side deletion of old settled bills, mirrors the client-side hide filter. **Important guard:** a settled bill in a Splitwise-linked group is never deleted or hidden until it's actually been pushed (`splitwiseExpenseId` set) — age alone isn't sufficient there.
- [x] **12.9** Mobile polish pass — offline banner, loading states, error handling on silent-failure write paths.

## Phase 13 — Deferred / backlog
- [ ] **13.1** Weekly email digest of unsettled bills. Deferred: needs a new external email-sending dependency (e.g. Resend) that nothing in the current stack has, against the project's $0-cost-by-default philosophy — push (Phase 12.5/12.6) already covers the same "you still owe a response" need on installed PWAs. Revisit only if push proves insufficient (e.g. once distributed via an Android store wrapper where push reliability might differ).
- [ ] **13.2** Smart defaults: auto-uncheck items a given user has consistently opted out of historically. Deferred: discussed implementation (deterministic frequency-count query vs. AI-assisted matching) but decided the payoff is marginal for a 3-4 person household — a few extra taps per bill — against the new surface area required (item-name normalization/fuzzy-matching, a threshold calc, and either a per-review scan or a maintained per-user-per-item aggregate doc). Revisit only if this becomes an actual recurring annoyance in practice.
- [ ] **13.3** Per-bill notes field (e.g. "I'm paying for the wine separately, don't include me"). Deferred alongside 13.2. Discussed design if revisited: uploader-only, added/edited on the review screen and editable later from the grid page (same uploader-only pattern as "Manage participants"); shown only when non-empty, as a truncated one-line callout above the item list on the select screen (highest-value spot — visible before people pick items) and optionally the grid page, using the existing `accent-soft` chip styling rather than a permanent banner to avoid cluttering the already-dense grid page.
- [ ] **13.4** Let the uploader re-open the review screen after Confirm to edit items/charges/currency — not just a narrow "edit currency" control. Motivated by Phase 14: currency is currently locked at confirm (same as items/charges), so an accidental wrong-currency pick on Confirm has no fix short of deleting and re-entering the whole bill. Discussed design if revisited: uploader-only (same ownership pattern as "Manage participants"), from the grid page. Real wrinkle to solve at that point: items/`sharedCharges` already exist as separate subcollection docs by then (not the review screen's local array-of-edits state), so "re-opening review" means editing those existing docs in place rather than replaying `confirmBill`'s create-from-scratch batch — needs its own write path. Also flagged during the currency discussion: if the currency change crosses a different minor-unit-exponent boundary (e.g. USD's 2 decimals to JPY's 0), the raw stored integers suddenly mean a wildly different amount if just retagged — needs at least a warning, not silent retagging, when decimals differ between old and new currency.

## Phase 14 — Multi-currency support
Full design in `PROJECT_PLAN.md` §16. No exchange-rate conversion anywhere — currency is tagged per-bill, Splitwise-style, never converted or aggregated across bills.
- [x] **14.1** ISO 4217 minor-unit-exponent lookup table, replacing the hardcoded "always cents" assumption.
- [x] **14.2** Display formatting via `Intl.NumberFormat`/`narrowSymbol`, replacing hardcoded `$` across the app. Missing `currency` field (pre-Phase-14 bills) defaults to `"USD"`.
- [x] **14.3** `households/{householdId}.defaultCurrency`, computed once at creation from device locale. (A Manage-page editor for this was added then removed same session — only matters for a household's very first bill, already fixable via the review-screen picker.)
- [x] **14.4** Gemini parsing schema gained a `currency` field.
- [x] **14.5** Review-screen currency picker, pre-filled by fallback chain (Gemini → household's last bill → `defaultCurrency` → `"USD"`), immutable after Confirm.
- [x] **14.6** Splitwise push sends `bill.currency` as `currency_code`.

## Phase 15 — Account deletion

Driven by Google Play Store compliance (apps with account creation must offer in-app deletion + a public policy page), not a user feature request — see `PROJECT_PLAN.md` §17 for the full discussion so far.

- [x] **15.1** Designed the account-deletion flow: UI location/confirmation UX, Auth-user deletion mechanics, public policy page timing, and the creator/owner scenario (silent auto-transfer, block only as a last resort) are all decided — see §17.
- [x] **15.2** Built the in-app deletion flow: new account-level `/profile` page (also home to the personal Splitwise connect toggle and Sign out, both moved out of `NavDrawer`), `POST /api/account/delete` with the full auto-transfer/block logic (`findSuccessor`). `docs/CLAUDE.md`'s roles section updated to document the transfer as a deliberate second exception to "creator can't be changed."
- [x] **15.3** Built `/data-deletion` (the required policy page), plus `/privacy` and `/terms` — the user wanted the full Privacy Policy / Terms of Service pair built now too, not deferred as a separate `ANDROID_APP.md` item. Phase 15 is done.
