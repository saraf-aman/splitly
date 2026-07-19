"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  deleteGroup,
  removeMember,
  updateMemberRole,
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

export default function GroupManagePage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const group = useGroup(groupId);
  const members = useMembers(groupId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
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
