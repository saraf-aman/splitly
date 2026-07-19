"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Home,
  Settings,
  ArrowLeftRight,
  LogOut,
  X,
  Copy,
  Check,
  Users,
  DoorOpen,
  CheckCircle,
  Unlink,
  Link,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useGroup, useMembers, leaveGroup } from "@/lib/group";
import { useSplitwiseStatus, disconnectSplitwise, saveGroupSplitwise, clearGroupSplitwise } from "@/lib/splitwise";

interface SwGroup {
  id: number;
  name: string;
}

interface Props {
  householdId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function NavDrawer({ householdId, isOpen, onClose }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const household = useGroup(householdId);
  const members = useMembers(householdId);
  const { loading: swLoading, connected: swConnected } = useSplitwiseStatus(user?.uid);

  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Splitwise personal connection
  const [swConnecting, setSwConnecting] = useState(false);
  const [swDisconnecting, setSwDisconnecting] = useState(false);
  const [swError, setSwError] = useState<string | null>(null);

  // Splitwise group linking (owner only)
  const [swGroups, setSwGroups] = useState<SwGroup[]>([]);
  const [swGroupsLoading, setSwGroupsLoading] = useState(false);
  const [swGroupsError, setSwGroupsError] = useState<string | null>(null);
  const [swLinkOpen, setSwLinkOpen] = useState(false);
  const [swSaving, setSwSaving] = useState(false);
  const [swClearing, setSwClearing] = useState(false);

  // Whether the current user is actually a member of the linked Splitwise group.
  // "idle" = not yet checked; "checking" = in flight; "member"/"not-member" = result.
  type SwMembership = "idle" | "checking" | "member" | "not-member";
  const [swMembership, setSwMembership] = useState<SwMembership>("idle");

  const me = members.find((m) => m.id === user?.uid);
  const isAdmin = me?.role === "admin";
  const isCreator = !!user && household?.createdBy === user.uid;
  const linkedGroupId = household?.splitwiseGroupId;

  // Reset membership check whenever the user's connection or the linked group changes.
  useEffect(() => {
    void Promise.resolve().then(() => setSwMembership("idle"));
  }, [swConnected, linkedGroupId]);

  // Run the membership check once per (connected + linked group) session, on drawer open.
  useEffect(() => {
    if (!isOpen || !swConnected || !linkedGroupId || !user) return;
    if (swMembership !== "idle") return;
    void Promise.resolve().then(() => setSwMembership("checking"));
    void (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/splitwise/groups", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as { groups: SwGroup[] };
        const isMember = data.groups.some((g) => g.id === linkedGroupId);
        setSwMembership(isMember ? "member" : "not-member");
        // Cache the groups list so the owner's link picker doesn't need a second fetch.
        if (data.groups.length > 0) setSwGroups(data.groups);
      } catch {
        setSwMembership("idle"); // silent fail — retry next open
      }
    })();
  }, [isOpen, swConnected, linkedGroupId, user, swMembership]);

  // Read sw params on return from OAuth, store error in state, clear URL
  const swParam = searchParams.get("sw");
  const swErrorParam = searchParams.get("sw_error");
  useEffect(() => {
    if (!swParam && !swErrorParam) return;
    void Promise.resolve().then(() => {
      if (swErrorParam) {
        setSwError(`Splitwise connection failed (${swErrorParam}). Please try again.`);
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("sw");
      url.searchParams.delete("sw_error");
      window.history.replaceState(null, "", url.toString());
    });
  }, [swParam, swErrorParam]);

  const close = useCallback(() => {
    setShowInvite(false);
    setCopied(false);
    setShowLeaveConfirm(false);
    setSwLinkOpen(false);
    setSwGroups([]);
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

  async function handleSwConnect() {
    if (!user) return;
    setSwConnecting(true);
    setSwError(null);
    try {
      const idToken = await user.getIdToken();
      const returnPath = window.location.pathname;
      const res = await fetch(
        `/api/splitwise/connect?returnPath=${encodeURIComponent(returnPath)}`,
        { headers: { Authorization: `Bearer ${idToken}` } },
      );
      if (!res.ok) throw new Error("Failed");
      const { authUrl } = (await res.json()) as { authUrl: string };
      window.location.href = authUrl;
    } catch {
      setSwError("Could not start Splitwise connection. Please try again.");
      setSwConnecting(false);
    }
  }

  async function handleSwDisconnect() {
    if (!user) return;
    setSwDisconnecting(true);
    setSwError(null);
    try {
      await disconnectSplitwise(user.uid);
    } catch {
      setSwError("Could not disconnect. Please try again.");
    } finally {
      setSwDisconnecting(false);
    }
  }

  async function handleOpenLinkPicker() {
    if (!user) return;
    setSwLinkOpen(true);
    setSwGroupsError(null);
    if (swGroups.length > 0) return; // already loaded
    setSwGroupsLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/splitwise/groups", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { groups: SwGroup[] };
      setSwGroups(data.groups);
    } catch {
      setSwGroupsError("Could not load groups. Please try again.");
    } finally {
      setSwGroupsLoading(false);
    }
  }

  async function handleLinkGroup(g: SwGroup) {
    setSwSaving(true);
    try {
      await saveGroupSplitwise(householdId, g.id, g.name);
      setSwLinkOpen(false);
    } catch {
      setSwGroupsError("Could not link group. Please try again.");
    } finally {
      setSwSaving(false);
    }
  }

  async function handleUnlinkGroup() {
    setSwClearing(true);
    try {
      await clearGroupSplitwise(householdId);
    } catch {
      setSwError("Could not unlink group. Please try again.");
    } finally {
      setSwClearing(false);
    }
  }

  const linkedGroupName = household?.splitwiseGroupName;

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
        className="fixed inset-y-0 right-0 z-40 flex w-72 flex-col overflow-y-auto bg-card shadow-xl"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms ease-out",
        }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between border-b border-border px-5"
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

          {/* Invite code */}
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

        {/* Splitwise section */}
        {!swLoading && (
          <div className="flex flex-col gap-1 px-3 py-3">
            <p className="mb-0.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Splitwise
            </p>

            {/* Personal connection row */}
            {swConnected ? (
              <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                <CheckCircle size={14} className="shrink-0 text-emerald-600" />
                <span className="flex-1 text-sm text-foreground">Connected</span>
                <button
                  onClick={handleSwDisconnect}
                  disabled={swDisconnecting}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                >
                  {swDisconnecting
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Unlink size={12} />}
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleSwConnect}
                disabled={swConnecting}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                {swConnecting
                  ? <Loader2 size={15} className="shrink-0 animate-spin text-muted-foreground" />
                  : <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-muted-foreground text-[9px] font-bold text-muted-foreground">S</span>}
                {swConnecting ? "Connecting…" : "Connect Splitwise"}
              </button>
            )}

            {/* Per-group Splitwise group — only when personally connected */}
            {swConnected && (
              <>
                {linkedGroupName ? (
                  swMembership === "not-member" ? (
                    /* User is connected but not in this Splitwise group */
                    <div
                      className="mx-1 mt-0.5 flex flex-col gap-1 rounded-lg border px-3 py-2.5"
                      style={{ background: "rgba(217,119,6,0.06)", borderColor: "rgba(217,119,6,0.25)" }}
                    >
                      <p className="text-xs font-semibold" style={{ color: "#B45309" }}>
                        Not in this group
                      </p>
                      <p className="text-xs" style={{ color: "#92400E" }}>
                        You&apos;re not a member of &ldquo;{linkedGroupName}&rdquo; on Splitwise. Ask the group owner to add you there.
                      </p>
                    </div>
                  ) : (
                    /* Group is linked — show name to everyone, owner gets unlink */
                    <div className="mx-1 mt-0.5 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                      {swMembership === "checking"
                        ? <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" />
                        : <CheckCircle size={12} className="shrink-0 text-emerald-600" />}
                      <span className="flex-1 truncate text-xs font-medium text-foreground">
                        {linkedGroupName}
                      </span>
                      {isCreator && (
                        <button
                          onClick={handleUnlinkGroup}
                          disabled={swClearing}
                          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                        >
                          {swClearing
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Unlink size={11} />}
                          Unlink
                        </button>
                      )}
                    </div>
                  )
                ) : isCreator ? (
                  /* No group linked yet — owner can link */
                  <div className="mx-1 mt-0.5 flex flex-col gap-1">
                    <button
                      onClick={swLinkOpen ? () => { setSwLinkOpen(false); setSwGroups([]); } : handleOpenLinkPicker}
                      disabled={swGroupsLoading}
                      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      {swGroupsLoading
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Link size={12} />}
                      <span className="flex-1 text-left">
                        {swGroupsLoading ? "Loading groups…" : "Link Splitwise group"}
                      </span>
                      {!swGroupsLoading && (
                        <ChevronDown
                          size={12}
                          className="transition-transform"
                          style={{ transform: swLinkOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                        />
                      )}
                    </button>

                    {swGroupsError && (
                      <p className="px-3 text-xs text-destructive">{swGroupsError}</p>
                    )}

                    {swLinkOpen && swGroups.length > 0 && (
                      <div className="rounded-lg border border-border bg-background shadow-sm">
                        {swGroups.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => handleLinkGroup(g)}
                            disabled={swSaving}
                            className="flex w-full items-center px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-secondary first:rounded-t-lg last:rounded-b-lg"
                          >
                            {swSaving
                              ? <Loader2 size={11} className="mr-2 shrink-0 animate-spin" />
                              : null}
                            {g.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Non-owner, no group linked */
                  <p className="px-3 text-xs text-muted-foreground">
                    No Splitwise group linked yet.
                  </p>
                )}
              </>
            )}

            {swError && (
              <p className="mt-0.5 px-3 text-xs text-destructive">{swError}</p>
            )}
          </div>
        )}

        <div className="mx-3 border-t border-border" />

        {/* Secondary nav */}
        <nav className="flex flex-col gap-0.5 p-3">
          <button
            onClick={() => nav("/groups?picker=1")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeftRight size={16} className="shrink-0 text-muted-foreground" />
            Switch Group
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
