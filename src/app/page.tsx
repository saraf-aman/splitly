"use client";

import { signOut } from "firebase/auth";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useHousehold, useMembers, useUserHousehold } from "@/lib/household";

export default function Home() {
  const { user } = useAuth();
  const { householdId } = useUserHousehold();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const isAdmin = members.find((m) => m.id === user?.uid)?.role === "admin";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-6 dark:bg-black">
      <p className="text-black dark:text-zinc-50">
        Signed in as {user?.displayName ?? user?.email}
      </p>
      {household && (
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-lg font-medium text-black dark:text-zinc-50">{household.name}</p>
          <p className="text-xs text-zinc-500">
            Invite ID: <span className="font-mono">{household.id}</span>
          </p>
        </div>
      )}
      {isAdmin && (
        <Link
          href="/household"
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Manage household
        </Link>
      )}
      <button
        onClick={() => signOut(auth)}
        className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        Sign out
      </button>
    </div>
  );
}
