"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Camera } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useMembers } from "@/lib/household";
import { useHouseholdBills } from "@/lib/bills";
import { formatCents } from "@/lib/utils";
import { NotificationBanner } from "@/components/NotificationBanner";
import type { Bill, Member } from "@/types/firestore";

// ─── Section helpers ────────────────────────────────────────────────────────

type Section = "needs" | "progress" | "settled";

const SECTION_META: Record<Section, { label: string; stripe: string; pill: string; pillText: string }> = {
  needs:    { label: "Needs your input",  stripe: "#D97706", pill: "#FEF3C7", pillText: "#D97706" },
  progress: { label: "In progress",       stripe: "#D1D5DB", pill: "#F1F0EE", pillText: "#6B7280" },
  settled:  { label: "Settled",           stripe: "#2E6E6E", pill: "#E3EEEE", pillText: "#2E6E6E" },
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

function getBillHref(bill: Bill & { id: string }, householdId: string, uid: string): string {
  if (bill.status === "pending_review") return `/households/${householdId}/bills/${bill.id}/review`;
  const confirmedBy = bill.confirmedBy ?? {};
  // Once the current user has confirmed their selections, show the grid.
  // Others may still be pending — that's visible in the grid's status banner.
  if (confirmedBy[uid]) return `/households/${householdId}/bills/${bill.id}/grid`;
  return `/households/${householdId}/bills/${bill.id}/select`;
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

function MemberChip({ member, confirmed, isMe }: { member: Member & { id: string }; confirmed: boolean; isMe: boolean }) {
  const initial = member.displayName ? member.displayName.charAt(0).toUpperCase() : "?";

  let bg = "#F1F0EE";
  let color = "#9CA3AF";
  let outline = "none";

  if (confirmed) {
    bg = "#2E6E6E";
    color = "#FFFFFF";
    outline = isMe ? "2px solid #1A4F4F" : "none";
  } else if (isMe) {
    bg = "#FEF3C7";
    color = "#D97706";
    outline = "1.5px solid #FDE68A";
  }

  return (
    <span
      title={member.displayName}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: bg,
        color,
        outline,
        outlineOffset: confirmed && isMe ? "1px" : undefined,
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}

// ─── Bill card ────────────────────────────────────────────────────────────────

function BillCard({
  bill,
  householdId,
  uid,
  members,
}: {
  bill: Bill & { id: string };
  householdId: string;
  uid: string;
  members: (Member & { id: string })[];
}) {
  const memberIds = members.map((m) => m.id);
  const section = getSection(bill, uid, memberIds);
  const meta = SECTION_META[section];
  const statusLabel = getBillStatusLabel(bill, uid, memberIds);
  const href = getBillHref(bill, householdId, uid);
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
              color: isSettled ? "#2E6E6E" : "#1A1A1F",
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

        {/* Member chips */}
        {members.length > 0 && (
          <div className="flex gap-1.5 pt-0.5">
            {members.map((m) => (
              <MemberChip
                key={m.id}
                member={m}
                confirmed={!!confirmedBy[m.id]}
                isMe={m.id === uid}
              />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HouseholdHomePage() {
  const { householdId } = useParams<{ householdId: string }>();
  const { user } = useAuth();
  const members = useMembers(householdId);
  const { bills, loading } = useHouseholdBills(householdId);
  const uid = user?.uid ?? "";
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

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6 pb-28">
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
                  householdId={householdId}
                  uid={uid}
                  members={members}
                />
              ))}
            </div>
          );
        })}

      </div>

      {/* Floating action button */}
      <Link
        href={`/households/${householdId}/bills/new`}
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
    </div>
  );
}
