"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Loader2, LogOut, Trash2, Unlink } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { clearLastGroupId } from "@/lib/group";
import { useSplitwiseStatus, disconnectSplitwise } from "@/lib/splitwise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface OwnedHousehold {
  id: string;
  name: string;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { loading: swLoading, connected: swConnected, connection: swConnection } = useSplitwiseStatus(user?.uid);

  const [swConnecting, setSwConnecting] = useState(false);
  const [swDisconnecting, setSwDisconnecting] = useState(false);
  const [swError, setSwError] = useState<string | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [ownedHouseholds, setOwnedHouseholds] = useState<OwnedHousehold[] | null>(null);

  // Self-heal: connections made before the callback started storing
  // splitwise.email won't have it yet — backfill once, silently.
  useEffect(() => {
    if (!user || !swConnected || swConnection?.email) return;
    void (async () => {
      try {
        const idToken = await user.getIdToken();
        await fetch("/api/splitwise/backfill-email", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } catch {
        // silent — retry next Profile visit
      }
    })();
  }, [user, swConnected, swConnection?.email]);

  async function handleSignOut() {
    clearLastGroupId();
    await signOut(auth);
    router.replace("/login");
  }

  async function handleSwConnect() {
    if (!user) return;
    setSwConnecting(true);
    setSwError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(
        `/api/splitwise/connect?returnPath=${encodeURIComponent("/profile")}`,
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

  async function handleDeleteAccount() {
    if (!user) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.status === 409) {
        const data = (await res.json()) as { households: OwnedHousehold[] };
        setOwnedHouseholds(data.households);
        return;
      }
      if (!res.ok) throw new Error("Failed");
      clearLastGroupId();
      await signOut(auth);
      router.replace("/login");
    } catch {
      setDeleteError("Could not delete your account. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 bg-background px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <Link
        href="/groups"
        className="-mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft size={15} />
        Back
      </Link>

      <h1 className="text-heading text-foreground">Profile</h1>

      {/* Account */}
      <Card>
        <CardContent className="flex items-center gap-3">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-semibold text-muted-foreground">
              {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">
              {user.displayName ?? "—"}
            </span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </CardContent>
      </Card>

      {/* Splitwise */}
      {!swLoading && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-foreground">Splitwise</h2>
            {swConnected ? (
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="shrink-0 text-emerald-600" />
                <span className="flex-1 truncate text-sm text-foreground">
                  {swConnection?.email ?? "Connected"}
                </span>
                <button
                  onClick={handleSwDisconnect}
                  disabled={swDisconnecting}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                >
                  {swDisconnecting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Unlink size={12} />
                  )}
                  Disconnect
                </button>
              </div>
            ) : (
              <Button variant="outline" onClick={handleSwConnect} disabled={swConnecting}>
                {swConnecting ? "Connecting…" : "Connect Splitwise"}
              </Button>
            )}
            {swError && <p className="text-xs text-destructive">{swError}</p>}
          </CardContent>
        </Card>
      )}

      {/* Account actions */}
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-destructive/10"
          style={{ color: "var(--destructive)" }}
        >
          <LogOut size={16} className="shrink-0" />
          Sign out
        </button>

        {!showDeleteConfirm && !ownedHouseholds && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-destructive/10"
            style={{ color: "var(--destructive)" }}
          >
            <Trash2 size={16} className="shrink-0" />
            Delete account
          </button>
        )}
      </div>

      {ownedHouseholds && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3">
          <p className="text-xs text-foreground">
            {ownedHouseholds.length === 1 ? "This household has" : "These households have"} no
            other member to take over as owner, so your account can&apos;t be deleted yet. Add
            another member first, or delete the household if it&apos;s no longer needed:
          </p>
          <ul className="flex flex-col gap-1">
            {ownedHouseholds.map((h) => (
              <li key={h.id}>
                <Link
                  href={`/groups/${h.id}/group`}
                  className="text-xs font-medium underline"
                  style={{ color: "var(--destructive)" }}
                >
                  {h.name}
                </Link>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setOwnedHouseholds(null)}
            className="self-start text-xs text-muted-foreground underline"
          >
            Back
          </button>
        </div>
      )}

      {showDeleteConfirm && !ownedHouseholds && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3">
          <p className="text-xs text-foreground">
            This permanently deletes your account and removes you from every household. If you
            own a household with another member, ownership transfers to them automatically. This
            cannot be undone.{" "}
            <Link href="/data-deletion" className="underline">
              Full details
            </Link>
            .
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-email" className="text-caption text-muted-foreground">
              Type &ldquo;<span className="font-money">{user.email}</span>&rdquo; to confirm
            </Label>
            <Input
              id="confirm-email"
              className="border-border bg-card dark:bg-card"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              disabled={deleting}
            />
          </div>
          {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting || confirmEmail !== user.email}
              onClick={handleDeleteAccount}
            >
              {deleting ? "Deleting…" : "Delete account forever"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowDeleteConfirm(false);
                setConfirmEmail("");
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
