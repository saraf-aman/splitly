"use client";

import { useEffect, useId, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { AlertTriangle, Trash2, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getBill, confirmBill } from "@/lib/bills";
import type { Bill } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface EditableItem {
  id: string;
  name: string;
  priceStr: string; // dollar string shown in input, e.g. "11.87"
  lowConfidence: boolean;
}

function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function dollarsToCents(str: string): number {
  const n = parseFloat(str);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function formatBlur(str: string): string {
  const n = parseFloat(str);
  return isNaN(n) ? "0.00" : n.toFixed(2);
}

export default function ReviewBillPage() {
  const router = useRouter();
  const { billId } = useParams<{ billId: string }>();
  const { user } = useAuth();
  const uid = useId();

  const [bill, setBill] = useState<Bill | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [taxStr, setTaxStr] = useState("");
  const [tipStr, setTipStr] = useState("");
  const [serviceStr, setServiceStr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    if (!billId) return;
    getBill(billId).then((b) => {
      if (b) {
        setBill(b);
        setItems(
          b.parsedResult.items.map((item, i) => ({
            id: `${uid}-${i}`,
            name: item.name,
            priceStr: centsToDollars(item.price),
            lowConfidence: item.lowConfidence,
          }))
        );
        setCounter(b.parsedResult.items.length);
        setTaxStr(centsToDollars(b.parsedResult.tax));
        setTipStr(centsToDollars(b.parsedResult.tip));
        setServiceStr(centsToDollars(b.parsedResult.serviceCharge));
      }
      setLoading(false);
    });
  }, [billId, uid]);

  function updateItem(id: string, patch: Partial<EditableItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function deleteItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: `${uid}-new-${counter}`, name: "", priceStr: "0.00", lowConfidence: false },
    ]);
    setCounter((c) => c + 1);
  }

  async function handleConfirm() {
    if (!bill || !billId) return;
    setSaving(true);
    try {
      const confirmedItems = items.map((it) => ({
        name: it.name.trim() || "Item",
        price: dollarsToCents(it.priceStr),
        lowConfidence: it.lowConfidence,
      }));

      const charges: { type: "tax" | "tip" | "service_charge"; amount: number }[] = [];
      if (taxStr && dollarsToCents(taxStr) > 0)
        charges.push({ type: "tax", amount: dollarsToCents(taxStr) });
      if (tipStr && dollarsToCents(tipStr) > 0)
        charges.push({ type: "tip", amount: dollarsToCents(tipStr) });
      if (serviceStr && dollarsToCents(serviceStr) > 0)
        charges.push({ type: "service_charge", amount: dollarsToCents(serviceStr) });

      await confirmBill(billId, confirmedItems, charges);
      router.push("/");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading bill…</p>
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

  if (bill.status !== "pending_review") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-heading text-foreground">Bill already confirmed</p>
        <p className="text-body text-muted-foreground">This bill has already been confirmed and is open for selections.</p>
        <Button variant="outline" onClick={() => router.push("/")}>
          Go home
        </Button>
      </div>
    );
  }

  if (user && bill.uploadedBy !== user.uid) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-heading text-foreground">Bill is being reviewed</p>
        <p className="text-body text-muted-foreground">
          The person who uploaded this bill is reviewing the items. Check back soon.
        </p>
        <Button variant="outline" onClick={() => router.push("/")}>
          Go home
        </Button>
      </div>
    );
  }

  const hasLowConfidence = items.some((it) => it.lowConfidence);

  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-heading text-foreground">
            {bill.restaurantOrStoreName ?? "Review receipt"}
          </h1>
          <p className="text-caption text-muted-foreground mt-0.5">
            Edit items if anything looks wrong, then confirm.
          </p>
        </div>

        {/* Item rows */}
        <div className="flex flex-col gap-2">
          {items.length === 0 && (
            <p className="text-caption text-muted-foreground py-4 text-center">
              No items found — add them manually below.
            </p>
          )}
          {items.map((item) => (
            <Card
              key={item.id}
              className={
                item.lowConfidence
                  ? "border-amber-300 bg-amber-50/60"
                  : undefined
              }
            >
              <CardContent className="flex items-center gap-2 px-3 py-2">
                {item.lowConfidence ? (
                  <AlertTriangle
                    className="size-4 shrink-0 text-amber-500"
                    aria-label="AI low confidence — please double-check"
                  />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <Input
                  className="flex-1 h-9 text-sm"
                  value={item.name}
                  placeholder="Item name"
                  onChange={(e) => updateItem(item.id, { name: e.target.value })}
                />
                <div className="relative w-24 shrink-0">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    className="h-9 pl-5 pr-2 font-money text-right text-sm"
                    value={item.priceStr}
                    inputMode="decimal"
                    onChange={(e) => updateItem(item.id, { priceStr: e.target.value })}
                    onBlur={(e) => updateItem(item.id, { priceStr: formatBlur(e.target.value) })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteItem(item.id)}
                  aria-label="Remove item"
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button variant="outline" className="mt-2 w-full gap-1.5" onClick={addItem}>
          <Plus className="size-4" />
          Add item
        </Button>

        {hasLowConfidence && (
          <p className="mt-3 flex items-center gap-1.5 text-caption text-amber-600">
            <AlertTriangle className="size-3.5 shrink-0" />
            Highlighted items may have been misread — please verify.
          </p>
        )}

        {/* Shared charges */}
        <div className="mt-6 flex flex-col gap-2">
          <p className="text-caption font-medium text-muted-foreground uppercase tracking-wide">
            Shared charges
          </p>
          {(
            [
              { label: "Tax", value: taxStr, onChange: setTaxStr },
              { label: "Tip", value: tipStr, onChange: setTipStr },
              { label: "Service charge", value: serviceStr, onChange: setServiceStr },
            ] as const
          ).map(({ label, value, onChange }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-body text-foreground w-32 shrink-0">{label}</span>
              <div className="relative w-28">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  className="h-9 pl-5 pr-2 font-money text-right text-sm"
                  value={value}
                  placeholder="—"
                  inputMode="decimal"
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={(e) => onChange(e.target.value ? formatBlur(e.target.value) : "")}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky confirm */}
      <div className="border-t bg-card px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button
          size="lg"
          className="h-12 w-full text-base"
          onClick={handleConfirm}
          disabled={saving}
        >
          {saving ? "Saving…" : "Confirm bill"}
        </Button>
      </div>
    </div>
  );
}
