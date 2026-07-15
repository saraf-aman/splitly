# Project Plan — Household Bill Splitter

Full reference doc. `CLAUDE.md` points here for detail on specific topics — you generally only need one section of this at a time, not the whole file.

## 1. Problem statement

Splitting grocery/restaurant bills in a shared household is tedious: not everyone eats/uses every item, taxes/tips/service charges need to be split differently from items, and manually itemizing a receipt by hand is painful. This app removes the manual itemizing step (AI parses the receipt) and the manual "who had what" negotiation (everyone selects their own items live on their phone), and outputs a clean final total per person.

## 2. Users & scale

- Household of 3 people (admins), occasionally 4 (a temporary guest, e.g. a roommate's partner staying ~3 months).
- All usage is private to this household — not a multi-tenant public product. Build for correctness and low cost, not massive scale.

## 3. Roles

| Action | Admin | Guest |
|---|---|---|
| Upload a bill | ✅ | ✅ |
| Review/edit parsed items before confirming | ✅ | ✅ |
| Select own items/shares on a bill | ✅ | ✅ |
| View final grid | ✅ | ✅ |
| Push final split to Splitwise | ✅ | ✅ |
| Add/remove household members or guests | ✅ | ❌ |
| Change household settings | ✅ | ❌ |

Guests sign in with their own Google account (not a proxy/shared login) so they can interact independently in realtime. Removing a guest revokes future access only — it does not alter their selections on past bills (historical data is preserved as-is).

A guest can alternatively be represented with zero login at all, by another member simply bumping their own share count on relevant items (e.g. "2" instead of "1"). This remains available for one-off, non-recurring guests who won't be interacting with the app themselves — it's a manual convenience, not a formal role.

## 4. Core user flow

1. **Upload**: Any household member (admin or guest) uploads a photo/screenshot of a receipt.
2. **AI parse**: The image is sent to the Claude API (vision), which returns structured JSON: line items (name, price), and separately identified tax, tip, service charge, and total.
3. **Review/edit**: The uploader sees the parsed draft and can correct/add/remove line items before confirming. Low-confidence items (the AI wasn't sure) are visually flagged for a second look.
4. **Confirm**: Bill status becomes `open`. All household members get a push notification that a new bill is ready.
5. **Select**: Each member opens the bill and sees every line item as a row with two controls:
   - a checkbox (include me / not me)
   - a share count (default `1`) — used for cases like "my friend is staying with me, count me for 2 shares" without that friend needing an account
   Tax/tip/service-charge rows are always shown in this same screen, always pre-checked, and are **not editable** (can't be unchecked or share-adjusted) — they always apply equally to everyone on the bill.
   All of this is realtime: as soon as one person changes a selection, everyone else viewing the bill sees the update live via Firestore listeners.
6. **Final grid**: Once people are done selecting, anyone who interacted with the bill can view a grid — items (rows) × household members (columns) — showing each person's share count per item, with `-` for anyone who didn't select that item. Below the grid: each person's final total (their itemized cost + their equal share of tax/tip/service charge).

## 5. Split calculation logic

- **Item cost per person** = (item price ÷ total shares claimed on that item) × that person's shares.
  - Example: a $12 item with Person A = 1 share, Person B = 2 shares → total 3 shares → A pays $4, B pays $8.
- **Tax / tip / service charge**: always split **equally** across everyone who is part of the bill (not proportional to what they ordered), regardless of item selections.
- **Rounding**: cents must not be silently dropped or double-counted across people — use a rounding remainder allocation approach (e.g. give the leftover cent(s) to whoever's total already rounds down the most) so the sum of all individual totals always equals the bill total exactly.
- **No cross-bill ledger.** The final grid for a given bill is the complete output of that bill. The bill owner manually (or via the Splitwise integration) logs the totals into Splitwise. The app does not track "who owes whom" across multiple bills over time.

## 6. Data model (Firestore)

```
households/{householdId}
  name: string
  createdAt: timestamp
  members/{userId}
    displayName: string
    photoUrl: string
    role: "admin" | "guest"
    fcmTokens: string[]        // for push notifications, can be multiple devices
    addedAt: timestamp

bills/{billId}
  householdId: string
  uploadedBy: userId
  imageUrl: string             // Firebase Storage path
  restaurantOrStoreName: string | null
  billDate: timestamp
  status: "pending_review" | "open" | "settled"
  createdAt: timestamp

  items/{itemId}
    name: string
    price: number               // in cents, to avoid float rounding issues
    lowConfidence: boolean       // AI parser flagged this for double-checking
    selections: {
      [userId]: { included: boolean, shares: number }   // default: included=true, shares=1
    }

  sharedCharges/{chargeId}      // tax, tip, service charge — always equal split, locked
    type: "tax" | "tip" | "service_charge" | "other"
    amount: number              // in cents
```

Design notes:
- Store all money values in **integer cents**, never floats, to avoid rounding bugs.
- `sharedCharges` is a separate collection from `items` specifically because it's never subject to per-user include/exclude/share editing — keeping it structurally separate prevents accidental UI logic that lets someone uncheck a tax line.
- History retention: bills older than **2 weeks** are not shown in the default history view. (Implementation options to evaluate at that stage: a scheduled Cloud Function that archives/deletes, or simply a query filter with a manual cleanup job — pick the cheaper one; likely a query filter, since there's no strict need to actually delete data at this small scale, just hide old clutter.)

## 7. Notifications (Firebase Cloud Messaging)

Triggers:
- New bill uploaded and confirmed → notify all household members except the uploader.
- Reminder nudge → if a member hasn't made any selection on an `open` bill after some threshold (e.g. 24h), send a gentle reminder. (v2 feature, not blocking v1.)

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
