"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useState } from "react";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  async function handleSignIn() {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 dark:bg-black">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Splitly</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Sign in to split bills with your household.
        </p>
      </div>
      <button
        onClick={handleSignIn}
        disabled={signingIn}
        className="rounded-full bg-indigo-600 px-6 py-3 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {signingIn ? "Signing in..." : "Sign in with Google"}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
