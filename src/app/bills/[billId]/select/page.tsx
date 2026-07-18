"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Lock, MoreVertical, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBill, useBillItems, useSharedCharges, updateItemSelection, confirmSelections } from "@/lib/bills";
import { useMembers } from "@/lib/household";
import type { SharedChargeType } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const CHARGE_LABELS: Record<SharedChargeType, string> = {
  tax: "Tax",
  tip: "Tip",
  service_charge: "Service charge",
  other: "Other",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function SelectItemsPage() {
  const { billId } = useParams<{ billId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { bill, loading: billLoading } = useBill(billId);
  const { items, loading: itemsLoading } = useBillItems(billId);
  const { charges, loading: chargesLoading } = useSharedCharges(billId);
  const members = useMembers(bill?.householdId ?? null);

  const [sharesItemId, setSharesItemId] = useState<string | null>(null);

  const loading = billLoading || itemsLoading || chargesLoading;
  const uid = user?.uid ?? "";

  function handleToggle(itemId: string, current: { included: boolean; shares: number }) {
    updateItemSelection(billId, itemId, uid, { ...current, included: !current.included });
  }

  function handleShares(itemId: string, current: { included: boolean; shares: number }, delta: number) {
    const next = Math.max(1, current.shares + delta);
    if (next === current.shares) return;
    updateItemSelection(billId, itemId, uid, { ...current, shares: next });
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-body text-muted-foreground">Bill not found.</p>
        <Button variant="outline" onClick={() => router.push("/")}>
          Go home
        </Button>
      </div>
    );
  }

  if (bill.status === "pending_review") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-heading text-foreground">Bill is being reviewed</p>
        <p className="text-body text-muted-foreground">
          The uploader is still reviewing the items. Check back soon.
        </p>
        <Button variant="outline" onClick={() => router.push("/")}>
          Go home
        </Button>
      </div>
    );
  }

  const sharesItem = sharesItemId ? items.find((i) => i.id === sharesItemId) : null;
  const sheetSel = sharesItem?.selections[uid];
  const sheetIncluded = sheetSel?.included ?? true;
  const sheetShares = sheetSel?.shares ?? 1;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-heading text-foreground">
            {bill.restaurantOrStoreName ?? "Select your items"}
          </h1>
          <p className="text-caption text-muted-foreground mt-0.5">
            Check off what you had. Tap ⋮ to split an item with someone outside the household.
          </p>
        </div>

        {/* Column header */}
        <div className="mb-1 flex items-center gap-3 px-4">
          <span className="size-5 shrink-0" />
          <span className="flex-1" />
          <span className="w-16 text-right text-caption text-muted-foreground">Price</span>
          <span className="w-8 shrink-0" />
        </div>

        <div className="flex flex-col gap-2">
          {items.length === 0 && (
            <p className="text-caption text-muted-foreground py-6 text-center">
              No items on this bill.
            </p>
          )}
          {items.map((item) => {
            const sel = item.selections[uid];
            const included = sel?.included ?? true;
            const shares = sel?.shares ?? 1;
            return (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary cursor-pointer"
                    checked={included}
                    onChange={() => handleToggle(item.id, { included, shares })}
                  />
                  <span className="flex-1 text-body text-foreground leading-snug">
                    {item.name}
                  </span>
                  <span className="w-16 text-right font-money text-sm text-muted-foreground tabular-nums">
                    {formatCents(item.price)}
                  </span>
                  {/* Vertical kebab — opens shares bottom sheet */}
                  <button
                    className={`relative flex size-8 shrink-0 items-center justify-center rounded transition-opacity ${
                      included ? "text-muted-foreground hover:bg-secondary" : "opacity-30 cursor-not-allowed"
                    }`}
                    onClick={() => included && setSharesItemId(item.id)}
                    disabled={!included}
                    aria-label="Sharing options"
                  >
                    <MoreVertical className="size-4" />
                    {shares > 1 && (
                      <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                        ×{shares}
                      </span>
                    )}
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Shared charges — locked, always included, split equally */}
        {charges.length > 0 && (
          <>
            <p className="mt-6 mb-1 px-1 text-caption font-medium uppercase tracking-wide text-muted-foreground">
              Shared charges
            </p>
            <div className="flex flex-col gap-2">
              {charges.map((charge) => (
                <Card key={charge.id} className="border-dashed bg-muted/30">
                  <CardContent className="flex items-center gap-3 px-4 py-3">
                    <Lock className="size-5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-body text-muted-foreground leading-snug">
                      {CHARGE_LABELS[charge.type]}
                    </span>
                    <span className="w-16 text-right font-money text-sm text-muted-foreground tabular-nums">
                      {formatCents(charge.amount)}
                    </span>
                    <span className="w-8 shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div className="border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {(() => {
          const confirmedBy = bill?.confirmedBy ?? {};
          const confirmedNames = members
            .filter((m) => confirmedBy[m.id] === true)
            .map((m) => m.displayName.split(" ")[0]);
          return confirmedNames.length > 0 ? (
            <p className="mb-2 text-center text-caption text-muted-foreground">
              Done: {confirmedNames.join(", ")}
            </p>
          ) : null;
        })()}
        <Button
          className="w-full"
          variant={bill?.confirmedBy?.[uid] ? "secondary" : "default"}
          onClick={() => confirmSelections(billId, uid)}
        >
          {bill?.confirmedBy?.[uid] ? "Selections confirmed ✓" : "Confirm my selections"}
        </Button>
        <Button
          variant="ghost"
          className="mt-2 w-full text-muted-foreground"
          onClick={() => router.push("/")}
        >
          Back to home
        </Button>
      </div>

      {/* Shares bottom sheet */}
      {sharesItem && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSharesItemId(null)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card px-6 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-body font-medium text-foreground leading-snug">
                {sharesItem.name}
              </p>
              <button
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => setSharesItemId(null)}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mb-6 text-caption text-muted-foreground">
              Covering someone outside the household? Increase this to pay for extra portions — e.g. set to 2 if you&apos;re paying for yourself and a friend.
            </p>
            <div className="flex items-center justify-center gap-8">
              <button
                className="flex size-10 items-center justify-center rounded-full border text-lg text-muted-foreground hover:bg-secondary disabled:opacity-30"
                onClick={() => handleShares(sharesItem.id, { included: sheetIncluded, shares: sheetShares }, -1)}
                disabled={sheetShares <= 1}
                aria-label="Decrease"
              >
                −
              </button>
              <span className="w-10 text-center font-money text-3xl font-semibold text-foreground tabular-nums">
                {sheetShares}
              </span>
              <button
                className="flex size-10 items-center justify-center rounded-full border text-lg text-muted-foreground hover:bg-secondary"
                onClick={() => handleShares(sharesItem.id, { included: sheetIncluded, shares: sheetShares }, 1)}
                aria-label="Increase"
              >
                +
              </button>
            </div>
            <p className="mt-3 text-center text-caption text-muted-foreground">
              {sheetShares === 1 ? "just you" : `you + ${sheetShares - 1} extra${sheetShares - 1 > 1 ? " people" : " person"}`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
