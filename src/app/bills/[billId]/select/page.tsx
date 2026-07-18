"use client";

import { useParams, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBill, useBillItems, useSharedCharges, updateItemSelection } from "@/lib/bills";
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

  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-heading text-foreground">
            {bill.restaurantOrStoreName ?? "Select your items"}
          </h1>
          <p className="text-caption text-muted-foreground mt-0.5">
            Check off what you had. Adjust shares for split items.
          </p>
        </div>

        {/* Column header */}
        <div className="mb-1 flex items-center gap-3 px-4">
          <span className="size-5 shrink-0" />
          <span className="flex-1" />
          <span className="w-16 text-right text-caption text-muted-foreground">Price</span>
          <span className="w-20 text-center text-caption text-muted-foreground">Shares</span>
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
                  <div className="flex w-20 shrink-0 items-center justify-between">
                    <button
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-30"
                      onClick={() => handleShares(item.id, { included, shares }, -1)}
                      disabled={shares <= 1}
                      aria-label="Decrease shares"
                    >−</button>
                    <span className="w-4 text-center font-money text-sm text-foreground">{shares}</span>
                    <button
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
                      onClick={() => handleShares(item.id, { included, shares }, 1)}
                      aria-label="Increase shares"
                    >+</button>
                  </div>
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
                    {/* Spacer to align with items' shares stepper */}
                    <div className="w-20 shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sticky bottom bar — "confirm my selections" button added in 5.4 */}
      <div className="border-t bg-card px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button variant="outline" className="w-full" onClick={() => router.push("/")}>
          Back to home
        </Button>
      </div>
    </div>
  );
}
