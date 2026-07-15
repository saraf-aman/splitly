"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { createHousehold, joinHousehold } from "@/lib/household";

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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 dark:bg-black">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Welcome to Splitly</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Create a new household, or join one with an invite ID.
        </p>
      </div>

      <div className="flex gap-1 rounded-full bg-zinc-200 p-1 dark:bg-zinc-800">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "create"
              ? "bg-white text-black shadow dark:bg-zinc-950 dark:text-white"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          Create household
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "join"
              ? "bg-white text-black shadow dark:bg-zinc-950 dark:text-white"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          Join household
        </button>
      </div>

      {mode === "create" ? (
        <form onSubmit={handleCreate} className="flex w-full max-w-xs flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Household name"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-full bg-indigo-600 px-6 py-3 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create household"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="flex w-full max-w-xs flex-col gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Household ID"
            className="rounded-lg border border-zinc-300 px-4 py-2 font-mono text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={submitting || !code.trim()}
            className="rounded-full bg-indigo-600 px-6 py-3 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Joining..." : "Join household"}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
