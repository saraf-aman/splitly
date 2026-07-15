"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  deleteHousehold,
  removeMember,
  updateMemberRole,
  useHousehold,
  useMembers,
  useUserHousehold,
} from "@/lib/household";
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

export default function HouseholdManagePage() {
  const { user } = useAuth();
  const { householdId, loading } = useUserHousehold();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (loading || !householdId || !household) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <p className="text-body text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const me = members.find((m) => m.id === user?.uid);
  const isCreator = household.createdBy === user?.uid;

  if (!me || me.role !== "admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background px-6">
        <p className="text-body text-foreground">Only admins can manage the household.</p>
        <Link href="/" className="text-sm text-primary hover:underline">
          Back home
        </Link>
      </div>
    );
  }

  async function handleRoleChange(memberId: string, role: Role) {
    setBusyId(memberId);
    try {
      await updateMemberRole(householdId!, memberId, role);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(memberId: string) {
    setBusyId(memberId);
    try {
      await removeMember(householdId!, memberId);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteHousehold() {
    setDeleting(true);
    try {
      await deleteHousehold(householdId!, household!.createdBy);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 bg-background px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-heading text-foreground">Manage household</h1>
        <Link href="/" className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ChevronLeft className="size-4" />
          Back
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {members.map((member) => {
          const isSelf = member.id === user?.uid;
          const isTargetCreator = member.id === household.createdBy;
          // Creator: full control over everyone but themself.
          // Regular admin: can only promote a guest to admin, or remove a guest.
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
                Permanently deletes {household.name} — every member, bill, and item. This cannot
                be undone.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-household-name" className="text-caption text-muted-foreground">
                Type <span className="font-money">{household.name}</span> to confirm
              </Label>
              <Input
                id="confirm-household-name"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={deleting}
              />
            </div>
            <Button
              className="self-start bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting || confirmText !== household.name}
              onClick={handleDeleteHousehold}
            >
              {deleting ? "Deleting..." : "Delete household forever"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
