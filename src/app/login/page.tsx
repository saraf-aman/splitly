"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-display text-foreground">Splitly</h1>
        <p className="text-body text-muted-foreground">
          Sign in to split bills with your household.
        </p>
      </div>
      <Button onClick={handleSignIn} disabled={signingIn} className="h-12 px-8 text-base">
        {signingIn ? "Signing in..." : "Sign in with Google"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
