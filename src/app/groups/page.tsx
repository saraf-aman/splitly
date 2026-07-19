"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, CheckCircle, Unlink, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useUserGroups, useGroupList } from "@/lib/group";
import { useSplitwiseStatus, disconnectSplitwise } from "@/lib/splitwise";
import { GroupFormCard } from "@/components/GroupFormCard";
import { Button } from "@/components/ui/button";

export default function GroupsPickerPage() {
  const { loading, groupIds } = useUserGroups();
  const groups = useGroupList(groupIds);
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinMode = searchParams.get("join") === "1";
  const pickerMode = searchParams.get("picker") === "1";

  const { user } = useAuth();
  const { loading: swLoading, connected } = useSplitwiseStatus(user?.uid);
  const [swConnecting, setSwConnecting] = useState(false);
  const [swDisconnecting, setSwDisconnecting] = useState(false);
  const [swError, setSwError] = useState<string | null>(null);

  // Show connection status toast based on callback query param
  const swParam = searchParams.get("sw");
  const swErrorParam = searchParams.get("sw_error");
  useEffect(() => {
    void Promise.resolve().then(() => {
      if (swErrorParam) setSwError("Splitwise connection failed. Please try again.");
      else if (swParam === "connected") setSwError(null);
    });
  }, [swParam, swErrorParam]);

  useEffect(() => {
    if (loading) return;
    if (groupIds.length === 0) {
      router.replace("/onboarding");
      return;
    }
    if (groupIds.length === 1 && !joinMode && !pickerMode) {
      router.replace(`/groups/${groupIds[0]}`);
    }
  }, [loading, groupIds, router, joinMode, pickerMode]);

  // Show nothing while redirecting (0 or 1 group when not in join/picker mode)
  if (loading || (groupIds.length < 2 && !joinMode && !pickerMode)) return null;

  async function handleConnect() {
    if (!user) return;
    setSwConnecting(true);
    setSwError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/splitwise/connect", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error("Failed to start connection");
      const { authUrl } = (await res.json()) as { authUrl: string };
      window.location.href = authUrl;
    } catch {
      setSwError("Could not start Splitwise connection. Please try again.");
      setSwConnecting(false);
    }
  }

  async function handleDisconnect() {
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

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-6 pt-12 pb-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-heading text-foreground">Your groups</h1>
        <p className="text-body text-muted-foreground">Choose one to open</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => router.push(`/groups/${g.id}`)}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-secondary active:bg-secondary"
          >
            <span className="text-sm font-medium text-foreground">{g.name}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      <div className="w-full max-w-xs">
        <GroupFormCard />
      </div>

      {/* Splitwise connection — global, not per-group */}
      {!swLoading && (
        <div className="w-full max-w-xs">
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
            <div className="flex items-center gap-2">
              {connected ? (
                <CheckCircle className="size-4 text-emerald-600" />
              ) : (
                <span className="size-4" />
              )}
              <span className="text-sm font-medium text-foreground">
                Splitwise
              </span>
              {connected && (
                <span className="text-xs text-emerald-600 font-medium">connected</span>
              )}
            </div>

            {connected ? (
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                onClick={handleDisconnect}
                disabled={swDisconnecting}
              >
                {swDisconnecting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Unlink className="size-3" />
                )}
                Disconnect
              </button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleConnect}
                disabled={swConnecting}
              >
                {swConnecting ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" />
                    Connecting…
                  </span>
                ) : (
                  "Connect"
                )}
              </Button>
            )}
          </div>

          {swError && (
            <p className="mt-1.5 text-xs text-destructive px-1">{swError}</p>
          )}
        </div>
      )}
    </div>
  );
}
