# Project Plan — Household Bill Splitter

Full reference doc. `CLAUDE.md` points here for detail on specific topics — you generally only need one section of this at a time, not the whole file.

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

Guests sign in with their own Google account (not a proxy/shared login) so they can interact independently in realtime. Removing a guest revokes future access only — it does not alter their selections on past bills (historical data is preserved as-is).

A guest can alternatively be represented with zero login at all, by another member simply bumping their own share count on relevant items (e.g. "2" instead of "1"). This remains available for one-off, non-recurring guests who won't be interacting with the app themselves — it's a manual convenience, not a formal role.

**Bill-owner override is separate from this tier table** — it's keyed off bill-upload ownership (`bills/{id}.uploadedBy`), not household role. Whoever uploads a given bill can check/uncheck items and adjust share counts on behalf of any other member *on that bill's grid screen only* (Phase 6.4); a guest who uploads a bill gets override rights on that specific bill just like an admin or the creator would. This is orthogonal to the Creator/Admin/Guest hierarchy above, not an extension of it.

## 4. Core user flow

1. **Upload**: Any household member (admin or guest) uploads a photo/screenshot of a receipt.
2. **AI parse**: The image is sent to the Google Gemini API (vision, free tier), which returns structured JSON: line items (name, price), and separately identified tax, tip, service charge, and total.
3. **Review/edit**: The uploader sees the parsed draft and can correct/add/remove line items before confirming. Low-confidence items (the AI wasn't sure) are visually flagged for a second look.
4. **Confirm**: Bill status becomes `open`. All household members get a push notification that a new bill is ready.
5. **Select**: Each member opens the bill and sees every line item as a row with two controls:
   - a checkbox (include me / not me)
   - a share count (default `1`) — used for cases like "my friend is staying with me, count me for 2 shares" without that friend needing an account
   Tax/tip/service-charge rows are always shown in this same screen, always pre-checked, and are **not editable** (can't be unchecked or share-adjusted) — they always apply equally to everyone on the bill.
   All of this is realtime: as soon as one person changes a selection, everyone else viewing the bill sees the update live via Firestore listeners.
6. **Final grid**: Once people are done selecting, anyone who interacted with the bill can view a grid — items (rows) × household members (columns) — showing each person's share count per item, with `-` for anyone who didn't select that item. Below the grid: each person's final total (their itemized cost + their equal share of tax/tip/service charge). The bill's uploader can also check/uncheck items and adjust shares here on behalf of any other member (everyone else can only edit their own column); each cell's `setBy` field distinguishes a self-set entry from one the uploader overrode, rendered as a visual difference (e.g. checkmark color) so it's clear at a glance who actually made a given selection.

## 5. Split calculation logic

- **Item cost per person** = (item price ÷ total shares claimed on that item) × that person's shares.
  - Example: a $12 item with Person A = 1 share, Person B = 2 shares → total 3 shares → A pays $4, B pays $8.
- **Tax / tip / service charge**: always split **equally** across everyone who is part of the bill (not proportional to what they ordered), regardless of item selections.
- **Rounding**: cents must not be silently dropped or double-counted across people — use a rounding remainder allocation approach (e.g. give the leftover cent(s) to whoever's total already rounds down the most) so the sum of all individual totals always equals the bill total exactly.
- **No cross-bill ledger.** The final grid for a given bill is the complete output of that bill. The bill owner manually (or via the Splitwise integration) logs the totals into Splitwise. The app does not track "who owes whom" across multiple bills over time.

## 6. Data model (Firestore)

```
users/{userId}               // reverse index: which household(s) this signed-in user belongs to
  householdIds: string[]     // a user may belong to multiple households (Phase 8) — a simple
                             // array field, not a subcollection, since it's always read all-at-
                             // once for a picker/dashboard and never queried/filtered independently

households/{householdId}
  name: string
  createdAt: timestamp
  createdBy: userId          // lets security rules bootstrap the creator's own admin member doc
  members/{userId}
    displayName: string
    photoUrl: string
    role: "admin" | "guest"
    fcmTokens: string[]        // for push notifications, can be multiple devices
    addedAt: timestamp

bills/{billId}
  householdId: string
  uploadedBy: userId
  // no imageUrl field — the receipt photo is never persisted. It's sent
  // directly to the Claude parsing API route and discarded once parsed.
  restaurantOrStoreName: string | null
  billDate: timestamp
  status: "pending_review" | "open" | "settled"
  createdAt: timestamp

  items/{itemId}
    name: string
    price: number               // in cents, to avoid float rounding issues
    lowConfidence: boolean       // AI parser flagged this for double-checking
    selections: {
      // default: included=true, shares=1. setBy records who actually wrote this entry (self, or
      // the bill's uploadedBy overriding it) — used purely for the Phase 6.4 attribution display,
      // not rules-enforced (it's a cosmetic hint, not a security boundary).
      [userId]: { included: boolean, shares: number, setBy: userId }
    }

  sharedCharges/{chargeId}      // tax, tip, service charge — always equal split, locked
    type: "tax" | "tip" | "service_charge" | "other"
    amount: number              // in cents
```

Design notes:
- Store all money values in **integer cents**, never floats, to avoid rounding bugs.
- `sharedCharges` is a separate collection from `items` specifically because it's never subject to per-user include/exclude/share editing — keeping it structurally separate prevents accidental UI logic that lets someone uncheck a tax line.
- History retention: bills older than **2 weeks** are not shown in the default history view. (Implementation options to evaluate at that stage: a scheduled Cloud Function that archives/deletes, or simply a query filter with a manual cleanup job — pick the cheaper one; likely a query filter, since there's no strict need to actually delete data at this small scale, just hide old clutter.)
- `items` Firestore rules (Phase 6.4): today any household member can write the entire `items/{itemId}` doc, with no restriction on whose `selections` key they touch. That's tightened at Phase 6.4 by scoping the `update` rule with `request.resource.data.selections.diff(resource.data.selections).affectedKeys()`, requiring the changed keys to be either just the caller's own uid, or — if the caller is the bill's `uploadedBy` — any key at all. `create` stays open to any household member (Phase 4.2 confirm writes the initial item docs).

## 7. Notifications (Firebase Cloud Messaging)

Triggers:
- New bill uploaded and confirmed → notify all household members except the uploader.
- Reminder nudge → if a member hasn't made any selection on an `open` bill after some threshold (e.g. 24h), send a gentle reminder. (v2 feature, not blocking v1.)

iOS requirement: FCM push via PWA requires iOS 16.4+ and the app installed to the home screen. All household members are on iOS 17/18 — this is confirmed met, no special handling needed.

## 8. Splitwise integration

- Requires a Splitwise API key (user generates this from their Splitwise account settings — a short one-time step) and the target Splitwise **group name/ID**.
- On the final grid screen, a button pushes the computed per-person totals into the connected Splitwise group as a new expense, itemized or as a lump sum per person (decide exact format at implementation time).
- This is additive — the in-app final grid remains the source of truth even without Splitwise connected.

## 9. Feature list

**v1 (core, must work end to end):**
- Google login, household setup, admin/guest roles
- Bill upload + AI parsing + review/edit + confirm
- Realtime select screen (checkbox + shares + locked shared charges)
- Realtime final grid + per-person totals with correct rounding
- PWA install on iOS/Android
- Push notification on new bill

**v1.5 (layered in right after core works):**
- Bill history (2-week window)
- Home dashboard ("bills needing your input")
- Splitwise push integration

**v2 (nice-to-have, build only once the above is solid):**
- Reminder nudges for unresponded bills
- Smart defaults learned from history (e.g. auto-unchecking items you never buy)
- Manual fallback entry (skip AI parsing, type items directly)
- Low-confidence AI flagging refinements
- Per-bill notes (e.g. "I'm paying for the wine separately")

## 10. Explicit non-goals

- No cross-bill running balance/ledger.
- No in-app payments/money movement.
- No native mobile app — PWA only.
- No multi-tenant/public product concerns (no need for scalable pricing tiers, admin dashboards for "customers," etc. — this is a household tool for ~3-4 people).

## 11. Technical architecture & tooling decisions

This section records deliberate technical choices and the reasoning behind them. Future sessions should not revisit these without a specific reason.

### PWA library: `@serwist/next` (not `next-pwa`)

`next-pwa` (the `shadowwalker` package) is effectively unmaintained. `@serwist/next` is the actively maintained Workbox-based successor. Key benefit: Workbox auto-generates a typed precache manifest at `next build` time, listing every `_next/static/` asset with its content-hash filename. This replaces the need for any manual cache-busting script (cf. Meridian's `bust.py`). No manual `PRECACHE` arrays to maintain.

### Service worker: Firebase endpoint exclusions (critical for realtime)

The SW must never intercept Firebase traffic. Firestore realtime listeners run over a long-lived HTTP/2 stream; FCM uses its own endpoints. If the SW caches or interferes with these, realtime updates break silently. The following origins must be excluded from all SW `runtimeCaching` strategies:
- `https://firestore.googleapis.com`
- `https://firebase.googleapis.com`
- `https://fcmregistrations.googleapis.com`
- `https://identitytoolkit.googleapis.com` (Firebase Auth)

Apply these as `NavigationRoute` denylists or `urlPattern` exclusions in the Serwist config.

### Firestore: offline persistence

Enable `persistentLocalCache()` when initialising Firestore (`initializeFirestore` with `localCache: persistentLocalCache()`). This stores Firestore data in IndexedDB so the app degrades gracefully on flaky mobile connections rather than showing empty/broken states. Writes made offline are queued and sync automatically when connectivity resumes. Enable once in `lib/firebase.ts`; no other code changes needed.

### `'use client'` boundary strategy

Next.js App Router server components cannot hold Firestore listeners (listeners require a browser environment). The pattern to follow throughout this codebase:
- Page files (`app/.../page.tsx`) can be server components for layout/metadata.
- Any component that uses a Firestore `onSnapshot` listener must be a client component (`'use client'`).
- Auth context, Firestore hooks, and FCM registration are all client-only — keep them in `components/` or `lib/` with `'use client'` at the top.

### Commit hooks: Husky + lint-staged (not `.githooks/` shell scripts)

Husky's `prepare` script runs automatically on `npm install`, so hooks are active for every developer without a manual `git config` step. lint-staged runs only against staged files (fast). The hook runs:
1. `next lint --fix` — auto-fix lint issues, fail on errors
2. `tsc --noEmit` — fail on type errors

This ensures no type-broken or lint-failing code ever lands in a commit.

### Vercel API route timeout: Claude receipt parsing

The Next.js API route that calls Gemini vision (Phase 2.2) may need more than Vercel's default 10s timeout for a complex receipt with many line items. `maxDuration` beyond 10s requires the paid Vercel Pro plan — the free Hobby plan caps at 10s. Since the project goal is $0 running cost, design the parsing route to fit inside Hobby's 10s limit (compress/downscale the image before sending, keep the prompt tight) rather than assuming Pro. Revisit at Phase 2.2 if parsing consistently runs long in practice.

## 12. UI design system (Phase 3)

Everything built through Phase 2.2 (login, onboarding, household management, bill upload) is functional scaffolding, not final visual design — plain Tailwind utility classes with no shared component layer, no real typography scale, no cohesive navigation shell. Phase 3 is a dedicated pass to define and apply a real design system **before** any further feature work, so every screen built from Phase 4 onward (starting with the review/edit screen, originally 2.3) is built against a real UI standard from day one instead of retrofitting polish at the very end (the old plan deferred all of this to a "polish" step in the last phase — moved up deliberately per user request).

**Scope is visual/structural only, not new data features.** No bill-listing, history, or dashboard *data* gets pulled forward — that stays in its originally-planned phase. Phase 3 restyles the screens and navigation that already exist today; later phases keep adding features, just using the components/shell this phase establishes.

**Component library: shadcn/ui** (Radix UI primitives + Tailwind, code copied into the repo rather than an opaque npm dependency). Chosen over a hand-rolled Tailwind design system because it gives accessible, consistent primitives (buttons, inputs, cards, dialogs, nav) fast, without hand-maintaining a11y behavior (focus traps, ARIA on custom dropdowns/selects) that a small household-app project has no reason to build from scratch. It layers directly on the existing Tailwind v4 setup — no conflicting styling approach to reconcile.

**Visual identity — revised this session (superseding the original indigo/dual-mode sketch above):**

- **Light mode only, no dark mode.** Explicit user call — drop the existing Tailwind `dark:` classes and `prefers-color-scheme` handling entirely rather than reconciling them into the shadcn theme. One visual world, not two.
- **Accent color: deep teal**, `#2E6E6E`, with a soft tint `#E3EEEE` for chips/badges/callout backgrounds. Replaces an interim amber (`#C6893A`), which itself had replaced the original indigo (`#4f46e5`) — amber read too close to mustard/too warm once live in the app; the user reviewed six candidate accents as a Claude Artifact mockup and picked deep teal. This means `public/manifest.json` `theme_color` and the `themeColor` in `src/app/layout.tsx`'s `viewport` export are `#2E6E6E` (already updated).
- **Full light-mode token set** (background/surface/text, not just the accent):
  | Token | Hex | Use |
  |---|---|---|
  | `background` | `#FAFAF9` | page background (warm paper-white, not stark white) |
  | `surface` | `#FFFFFF` | cards |
  | `ink` | `#1A1A1F` | primary text |
  | `muted` | `#6B7280` | secondary/caption text |
  | `accent` | `#2E6E6E` | primary buttons, active tab, selected states — used sparingly, not as a background fill |
  | `accent-soft` | `#E3EEEE` | chip/badge backgrounds, "your share" callout background |
  | `border` | `#E5E7EB` | hairlines, card borders |
  | `success` | `#16A34A` | confirmed/settled states only (semantic, not the brand accent) |
- **Typography**: Geist Sans/Mono (already the `create-next-app` default, already wired into `layout.tsx`). Phase 3 adds a real type scale (display/heading/body/caption sizes with consistent line-height/weight) instead of ad hoc `text-sm`/`text-2xl` choices per page.
- **Signature treatment — money in mono.** Every monetary amount and quantity (item prices, shares, totals) renders in **Geist Mono with tabular figures, right-aligned** — distinct from Geist Sans used for all other UI text. Reads as a ledger/receipt rather than a generic dashboard; tabular figures also keep columns aligned in the future selection grid (Phase 5/6). Item lists get a **dashed divider** above the tax/tip/total rows, echoing a paper receipt's cut line — the one deliberate skeuomorphic nod, used once, not repeated elsewhere.
- **App icon**: `public/icon-192.png`/`icon-512.png` are a deep teal (`#2E6E6E`) rounded-square icon bearing a bold white/paper-white "S" wordmark.

**Navigation shell**: a persistent mobile-first bottom tab bar (Home / Bills / Household), since this is a PWA primarily installed to a phone home screen — replacing today's inline, ad hoc links (e.g. "Manage household" as a plain text link on the home page). Each tab gets its own line icon, not a generic placeholder block: **house** (Home), **receipt** (Bills — rectangle with a jagged/torn bottom edge and a few horizontal lines, matching the ledger motif), **people** (Household — two overlapping figures). Active tab tinted with the accent (icon + label), inactive tabs muted gray. Applies to every authenticated route; the login/onboarding screens (pre-household) stay shell-less since there's nothing to navigate to yet.

A confirmed visual reference (mockups reviewed and approved this session) exists as a Claude Artifact; ask the user if it's still needed since it's not checked into the repo.

**Phase 3 build order** (see `ROADMAP.md` for the exact steps): design tokens + base primitives first (no visible page changes), then the shared app shell (with the tab icons above), then restyle each existing screen against it (auth/onboarding → home/household → bill upload), then swap the app icon PNGs.

### Push notifications: iOS version requirement confirmed

FCM push notifications require iOS 16.4+ with the PWA installed to the home screen (not running in Safari). All household members are confirmed on iOS 17 or iOS 18 (devices from 2024 or later), so this requirement is met. No fallback needed for older iOS.

### Money: integer cents throughout

All monetary values in Firestore and in calculation functions are stored and handled as **integer cents** (e.g. `$12.50` → `1250`). Never use floats for money. The split calculation module (Phase 4.2) handles rounding remainders to ensure the sum of all per-person totals equals the bill total exactly.

## 13. Multi-household architecture (Phase 8)

Originally deferred (see the Phase 1.5 progress note) as a foundational data-model change not worth retrofitting mid-stream. Revisited once Phases 1-7 were far enough along to see the actual coupling surface, which turned out to be narrow: every Firestore rule already gates access per-household via the `households/{id}/members/{uid}` subcollection (never via the `users/{uid}` doc), and every data-fetching hook in `src/lib/household.ts` except `useUserHousehold` already takes `householdId` as an explicit parameter rather than reading a global singleton. So multi-household support is additive routing + a data-shape change, not a rewrite of the household/bill/selection logic already built.

**Data model: `users/{uid}.householdIds: string[]`, not a `users/{uid}/households/{id}` subcollection.** At this project's scale, a user belongs to at most a handful of households and the only access pattern is "give me all of them at once" for a picker screen — never an independent query or filter across households. An array field is a single listener call and needs zero `firestore.rules` changes (the existing `users/{userId}` rule — self-read/write only — already permits rewriting the whole doc). A subcollection would only pay off if querying/filtering households independently mattered, which it doesn't here.

**Routing: `/households/[householdId]/...`.** Today's flat routes (`/`, `/bills/new`, `/household`) assume exactly one global household context. Phase 8 nests them under a household id segment so every screen is explicitly scoped to the household the URL names — this also plays well with future deep links (e.g. a push notification landing on a specific bill within a specific household). A new picker/landing screen at `/households` lists all of a user's households (reusing the existing create/join UI); a user in exactly one household is routed straight into it, preserving today's zero-friction single-household experience.

**Why Phase 8, not earlier or later:** inserted right before the (renumbered) Phase 9 "History & dashboard," because that dashboard is exactly the screen a household picker needs to sit in front of. Building the picker as its own phase first means the dashboard gets built once, correctly, against a picker that already exists — rather than being built single-household in an earlier phase and reworked later once multi-household lands.

## 14. Dashboard & navigation redesign (Phase 8 + 9 visual spec)

Agreed design direction (reviewed and approved as a Claude Artifact — https://claude.ai/code/artifact/74fc0773-2d4b-43af-aedb-2b78e0920268). Every choice below stays within the existing token system (§12) and is additive — no token values change.

### Navigation shell changes

Replace the current bottom tab bar (Home / Bills / Household) with:

- **Two tabs**: Bills (receipt icon, left) and Household (people icon, right)
- **Raised camera FAB** centered between them, elevated ~28px above the tab bar, teal background (`#2E6E6E`), white camera icon, `box-shadow: 0 4px 18px rgba(46,110,110,0.45)`. This is the app's single primary action — photographing/uploading a receipt. Currently buried as a mid-page button; the FAB makes it unmissable.
- **Header**: household name as a tappable button ("The House ▾") left-aligned, notification bell + user avatar right-aligned. Tapping the household name opens the Phase 8.5 picker sheet. Font: 18px, 800 weight, `#1A1A1F`, letter-spacing -0.4px.

### Bills feed (Phase 9.1 home screen)

The home screen becomes a scrollable feed of bills, grouped into three sections with 10px uppercase section labels:

| Section | Left stripe color | Condition |
|---|---|---|
| **Needs your input** | Amber `#D97706` | `status === "open"` and the current user has not yet confirmed |
| **In progress** | Gray `#D1D5DB` | `status === "open"` and the current user has confirmed but others haven't |
| **Settled** | Teal `#2E6E6E` | All members have confirmed (`confirmedBy` count === members count) |

**Bill card anatomy** (each card: white background, 1px `#E5E7EB` border, 16px border-radius, 4px left stripe, tap → scale(0.975)):

```
[4px stripe] | Merchant name (14px, 700)          Jul 15
             | $94.50   ← 28px monospace, letter-spacing -1px (THE hero element)
             | [status pill]  ← amber/gray/teal tinted pill, 10.5px, 700
             | Uploaded by Meera  ← 11.5px, muted
             | [A] [M] [S] [R]  ← 28px circular chips
```

The **amount is the dominant visual element** on the card at 28px monospace — it is what the user actually needs at a glance. Everything else (merchant, date, meta) is secondary.

**Amount color by state:**
- Needs input / in progress: `#1A1A1F` (foreground — uncertain)
- Settled: `#2E6E6E` (teal — confirmed, celebratory)

**"Your share" line** (`font-mono`, 11.5px, `#6B7280`) appears only on settled bills, below the amount, because it's only certain once everyone has confirmed.

**Member chip colors:**
| Chip state | Background | Text |
|---|---|---|
| Confirmed (others) | `#2E6E6E` | `#FFFFFF` |
| Confirmed (you) | `#2E6E6E` + 2px `#1A4F4F` outline-offset ring | `#FFFFFF` |
| Pending (others) | `#F1F0EE` | `#9CA3AF` |
| Pending (you) | `#FEF3C7` + 1.5px `#FDE68A` outline | `#D97706` — amber self-pending draws the eye |

### Household picker sheet (Phase 8.5)

Triggered by tapping the household name in the header. Slides up as a bottom sheet (border-radius 26px 26px 0 0, cubic-bezier spring transition). Backdrop: `rgba(26,26,31,0.36)`.

Each household entry: 44px icon tile (`#E3EEEE` background, emoji), name (15px, 700), meta line ("4 members · 2 active bills", 12px muted), teal checkmark circle on the selected entry. "Join or create a household" teal text button at bottom.

Auto-dismisses after 220ms on selection (lets user see the selection animate before closing).

### Household screen (tab 2)

Member list: each member as a card (40px avatar circle, color-coded per member, name + role badge). Role badges: Owner = `#1A1A1F` bg / white text; Admin = `#E3EEEE` / `#2E6E6E`; Guest = `#F1F0EE` / `#6B7280`. Invite section below the list: monospaced invite ID (20px, letter-spacing 0.12em) + "Copy invite ID" button.
