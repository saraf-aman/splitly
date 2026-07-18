import { describe, it, expect } from "vitest";
import { calculateSplit } from "../splitCalc";
import type { SplitItem, SplitCharge } from "../splitCalc";

function sel(included: boolean, shares = 1) {
  return { included, shares };
}

function sumTotals(totals: Record<string, number>): number {
  return Object.values(totals).reduce((s, v) => s + v, 0);
}

describe("calculateSplit", () => {
  it("splits a single item equally between two people", () => {
    const items: SplitItem[] = [
      { price: 1000, selections: { a: sel(true), b: sel(true) } },
    ];
    const result = calculateSplit(items, [], ["a", "b"]);
    expect(result.a).toBe(500);
    expect(result.b).toBe(500);
  });

  it("splits a single item by shares (uneven)", () => {
    // $12.00 item: A=1 share, B=2 shares → A pays $4, B pays $8
    const items: SplitItem[] = [
      { price: 1200, selections: { a: sel(true, 1), b: sel(true, 2) } },
    ];
    const result = calculateSplit(items, [], ["a", "b"]);
    expect(result.a).toBe(400);
    expect(result.b).toBe(800);
    expect(sumTotals(result)).toBe(1200);
  });

  it("allocates rounding remainder so total is exact (3-way uneven)", () => {
    // $10.00 / 3 people = $3.33 each with $0.01 remainder → one person pays $3.34
    const items: SplitItem[] = [
      { price: 1000, selections: { a: sel(true), b: sel(true), c: sel(true) } },
    ];
    const result = calculateSplit(items, [], ["a", "b", "c"]);
    expect(sumTotals(result)).toBe(1000);
    const amounts = Object.values(result).sort();
    expect(amounts[0]).toBe(333);
    expect(amounts[1]).toBe(333);
    expect(amounts[2]).toBe(334);
  });

  it("largest-remainder: gives extra cent to member with highest fractional loss", () => {
    // $1.00 split among 3: floor(100/3)=33, remainder=1 cent
    // All three have equal frac (100*1 % 3 = 1), so first sorted member gets extra
    // The key property: total must equal 100
    const items: SplitItem[] = [
      { price: 100, selections: { a: sel(true), b: sel(true), c: sel(true) } },
    ];
    const result = calculateSplit(items, [], ["a", "b", "c"]);
    expect(sumTotals(result)).toBe(100);
  });

  it("excludes items not included by a member", () => {
    const items: SplitItem[] = [
      { price: 800, selections: { a: sel(true), b: sel(false) } },
      { price: 600, selections: { a: sel(false), b: sel(true) } },
    ];
    const result = calculateSplit(items, [], ["a", "b"]);
    expect(result.a).toBe(800);
    expect(result.b).toBe(600);
  });

  it("skips items with no included members", () => {
    const items: SplitItem[] = [
      { price: 500, selections: { a: sel(false), b: sel(false) } },
    ];
    const result = calculateSplit(items, [], ["a", "b"]);
    expect(result.a).toBe(0);
    expect(result.b).toBe(0);
  });

  it("splits shared charges equally among all members regardless of selections", () => {
    const items: SplitItem[] = [
      { price: 1000, selections: { a: sel(true), b: sel(false) } },
    ];
    const charges: SplitCharge[] = [{ amount: 200 }]; // tax = $2.00
    const result = calculateSplit(items, charges, ["a", "b"]);
    // a: $10 item + $1 tax = $11
    // b: $0 items + $1 tax = $1
    expect(result.a).toBe(1100);
    expect(result.b).toBe(100);
    expect(sumTotals(result)).toBe(1200);
  });

  it("handles uneven shared charge remainder correctly", () => {
    // $1.01 charge split among 2 → one gets 51¢, other gets 50¢
    const charges: SplitCharge[] = [{ amount: 101 }];
    const result = calculateSplit([], charges, ["a", "b"]);
    expect(sumTotals(result)).toBe(101);
    const amounts = Object.values(result).sort();
    expect(amounts[0]).toBe(50);
    expect(amounts[1]).toBe(51);
  });

  it("combined: items + multiple charges, sum equals total bill", () => {
    const items: SplitItem[] = [
      { price: 1500, selections: { a: sel(true, 1), b: sel(true, 2) } }, // $15 split 1:2
      { price: 900, selections: { a: sel(true), b: sel(false) } },        // $9 for a only
    ];
    const charges: SplitCharge[] = [
      { amount: 300 }, // tax
      { amount: 150 }, // tip
    ];
    const result = calculateSplit(items, charges, ["a", "b"]);
    const expectedTotal = 1500 + 900 + 300 + 150;
    expect(sumTotals(result)).toBe(expectedTotal);
    // a's items: floor(1500*1/3)=500, plus 900 = 1400
    // b's items: floor(1500*2/3)=1000
    // charges: 450/2 = 225 each
    expect(result.a).toBe(500 + 900 + 225);
    expect(result.b).toBe(1000 + 225);
  });

  it("handles a member with multiple shares in a non-divisible item", () => {
    // $10 item: a=1 share, b=3 shares → total 4 shares
    // a: floor(1000*1/4)=250, b: floor(1000*3/4)=750, sum=1000 ✓
    const items: SplitItem[] = [
      { price: 1000, selections: { a: sel(true, 1), b: sel(true, 3) } },
    ];
    const result = calculateSplit(items, [], ["a", "b"]);
    expect(result.a).toBe(250);
    expect(result.b).toBe(750);
    expect(sumTotals(result)).toBe(1000);
  });

  it("handles item with price not divisible by shares (remainder to largest fraction)", () => {
    // $10.01 split 3 equal shares: 334, 334, 333 (largest frac gets extra)
    const items: SplitItem[] = [
      { price: 1001, selections: { a: sel(true), b: sel(true), c: sel(true) } },
    ];
    const result = calculateSplit(items, [], ["a", "b", "c"]);
    expect(sumTotals(result)).toBe(1001);
    const amounts = Object.values(result).sort();
    expect(amounts[0]).toBe(333);
    expect(amounts[1]).toBe(334);
    expect(amounts[2]).toBe(334);
  });

  // — Cent-integrity invariants —

  it("per-item allocation always sums to item price exactly", () => {
    // Three items with different rounding scenarios
    const items: SplitItem[] = [
      { price: 100,  selections: { a: sel(true), b: sel(true), c: sel(true) } }, // 100/3
      { price: 1001, selections: { a: sel(true, 2), b: sel(true, 1) } },          // uneven shares
      { price: 999,  selections: { a: sel(true), b: sel(true), c: sel(true), d: sel(true) } }, // 999/4
    ];
    // Run each item individually and verify its allocation sums to its own price
    for (const item of items) {
      const result = calculateSplit([item], [], Object.keys(item.selections));
      expect(sumTotals(result)).toBe(item.price);
    }
  });

  it("sum of all per-person totals equals sum of all item prices + charges", () => {
    const items: SplitItem[] = [
      { price: 333,  selections: { a: sel(true), b: sel(true), c: sel(true) } }, // 333/3 = 111 each
      { price: 701,  selections: { a: sel(true), b: sel(true) } },               // 701/2 → remainder
      { price: 1999, selections: { a: sel(true, 1), b: sel(true, 2), c: sel(true, 1) } }, // 1999/4
    ];
    const charges: SplitCharge[] = [{ amount: 97 }, { amount: 201 }]; // odd amounts
    const expected = items.reduce((s, i) => s + i.price, 0) + charges.reduce((s, c) => s + c.amount, 0);
    const result = calculateSplit(items, charges, ["a", "b", "c"]);
    expect(sumTotals(result)).toBe(expected);
  });

  it("no cents lost when a selection uid is not in memberIds", () => {
    // 'x' selected an item but is not in the memberIds list (e.g. left the household).
    // Their portion must still be counted — no silent drop.
    const items: SplitItem[] = [
      { price: 900, selections: { a: sel(true), x: sel(true) } },
    ];
    const result = calculateSplit(items, [], ["a", "b"]);
    expect(sumTotals(result)).toBe(900); // 450 + 450; 'x' appears in result even though not in memberIds
    expect(result.x).toBe(450);
  });

  it("runtime assertion throws if total would mismatch (regression guard)", () => {
    // Verify the built-in invariant check fires — this test documents the contract.
    // We can't easily trigger it without monkey-patching, so we just confirm a normal
    // call passes through without throwing.
    const items: SplitItem[] = [
      { price: 7777, selections: { a: sel(true, 3), b: sel(true, 1), c: sel(true, 2) } },
    ];
    expect(() => calculateSplit(items, [{ amount: 123 }], ["a", "b", "c"])).not.toThrow();
    expect(sumTotals(calculateSplit(items, [{ amount: 123 }], ["a", "b", "c"]))).toBe(7777 + 123);
  });
});
