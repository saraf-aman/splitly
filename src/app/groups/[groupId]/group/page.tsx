"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  deleteGroup,
  removeMember,
  updateMemberRole,
  setMemberSplitwiseId,
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
import { CheckCircle, Loader2 } from "lucide-react";

export default function GroupManagePage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const group = useGroup(groupId);
  const members = useMembers(groupId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  // Splitwise ID inputs: memberId → pending text value
  const [swIdInputs, setSwIdInputs] = useState<Record<string, string>>({});
  const [swIdSaving, setSwIdSaving] = useState<string | null>(null);
  const [swIdError, setSwIdError] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);

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

  async function handleSaveSwId(memberId: string) {
    const raw = swIdInputs[memberId]?.trim() ?? "";
    const parsed = parseInt(raw, 10);
    if (!raw || isNaN(parsed) || parsed <= 0) {
      setSwIdError((e) => ({ ...e, [memberId]: "Enter a valid Splitwise user ID (a positive number)." }));
      return;
    }
    setSwIdSaving(memberId);
    setSwIdError((e) => ({ ...e, [memberId]: "" }));
    try {
      await setMemberSplitwiseId(groupId, memberId, parsed);
      setSwIdInputs((v) => ({ ...v, [memberId]: "" }));
    } catch {
      setSwIdError((e) => ({ ...e, [memberId]: "Could not save. Please try again." }));
    } finally {
      setSwIdSaving(null);
    }
  }

  // Members that still need a Splitwise ID set
  const unlinkedMembers = members.filter((m) => !m.splitwiseUserId);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 bg-background px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-heading text-foreground">Manage group</h1>
      </div>

      <ul className="flex flex-col gap-2">
        {members.map((member) => {
          const isSelf = member.id === user?.uid;
          const isTargetCreator = member.id === group.createdBy;
          const canEdit = !isTargetCreator && (isCreator || member.role === "guest");
          const disabled = busyId === member.id;

          return (
            <Card key={member.id} size="sm">
              <CardContent className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                  {member.displayName || "Unnamed"}
                  {isSelf && <span className="text-muted-foreground"> (you)</span>}
                </span>

                {canEdit ? (
                  <div className="flex items-center gap-2">
                    <Select
                      value={member.role}
                      disabled={disabled}
                      onValueChange={(value) => handleRoleChange(member.id, value as Role)}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="guest">Guest</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={disabled}
                      onClick={() => handleRemove(member.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline">{isTargetCreator ? "Owner" : "Admin"}</Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </ul>

      {/* Splitwise IDs — admin-only section */}
      <div className="mt-2 flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Splitwise IDs</h2>
        <p className="text-xs text-muted-foreground">
          Members with a Splitwise ID can be included in bill expenses. IDs are set automatically when someone connects their Splitwise account, or you can enter them manually for members who haven&apos;t connected yet.
        </p>

        <div className="flex flex-col gap-2">
          {members.map((member) => {
            const isSelf = member.id === user?.uid;
            const hasId = !!member.splitwiseUserId;
            const saving = swIdSaving === member.id;
            const err = swIdError[member.id];

            return (
              <Card key={member.id} size="sm">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {member.displayName || "Unnamed"}
                      {isSelf && <span className="text-muted-foreground"> (you)</span>}
                    </span>
                    {hasId ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                        <CheckCircle size={12} />
                        <span className="font-mono">{member.splitwiseUserId}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No ID</span>
                    )}
                  </div>

                  {/* Input for members without an ID — admin can set it once */}
                  {!hasId && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="Splitwise user ID"
                        value={swIdInputs[member.id] ?? ""}
                        onChange={(e) =>
                          setSwIdInputs((v) => ({ ...v, [member.id]: e.target.value }))
                        }
                        disabled={saving}
                        className="h-8 text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 text-xs"
                        disabled={saving || !swIdInputs[member.id]?.trim()}
                        onClick={() => handleSaveSwId(member.id)}
                      >
                        {saving ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  )}
                  {err && <p className="text-xs text-destructive">{err}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {unlinkedMembers.length === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle size={12} />
            All members have a Splitwise ID — bill pushes will work for everyone.
          </p>
        )}
      </div>

      {isCreator && (
        <Card className="mt-6 ring-destructive/30">
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
