"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useGroup, useMembers } from "@/lib/group";
import { useGroupBills } from "@/lib/bills";
import { useSplitwiseStatus } from "@/lib/splitwise";
import { formatCents } from "@/lib/utils";
import { NotificationBanner } from "@/components/NotificationBanner";
import { MemberAvatar } from "@/components/MemberAvatar";
import type { Bill, Member } from "@/types/firestore";

// ─── Section helpers ────────────────────────────────────────────────────────

type Section = "needs" | "progress" | "settled";

const SECTION_META: Record<Section, { label: string; stripe: string; pill: string; pillText: string }> = {
  needs:    { label: "Needs your input",  stripe: "#D97706", pill: "#FEF3C7", pillText: "#B45309" },
  progress: { label: "In progress",       stripe: "#3B82F6", pill: "#EFF6FF", pillText: "#2563EB" },
  settled:  { label: "Settled",           stripe: "#16A34A", pill: "#F0FDF4", pillText: "#15803D" },
};

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function isSettledAndOld(bill: Bill & { id: string }): boolean {
  const ts = bill.createdAt;
  if (!ts) return false;
  return Date.now() - ts.toMillis() > ONE_MONTH_MS;
}

function getSection(bill: Bill & { id: string }, uid: string, memberIds: string[]): Section {
  if (bill.status === "pending_review") return "needs";
  const confirmedBy = bill.confirmedBy ?? {};
  if (memberIds.length > 0 && memberIds.every((id) => confirmedBy[id])) return "settled";
  if (confirmedBy[uid]) return "progress";
  return "needs";
}

function getBillStatusLabel(bill: Bill & { id: string }, uid: string, memberIds: string[]): string {
  if (bill.status === "pending_review") return "Reviewing";
  const confirmedBy = bill.confirmedBy ?? {};
  if (memberIds.length > 0 && memberIds.every((id) => confirmedBy[id])) return "Settled";
  if (confirmedBy[uid]) return "In progress";
  return "Needs your input";
}

function getBillHref(bill: Bill & { id: string }, groupId: string, uid: string): string {
  if (bill.status === "pending_review") return `/groups/${groupId}/bills/${bill.id}/review`;
  const confirmedBy = bill.confirmedBy ?? {};
  // Once the current user has confirmed their selections, show the grid.
  // Others may still be pending — that's visible in the grid's status banner.
  if (confirmedBy[uid]) return `/groups/${groupId}/bills/${bill.id}/grid`;
  return `/groups/${groupId}/bills/${bill.id}/select`;
}

function formatBillDate(bill: Bill & { id: string }): string {
  const ts = bill.billDate ?? bill.createdAt;
  if (!ts) return "";
  try {
    return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ─── Member chip ─────────────────────────────────────────────────────────────

function MemberChip({ member, confirmed, isOwner }: {
  member: Member & { id: string };
  confirmed: boolean;
  isOwner: boolean;
}) {
  const ring = isOwner ? "#DC2626" : confirmed ? "#16A34A" : "#FBBF24";
  return <MemberAvatar member={member} size={28} ring={ring} />;
}

// ─── Bill card ────────────────────────────────────────────────────────────────

function BillCard({
  bill,
  groupId,
  uid,
  members,
  isUploader,
  onDeleteRequest,
}: {
  bill: Bill & { id: string };
  groupId: string;
  uid: string;
  members: (Member & { id: string })[];
  isUploader: boolean;
  onDeleteRequest: (bill: Bill & { id: string }) => void;
}) {
  const memberIds = members.map((m) => m.id);
  const section = getSection(bill, uid, memberIds);
  const meta = SECTION_META[section];
  const statusLabel = getBillStatusLabel(bill, uid, memberIds);
  const href = getBillHref(bill, groupId, uid);
  const confirmedBy = bill.confirmedBy ?? {};
  const total = bill.parsedResult?.total;
  const isSettled = section === "settled";

  return (
    <Link
      href={href}
      className="flex overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-transform active:scale-[0.975]"
    >
      {/* Left stripe */}
      <div style={{ width: 4, flexShrink: 0, background: meta.stripe }} />

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1.5 px-4 py-3.5">
        {/* Top row: name + date */}
        <div className="flex items-start justify-between gap-2">
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1F", lineHeight: 1.3 }}>
            {bill.restaurantOrStoreName ?? "Receipt"}
          </span>
          <span style={{ fontSize: 11.5, color: "#9CA3AF", whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.3 }}>
            {formatBillDate(bill)}
          </span>
        </div>

        {/* Amount */}
        {total != null && (
          <span
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.5px",
              color: isSettled ? "#16A34A" : "#1A1A1F",
              lineHeight: 1.1,
            }}
          >
            {formatCents(total)}
          </span>
        )}

        {/* Status pill */}
        <span
          style={{
            display: "inline-flex",
            alignSelf: "flex-start",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 10.5,
            fontWeight: 700,
            background: meta.pill,
            color: meta.pillText,
            letterSpacing: "0.01em",
          }}
        >
          {statusLabel}
        </span>

        {/* Uploader */}
        {(() => {
          const uploader = members.find((m) => m.id === bill.uploadedBy);
          if (!uploader) return null;
          const name = uploader.id === uid ? "you" : uploader.displayName.split(" ")[0];
          return (
            <span style={{ fontSize: 11.5, color: "#9CA3AF" }}>
              Uploaded by {name}
            </span>
          );
        })()}

        {/* Bottom row: member chips + delete button */}
        <div className="flex items-end justify-between pt-0.5">
          {members.length > 0 ? (
            <div className="flex gap-1.5">
              {members.map((m) => (
                <MemberChip
                  key={m.id}
                  member={m}
                  confirmed={!!confirmedBy[m.id]}
                  isOwner={m.id === bill.uploadedBy}
                />
              ))}
            </div>
          ) : <div />}

          {isUploader && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDeleteRequest(bill);
              }}
              aria-label="Delete bill"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "#FEE2E2",
                flexShrink: 0,
              }}
            >
              <Trash2 size={14} color="#DC2626" />
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupHomePage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const group = useGroup(groupId);
  const members = useMembers(groupId);
  const { bills, loading } = useGroupBills(groupId);
  const { loading: swLoading, connected: swConnected } = useSplitwiseStatus(user?.uid);
  const uid = user?.uid ?? "";

  const [swConnecting, setSwConnecting] = useState(false);
  const [swConnectError, setSwConnectError] = useState<string | null>(null);

  const [deletingBill, setDeletingBill] = useState<(Bill & { id: string }) | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteConfirm() {
    if (!deletingBill || !user) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/bills/${deletingBill.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      setDeletingBill(null);
    } catch {
      setDeleteError("Could not delete bill. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  }

  // Show banner when: group has Splitwise configured AND current user is not connected
  const showSwBanner = !swLoading && !swConnected && !!group?.splitwiseGroupId;

  async function handleBannerConnect() {
    if (!user) return;
    setSwConnecting(true);
    setSwConnectError(null);
    try {
      const idToken = await user.getIdToken();
      const returnPath = window.location.pathname;
      const res = await fetch(
        `/api/splitwise/connect?returnPath=${encodeURIComponent(returnPath)}`,
        { headers: { Authorization: `Bearer ${idToken}` } },
      );
      if (!res.ok) throw new Error("Failed");
      const { authUrl } = (await res.json()) as { authUrl: string };
      window.location.href = authUrl;
    } catch {
      setSwConnectError("Could not start connection. Try again.");
      setSwConnecting(false);
    }
  }
  const memberIds = members.map((m) => m.id);

  const sections: Section[] = ["needs", "progress", "settled"];
  const grouped = Object.fromEntries(
    sections.map((s) => [
      s,
      bills.filter((b) => {
        if (getSection(b, uid, memberIds) !== s) return false;
        if (s === "settled" && isSettledAndOld(b)) return false;
        return true;
      }),
    ])
  ) as Record<Section, (Bill & { id: string })[]>;

  const hasBills = bills.length > 0;

  return (
    <div className="relative flex flex-1 flex-col bg-background">
      <NotificationBanner />

      {showSwBanner && (
        <div
          className="mx-4 mt-3 flex flex-col gap-2 rounded-xl px-4 py-3"
          style={{ background: "rgba(46,110,110,0.08)", border: "1px solid rgba(46,110,110,0.2)" }}
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-semibold" style={{ color: "#2E6E6E" }}>
              Connect Splitwise
            </p>
            <p className="text-xs text-muted-foreground">
              Your group uses Splitwise. Connect your account to be included in bill expenses.
            </p>
          </div>
          <button
            onClick={handleBannerConnect}
            disabled={swConnecting}
            className="flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: "#2E6E6E" }}
          >
            {swConnecting && <Loader2 size={11} className="animate-spin" />}
            {swConnecting ? "Connecting…" : "Connect now"}
          </button>
          {swConnectError && (
            <p className="text-xs text-destructive">{swConnectError}</p>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6 pb-28">
        {group && (
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1A1A1F", lineHeight: 1.2 }}>
            {group.name}
          </h1>
        )}

        {loading && (
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        )}

        {!loading && !hasBills && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
            <span style={{ fontSize: 48 }}>🧾</span>
            <p className="text-sm font-medium text-foreground">No bills yet</p>
            <p className="text-sm text-muted-foreground">Tap the camera button to upload your first receipt.</p>
          </div>
        )}

        {!loading && hasBills && sections.map((section) => {
          const sectionBills = grouped[section];
          if (sectionBills.length === 0) return null;
          return (
            <div key={section} className="flex flex-col gap-3">
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#9CA3AF",
                }}
              >
                {SECTION_META[section].label}
              </p>
              {sectionBills.map((bill) => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  groupId={groupId}
                  uid={uid}
                  members={members}
                  isUploader={bill.uploadedBy === uid}
                  onDeleteRequest={setDeletingBill}
                />
              ))}
            </div>
          );
        })}

      </div>

      {/* Floating action button */}
      <Link
        href={`/groups/${groupId}/bills/new`}
        aria-label="Upload a bill"
        className="fixed bottom-8 right-6 flex items-center justify-center rounded-full"
        style={{
          width: 58,
          height: 58,
          background: "#2E6E6E",
          boxShadow: "0 4px 18px rgba(46,110,110,0.45)",
          zIndex: 20,
        }}
      >
        <Camera size={24} color="#ffffff" />
      </Link>

      {/* Delete confirmation dialog */}
      {deletingBill && (
        <div
          className="fixed inset-0 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.4)", zIndex: 50 }}
          onClick={() => { if (!deleteLoading) setDeletingBill(null); }}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <p style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1F" }}>Delete bill?</p>
              <p style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600, color: "#1A1A1F" }}>
                  {deletingBill.restaurantOrStoreName ?? "This receipt"}
                </span>{" "}
                and all selections will be permanently deleted. This cannot be undone.
              </p>
            </div>

            {deleteError && (
              <p style={{ fontSize: 12.5, color: "#DC2626" }}>{deleteError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setDeletingBill(null)}
                disabled={deleteLoading}
                className="flex flex-1 items-center justify-center rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground transition-opacity disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ background: "#DC2626" }}
              >
                {deleteLoading && <Loader2 size={14} className="animate-spin" />}
                {deleteLoading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
