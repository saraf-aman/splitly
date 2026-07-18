"use client";

import { useParams, useRouter } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBill, useBillItems } from "@/lib/bills";
import { useMembers } from "@/lib/household";
import { Button } from "@/components/ui/button";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function GridPage() {
  const { billId } = useParams<{ billId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { bill, loading: billLoading } = useBill(billId);
  const { items, loading: itemsLoading } = useBillItems(billId);
  const members = useMembers(bill?.householdId ?? null);

  const loading = billLoading || itemsLoading;
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
        <Button variant="outline" onClick={() => router.push("/")}>
          Go home
        </Button>
      </div>
    );
  }

  const confirmedBy = bill.confirmedBy ?? {};
  const confirmedCount = members.filter((m) => confirmedBy[m.id] === true).length;

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
              const confirmed = confirmedBy[m.id] === true;
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
                {/* Sticky item column header */}
                <th className="sticky left-0 z-10 bg-card min-w-[130px] max-w-[180px] px-4 py-2.5 text-left text-caption font-medium text-muted-foreground">
                  Item
                </th>
                {members.map((m) => {
                  const confirmed = confirmedBy[m.id] === true;
                  const firstName = m.displayName.split(" ")[0];
                  return (
                    <th
                      key={m.id}
                      className={`min-w-[64px] px-2 py-2.5 text-center text-caption font-medium ${
                        confirmed ? "text-foreground" : "bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        {!confirmed && <Clock className="size-3 shrink-0" />}
                        <span className="truncate">{firstName}</span>
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
                  {/* Sticky item name + price */}
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
                    const confirmed = confirmedBy[m.id] === true;
                    const sel = item.selections[m.id];
                    const included = sel?.included ?? false;
                    const shares = sel?.shares ?? 1;
                    const isSelf = m.id === uid;

                    let cellContent: React.ReactNode;
                    if (!sel) {
                      cellContent = <span className="text-muted-foreground/40">—</span>;
                    } else if (included) {
                      cellContent = (
                        <span
                          className={`inline-flex items-center gap-0.5 font-medium ${
                            isSelf ? "text-primary" : "text-foreground"
                          }`}
                        >
                          <Check className="size-3.5 shrink-0" />
                          {shares > 1 && (
                            <span className="text-xs">×{shares}</span>
                          )}
                        </span>
                      );
                    } else {
                      cellContent = <span className="text-muted-foreground/40">—</span>;
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
          </table>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button
          className="w-full"
          variant="default"
          onClick={() => router.push(`/bills/${billId}/select`)}
        >
          Edit my selections
        </Button>
        <Button
          variant="ghost"
          className="mt-2 w-full text-muted-foreground"
          onClick={() => router.push("/")}
        >
          Back to home
        </Button>
      </div>
    </div>
  );
}
