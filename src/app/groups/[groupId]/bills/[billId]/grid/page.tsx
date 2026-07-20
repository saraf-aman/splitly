"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, Clock, Lock, Pencil, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBill, useBillItems, useSharedCharges, updateMemberSettleStates } from "@/lib/bills";
import { useGroup, useMembers } from "@/lib/group";
import { useSplitwiseStatus } from "@/lib/splitwise";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";
import { calculateSplit, allocateEqually, getActiveParticipants } from "@/lib/splitCalc";
import type { SharedChargeType } from "@/types/firestore";

const CHARGE_LABELS: Record<SharedChargeType, string> = {
  tax: "Tax",
  tip: "Tip",
  service_charge: "Service charge",
  other: "Other",
};

type SwDialog =
  | "idle"
  | "not-connected"
  | "no-group"
  | "not-settled"
  | "already-pushed"
  | "resolver"
  | "pushing"
  | "error";

export default function GridPage() {
  const { groupId, billId } = useParams<{ groupId: string; billId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { bill, loading: billLoading } = useBill(billId);
  const { items, loading: itemsLoading } = useBillItems(billId);
  const { charges, loading: chargesLoading } = useSharedCharges(billId);
  const members = useMembers(bill?.householdId ?? null);
  const group = useGroup(bill?.householdId ?? null);
  const swStatus = useSplitwiseStatus(user?.uid);

  // Settle sheet state
  const [settleSheetOpen, setSettleSheetOpen] = useState(false);
  const [settleStates, setSettleStates] = useState<Record<string, boolean>>({});
  const [settleSaving, setSettleSaving] = useState(false);

  // Splitwise dialog state
  const [swDialog, setSwDialog] = useState<SwDialog>("idle");
  const [swError, setSwError] = useState<string | null>(null);
  const [warnedDuplicate, setWarnedDuplicate] = useState(false);

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
        <Button variant="outline" onClick={() => router.push(`/groups/${groupId}`)}>
          Go home
        </Button>
      </div>
    );
  }

  const confirmedBy = bill.confirmedBy ?? {};
  const confirmedCount = members.filter((m) => confirmedBy[m.id]).length;
  const isUploader = bill.uploadedBy === uid;
  const isSettled = members.length > 0 && members.every((m) => confirmedBy[m.id]);

  const memberIds = members.map((m) => m.id);
  const activeParticipants = getActiveParticipants(items, memberIds);
  const totals = memberIds.length > 0 ? calculateSplit(items, charges, memberIds) : null;

  // Resolve which members have a Splitwise user ID (for the resolver sheet preview)
  const resolvedMembers = members.filter((m) => !!m.splitwiseUserId);
  const unresolvedMembers = members.filter((m) => !m.splitwiseUserId);

  // ── Settle sheet ────────────────────────────────────────────────────────────

  function openSettleSheet() {
    const init: Record<string, boolean> = {};
    for (const m of members) init[m.id] = !!(confirmedBy[m.id]);
    setSettleStates(init);
    setSettleSheetOpen(true);
  }

  const allSettled = members.length > 0 && members.every((m) => settleStates[m.id]);

  function toggleSettleAll() {
    const next = !allSettled;
    const updated: Record<string, boolean> = {};
    for (const m of members) updated[m.id] = next;
    setSettleStates(updated);
  }

  async function saveSettleStates() {
    setSettleSaving(true);
    try {
      const diff: Record<string, boolean> = {};
      const changes: { uid: string; settled: boolean }[] = [];
      for (const m of members) {
        const prev = !!(confirmedBy[m.id]);
        const next = settleStates[m.id] ?? false;
        if (prev !== next) {
          diff[m.id] = next;
          if (m.id !== uid) changes.push({ uid: m.id, settled: next });
        }
      }
      if (Object.keys(diff).length > 0) {
        await updateMemberSettleStates(billId, diff);
        if (changes.length > 0) {
          const ownerName = members.find((m) => m.id === uid)?.displayName ?? "The bill owner";
          void fetch("/api/notify-settle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              groupId: bill!.householdId,
              billId,
              billName: bill!.restaurantOrStoreName,
              ownerName,
              changes,
            }),
          });
        }
      }
      setSettleSheetOpen(false);
    } finally {
      setSettleSaving(false);
    }
  }

  // ── Splitwise push ──────────────────────────────────────────────────────────

  function handleSplitwisePush() {
    if (!swStatus.connected) { setSwDialog("not-connected"); return; }
    if (!group?.splitwiseGroupId) { setSwDialog("no-group"); return; }
    if (!isSettled) { setSwDialog("not-settled"); return; }
    if (bill!.splitwiseExpenseId && !warnedDuplicate) { setSwDialog("already-pushed"); return; }
    setSwDialog("resolver");
  }

  async function executePush() {
    setSwDialog("pushing");
    setSwError(null);
    try {
      const idToken = await user!.getIdToken();
      const res = await fetch("/api/splitwise/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ billId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Push failed");
      }
      setWarnedDuplicate(false);
      setSwDialog("idle");
    } catch (e) {
      setSwError(e instanceof Error ? e.message : "Push failed");
      setSwDialog("error");
    }
  }

  const swButtonLabel = bill.splitwiseExpenseId ? "Push to Splitwise again" : "Push to Splitwise";

  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="flex-1 overflow-y-auto">

        {/* Status banner — tappable by bill uploader to manage settle */}
        <div
          className={`border-b bg-card px-4 py-3 ${isUploader ? "cursor-pointer active:bg-muted/50" : ""}`}
          onClick={isUploader ? openSettleSheet : undefined}
          role={isUploader ? "button" : undefined}
          aria-label={isUploader ? "Manage bill settlement" : undefined}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-caption text-muted-foreground">
              {confirmedCount} of {members.length} confirmed
            </p>
            {isUploader && (
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            )}
          </div>
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

        {/* Edit my selections — above the grid */}
        <div className="px-4 pt-3 pb-1">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 active:bg-amber-200 transition-colors"
            onClick={() => router.push(`/groups/${groupId}/bills/${billId}/select`)}
          >
            <Pencil className="size-3.5" />
            Edit my selections
          </button>
        </div>

        {/* Scrollable grid */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted">
                <th className="sticky left-0 z-10 bg-muted min-w-[130px] max-w-[180px] px-4 py-2.5 text-left text-caption font-medium text-muted-foreground">
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
                        confirmed ? "text-foreground" : "bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center justify-center gap-1">
                          {!confirmed && <Clock className="size-3 shrink-0" />}
                          <span className="truncate">{firstName}</span>
                        </div>
                        {canEdit && (
                          <button
                            className="flex items-center gap-0.5 rounded border border-amber-300 px-1.5 py-0.5 text-[10px] font-normal text-amber-700 hover:bg-amber-50"
                            onClick={() =>
                              router.push(
                                `/groups/${groupId}/bills/${billId}/select?as=${m.id}`,
                              )
                            }
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
                    style={{
                      backgroundColor:
                        idx % 2 === 0 ? "hsl(var(--background))" : "hsl(var(--card))",
                    }}
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
                    const included = sel?.included ?? confirmed;
                    const shares = sel?.shares ?? 1;
                    const uploaderSet = sel?.setBy && sel.setBy !== m.id;

                    let cellContent: React.ReactNode;
                    if (!sel || !included) {
                      cellContent = <span className="text-muted-foreground/30">—</span>;
                    } else if (uploaderSet || m.id === uid) {
                      cellContent = (
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            uploaderSet ? "bg-amber-500 text-white" : "bg-green-500 text-white"
                          }`}
                        >
                          <Check className="size-3 shrink-0" />
                          {shares > 1 && <span>×{shares}</span>}
                        </span>
                      );
                    } else {
                      cellContent = (
                        <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold bg-stone-300 text-stone-600">
                          <Check className="size-3 shrink-0" />
                          {shares > 1 && <span>×{shares}</span>}
                        </span>
                      );
                    }

                    return (
                      <td
                        key={m.id}
                        className={`px-2 py-2.5 text-center ${!confirmed ? "bg-muted/60" : ""}`}
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
                <tr className="border-t-2 border-border">
                  <td
                    colSpan={members.length + 1}
                    className="sticky left-0 z-10 bg-slate-100 px-4 pt-3 pb-1"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Shared charges
                    </span>
                  </td>
                </tr>
                {charges.map((charge) => {
                  const alloc = allocateEqually(charge.amount, activeParticipants);
                  return (
                    <tr key={charge.id} className="bg-slate-100">
                      <td className="sticky left-0 z-10 bg-slate-100 min-w-[130px] max-w-[180px] px-4 py-2.5">
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
              <tr className="border-t-2 border-primary/40 bg-teal-50">
                <td className="sticky left-0 z-10 px-4 py-3 bg-teal-50">
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
                      className={`px-2 py-3 text-center font-semibold tabular-nums font-mono ${
                        confirmed ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Push to Splitwise — flex spacer mirrors the sticky item column width */}
        {isUploader && (
          <div className="flex pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <div className="w-[130px] shrink-0" />
            <div className="px-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
                onClick={handleSplitwisePush}
              >
                Push to Splitwise
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Settle sheet ────────────────────────────────────────────────────── */}
      {settleSheetOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => !settleSaving && setSettleSheetOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card px-6 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-body font-semibold text-foreground">Manage settlement</p>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => !settleSaving && setSettleSheetOpen(false)}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Settle all */}
            <label className="mb-3 flex items-center gap-3 border-b pb-3 cursor-pointer">
              <input
                type="checkbox"
                className="size-5 shrink-0 cursor-pointer accent-primary"
                checked={allSettled}
                onChange={toggleSettleAll}
              />
              <span className="text-body font-medium text-foreground">Settle all</span>
            </label>

            {/* Per-member rows */}
            <div className="flex flex-col gap-2 mb-5">
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 cursor-pointer accent-primary"
                    checked={settleStates[m.id] ?? false}
                    onChange={(e) =>
                      setSettleStates((prev) => ({ ...prev, [m.id]: e.target.checked }))
                    }
                  />
                  <span className="flex-1 text-body text-foreground">
                    {m.displayName.split(" ")[0]}
                    {m.id === uid && (
                      <span className="ml-1.5 text-caption text-muted-foreground">(you)</span>
                    )}
                  </span>
                  {confirmedBy[m.id] && (
                    <span className="text-caption text-primary">confirmed</span>
                  )}
                </label>
              ))}
            </div>

            <Button
              className="w-full"
              disabled={settleSaving}
              onClick={saveSettleStates}
            >
              {settleSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </>
      )}

      {/* ── Splitwise dialogs ────────────────────────────────────────────────── */}

      {/* Not connected */}
      {swDialog === "not-connected" && (
        <SwModal
          title="Connect Splitwise"
          message="You need to connect your Splitwise account before pushing expenses."
          confirmLabel="Connect now"
          onConfirm={() => {
            setSwDialog("idle");
            router.push(`/groups/${groupId}?sw_connect=1`);
          }}
          onCancel={() => setSwDialog("idle")}
        />
      )}

      {/* No group linked */}
      {swDialog === "no-group" && (
        <SwModal
          title="No Splitwise group linked"
          message="Ask the group creator to link a Splitwise group from the navigation drawer."
          confirmLabel="Got it"
          onConfirm={() => setSwDialog("idle")}
          onCancel={null}
        />
      )}

      {/* Not settled */}
      {swDialog === "not-settled" && (
        <SwModal
          title="Bill not settled"
          message="Please settle the bill before pushing the expense to Splitwise."
          confirmLabel="Got it"
          onConfirm={() => setSwDialog("idle")}
          onCancel={null}
        />
      )}

      {/* Already pushed — amber duplicate warning */}
      {swDialog === "already-pushed" && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSwDialog("idle")} />
          <div className="fixed inset-x-6 top-1/2 z-50 -translate-y-1/2 rounded-2xl bg-card px-6 py-5 shadow-xl border border-amber-300">
            <div className="flex items-start gap-3 mb-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="size-4 text-amber-600" />
              </div>
              <div>
                <p className="text-body font-semibold text-foreground">Already pushed</p>
                <p className="mt-1 text-caption text-muted-foreground">
                  This will create a duplicate expense in Splitwise.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setSwDialog("idle")}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => {
                  setWarnedDuplicate(true);
                  setSwDialog("resolver");
                }}
              >
                Push anyway
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Resolver sheet */}
      {swDialog === "resolver" && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSwDialog("idle")} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card px-6 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-body font-semibold text-foreground">Push to Splitwise</p>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setSwDialog("idle")}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            {resolvedMembers.length > 0 && (
              <div className="mb-3">
                <p className="text-caption text-muted-foreground mb-1.5">Will be included</p>
                <div className="flex flex-col gap-1">
                  {resolvedMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <Check className="size-3.5 text-green-600 shrink-0" />
                      <span className="text-body text-foreground">{m.displayName.split(" ")[0]}</span>
                      {totals && (
                        <span className="ml-auto font-mono text-sm text-muted-foreground tabular-nums">
                          {formatCents(totals[m.id] ?? 0)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {unresolvedMembers.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-caption text-amber-800 font-medium mb-1">Will be omitted</p>
                <div className="flex flex-col gap-1">
                  {unresolvedMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className="size-3.5 shrink-0 text-center text-amber-600 text-xs leading-none">!</span>
                      <span className="text-caption text-amber-900">{m.displayName.split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-amber-700">
                  These members don&apos;t have a linked Splitwise account. An admin can set their
                  Splitwise email on the manage page.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setSwDialog("idle")}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={resolvedMembers.length === 0}
                onClick={executePush}
              >
                {resolvedMembers.length === 0 ? "No one to push" : swButtonLabel}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Pushing spinner */}
      {swDialog === "pushing" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-2xl bg-card px-8 py-6 shadow-xl">
            <p className="text-body text-foreground text-center">Pushing to Splitwise…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {swDialog === "error" && (
        <SwModal
          title="Push failed"
          message={swError ?? "Something went wrong. Please try again."}
          confirmLabel="OK"
          onConfirm={() => setSwDialog("idle")}
          onCancel={null}
        />
      )}
    </div>
  );
}

// ── Small reusable modal ──────────────────────────────────────────────────────

function SwModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: (() => void) | null;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onCancel ?? onConfirm} />
      <div className="fixed inset-x-6 top-1/2 z-50 -translate-y-1/2 rounded-2xl bg-card px-6 py-5 shadow-xl">
        <p className="text-body font-semibold text-foreground mb-2">{title}</p>
        <p className="text-caption text-muted-foreground mb-5">{message}</p>
        <div className="flex gap-3">
          {onCancel && (
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button className={onCancel ? "flex-1" : "w-full"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
