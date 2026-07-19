"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { createGroup, joinGroup } from "@/lib/group";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  title?: string;
  description?: string;
}

export function GroupFormCard({ title, description }: Props) {
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
      await createGroup(user, name.trim());
      setName("");
    } catch {
      setError("Couldn't create the group. Please try again.");
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
      await joinGroup(user, code.trim());
      setCode("");
    } catch {
      setError("That invite code doesn't look right. Double-check it and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {(title || description) && (
        <div className="flex flex-col items-center gap-2 text-center">
          {title && <h1 className="text-heading text-foreground">{title}</h1>}
          {description && <p className="text-body text-muted-foreground">{description}</p>}
        </div>
      )}

      <div className="flex gap-1 rounded-full bg-secondary p-1">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            mode === "create"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
        >
          Create group
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            mode === "join" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          Join group
        </button>
      </div>

      <Card className="w-full max-w-xs">
        <CardContent>
          {mode === "create" ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hf-name">Group name</Label>
                <Input
                  id="hf-name"
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
                {submitting ? "Creating..." : "Create group"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hf-code">Invite code</Label>
                <Input
                  id="hf-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste invite code"
                  className="h-11 font-mono text-base"
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !code.trim()}
                className="h-11 text-base"
              >
                {submitting ? "Joining..." : "Join group"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
