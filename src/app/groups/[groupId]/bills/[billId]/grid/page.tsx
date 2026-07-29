"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Bell, Check, ChevronRight, Lock, Pencil, Users, X } from "lucide-react";
import { MemberAvatar } from "@/components/MemberAvatar";
import { useAuth } from "@/lib/auth-context";
import { useBill, useBillItems, useSharedCharges, updateMemberSettleStates, setBillParticipants } from "@/lib/bills";
import { useGroup, useMembers } from "@/lib/group";
import { useSplitwiseStatus } from "@/lib/splitwise";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/Loading";
import { formatMoney } from "@/lib/currency";
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

const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function getReminderCooldownRemainingMs(lastManualReminderAt: { toMillis(): number } | undefined): number {
  if (!lastManualReminderAt) return 0;
  return Math.max(0, REMINDER_COOLDOWN_MS - (Date.now() - lastManualReminderAt.toMillis()));
}

export default function GridPage() {
  const { groupId, billId } = useParams<{ groupId: string; billId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { bill, loading: billLoading } = useBill(billId);
  const { items, loading: itemsLoading } = useBillItems(billId);
  const { charges, loading: chargesLoading } = useSharedCharges(billId);
  const allMembers = useMembers(bill?.householdId ?? null);
  const members = bill?.participantIds ? allMembers.filter((m) => bill.participantIds!.includes(m.id)) : allMembers;
  const group = useGroup(bill?.householdId ?? null);
  const swStatus = useSplitwiseStatus(user?.uid);
  const isOnline = useOnlineStatus();

  // Column header tooltip — fixed-position so it floats above the overflow-x container
  const [tooltip, setTooltip] = useState<{ uid: string; x: number; y: number } | null>(null);

  // Settle sheet state
  const [settleSheetOpen, setSettleSheetOpen] = useState(false);
  const [settleStates, setSettleStates] = useState<Record<string, boolean>>({});
  const [settleSaving, setSettleSaving] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  // Splitwise dialog state
  const [swDialog, setSwDialog] = useState<SwDialog>("idle");
  const [swError, setSwError] = useState<string | null>(null);
  const [warnedDuplicate, setWarnedDuplicate] = useState(false);

  // Manage participants sheet (Phase 12.2) — staged like the settle sheet:
  // checkbox taps only update local state, nothing writes (or notifies)
  // until Save, so playing with checkboxes doesn't fire a push per click.
  const [manageSheetOpen, setManageSheetOpen] = useState(false);
  const [participantStates, setParticipantStates] = useState<Record<string, boolean>>({});
  const [participantSaving, setParticipantSaving] = useState(false);
  const [participantSaveError, setParticipantSaveError] = useState<string | null>(null);
  const [blockedMemberName, setBlockedMemberName] = useState<string | null>(null);

  // Manual per-member remind icon, inside the settle sheet (Phase 12.6)
  const [remindingUid, setRemindingUid] = useState<string | null>(null);
  const [remindErrors, setRemindErrors] = useState<Record<string, string>>({});

  const loading = billLoading || itemsLoading || chargesLoading;
  const uid = user?.uid ?? "";

  if (loading) {
    return <Loading />;
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

  // Grid columns: owner always first, everyone else in their original (addedAt) order.
  const orderedMembers = [
    ...members.filter((m) => m.id === bill.uploadedBy),
    ...members.filter((m) => m.id !== bill.uploadedBy),
  ];

  const memberIds = members.map((m) => m.id);
  const activeParticipants = getActiveParticipants(items, memberIds);
  const totals = memberIds.length > 0 ? calculateSplit(items, charges, memberIds) : null;

  // Resolve which members have a Splitwise user ID (for the resolver sheet preview)
  const resolvedMembers = members.filter((m) => !!m.splitwiseUserId);
  const unresolvedMembers = members.filter((m) => !m.splitwiseUserId);

  // ── Manage participants (Phase 12.2) ────────────────────────────────────────
  // A member has "interacted" once they've confirmed, or touched any item's
  // selection — either signal means removing them would silently discard
  // something they did, so it's blocked rather than allowed.
  function memberHasInteracted(memberId: string): boolean {
    if (confirmedBy[memberId]) return true;
    return items.some((item) => memberId in item.selections);
  }

  function notifyParticipantChange(memberId: string, action: "added" | "removed") {
    const ownerName = members.find((m) => m.id === uid)?.displayName ?? "The bill owner";
    void fetch("/api/notify-participant-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: bill!.householdId,
        billId,
        billName: bill!.restaurantOrStoreName,
        ownerName,
        memberUid: memberId,
        action,
      }),
    }).catch(() => {});
  }

  function openManageSheet() {
    const init: Record<string, boolean> = {};
    for (const m of allMembers) init[m.id] = members.some((pm) => pm.id === m.id);
    setParticipantStates(init);
    setManageSheetOpen(true);
  }

  function handleToggleParticipant(memberId: string, memberName: string) {
    const isCurrentlyChecked = participantStates[memberId] ?? false;
    if (isCurrentlyChecked && memberHasInteracted(memberId)) {
      setBlockedMemberName(memberName);
      return;
    }
    setParticipantStates((prev) => ({ ...prev, [memberId]: !isCurrentlyChecked }));
  }

  async function saveParticipants() {
    setParticipantSaving(true);
    setParticipantSaveError(null);
    try {
      const originalIds = new Set(members.map((m) => m.id));
      const nextIds = allMembers.filter((m) => participantStates[m.id]).map((m) => m.id);
      const nextIdSet = new Set(nextIds);

      const added = allMembers.filter((m) => nextIdSet.has(m.id) && !originalIds.has(m.id));
      const removed = allMembers.filter((m) => !nextIdSet.has(m.id) && originalIds.has(m.id));

      if (added.length > 0 || removed.length > 0) {
        await setBillParticipants(billId, nextIds);
        for (const m of added) notifyParticipantChange(m.id, "added");
        for (const m of removed) notifyParticipantChange(m.id, "removed");
      }
      setManageSheetOpen(false);
    } catch {
      setParticipantSaveError("Couldn't save participants. Please try again.");
    } finally {
      setParticipantSaving(false);
    }
  }

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
    setSettleError(null);
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
        void fetch("/api/notify-bill-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ billId, groupId: bill!.householdId }),
        }).catch(() => {});
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
    } catch {
      setSettleError("Couldn't save settlement. Please try again.");
    } finally {
      setSettleSaving(false);
    }
  }

  // ── Manual remind, per member (Phase 12.6) ──────────────────────────────────

  async function handleRemindMember(memberId: string) {
    if (remindingUid) return;
    setRemindingUid(memberId);
    setRemindErrors((prev) => {
      const next = { ...prev };
      delete next[memberId];
      return next;
    });
    try {
      const idToken = await user!.getIdToken();
      const res = await fetch("/api/remind-now", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ billId, targetUid: memberId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(
          data.error === "cooldown" ? "Already reminded in the last 24h" : (data.error ?? "Failed to send"),
        );
      }
    } catch (e) {
      setRemindErrors((prev) => ({
        ...prev,
        [memberId]: e instanceof Error ? e.message : "Failed to send",
      }));
    } finally {
      setRemindingUid(null);
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
    <div className="flex flex-1 flex-col bg-background" onClick={() => setTooltip(null)}>
      <div className="flex-1 overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">

        <div className="px-4 pt-4 pb-2">
          <Link
            href={`/groups/${groupId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft size={15} />
            Home
          </Link>
        </div>

        {/* Status banner — tappable by bill uploader to manage settle */}
        <div
          className={`border-b bg-card px-4 py-2.5 ${isUploader ? "cursor-pointer active:bg-muted/50" : ""}`}
          onClick={isUploader ? openSettleSheet : undefined}
          role={isUploader ? "button" : undefined}
          aria-label={isUploader ? "Manage bill settlement" : undefined}
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* "X of Y confirmed" label */}
            <p className="text-sm text-muted-foreground shrink-0">
              {confirmedCount} of {members.length} confirmed
            </p>
            {/* Avatar row — scrolls horizontally if too many members.
                py-[3px] gives the box-shadow ring room to breathe vertically;
                overflow-y visible lets it escape without clipping. */}
            <div
              className="flex items-center gap-2 min-w-0"
              style={{
                overflowX: "auto",
                overflowY: "visible",
                scrollbarWidth: "none",
                padding: 3,
              }}
            >
              {[...members].sort((a, b) => {
                const rank = (m: typeof a) =>
                  m.id === bill.uploadedBy ? 0 : confirmedBy[m.id] ? 1 : 2;
                return rank(a) - rank(b);
              }).map((m) => {
                const confirmed = confirmedBy[m.id];
                const isOwner = m.id === bill.uploadedBy;
                return (
                  <span
                    key={m.id}
                    className="shrink-0"
                    style={{ opacity: confirmed ? 1 : 0.38 }}
                  >
                    <MemberAvatar
                      member={m}
                      size={20}
                      ring={isOwner ? "#DC2626" : confirmed ? "#16A34A" : "#FBBF24"}
                    />
                  </span>
                );
              })}
            </div>
            {/* Arrow right-aligned */}
            {isUploader && (
              <ChevronRight className="ml-auto shrink-0 text-muted-foreground" style={{ width: 16, height: 16 }} />
            )}
          </div>
        </div>

        {/* Edit my selections + manage participants — above the grid */}
        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 active:bg-amber-200 transition-colors"
            onClick={() => router.push(`/groups/${groupId}/bills/${billId}/select?from=grid`)}
          >
            <Pencil className="size-3.5" />
            Edit my selections
          </button>
          {isUploader && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary active:bg-secondary transition-colors"
              onClick={openManageSheet}
            >
              <Users className="size-3.5" />
              Manage participants
            </button>
          )}
        </div>

        {/* Scrollable grid */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted">
                <th className="sticky left-0 z-10 bg-muted min-w-[130px] max-w-[180px] px-4 py-2.5 text-left text-caption font-medium text-muted-foreground">
                  Item
                </th>
                {orderedMembers.map((m) => {
                  const confirmed = confirmedBy[m.id];
                  const canEdit = isUploader && m.id !== uid;
                  return (
                    <th
                      key={m.id}
                      className={`min-w-[72px] px-2 py-2 text-center text-caption font-medium ${
                        confirmed ? "text-foreground" : "bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      {/* Photo + Edit button side by side, vertically centred */}
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setTooltip((prev) =>
                              prev?.uid === m.id
                                ? null
                                : { uid: m.id, x: rect.left + rect.width / 2, y: rect.bottom + 6 },
                            );
                          }}
                          aria-label={`Show name: ${m.displayName}`}
                          style={{ lineHeight: 0, flexShrink: 0 }}
                        >
                          <MemberAvatar
                            member={m}
                            size={20}
                            ring={confirmed ? "#16A34A" : "#FBBF24"}
                          />
                        </button>
                        {canEdit && (
                          <button
                            className="flex items-center gap-0.5 rounded border border-amber-300 px-1.5 py-0.5 text-[10px] font-normal text-amber-700 hover:bg-amber-50"
                            onClick={() =>
                              router.push(
                                `/groups/${groupId}/bills/${billId}/select?as=${m.id}&from=grid`,
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
              {items.map((item, idx) => {
                const rowBg = idx % 2 === 0 ? "bg-background" : "bg-card";
                return (
                  <tr key={item.id} className={rowBg}>
                    {/* Sticky cell's background is the SAME static Tailwind
                        class as the row's, not a JS-computed inline style —
                        matching the header th (which never had the ghosting
                        bug) turned out to be the actual fix, not the table
                        vs. div markup or position:sticky itself. */}
                    <td className={`sticky left-0 z-10 min-w-[130px] max-w-[180px] px-4 py-2.5 ${rowBg}`}>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-body text-foreground leading-snug line-clamp-2">
                          {item.name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {formatMoney(item.price, bill?.currency ?? "USD")}
                        </span>
                      </div>
                    </td>
                    {orderedMembers.map((m) => {
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
                );
              })}
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
                          {formatMoney(charge.amount, bill?.currency ?? "USD")}
                        </span>
                      </td>
                      {orderedMembers.map((m) => (
                        <td
                          key={m.id}
                          className="px-2 py-2.5 text-center font-mono text-xs text-muted-foreground tabular-nums"
                        >
                          {formatMoney(alloc[m.id] ?? 0, bill?.currency ?? "USD")}
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
                {orderedMembers.map((m) => {
                  const confirmed = confirmedBy[m.id];
                  const total = totals?.[m.id] ?? 0;
                  const display = !totals
                    ? "…"
                    : confirmed
                    ? formatMoney(total, bill?.currency ?? "USD")
                    : `~${formatMoney(total, bill?.currency ?? "USD")}`;
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

        {/* Push to Splitwise — standard right-aligned placement below the table */}
        {isUploader && (
          <div className="flex flex-col items-end gap-1 px-4 pt-3 pb-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              onClick={handleSplitwisePush}
              disabled={!isOnline}
            >
              Push to Splitwise
            </button>
            {!isOnline && (
              <p className="text-caption text-amber-700">Needs a connection to push</p>
            )}
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
              {orderedMembers.map((m) => {
                const confirmed = confirmedBy[m.id];
                const remindCooldownMs = getReminderCooldownRemainingMs(bill!.manualReminderSentAt?.[m.id]);
                const canRemind = !confirmed && m.id !== uid;
                return (
                  <div key={m.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-3">
                      <label className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          className="size-5 shrink-0 cursor-pointer accent-primary"
                          checked={settleStates[m.id] ?? false}
                          onChange={(e) =>
                            setSettleStates((prev) => ({ ...prev, [m.id]: e.target.checked }))
                          }
                        />
                        <MemberAvatar member={m} size={28} ring="transparent" />
                        <span className="flex-1 truncate text-body text-foreground">
                          {m.displayName}
                          {m.id === uid && (
                            <span className="ml-1.5 text-caption text-muted-foreground">(you)</span>
                          )}
                        </span>
                      </label>
                      {confirmed && (
                        <span className="shrink-0 text-caption text-primary">confirmed</span>
                      )}
                      {canRemind && (
                        <button
                          type="button"
                          className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-1 text-caption text-muted-foreground hover:bg-secondary active:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          onClick={() => handleRemindMember(m.id)}
                          disabled={remindingUid === m.id || remindCooldownMs > 0}
                          aria-label={`Remind ${m.displayName}`}
                        >
                          <Bell className="size-3.5" />
                          {remindingUid === m.id
                            ? "Sending…"
                            : remindCooldownMs > 0
                            ? `${Math.ceil(remindCooldownMs / (60 * 60 * 1000))}h`
                            : "Remind"}
                        </button>
                      )}
                    </div>
                    {remindErrors[m.id] && (
                      <p className="pl-11 text-xs text-destructive">{remindErrors[m.id]}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {settleError && (
              <p className="mb-2 text-center text-xs text-destructive">{settleError}</p>
            )}
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

      {/* ── Manage participants sheet (Phase 12.2) ──────────────────────────── */}
      {manageSheetOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => !participantSaving && setManageSheetOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card px-6 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-xl max-h-[70vh] overflow-y-auto">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-body font-semibold text-foreground">Manage participants</p>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => !participantSaving && setManageSheetOpen(false)}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mb-4 text-caption text-muted-foreground">
              Only checked members can see this bill.
            </p>

            <div className="flex flex-col gap-2 mb-5">
              {allMembers.map((m) => {
                const isSelf = m.id === uid;
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 ${isSelf ? "opacity-60" : "cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      className="size-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
                      checked={participantStates[m.id] ?? false}
                      disabled={isSelf || participantSaving}
                      onChange={() => handleToggleParticipant(m.id, m.displayName.split(" ")[0] ?? "This member")}
                    />
                    <MemberAvatar member={m} size={28} ring="transparent" />
                    <span className="flex-1 text-body text-foreground">
                      {m.displayName}
                      {isSelf && <span className="ml-1.5 text-caption text-muted-foreground">(you)</span>}
                    </span>
                  </label>
                );
              })}
            </div>

            {participantSaveError && (
              <p className="mb-2 text-center text-xs text-destructive">{participantSaveError}</p>
            )}
            <Button className="w-full" disabled={participantSaving} onClick={saveParticipants}>
              {participantSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </>
      )}

      {/* Can't remove — member has already interacted (warning style) */}
      {blockedMemberName && (
        <div
          className="fixed inset-0 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.4)", zIndex: 60 }}
          onClick={() => setBlockedMemberName(null)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-amber-900">
                  Can&apos;t remove {blockedMemberName}
                </p>
                <p className="text-xs leading-relaxed text-amber-800">
                  {`${blockedMemberName} has already made selections on this bill. Ask them to either reset their picks, or clear their selections yourself.`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setBlockedMemberName(null)}
              className="rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Got it
            </button>
          </div>
        </div>
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
                          {formatMoney(totals[m.id] ?? 0, bill?.currency ?? "USD")}
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
                  We tried matching them by their login email but couldn&apos;t find them in this
                  Splitwise group. Either push without them, or an admin can link their corresponding
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

      {/* Floating name tooltip for grid column header photos */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y,
            transform: "translateX(-50%)",
            background: "#1A1A1F",
            color: "#fff",
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          {members.find((m) => m.id === tooltip.uid)?.displayName}
        </div>
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
