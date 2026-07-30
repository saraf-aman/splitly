# Project Plan — Household Bill Splitter

Full reference doc. `CLAUDE.md` points here for detail on specific topics — you generally only need one section of this at a time, not the whole file. Sections describing **shipped** features (§1–§16) are kept concise since the code is the source of truth for exact behavior; only decisions/rationale not obvious from the code are recorded. §17 (not yet built) stays fully detailed since there's no code to defer to yet.

## 1. Problem statement

Splitting grocery/restaurant bills in a shared household is tedious: not everyone eats/uses every item, taxes/tips/service charges need to be split differently from items, and manually itemizing a receipt by hand is painful. This app removes the manual itemizing step (AI parses the receipt) and the manual "who had what" negotiation (everyone selects their own items live on their phone), and outputs a clean final total per person.

## 2. Users & scale

- Household of 3 people (admins), occasionally 4 (a temporary guest, e.g. a roommate's partner staying ~3 months).
- All usage is private to this household — not a multi-tenant public product. Build for correctness and low cost, not massive scale.

## 3. Roles

Three-tier hierarchy: **Creator** (the household's original creator — a permanent super-admin) > **Admin** > **Guest**. There is exactly one creator per household, identified by `households/{id}.createdBy`, not a separate role value in the `Member` doc (a creator's `role` field is still `"admin"`). This tier is a general pattern intended to extend to other critical/sensitive actions added in later phases, not just member management.

| Action | Creator | Admin | Guest |
|---|---|---|---|
| Upload a bill | ✅ | ✅ | ✅ |
| Review/edit parsed items before confirming | ✅ | ✅ | ✅ |
| Select own items/shares on a bill | ✅ | ✅ | ✅ |
| View final grid | ✅ | ✅ | ✅ |
| Push final split to Splitwise | ✅ | ✅ | ✅ |
| Promote a guest to admin | ✅ | ✅ | ❌ |
| Remove a guest | ✅ | ✅ | ❌ |
| Demote or remove an admin | ✅ | ❌ | ❌ |
| Be demoted or removed (as the creator) | ❌ (nobody can, not even themself, *except* as the last step of deleting the whole household) | — | — |
| Change household settings | ✅ | ✅ | ❌ |
| Delete the household (wipes all members/bills/data) | ✅ | ❌ | ❌ |

Guests sign in with their own Google account (not a proxy/shared login) so they can interact independently in realtime. Removing a guest revokes future access only — it does not alter their selections on past bills.

A guest can alternatively be represented with zero login at all, by another member simply bumping their own share count on relevant items — a manual convenience for one-off guests, not a formal role.

**Bill-owner override is separate from this tier table** — it's keyed off bill-upload ownership (`bills/{id}.uploadedBy`), not household role. Whoever uploads a given bill can check/uncheck items and adjust share counts on behalf of any other member on that bill's grid screen only (Phase 6.4).

## 4. Core user flow

1. **Upload**: Any household member uploads a photo/screenshot of a receipt (or enters items manually).
2. **AI parse**: Sent to Google Gemini (vision, free tier), returns structured JSON: line items, tax, tip, service charge, total.
3. **Review/edit**: Uploader corrects/adds/removes items before confirming; low-confidence items are flagged.
4. **Confirm**: Bill status becomes `open`. Participants get a push notification.
5. **Select**: Each participant sees every item with a checkbox (include me) + share count (default 1). Tax/tip/service-charge rows are always pre-checked and locked (equal split, not editable). Realtime via Firestore listeners.
6. **Final grid**: Items × members grid with per-person totals (itemized cost + equal share of tax/tip/service). The uploader can edit any member's column; everyone else can only edit their own.

## 5. Split calculation logic

- **Item cost per person** = (item price ÷ total shares claimed on that item) × that person's shares.
- **Tax/tip/service charge**: always split equally across everyone on the bill, regardless of item selections.
- **Rounding**: a remainder-allocation approach ensures the sum of all individual totals always equals the bill total exactly — no floats, ever.
- **No cross-bill ledger.** Each bill is a complete, self-contained output; the app never tracks who-owes-whom across bills over time.

## 6. Data model (Firestore)

```
users/{userId}
  householdIds: string[]     // households this user belongs to
  fcmTokens: { [deviceId]: string }

households/{householdId}
  name, createdAt, createdBy
  defaultCurrency            // Phase 14 — ISO 4217, set once at creation
  retentionMonths?: number | null   // Phase 12.7 — creator-only, null = keep forever
  splitwiseGroupId?, splitwiseGroupName?   // creator-only link
  members/{userId}
    displayName, photoUrl, email, role: "admin" | "guest", addedAt
    splitwiseUserId?, splitwiseEmail?

bills/{billId}
  householdId, uploadedBy
  // no imageUrl — receipt photo is never persisted
  restaurantOrStoreName, billDate, status: "pending_review" | "open" | "settled"
  currency                   // Phase 14, immutable once confirmed
  createdAt
  participantIds: string[]   // Phase 12 — subset of household members this bill applies to
  confirmedBy?: Record<uid, boolean>
  splitwiseExpenseId?: number  // set after a successful Splitwise push
  reminders?, lastManualReminderAt?  // Phase 12 reminder/nudge state

  items/{itemId}
    name, price (integer smallest-unit for the bill's currency), lowConfidence
    selections: { [userId]: { included, shares, setBy } }   // setBy = self or uploader override

  sharedCharges/{chargeId}   // tax, tip, service_charge — always equal split, structurally separate from items
    type, amount
```

Design notes:
- Money is always stored as an **integer in the currency's smallest unit** (cents for USD, but 0-decimal for JPY/KRW, 3-decimal for KWD/BHD — see §16), never floats.
- `sharedCharges` is a separate collection from `items` specifically so no UI path can accidentally let someone uncheck a tax line.
- `items` Firestore rules (Phase 6.4): a write to `selections` only succeeds if the changed keys are the caller's own uid, or — if the caller is the bill's `uploadedBy` — any key.
- Bill-level access (`read`/`update`/`delete`) is scoped to `participantIds`, not plain household membership (Phase 12.1).

## 7. Notifications (Firebase Cloud Messaging)

Triggers: new bill opened (all participants except uploader) · everyone's done (uploader only) · automated reminder (24h then every 72h, capped at 3) · manual "remind" nudge (uploader-triggered, rate-limited). All reuse one FCM send path. iOS requires 16.4+ with the PWA installed to home screen — confirmed met for all household members (iOS 17/18).

## 8. Splitwise integration

- Per-user OAuth connect/disconnect lives in the NavDrawer. Group linking is **creator-only**.
- Additive — the in-app final grid remains the source of truth even without Splitwise connected.
- **Member resolution at push time**: `members/{uid}.splitwiseUserId` first (persisted after OAuth or admin-set), else email match (`splitwiseEmail` or account email) against the Splitwise group's member list. Unresolved members are omitted, not an error — uploader is warned and can proceed or cancel.
- **Push UX** (grid screen): button sits below the table, outside the horizontal-scroll container, visible to the uploader only when a Splitwise group is linked. Error cascade before push: not connected → connect dialog; no group linked → ask the creator; bill not settled → settle first; unresolved members → resolver sheet showing who'll be included/omitted; already pushed → duplicate-expense warning (Splitwise has no idempotency — re-push is never blocked, only warned). After push, `splitwiseExpenseId` is written to the bill.
- **Settle management**: the confirmed-members banner opens a bottom sheet (uploader-only) with a "Settle all" toggle + per-member checkboxes, supporting partial settle, force-settle, and un-settling. Each save pushes a notification to affected members.

## 9. Feature list

**v1 (core):** Google login, household setup, roles · bill upload + AI parsing + review/edit + confirm · realtime select screen · realtime final grid with correct rounding · PWA install · push on new bill.

**v1.5:** Bill history (age-based hide) · home dashboard · Splitwise push.

**v2 (Phase 12):** Participant scoping · manual entry · completion/reminder notifications.

**v2.5 (nice-to-have):** Smart defaults from history · low-confidence flagging refinements · per-bill notes.

**Deferred/backlog (Phase 13):** Weekly email digest.

## 10. Explicit non-goals

- No cross-bill running balance/ledger.
- No in-app payments/money movement.
- No native mobile app — PWA only.
- No multi-tenant/public product concerns.

## 11. Technical architecture & tooling decisions

Deliberate technical choices — future sessions should not revisit these without a specific reason.

- **PWA library: `@serwist/next`**, not `next-pwa` (unmaintained). Auto-generates a content-hashed precache manifest at build time — no manual cache-busting needed.
- **Service worker must never intercept Firebase traffic** — Firestore realtime listeners and FCM break silently if cached/intercepted. Excluded origins: `firestore.googleapis.com`, `firebase.googleapis.com`, `fcmregistrations.googleapis.com`, `identitytoolkit.googleapis.com`.
- **Firestore offline persistence**: `persistentLocalCache()` in `lib/firebase.ts` — IndexedDB-backed, queues offline writes, syncs on reconnect.
- **`'use client'` boundary**: any component using an `onSnapshot` listener must be a client component; auth context, Firestore hooks, and FCM registration all live client-side.
- **Commit hooks: Husky + lint-staged**, not shell scripts — `prepare` script activates automatically on `npm install`. Runs `next lint --fix` + `tsc --noEmit` on staged files.
- **Vercel API route timeout**: Gemini vision parsing must fit inside Hobby plan's 10s limit (no Pro plan) — keep images compressed and the prompt tight.
- **Money**: always integer smallest-unit (cents for 2-decimal currencies), never floats.

## 12. UI design system (Phase 3)

**Component library: shadcn/ui** (Radix primitives + Tailwind, code copied into the repo). **Light mode only**, no dark mode — `dark:` classes and `prefers-color-scheme` handling were dropped entirely.

**Tokens:**
| Token | Hex | Use |
|---|---|---|
| `background` | `#FAFAF9` | page background |
| `surface` | `#FFFFFF` | cards |
| `ink` | `#1A1A1F` | primary text |
| `muted` | `#6B7280` | secondary/caption text |
| `accent` | `#2E6E6E` | primary buttons, active states — used sparingly |
| `accent-soft` | `#E3EEEE` | chip/badge backgrounds |
| `border` | `#E5E7EB` | hairlines, card borders |
| `success` | `#16A34A` | confirmed/settled states only |

- **Typography**: Geist Sans for UI text; **Geist Mono with tabular figures, right-aligned, for every monetary amount/quantity** — reads as a ledger rather than a generic dashboard.
- **App icon**: teal (`#2E6E6E`) rounded-square with a white "S" wordmark.
- Accent color went through two earlier iterations (indigo → amber → teal) before landing on deep teal, chosen from mockups reviewed as a Claude Artifact.

**Navigation shell** (superseded by Phase 9's top-bar redesign, §14): originally a bottom tab bar (Home / Bills / Household).

## 13. Multi-household architecture (Phase 8)

`users/{uid}.householdIds: string[]` (not a subcollection) — at this project's scale a user belongs to a handful of households at most and the only access pattern is "give me all of them at once," so a single array field with no extra rules changes was sufficient. Routing nests under `/households/[householdId]/...`; a picker screen lists all of a user's households, auto-entering if there's exactly one. Built as its own phase (before Phase 9's dashboard) so the dashboard could be built once against a picker that already existed.

## 14. Navigation shell redesign (Phase 9)

Replaced the Phase 3 bottom tab bar with a top-bar + hamburger drawer pattern (more standard, frees vertical space).

- **Top bar**: "Splitly" wordmark (links to the household picker) on the left, hamburger `≡` on the right, on all authenticated screens.
- **Liquid glass `← ⌂` pill**: appears below the top bar, left-aligned, on any screen inside a household but not the household home (bill review/select/grid) — always navigates to household home, never browser back.
- **Hamburger drawer**: Home / Manage (admin+creator only) / Switch Household / Sign out.
- **Picker screen**: hamburger replaced with a plain sign-out icon (only action available at that level).
- **Household home**: bills feed (see below) + a floating camera FAB (teal, bottom-right) linking to bill upload.
- **Bills feed**: three sections — Needs your input (amber) / In progress (gray) / Settled (teal) — each bill card shows merchant name, amount (mono, hero-sized), status pill, uploader, member chips. Member chip colors distinguish confirmed/pending and self/others.

## 15. Participant scoping, manual entry & completion notifications (Phase 12)

- **Participant scoping**: `bills/{billId}.participantIds` set at upload (pre-checked checklist, uploader unchecks anyone not involved); Firestore rules and the home feed both gate on it instead of plain household membership. Add/remove after creation is uploader-only, from the grid page's "Manage participants," staged like the settle sheet (nothing writes until Save). Removing a member is blocked if they've already made any non-default selections — the uploader can already override their picks via Phase 6.4 instead.
- **Manual entry**: `/bills/new` gained an "Enter manually" path that skips Gemini entirely and feeds the same shape into the existing review/confirm flow.
- **Notifications**: everyone's-done (push to uploader) · automated reminders (24h then every 72h, capped at 3, tracked per-member on the bill doc) · manual "remind" nudge (uploader-triggered, rate-limited to 24h/bill).
- **Explicitly deferred (13.1)**: weekly email digest — would add an external email dependency against the project's $0-cost default; push already covers the same need.

Data model additions: `bills/{billId}.participantIds`, `.lastManualReminderAt`, `.reminders.{userId}: { count, lastSentAt }`.

## 16. Multi-currency support (Phase 14)

Modeled on Splitwise itself: **currency lives on the bill, not the household, and there is no conversion.** A household with bills in two currencies just has bills in two currencies — nothing sums across them, matching the existing no-cross-bill-ledger design (§10).

- **Determining a bill's currency** (fallback chain, always shown in an editable picker, never silently locked): Gemini reads it off the receipt → household's most-recently-created bill's currency → `households/{id}.defaultCurrency` (set once at creation from device locale, no network call) → hardcoded `"USD"`.
- **Editing**: the bill review screen's currency picker; immutable once confirmed.
- **Display**: `Intl.NumberFormat(locale, { currencyDisplay: 'narrowSymbol' })` — no separate symbol lookup table needed.
- **Storage**: generalized "integer cents" to "integer smallest-unit for that currency's minor-unit exponent" via an ISO 4217 lookup table (JPY/KRW = 0 decimals, KWD/BHD = 3). Bills missing a `currency` field (pre-Phase-14) default to `"USD"`, no backfill needed.
- **Splitwise push**: sends `bill.currency` as `currency_code` — Splitwise's API accepts a per-expense currency independent of the group's own default (confirmed working in practice).

## 17. Account deletion (Phase 15)

Raised alongside the currency work, deliberately deferred until currency shipped.

**Driver: Google Play Store compliance, not a user feature request.** Google Play requires apps that support account creation to also offer (a) an in-app flow to delete the account and its data, and (b) a policy describing what gets deleted, reachable from a public place outside the app (e.g. a web page, no login required) — not just from inside a logged-in session. This becomes relevant once the app is wrapped for Android distribution (see `docs/ANDROID_APP.md`), but the in-app flow itself doesn't depend on the Android wrapper existing yet.

**The hard part is the household model, not the deletion mechanics.** A plain guest or non-creator admin can delete their own account cleanly: leave every household they're in, delete their `users/{uid}` doc, delete the underlying Firebase Auth user. A **creator** is the problem — they're a permanent super-admin who can't be removed from their own household except as the final step of that household's full deletion (`docs/CLAUDE.md` roles section; `deleteGroup` in `src/lib/group.ts`).

### Creator/owner scenario — decided and built

Landed on **silent auto-transfer, block only as a last resort** — deliberately not the "block, don't cascade" framing this section originally leaned toward; that framing was borrowed from `deleteGroup`'s guardrails without questioning whether it actually fit a different action. The reasoning that won out: forcing a departing user to manually resolve/destroy a shared household just to delete their own account produces worse outcomes in practice (abandoned accounts, permanently zombie creators) than quietly reassigning a piece of ownership metadata to someone already in the household. Matches how GitHub/Slack/Google Workspace handle a departing org owner — reassign automatically, only block when there's truly no one left.

**Eligibility rule** (`findSuccessor` in `src/app/api/account/delete/route.ts`), checked per owned household:
1. Another **admin** exists (excluding the departing user) → transfer `createdBy` to the longest-tenured one (earliest `addedAt`).
2. No other admin, but a **guest** exists → promote the longest-tenured guest to `role: "admin"` *and* transfer `createdBy` to them.
3. No other members at all → blocked. Nothing to hand off to.

**All-or-nothing, checked before any writes**: every owned household's eligibility is resolved first; if even one is blocked, the route does nothing and returns 409 with only the genuinely-blocked households. This avoids a blocked attempt silently reassigning ownership of a household the user didn't intend to touch — same "no surprising side effects from a blocked action" reasoning as `deleteGroup`'s block-not-cascade decision.

**Fully silent, both tiers** — no advance per-household preview of who becomes the new owner, no acceptance step for the new owner. Explicit user call: an admin→admin transfer isn't a bigger unilateral power than admin already has (an admin can already promote/demote other guests unilaterally); the guest→admin case is a bigger trust jump in principle, but still kept silent for simplicity rather than adding a preview/consent flow.

No `firestore.rules` change was needed — the transfer writes go through `firebase-admin`, which bypasses Firestore rules by design; the rules-level "creator can't be changed" lock in `docs/CLAUDE.md` only ever restricted *client* writes. That invariant's wording was updated to document this as a deliberate second exception (see the roles section) rather than leaving it looking absolute.

### Shipped this session (nav reshuffle + most of the in-app flow)

While designing this, we noticed the personal Splitwise connect/disconnect toggle was oddly placed — it's per-user, not per-household, but lived inside the household-scoped `NavDrawer`. Used the account-deletion work as the reason to also introduce a proper account-level home for it:

- **New `/profile` route** (`src/app/profile/page.tsx`), not household-scoped. Contains: account header (Google avatar/name/email, read-only), a Splitwise card (connect/disconnect — moved wholesale out of `NavDrawer`), Sign out, and Delete account.
- **`NavDrawer` changes**: added a "Profile" row above "Home" (uses the user's Google avatar as its icon, falls back to `CircleUserRound`). Removed the personal Splitwise connect/disconnect block and the Sign out button entirely (both now live only on `/profile`). The household-level Splitwise **group link** (creator-only — linking *this household* to a Splitwise group) stays in `NavDrawer`, since that's genuinely household-scoped; it's now gated on `swConnected || isCreator` so a disconnected creator still sees a hint ("Connect Splitwise in your Profile to link this group") instead of the section just vanishing.
- **Delete account entry point**: deliberately a plain text button, same visual weight as "Sign out" — *not* a permanently-visible "Danger zone" card like household deletion (`src/app/groups/[groupId]/group/page.tsx`) has. Clicking it expands an inline confirm (same collapse/expand pattern as `NavDrawer`'s "Leave Group"), which requires typing the user's own email to enable the destructive button. Lighter-weight than household deletion's typed-name confirmation was judged appropriate since this only destroys the acting user's own data.
- **`POST /api/account/delete`** (`src/app/api/account/delete/route.ts`), following the existing `firebase-admin` + bearer-token-verification pattern used by `DELETE /api/bills/[billId]`. Server-side (not client `user.delete()`, to avoid `requires-recent-login` reauth-popup handling): looks up the caller's `householdIds`, checks whether they're `createdBy` on any of them (409 + list if so — nothing is deleted), otherwise deletes their member doc in every household, deletes `users/{uid}`, then `admin.auth().deleteUser(uid)`. No `fcmTokens` cleanup needed — they live on `users/{uid}` per the Phase 12 centralization and go with that doc.

### Public policy pages — built, scope expanded beyond just deletion

15.3 was originally scoped as just the required deletion-policy page, but the user wanted the full legal picture done now rather than left as a dangling `docs/ANDROID_APP.md` checklist item — three pages were built together:

- **`/data-deletion`** — the Play-required page: how to delete an account, exactly what's deleted immediately, the full owner-transfer behavior described in plain language (admin → longest-tenured admin, else longest-tenured guest promoted, else blocked), and what's *not* deleted (shared household bill data).
- **`/privacy`** — full Privacy Policy: what's collected (account info via Google Sign-In, household/bill data, receipt photos — explicitly never stored — Splitwise connection data if opted in, FCM push tokens), how it's used, third-party processors (Firebase, Gemini, Splitwise), retention, security, children's privacy, contact.
- **`/terms`** — Terms of Service: eligibility, acceptable use, households-are-shared-spaces, third-party-service disclaimer, no-financial-services clause (Splitly never moves money), IP, warranty disclaimer, liability limitation, governing law (United States, per user direction), contact.

All three are wired into `AuthGate` (`ALWAYS_PUBLIC_PATHS`) and `AppShell` (`SHELLLESS_PATHS`) so they render with no app chrome and are reachable with or without a session — required since Play reviewers and cold visitors need to open them without logging in. `/login` now footer-links to `/terms` and `/privacy`; the Profile delete-confirm panel links to `/data-deletion`.

**Explicitly flagged to the user, not glossed over**: these are solid, factually-grounded drafts (accuracy against actual app behavior was the design goal), not a substitute for an actual lawyer's review before a public Play Store submission — Terms of Service in particular is a binding contract, not just a disclosure. Contact email on all three is the user's personal address (`amansaraf28@gmail.com`) as a placeholder — they intend to swap in a dedicated Splitly address later.

### Also still open
- No email/notification to a new owner (transferred-to admin, or promoted-and-transferred-to guest) telling them it happened — flagged as a possible gap during design, deliberately deferred rather than treated as a blocker.
- The blocking-only-when-no-successor path (`findSuccessor` returns null) was not exercised against a real account during implementation — destructive/irreversible to test live, so it's verified by code review only. Worth a careful look if it misbehaves in practice.
- Legal review of `/privacy` and `/terms` before any public Play Store submission.
