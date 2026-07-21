"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Trash2, CheckCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  deleteGroup,
  removeMember,
  updateMemberRole,
  setMemberSplitwiseEmail,
  useGroup,
  useMembers,
} from "@/lib/group";
import type { Role } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── SW status chip ────────────────────────────────────────────────────────────

function SwStatusChip({ linked }: { linked: boolean }) {
  if (linked) {
    return (
      <span
        className="flex items-center gap-1 text-[10px] font-light"
        style={{ color: "#2E6E6E" }}
      >
        <CheckCircle size={9} strokeWidth={2.5} />
        Splitwise
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupManagePage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const group = useGroup(groupId);
  const members = useMembers(groupId);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // splitwiseEmail inputs: memberId → current text in the input
  const [swEmailInputs, setSwEmailInputs] = useState<Record<string, string>>({});
  const [swEmailSaving, setSwEmailSaving] = useState<string | null>(null);
  const [swEmailError, setSwEmailError] = useState<Record<string, string>>({});
  const [swEmailSaved, setSwEmailSaved] = useState<Record<string, boolean>>({});

  if (!group) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <p className="text-body text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const me = members.find((m) => m.id === user?.uid);
  const isCreator = group.createdBy === user?.uid;

  if (!me || me.role !== "admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background px-6">
        <p className="text-body text-foreground">Only admins can manage the group.</p>
      </div>
    );
  }

  async function handleRoleChange(memberId: string, role: Role) {
    setBusyId(memberId);
    try {
      await updateMemberRole(groupId, memberId, role);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(memberId: string) {
    setBusyId(memberId);
    try {
      await removeMember(groupId, memberId);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteGroup() {
    setDeleting(true);
    try {
      await deleteGroup(groupId, group!.createdBy);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveSwEmail(memberId: string) {
    const email = (swEmailInputs[memberId] ?? "").trim();
    if (!email || !email.includes("@")) {
      setSwEmailError((e) => ({ ...e, [memberId]: "Enter a valid email address." }));
      return;
    }
    setSwEmailSaving(memberId);
    setSwEmailError((e) => ({ ...e, [memberId]: "" }));
    try {
      await setMemberSplitwiseEmail(groupId, memberId, email);
      setSwEmailSaved((s) => ({ ...s, [memberId]: true }));
      setTimeout(() => setSwEmailSaved((s) => ({ ...s, [memberId]: false })), 2000);
    } catch {
      setSwEmailError((e) => ({ ...e, [memberId]: "Could not save. Please try again." }));
    } finally {
      setSwEmailSaving(null);
    }
  }

  // Unlinked = no splitwiseUserId. Email section only appears if group has SW configured.
  const unlinkedMembers = members.filter((m) => !m.splitwiseUserId);
  const showSwEmailSection = !!group.splitwiseGroupId && unlinkedMembers.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 bg-background px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <Link
        href={`/groups/${groupId}`}
        className="-mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft size={15} />
        Home
      </Link>

      <h1 className="text-heading text-foreground">Manage group</h1>

      {/* ── Members table ── */}
      <div className="flex flex-col gap-1">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Members
        </p>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {members.map((member, idx) => {
            const isSelf = member.id === user?.uid;
            const isTargetCreator = member.id === group.createdBy;
            const canChangeRole = !isTargetCreator && (isCreator || member.role === "guest");
            const canRemove = !isSelf && !isTargetCreator && (isCreator || member.role === "guest");
            const busy = busyId === member.id;

            return (
              // Grid: [name+email grows] [Splitwise col] [role col] [action col]
              // Using grid (not flex) so every row shares the exact same column widths.
              <div
                key={member.id}
                className={`grid items-center gap-x-3 px-4 py-3 ${idx !== members.length - 1 ? "border-b border-border" : ""}`}
                style={{ gridTemplateColumns: "1fr 72px 80px 28px" }}
              >
                {/* Col 1 — name + email */}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {member.displayName || "Unnamed"}
                    {isSelf && <span className="font-normal text-muted-foreground"> (you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>

                {/* Col 2 — Splitwise status */}
                <div className="flex items-center">
                  <SwStatusChip linked={!!member.splitwiseUserId} />
                </div>

                {/* Col 3 — role select or badge, full width of cell */}
                <div className="flex items-center">
                  {canChangeRole ? (
                    <Select
                      value={member.role}
                      disabled={busy}
                      onValueChange={(value) => handleRoleChange(member.id, value as Role)}
                    >
                      <SelectTrigger size="sm" className="h-7 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="guest">Guest</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="w-full justify-center text-xs">
                      {isTargetCreator ? "Owner" : member.role === "admin" ? "Admin" : "Guest"}
                    </Badge>
                  )}
                </div>

                {/* Col 4 — remove button (empty cell keeps column for rows without it) */}
                <div className="flex items-center justify-center">
                  {canRemove && (
                    <button
                      onClick={() => handleRemove(member.id)}
                      disabled={busy}
                      className="rounded p-1 text-destructive transition-colors hover:text-red-900 disabled:opacity-40 [&:hover_svg]:stroke-[2.5]"
                      aria-label={`Remove ${member.displayName}`}
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Splitwise email overrides (only for unlinked members when SW group is set) ── */}
      {showSwEmailSection && (
        <div className="flex flex-col gap-1">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Splitwise accounts
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            These members haven&apos;t connected Splitwise yet. If their Splitwise email differs
            from their Google email, enter it here so they&apos;re matched correctly when pushing expenses.
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {unlinkedMembers.map((member, idx) => {
              const saving = swEmailSaving === member.id;
              const err = swEmailError[member.id];
              const saved = swEmailSaved[member.id];
              const existing = member.splitwiseEmail ?? "";
              const inputVal = swEmailInputs[member.id] ?? existing;

              return (
                <div
                  key={member.id}
                  className={`flex flex-col gap-2 px-4 py-3 ${idx !== unlinkedMembers.length - 1 ? "border-b border-border" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {member.displayName || "Unnamed"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    {existing && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Override set
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      type="email"
                      placeholder={`Splitwise email (default: ${member.email})`}
                      value={inputVal}
                      onChange={(e) =>
                        setSwEmailInputs((v) => ({ ...v, [member.id]: e.target.value }))
                      }
                      disabled={saving}
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 text-xs"
                      disabled={saving || !inputVal.trim() || inputVal.trim() === existing}
                      onClick={() => handleSaveSwEmail(member.id)}
                    >
                      {saving ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : saved ? (
                        <CheckCircle size={12} className="text-emerald-600" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                  {err && <p className="text-xs text-destructive">{err}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Danger zone ── */}
      {isCreator && (
        <Card className="ring-destructive/30">
          <CardContent className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
              <p className="text-caption text-muted-foreground">
                Permanently deletes {group.name} — every member, bill, and item. This cannot
                be undone.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-group-name" className="text-caption text-muted-foreground">
                Type <span className="font-money">{group.name}</span> to confirm
              </Label>
              <Input
                id="confirm-group-name"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={deleting}
              />
            </div>
            <Button
              className="self-start bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting || confirmText !== group.name}
              onClick={handleDeleteGroup}
            >
              {deleting ? "Deleting..." : "Delete group forever"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
