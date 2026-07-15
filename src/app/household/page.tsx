"use client";

import Link from "next/link";
import { useState } from "react";
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
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  const me = members.find((m) => m.id === user?.uid);
  const isCreator = household.createdBy === user?.uid;

  if (!me || me.role !== "admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
        <p className="text-black dark:text-zinc-50">Only admins can manage the household.</p>
        <Link href="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
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
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium text-black dark:text-zinc-50">Manage household</h1>
        <Link href="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
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
            <li
              key={member.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <span className="text-sm font-medium text-black dark:text-zinc-50">
                {member.displayName || "Unnamed"}
                {isSelf && <span className="text-zinc-500"> (you)</span>}
              </span>

              {canEdit ? (
                <div className="flex items-center gap-2">
                  <select
                    value={member.role}
                    disabled={disabled}
                    onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                    className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
                  >
                    <option value="admin">Admin</option>
                    <option value="guest">Guest</option>
                  </select>
                  <button
                    onClick={() => handleRemove(member.id)}
                    disabled={disabled}
                    className="rounded border border-red-300 px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <span className="text-sm text-zinc-500">{isTargetCreator ? "Owner" : "Admin"}</span>
              )}
            </li>
          );
        })}
      </ul>

      {isCreator && (
        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-red-300 p-4 dark:border-red-900">
          <div>
            <h2 className="text-sm font-medium text-red-600 dark:text-red-400">Danger zone</h2>
            <p className="text-xs text-zinc-500">
              Permanently deletes {household.name} — every member, bill, and item. This cannot be
              undone.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Type <span className="font-mono">{household.name}</span> to confirm
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting}
              className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <button
            onClick={handleDeleteHousehold}
            disabled={deleting || confirmText !== household.name}
            className="self-start rounded border border-red-600 bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-red-700 dark:border-red-700"
          >
            {deleting ? "Deleting..." : "Delete household forever"}
          </button>
        </div>
      )}
    </div>
  );
}
