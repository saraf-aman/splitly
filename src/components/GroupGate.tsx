"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { clearRemovedGroupPointer, useMembershipStatus, useUserGroups } from "@/lib/group";
import { useNotificationSetup } from "@/lib/notifications";

const ONBOARDING_PATH = "/onboarding";
const PICKER_PATH = "/groups";

export function GroupGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { groupIds, loading } = useUserGroups();
  const pathname = usePathname();
  const router = useRouter();

  // Which group is currently open in the URL (null on picker/onboarding/root).
  const ggMatch = pathname.match(/^\/groups\/([^/]+)/);
  const viewedGroupId = ggMatch?.[1] ?? null;

  // Membership is checked against the *viewed* group, not the user's first one.
  // This means removal is detected per-group rather than globally.
  const membership = useMembershipStatus(viewedGroupId, user?.uid);

  // FCM tokens are stored on member docs; use first group for now.
  useNotificationSetup(user?.uid, groupIds[0] ?? null);

  // Backfill email field on all member docs (added after initial release).
  const idsKey = groupIds.join(",");
  useEffect(() => {
    if (!user?.uid || !user.email || !groupIds.length) return;
    groupIds.forEach((id) => {
      void updateDoc(doc(db, "households", id, "members", user.uid), { email: user.email });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.email, idsKey]);

  const isOnboarding = pathname === ONBOARDING_PATH;
  const isPicker = pathname === PICKER_PATH;

  // wasRemoved: we're on a specific group URL but our member doc is gone.
  const wasRemoved = !!viewedGroupId && !membership.loading && !membership.isMember;
  const clearing = useRef(false);

  useEffect(() => {
    clearing.current = false;
  }, [viewedGroupId]);

  useEffect(() => {
    if (!user || loading) return;

    if (wasRemoved) {
      if (!clearing.current) {
        clearing.current = true;
        // Remove the stale pointer, then let the picker route to remaining groups
        // (or onboarding if this was the last one).
        void clearRemovedGroupPointer(user, viewedGroupId!);
        router.replace(PICKER_PATH);
      }
      return;
    }

    // No groups yet — must onboard. Picker and onboarding manage themselves.
    if (groupIds.length === 0 && !isOnboarding && !isPicker) {
      router.replace(ONBOARDING_PATH);
    }
    // Already has groups but landed on onboarding — go to picker (handles 1 vs 2+).
    if (groupIds.length > 0 && isOnboarding) {
      router.replace(PICKER_PATH);
    }
  }, [user, loading, groupIds, isOnboarding, isPicker, router, wasRemoved, viewedGroupId]);

  if (!user) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (wasRemoved) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-zinc-500">You&apos;ve been removed from this group.</p>
      </div>
    );
  }

  // Suppress children while a redirect is in flight.
  if (groupIds.length === 0 && !isOnboarding && !isPicker) {
    return null;
  }
  if (groupIds.length > 0 && isOnboarding) {
    return null;
  }

  return <>{children}</>;
}
