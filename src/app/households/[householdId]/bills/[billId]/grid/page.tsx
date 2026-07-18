"use client";

import { useParams, useRouter } from "next/navigation";
import { Check, Clock, Lock, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBill, useBillItems, useSharedCharges } from "@/lib/bills";
import { useMembers } from "@/lib/household";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";
import { calculateSplit, allocateEqually } from "@/lib/splitCalc";
import type { SharedChargeType } from "@/types/firestore";

const CHARGE_LABELS: Record<SharedChargeType, string> = {
  tax: "Tax",
  tip: "Tip",
  service_charge: "Service charge",
  other: "Other",
};

export default function GridPage() {
  const { householdId, billId } = useParams<{ householdId: string; billId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { bill, loading: billLoading } = useBill(billId);
  const { items, loading: itemsLoading } = useBillItems(billId);
  const { charges, loading: chargesLoading } = useSharedCharges(billId);
  const members = useMembers(bill?.householdId ?? null);

  const loading = billLoading || itemsLoading || chargesLoading;
  const uid = user?.uid ?? "";

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
        <Button variant="outline" onClick={() => router.push(`/households/${householdId}`)}>
          Go home
        </Button>
      </div>
    );
  }

  const confirmedBy = bill.confirmedBy ?? {};
  const confirmedCount = members.filter((m) => confirmedBy[m.id]).length;
  const isUploader = bill.uploadedBy === uid;

  const memberIds = members.map((m) => m.id);
  const totals = memberIds.length > 0 ? calculateSplit(items, charges, memberIds) : null;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="flex-1 overflow-y-auto">
        {/* Status banner */}
        <div className="border-b bg-card px-4 py-3">
          <p className="text-caption text-muted-foreground mb-2">
            {confirmedCount} of {members.length} confirmed
          </p>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const confirmed = confirmedBy[m.id];
              const firstName = m.displayName.split(" ")[0];
              return (
                <span
                  key={m.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    confirmed
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {!confirmed && <Clock className="size-3" />}
                  {firstName}
                  {confirmed && <Check className="size-3" />}
                </span>
              );
            })}
          </div>
        </div>

        {/* Scrollable grid */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 z-10 bg-card min-w-[130px] max-w-[180px] px-4 py-2.5 text-left text-caption font-medium text-muted-foreground">
                  Item
                </th>
                {members.map((m) => {
                  const confirmed = confirmedBy[m.id];
                  const firstName = m.displayName.split(" ")[0];
                  const canEdit = isUploader && m.id !== uid;
                  return (
                    <th
                      key={m.id}
                      className={`min-w-[72px] px-2 py-2 text-center text-caption font-medium ${
                        confirmed ? "text-foreground" : "bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center justify-center gap-1">
                          {!confirmed && <Clock className="size-3 shrink-0" />}
                          <span className="truncate">{firstName}</span>
                        </div>
                        {canEdit && (
                          <button
                            className="flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground hover:bg-secondary"
                            onClick={() => router.push(`/households/${householdId}/bills/${billId}/select?as=${m.id}`)}
                          >
                            <Pencil className="size-2.5" />
                            Edit
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={members.length + 1}
                    className="px-4 py-8 text-center text-caption text-muted-foreground"
                  >
                    No items on this bill.
                  </td>
                </tr>
              )}
              {items.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? "bg-background" : "bg-card"}>
                  <td
                    className="sticky left-0 z-10 min-w-[130px] max-w-[180px] px-4 py-2.5"
                    style={{ backgroundColor: idx % 2 === 0 ? "hsl(var(--background))" : "hsl(var(--card))" }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-body text-foreground leading-snug line-clamp-2">
                        {item.name}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {formatCents(item.price)}
                      </span>
                    </div>
                  </td>
                  {members.map((m) => {
                    const confirmed = confirmedBy[m.id];
                    const sel = item.selections[m.id];
                    const included = sel?.included ?? (confirmed);
                    const shares = sel?.shares ?? 1;
                    const isSelf = m.id === uid;
                    const uploaderSet = sel?.setBy && sel.setBy !== m.id;

                    let cellContent: React.ReactNode;
                    if (!sel || !included) {
                      cellContent = <span className="text-muted-foreground/30">—</span>;
                    } else {
                      cellContent = (
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            uploaderSet
                              ? "bg-amber-500 text-white"
                              : isSelf
                              ? "bg-green-500 text-white"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          <Check className="size-3 shrink-0" />
                          {shares > 1 && <span>×{shares}</span>}
                        </span>
                      );
                    }

                    return (
                      <td
                        key={m.id}
                        className={`px-2 py-2.5 text-center ${!confirmed ? "bg-muted/30" : ""}`}
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>

            {charges.length > 0 && memberIds.length > 0 && (
              <tbody>
                <tr>
                  <td
                    colSpan={members.length + 1}
                    className="sticky left-0 z-10 bg-muted/20 px-4 pt-3 pb-1"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Shared charges
                    </span>
                  </td>
                </tr>
                {charges.map((charge) => {
                  const alloc = allocateEqually(charge.amount, memberIds);
                  return (
                    <tr key={charge.id} className="bg-muted/20">
                      <td className="sticky left-0 z-10 bg-muted/20 min-w-[130px] max-w-[180px] px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Lock className="size-3 shrink-0 text-muted-foreground" />
                          <span className="text-body text-muted-foreground leading-snug">
                            {CHARGE_LABELS[charge.type]}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                          {formatCents(charge.amount)}
                        </span>
                      </td>
                      {members.map((m) => (
                        <td
                          key={m.id}
                          className="px-2 py-2.5 text-center font-mono text-xs text-muted-foreground tabular-nums"
                        >
                          {formatCents(alloc[m.id] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            )}

            <tfoot>
              <tr className="border-t-2 border-border">
                <td
                  className="sticky left-0 z-10 bg-card px-4 py-3"
                  style={{ borderTop: "2px solid hsl(var(--border))" }}
                >
                  <span className="text-body font-semibold text-foreground">Total</span>
                </td>
                {members.map((m) => {
                  const confirmed = confirmedBy[m.id];
                  const total = totals?.[m.id] ?? 0;
                  const display = !totals
                    ? "…"
                    : confirmed
                    ? formatCents(total)
                    : `~${formatCents(total)}`;
                  return (
                    <td
                      key={m.id}
                      className={`px-2 py-3 text-center font-semibold tabular-nums ${
                        confirmed ? "text-foreground font-mono" : "text-muted-foreground font-mono"
                      } ${!confirmed ? "bg-muted/30" : ""}`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button
          className="w-full"
          variant="default"
          onClick={() => router.push(`/households/${householdId}/bills/${billId}/select`)}
        >
          Edit my selections
        </Button>
      </div>
    </div>
  );
}
