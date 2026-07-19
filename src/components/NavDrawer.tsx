"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Settings, ArrowLeftRight, LogOut, X, Copy, Check, Users, DoorOpen } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useGroup, useMembers, leaveGroup } from "@/lib/group";

interface Props {
  householdId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function NavDrawer({ householdId, isOpen, onClose }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const household = useGroup(householdId);
  const members = useMembers(householdId);
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const me = members.find((m) => m.id === user?.uid);
  const isAdmin = me?.role === "admin";
  const isCreator = !!user && household?.createdBy === user.uid;

  const close = useCallback(() => {
    setShowInvite(false);
    setCopied(false);
    setShowLeaveConfirm(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  async function handleLeave() {
    if (!user) return;
    setLeaving(true);
    try {
      await leaveGroup(user, householdId);
      onClose();
      router.replace("/groups");
    } finally {
      setLeaving(false);
    }
  }

  async function handleSignOut() {
    close();
    await signOut(auth);
    router.replace("/login");
  }

  function nav(href: string) {
    close();
    router.push(href);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(householdId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-30"
        style={{
          background: "rgba(26,26,31,0.36)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 200ms ease",
        }}
        onClick={close}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="fixed inset-y-0 right-0 z-40 flex w-72 flex-col bg-card shadow-xl"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms ease-out",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border px-5"
          style={{ height: 62 }}
        >
          <span className="truncate pr-4 text-sm font-semibold text-foreground">
            {household?.name ?? "—"}
          </span>
          <button
            onClick={close}
            aria-label="Close menu"
            className="flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            style={{ width: 32, height: 32 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Primary nav */}
        <nav className="flex flex-col gap-0.5 p-3">
          <button
            onClick={() => nav(`/groups/${householdId}`)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Home size={16} className="shrink-0 text-muted-foreground" />
            Home
          </button>

          {isAdmin && (
            <button
              onClick={() => nav(`/groups/${householdId}/group`)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <Settings size={16} className="shrink-0 text-muted-foreground" />
              Manage
            </button>
          )}

          {/* Invite code — available to all members */}
          <button
            onClick={() => setShowInvite((v) => !v)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Users size={16} className="shrink-0 text-muted-foreground" />
            Invite Code
          </button>

          {showInvite && (
            <div className="mx-1 mb-1 rounded-lg border border-border bg-secondary/60 px-3 py-2.5">
              <p className="mb-1.5 text-xs text-muted-foreground">Share this code to invite someone:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs font-mono text-foreground border border-border">
                  {householdId}
                </code>
                <button
                  onClick={handleCopy}
                  aria-label="Copy invite code"
                  className="flex shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  style={{ width: 30, height: 30 }}
                >
                  {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          )}
        </nav>

        <div className="mx-3 border-t border-border" />

        {/* Secondary nav */}
        <nav className="flex flex-col gap-0.5 p-3">
          <button
            onClick={() => nav("/groups?join=1")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeftRight size={16} className="shrink-0 text-muted-foreground" />
            Switch Household
          </button>

          {!isCreator && !showLeaveConfirm && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-destructive/10"
              style={{ color: "var(--destructive)" }}
            >
              <DoorOpen size={16} className="shrink-0" />
              Leave Group
            </button>
          )}

          {!isCreator && showLeaveConfirm && (
            <div className="mx-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <p className="mb-2.5 text-xs text-foreground">
                Leave <span className="font-semibold">{household?.name}</span>? You&apos;ll lose access to all its bills.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleLeave}
                  disabled={leaving}
                  className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors"
                  style={{ background: "var(--destructive)", opacity: leaving ? 0.6 : 1 }}
                >
                  {leaving ? "Leaving…" : "Yes, leave"}
                </button>
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-destructive/10"
            style={{ color: "var(--destructive)" }}
          >
            <LogOut size={16} className="shrink-0" />
            Sign out
          </button>
        </nav>
      </div>
    </>
  );
}
