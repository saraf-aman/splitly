"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Trash2, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getBill, confirmBill } from "@/lib/bills";
import type { Bill } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loading } from "@/components/Loading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  COMMON_CURRENCIES,
  decimalStringToMinorUnits,
  formatCurrencyOption,
  formatDecimalBlur,
  getCurrencySymbol,
  minorUnitsToDecimalString,
} from "@/lib/currency";

interface EditableItem {
  id: string;
  name: string;
  priceStr: string;
  lowConfidence: boolean;
}

export default function ReviewBillPage() {
  const router = useRouter();
  const { groupId, billId } = useParams<{ groupId: string; billId: string }>();
  const { user } = useAuth();
  const uid = useId();

  const [bill, setBill] = useState<Bill | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [taxStr, setTaxStr] = useState("");
  const [tipStr, setTipStr] = useState("");
  const [serviceStr, setServiceStr] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    if (!billId) return;
    getBill(billId)
      .then((b) => {
        if (b) {
          setBill(b);
          const billCurrency = b.currency ?? "USD";
          setCurrency(billCurrency);
          setItems(
            b.parsedResult.items.map((item, i) => ({
              id: `${uid}-${i}`,
              name: item.name,
              priceStr: minorUnitsToDecimalString(item.price, billCurrency),
              lowConfidence: item.lowConfidence,
            }))
          );
          setCounter(b.parsedResult.items.length);
          setTaxStr(minorUnitsToDecimalString(b.parsedResult.tax, billCurrency));
          setTipStr(minorUnitsToDecimalString(b.parsedResult.tip, billCurrency));
          setServiceStr(minorUnitsToDecimalString(b.parsedResult.serviceCharge, billCurrency));
        }
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
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
      { id: `${uid}-new-${counter}`, name: "", priceStr: minorUnitsToDecimalString(0, currency), lowConfidence: false },
    ]);
    setCounter((c) => c + 1);
  }

  async function handleConfirm() {
    if (!bill || !billId) return;
    setSaving(true);
    setConfirmError(null);
    try {
      const confirmedItems = items.map((it) => ({
        name: it.name.trim() || "Item",
        price: decimalStringToMinorUnits(it.priceStr, currency),
        lowConfidence: it.lowConfidence,
      }));

      const charges: { type: "tax" | "tip" | "service_charge"; amount: number }[] = [];
      if (taxStr && decimalStringToMinorUnits(taxStr, currency) > 0)
        charges.push({ type: "tax", amount: decimalStringToMinorUnits(taxStr, currency) });
      if (tipStr && decimalStringToMinorUnits(tipStr, currency) > 0)
        charges.push({ type: "tip", amount: decimalStringToMinorUnits(tipStr, currency) });
      if (serviceStr && decimalStringToMinorUnits(serviceStr, currency) > 0)
        charges.push({ type: "service_charge", amount: decimalStringToMinorUnits(serviceStr, currency) });

      await confirmBill(billId, confirmedItems, charges, currency);
      if (bill.uploadedBy && bill.householdId) {
        fetch("/api/notify-bill-open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            billId,
            groupId: bill.householdId,
            uploaderUid: bill.uploadedBy,
            billName: bill.restaurantOrStoreName ?? null,
          }),
        }).catch(() => {});
      }
      router.push(`/groups/${groupId}/bills/${billId}/select`);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "Couldn't save the bill. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Loading label="Loading bill…" />;
  }

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-body text-muted-foreground">Couldn&apos;t load this bill. Please try again.</p>
        <Button variant="outline" onClick={() => router.push(`/groups/${groupId}`)}>
          Go home
        </Button>
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

  if (bill.status !== "pending_review") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-heading text-foreground">Bill already confirmed</p>
        <p className="text-body text-muted-foreground">This bill has already been confirmed and is open for selections.</p>
        <Button variant="outline" onClick={() => router.push(`/groups/${groupId}`)}>
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
        <Button variant="outline" onClick={() => router.push(`/groups/${groupId}`)}>
          Go home
        </Button>
      </div>
    );
  }

  const hasLowConfidence = items.some((it) => it.lowConfidence);

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

        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-heading text-foreground">
              {bill.restaurantOrStoreName ?? "Review receipt"}
            </h1>
            <p className="text-caption text-muted-foreground mt-0.5">
              Double-check the details below, then continue.
            </p>
          </div>
          <Select value={currency} onValueChange={(value) => value && setCurrency(value)}>
            <SelectTrigger
              size="sm"
              className="shrink-0 border-primary/30 bg-transparent text-primary"
            >
              <SelectValue>{(value: string) => formatCurrencyOption(value)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* Gemini can detect a currency outside this common-list shortcut
                  (e.g. a less common one) — surface it too so the trigger never
                  shows a value with no matching item. */}
              {(
                (COMMON_CURRENCIES as readonly string[]).includes(currency)
                  ? COMMON_CURRENCIES
                  : [currency, ...COMMON_CURRENCIES]
              ).map((code) => (
                <SelectItem key={code} value={code}>
                  {formatCurrencyOption(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          {items.length === 0 && (
            <p className="text-caption text-muted-foreground py-4 text-center">
              No items found — add them manually below.
            </p>
          )}
          {items.map((item) => (
            <Card
              key={item.id}
              className={item.lowConfidence ? "border-amber-300 bg-amber-50/60" : undefined}
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
                    {getCurrencySymbol(currency)}
                  </span>
                  <Input
                    className="h-9 pl-5 pr-2 font-money text-right text-sm"
                    value={item.priceStr}
                    inputMode="decimal"
                    onChange={(e) => updateItem(item.id, { priceStr: e.target.value })}
                    onBlur={(e) => updateItem(item.id, { priceStr: formatDecimalBlur(e.target.value, currency) })}
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
                  {getCurrencySymbol(currency)}
                </span>
                <Input
                  className="h-9 pl-5 pr-2 font-money text-right text-sm"
                  value={value}
                  placeholder="—"
                  inputMode="decimal"
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={(e) => onChange(e.target.value ? formatDecimalBlur(e.target.value, currency) : "")}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t bg-card px-4 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {confirmError && (
          <p className="mb-2 text-center text-xs text-destructive">{confirmError}</p>
        )}
        <Button
          size="lg"
          className="h-12 w-full text-base"
          onClick={handleConfirm}
          disabled={saving}
        >
          {saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
