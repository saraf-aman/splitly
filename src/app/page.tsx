"use client";

import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-6 dark:bg-black">
      <p className="text-black dark:text-zinc-50">
        Signed in as {user?.displayName ?? user?.email}
      </p>
      <button
        onClick={() => signOut(auth)}
        className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        Sign out
      </button>
    </div>
  );
}
