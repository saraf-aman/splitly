"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { createHousehold, joinHousehold } from "@/lib/household";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function OnboardingPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createHousehold(user, name.trim());
    } catch {
      setError("Couldn't create the household. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!user || !code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await joinHousehold(user, code.trim());
    } catch {
      setError("That household ID doesn't look right. Double-check it and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-heading text-foreground">Welcome to Splitly</h1>
        <p className="text-body text-muted-foreground">
          Create a new household, or join one with an invite ID.
        </p>
      </div>

      <div className="flex gap-1 rounded-full bg-secondary p-1">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            mode === "create"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          Create household
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            mode === "join" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          Join household
        </button>
      </div>

      <Card className="w-full max-w-xs">
        <CardContent>
          {mode === "create" ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="household-name">Household name</Label>
                <Input
                  id="household-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Apt. 4B"
                  className="h-11 text-base"
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !name.trim()}
                className="h-11 text-base"
              >
                {submitting ? "Creating..." : "Create household"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="household-code">Household ID</Label>
                <Input
                  id="household-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Invite ID"
                  className="h-11 font-mono text-base"
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !code.trim()}
                className="h-11 text-base"
              >
                {submitting ? "Joining..." : "Join household"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
