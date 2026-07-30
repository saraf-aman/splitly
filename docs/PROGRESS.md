# Progress Log

Concise rolling log, newest first. Each entry captures what shipped, key files, and any non-obvious decision/gotcha — not a blow-by-blow build narrative. The code is the source of truth for exact behavior; `ROADMAP.md` tracks what's done vs. pending.

_New-entry template (add above the phase it belongs to, or as a new "Unplanned" note near the top if it's not on the roadmap):_
```
**Phase X.Y done:** what shipped, in 2-4 sentences. Key files. Any non-obvious deviation/gotcha only — skip anything derivable from reading the code.
```

---

## Current state
_Update this block at the end of every session. This is the only section a new session needs to read — history below is reference only._

**Phase 15 (account deletion) is done**, 15.1–15.3 all complete. Phase 13 (backlog: email digest, smart defaults, per-bill notes, re-editable review) remains deferred as the next thing to consider.

**Most recent session:** Built out Phase 15 end to end. New account-level `/profile` page (avatar/name/email header, Splitwise connect/disconnect card showing the connected account's email, Sign out, Delete account) reached via a new "Profile" row in `NavDrawer` (above "Home", separated by a divider, user's Google avatar as its icon) and a new minimal `PickerNavDrawer` (just "Profile") giving the group-picker page the same hamburger-menu header as the rest of the app. Personal Splitwise connect/disconnect and Sign out moved out of `NavDrawer` entirely onto `/profile`; `NavDrawer` now only keeps the household-scoped Splitwise **group link** (creator-only), gated on `swConnected || isCreator`. Splitwise callback (`/api/splitwise/callback`) now stores the connected account's `email`; a self-heal on `/profile` (`POST /api/splitwise/backfill-email`) backfills it for connections made before this change. Delete-account entry point is a plain button inside a bordered card with Sign out (not a permanent "Danger zone" card like household deletion) that expands an inline typed-email confirm on click.

`POST /api/account/delete` implements the finalized creator/owner design (§17): for each household the caller created, silently transfer ownership to the longest-tenured other admin, or — if none — the longest-tenured guest (promoted to admin as part of the handoff); only block (409, nothing mutated) if a household has no other member at all. `docs/CLAUDE.md`'s roles section updated to document this as a deliberate second exception to "creator can't be changed." The blocking path and the actual delete were **not** exercised against a real account (destructive/irreversible) — verified by code review + `tsc`/`eslint` only; the surrounding UI (drawer, profile page, inline confirm panels) was verified live via claude-in-chrome.

15.3 grew beyond its original scope: the user wanted the *full* legal picture built now, not just the required deletion-policy page. Shipped `/data-deletion`, `/privacy`, and `/terms` together — all reachable with or without a session (new `ALWAYS_PUBLIC_PATHS` in `AuthGate.tsx`, replacing the old login-only `PUBLIC_PATHS`) and rendered shell-less like `/login`. `docs/ANDROID_APP.md`'s pre-launch checklist items for privacy policy and account deletion are now checked off, ahead of when that phase would normally have been picked up. Governing law is United States, contact email is the user's personal address as a placeholder. **Explicitly flagged, not a substitute for actual legal review** before a public Play Store submission.

- **Dev server:** port 3001 (3000 is a different app on this machine).
- **Gemini model:** `gemini-flash-lite-latest` — chosen for speed (full `flash` took ~14s on a test image, over Vercel Hobby's 10s cap; lite took ~1.3s). Accuracy tradeoff is caught by the existing `lowConfidence` per-item flag.
- **Accent color:** Deep Teal `#2E6E6E` (went through indigo → amber → teal before landing here).

---

## Phase 12 — Participant scoping, manual entry & completion notifications
Full spec: `PROJECT_PLAN.md` §15.
- **12.1–12.2** `bills/{billId}.participantIds` scopes bill visibility/access (rules + home feed + composite index `householdId, participantIds, createdAt`). Add/remove after creation is uploader-only via the grid page's "Manage participants," blocked if the member already has non-default selections. Existing bills were backfilled with a one-time script (not committed).
- **12.3** Manual bill entry — skips Gemini, converges on the same review/confirm flow.
- **12.4–12.6** Completion/reminder notifications: "everyone's done" push to uploader (once per bill, skipped if already pushed to Splitwise); automated cron reminders (24h then every 72h, capped at 3, `/api/cron/remind-bills`); manual per-member "Remind" nudge inside the settle sheet (24h cooldown per member, moved there mid-session after user feedback that a bulk grid button was unwanted clutter).
- **12.7–12.8** Group retention policy (`retentionMonths`, creator-only, Manage page) + daily cron `cleanup-bills` for server-side deletion. Existing groups were migrated to 6 months (not indefinite) so the old ~30-day hide behavior didn't silently disappear. New groups later changed to default 6 months too, per user direction. **Important guard**: a Splitwise-linked group's settled bill is never deleted/hidden until it's actually been pushed.
- **12.9** Mobile polish — offline banner (`useOnlineStatus` via `useSyncExternalStore`, not `useState`+effect, to satisfy `react-hooks/set-state-in-effect`), consistent loading states, `catch` blocks added to previously-silent write paths.
- **Unplanned fixes this phase**: FCM tokens centralized from per-household `Member.fcmTokens` to `users/{uid}.fcmTokens` (push had silently broken for any non-first household — `groupIds[0]` leftover from Phase 8); duplicate-push fix via a WebPush `tag` field + token de-duplication; Splitwise push-status pill added to settled bill cards (green "✓ Splitwise" / amber "⌛ Splitwise").

## Phase 11 — UI refinements
- Group name header on home; delete-bill-from-home (uploader-only, server-side cascade delete via `DELETE /api/bills/[billId]`); color-graded bill card sections (amber/blue/green); Google profile photos everywhere (`MemberAvatar.tsx`, self-healing `photoURL` backfill, letter-initial fallback); Splitwise button alignment fix (dropped a fragile `ResizeObserver` spacer for a plain right-aligned block).
- **Duplicate push notifications** were only partially resolved this phase (tag-based dedup, deviceId-keyed token map) — known remaining edge cases were not fully isolated; user chose to move on. Fully fixed later in Phase 12's unplanned-fixes pass above.

## Phase 10 — Splitwise integration
Full spec: `PROJECT_PLAN.md` §8.
- Per-user OAuth connect/disconnect + creator-only group link/unlink, in the NavDrawer. Member resolution at push time: `splitwiseUserId` first, else email match. "Push to Splitwise" button + full settle-sheet rework on the grid page; error cascade (not connected → no group → not settled → resolver sheet → push; re-push warns about duplicates, never blocks).
- **Gotcha hit**: a trailing slash in `NEXT_PUBLIC_APP_URL` caused a double-slash redirect URI and an `invalid_grant` from Splitwise — fixed with `.replace(/\/$/, "")` in the connect/callback routes.
- NavDrawer also checks Splitwise group membership on open (amber warning if connected but not actually in the linked Splitwise group).

## Phase 9 — Navigation shell redesign + dashboard
Full spec: `PROJECT_PLAN.md` §14.
- Top-bar + hamburger drawer replaced the Phase 3 bottom tabs; liquid-glass `← ⌂` pill on inner household screens. Household home redesigned into the bills feed (3 sections, camera FAB). Settled bills older than 1 month hidden from the default feed (hide-only, no deletion — this was superseded by Phase 12.7's configurable retention).
- Required a new Firestore composite index (`householdId`, `createdAt desc`) for the bills feed query — caught because it only worked locally due to offline-cache masking the missing index.

## Phase 8 — Multi-household support
- Generalized `users/{uid}.householdId` (single) → `householdIds: string[]`; additive since rules already gated per-household and hooks already took `householdId` as a param. New picker screen, `leaveHousehold` self-service action, three-way `HouseholdGate` redirect (0 / 1 / 2+ households).
- Renamed "household" → "group" in routes/code/copy this era (Firestore collection names `households`/`householdId` were deliberately left unchanged).

## Phase 7 — Push notifications
- FCM token registration + send-on-bill-open, via `firebase-admin`. Notification permission requested on explicit user gesture (auto-requesting in an effect is silently blocked on iOS).

## Phase 6 — Final grid & calculations
- Items × members grid, cent-accurate split calculation (`splitCalc.ts`, largest-remainder rounding, unit-tested), per-person totals (`~$X.XX` while unconfirmed).
- **Bill-owner override (6.4)**: uploader can edit any member's selections; rules scoped via `.diff().affectedKeys()` on the nested `selections` map so a regular member can only touch their own key. Visually distinguished via pill color (green self-set, amber uploader-set).

## Phase 5 — Realtime selection screen
- Checkbox + shares per item, written live to `selections[uid]`; shared charges rendered as locked always-checked rows; per-user "confirm my selections" indicator. Shares control later moved into a kebab-menu popover to declutter the row.

## Phase 4 — Bill review & confirm
- Review/edit screen (editable items, low-confidence flags) + confirm action (atomic `writeBatch` writing `items`/`sharedCharges` subcollections and flipping status to `open`).

## Phase 3 — UI design system & modernization
Full spec: `PROJECT_PLAN.md` §12.
- shadcn/ui + Tailwind tokens, light-mode-only, Geist Sans/Mono (money always mono/tabular/right-aligned). Bottom tab nav (later superseded by Phase 9). Real app icon.
- Accent color changed twice after launch: indigo (original) → amber (`#C6893A`, Phase 3.6) → deep teal (`#2E6E6E`, chosen from 6 mockup candidates after the user didn't like amber live).

## Phase 2 — Bill upload & AI parsing
- Camera/file-picker upload, image sent directly to the parsing route and never persisted (no Storage/Blaze plan needed).
- **Parsing provider changed from the originally-planned Claude API to Google Gemini** (`gemini-flash-lite-latest`) — the only genuinely $0 vision-capable option with a real free tier and no card on file; Claude/OpenAI vision are pay-per-token. Went through a couple of model-name changes after Google deprecated/gated specific dated models (`gemini-2.5-flash` → `gemini-flash-latest` → `gemini-flash-lite-latest` for the 10s Vercel Hobby timeout).

## Phase 1 — Auth & household
- Google Sign-In, `households`/`members` data model + rules, creation/join flow, admin management screen, creator-only household deletion (typed-name confirmation).
- **Reworked mid-phase into the 3-tier Creator/Admin/Guest hierarchy** (see `CLAUDE.md` roles section) — the creator is identified via `households/{id}.createdBy`, not a separate role value, and can never be demoted/removed except as the last step of full household deletion.
- Caught and fixed two related bugs: a removed member's already-open tab didn't react to losing access (added `useMembershipStatus` + reset-on-permission-denied), and a stale `isMember` state briefly broke rejoin/fresh-create for a previously-removed account (fixed via a synchronous state reset keyed on `householdId:uid`, not an effect).

## Phase 0 — Project scaffold
- Next.js + TypeScript + Tailwind, Husky + lint-staged pre-commit, Firebase client SDK (`persistentLocalCache` for offline), PWA manifest + Serwist service worker with Firebase endpoints excluded from all caching.
- **Key architecture note carried forward from here**: `@serwist/next` only supports webpack, not Turbopack (Next 16's default) — `dev`/`build` scripts are pinned to `--webpack`.
