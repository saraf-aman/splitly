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

## 17. Account deletion (Phase 15) — discussion only, not yet designed or built

Raised alongside the currency work, deliberately deferred until currency shipped. Nothing below is built — this section captures the discussion so a future session (possibly a fresh one) has the context without re-deriving it.

**Driver: Google Play Store compliance, not a user feature request.** Google Play requires apps that support account creation to also offer (a) an in-app flow to delete the account and its data, and (b) a policy describing what gets deleted, reachable from a public place outside the app (e.g. a web page, no login required) — not just from inside a logged-in session. This becomes relevant once the app is wrapped for Android distribution (see `docs/ANDROID_APP.md`), but the in-app flow itself doesn't depend on the Android wrapper existing yet.

**The hard part is the household model, not the deletion mechanics.** A plain guest or non-creator admin can delete their own account cleanly: leave every household they're in (existing `leaveGroup` self-service pattern, Phase 8.2), delete their `users/{uid}` doc, delete the underlying Firebase Auth user. A **creator** is the problem — they're a permanent super-admin who can't be removed from their own household except as the final step of that household's full deletion (`docs/CLAUDE.md` roles section; `deleteGroup` in `src/lib/group.ts`). So "delete my account" while still being a creator of one or more households needs an explicit decision.

**Leaning discussed (not finalized): block, don't cascade.** If the user is the creator of any household, block account deletion with a clear message pointing them at deleting that household first (reusing the existing typed-name-confirmation `deleteGroup` flow from `docs/CLAUDE.md`'s roles section) — rather than silently cascading the household deletion as a side effect of account deletion. Rationale discussed: household deletion is already the single most destructive action in the app (wipes all members/bills/data for everyone, not just the deleter), and auto-cascading it from a different, less-obviously-scoped action ("delete my account") risks surprising other household members. Blocking with a clear next step keeps that destructive path singular and explicit.

**Not yet discussed / open for the next session:**
- Exact UI location for the "Delete account" entry point (likely near "Sign out" in `NavDrawer`, going by existing patterns).
- Exact confirmation UX (typed-name-style like household deletion, or lighter).
- What "delete the account" does to the Firebase Auth user record itself (client-side `user.delete()` vs. an Admin SDK route) vs. just the Firestore `users/{uid}` doc + household member docs.
- The public policy page itself — content, route, and whether it needs to exist before an Android submission or can be built alongside the in-app flow.
- Whether `fcmTokens` cleanup needs anything beyond what deleting the `users/{uid}` doc already handles.
