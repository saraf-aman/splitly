export interface SplitItem {
  price: number; // cents
  selections: Record<string, { included: boolean; shares: number }>;
}

export interface SplitCharge {
  amount: number; // cents
}

// Divides `amount` among `members` proportionally by shares.
// Uses largest-remainder method: floor each share, then give 1 extra cent
// to members with the highest fractional loss until the sum matches exactly.
// Invariant: sum(returned values) === amount (always, no lost cents).
function allocateByShares(
  amount: number,
  members: { uid: string; shares: number }[],
): Record<string, number> {
  const totalShares = members.reduce((s, m) => s + m.shares, 0);
  if (totalShares === 0) return Object.fromEntries(members.map((m) => [m.uid, 0]));

  const allocations = members.map((m) => ({
    uid: m.uid,
    amount: Math.floor((amount * m.shares) / totalShares),
    frac: (amount * m.shares) % totalShares,
  }));

  const leftover = amount - allocations.reduce((s, a) => s + a.amount, 0);
  allocations.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < leftover; i++) {
    allocations[i].amount += 1;
  }

  return Object.fromEntries(allocations.map((a) => [a.uid, a.amount]));
}

// Splits `amount` equally among `uids`. Extra cent(s) go to the first N uids.
// Invariant: sum(returned values) === amount (always, no lost cents).
export function allocateEqually(amount: number, uids: string[]): Record<string, number> {
  const n = uids.length;
  if (n === 0) return {};
  const base = Math.floor(amount / n);
  const leftover = amount - base * n;
  return Object.fromEntries(uids.map((uid, i) => [uid, base + (i < leftover ? 1 : 0)]));
}

// Returns per-member totals in cents.
//
// Hard guarantees (enforced by a runtime assertion):
//   1. sum(result.values()) === sum(item.price for all items with ≥1 included member)
//                            + sum(charge.amount for all charges)
//   2. No cent is ever lost or double-counted.
//
// `memberIds` controls who shares the charges (tax/tip/service).
// Item costs go to whoever is in each item's `selections`, even if they are
// not in `memberIds` — so callers must pass a complete member list.
export function calculateSplit(
  items: SplitItem[],
  charges: SplitCharge[],
  memberIds: string[],
): Record<string, number> {
  // Seed with every memberIds uid so they appear even with a $0 total.
  const totals: Record<string, number> = Object.fromEntries(memberIds.map((uid) => [uid, 0]));

  let expectedTotal = 0;

  for (const item of items) {
    const included = Object.entries(item.selections)
      .filter(([, sel]) => sel.included)
      .map(([uid, sel]) => ({ uid, shares: sel.shares }));

    if (included.length === 0) continue;

    expectedTotal += item.price;
    const alloc = allocateByShares(item.price, included);

    for (const [uid, amount] of Object.entries(alloc)) {
      // Ensure the uid exists in totals even if not in memberIds, so no
      // cents are silently dropped when a selection exists for a non-member uid.
      totals[uid] = (totals[uid] ?? 0) + amount;
    }
  }

  const totalCharges = charges.reduce((s, c) => s + c.amount, 0);
  expectedTotal += totalCharges;

  if (totalCharges > 0 && memberIds.length > 0) {
    const chargeAlloc = allocateEqually(totalCharges, memberIds);
    for (const [uid, amount] of Object.entries(chargeAlloc)) {
      totals[uid] = (totals[uid] ?? 0) + amount;
    }
  }

  // Invariant check — catches any future regressions at the call site.
  const actualTotal = Object.values(totals).reduce((s, v) => s + v, 0);
  if (actualTotal !== expectedTotal) {
    throw new Error(
      `calculateSplit: cent mismatch — expected ${expectedTotal}¢ but got ${actualTotal}¢`,
    );
  }

  return totals;
}
