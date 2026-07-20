"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Lock, MoreVertical, Pencil, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBill, useBillItems, useSharedCharges, updateItemSelection, confirmSelections } from "@/lib/bills";
import { useMembers } from "@/lib/group";
import type { SharedChargeType } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

const CHARGE_LABELS: Record<SharedChargeType, string> = {
  tax: "Tax",
  tip: "Tip",
  service_charge: "Service charge",
  other: "Other",
};

export default function SelectItemsPage() {
  const { groupId, billId } = useParams<{ groupId: string; billId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { bill, loading: billLoading } = useBill(billId);
  const { items, loading: itemsLoading } = useBillItems(billId);
  const { charges, loading: chargesLoading } = useSharedCharges(billId);
  const members = useMembers(bill?.householdId ?? null);

  const [sharesItemId, setSharesItemId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const loading = billLoading || itemsLoading || chargesLoading;
  const uid = user?.uid ?? "";

  const asParam = searchParams.get("as");
  const isUploader = bill?.uploadedBy === uid;
  const overrideMemberId = isUploader && asParam && asParam !== uid ? asParam : null;
  const targetUid = overrideMemberId ?? uid;
  const overrideMember = overrideMemberId ? members.find((m) => m.id === overrideMemberId) : null;

  function handleToggle(itemId: string, current: { included: boolean; shares: number }) {
    updateItemSelection(
      billId, itemId, targetUid,
      { ...current, included: !current.included },
      overrideMemberId ? uid : undefined,
    );
  }

  function handleShares(itemId: string, current: { included: boolean; shares: number }, delta: number) {
    const next = Math.max(1, current.shares + delta);
    if (next === current.shares) return;
    updateItemSelection(
      billId, itemId, targetUid,
      { ...current, shares: next },
      overrideMemberId ? uid : undefined,
    );
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
        <Button variant="outline" onClick={() => router.push(`/groups/${groupId}`)}>
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
        <Button variant="outline" onClick={() => router.push(`/groups/${groupId}`)}>
          Go home
        </Button>
      </div>
    );
  }

  const sharesItem = sharesItemId ? items.find((i) => i.id === sharesItemId) : null;
  const sheetSel = sharesItem?.selections[targetUid];
  const sheetIncluded = sheetSel?.included ?? (!overrideMemberId);
  const sheetShares = sheetSel?.shares ?? 1;
  const overrideName = overrideMember?.displayName.split(" ")[0] ?? "them";

  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-10">
        <Link
          href={`/groups/${groupId}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={15} />
          Home
        </Link>

        {overrideMember && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-100 px-4 py-3">
            <Pencil className="size-4 shrink-0 text-amber-700" />
            <p className="text-caption text-amber-900">
              Editing <span className="font-semibold">{overrideMember.displayName.split(" ")[0]}</span>&apos;s selections on their behalf
            </p>
          </div>
        )}

        <div className="mb-4">
          <h1 className="text-heading text-foreground">
            {bill.restaurantOrStoreName ?? "Select your items"}
          </h1>
          <p className="text-caption text-muted-foreground mt-0.5">
            {overrideMember
              ? `Check off what ${overrideName} had. Tap ⋮ to adjust their share count.`
              : "Check off what you had. Tap ⋮ to split an item with someone outside the group."}
          </p>
        </div>

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
            const sel = item.selections[targetUid];
            const included = sel?.included ?? (!overrideMemberId);
            const shares = sel?.shares ?? 1;
            const uploaderSet = !!sel?.setBy && sel.setBy !== targetUid;
            return (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    className={`size-5 shrink-0 cursor-pointer ${uploaderSet ? "accent-amber-700" : "accent-primary"}`}
                    checked={included}
                    onChange={() => handleToggle(item.id, { included, shares })}
                  />
                  <span className="flex-1 text-body text-foreground leading-snug">
                    {item.name}
                  </span>
                  <span className="w-16 text-right font-money text-sm text-muted-foreground tabular-nums">
                    {formatCents(item.price)}
                  </span>
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

      <div className="border-t bg-card px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {overrideMember ? (
          <Button
            className="w-full bg-amber-700 text-white hover:bg-amber-800"
            onClick={() => router.push(`/groups/${groupId}/bills/${billId}/grid`)}
          >
            Save
          </Button>
        ) : (
          <>
            {confirmError && (
              <p className="mb-2 text-xs text-destructive text-center">{confirmError}</p>
            )}
            <Button
              className="w-full"
              variant="default"
              disabled={confirming || !uid}
              onClick={async () => {
                setConfirming(true);
                setConfirmError(null);
                console.log("[confirm] uid:", uid, "billId:", billId, "items:", items.length);
                try {
                  await confirmSelections(billId, uid, items);
                  router.push(`/groups/${groupId}/bills/${billId}/grid`);
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  console.error("[confirm] failed:", msg);
                  setConfirmError(msg);
                } finally {
                  setConfirming(false);
                }
              }}
            >
              {confirming ? "Saving…" : "Confirm"}
            </Button>
          </>
        )}
      </div>

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
              {overrideMember
                ? `Is ${overrideName} covering someone outside the household? Increase this — e.g. set to 2 if they're paying for themselves and a friend.`
                : "Covering someone outside the group? Increase this to pay for extra portions — e.g. set to 2 if you're paying for yourself and a friend."}
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
              {sheetShares === 1
                ? (overrideMember ? `just ${overrideName}` : "just you")
                : overrideMember
                ? `${overrideName} + ${sheetShares - 1} extra${sheetShares - 1 > 1 ? " people" : " person"}`
                : `you + ${sheetShares - 1} extra${sheetShares - 1 > 1 ? " people" : " person"}`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
