"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { clearRemovedHouseholdPointer, useMembershipStatus, useUserHouseholds } from "@/lib/household";
import { useNotificationSetup } from "@/lib/notifications";

const ONBOARDING_PATH = "/onboarding";
const PICKER_PATH = "/households";

export function HouseholdGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { householdIds, loading } = useUserHouseholds();
  const pathname = usePathname();
  const router = useRouter();

  // Which household is currently open in the URL (null on picker/onboarding/root).
  const hhMatch = pathname.match(/^\/households\/([^/]+)/);
  const viewedHouseholdId = hhMatch?.[1] ?? null;

  // Membership is checked against the *viewed* household, not the user's first one.
  // This means removal is detected per-household rather than globally.
  const membership = useMembershipStatus(viewedHouseholdId, user?.uid);

  // FCM tokens are stored on member docs; use first household for now.
  useNotificationSetup(user?.uid, householdIds[0] ?? null);

  // Backfill email field on all member docs (added after initial release).
  const idsKey = householdIds.join(",");
  useEffect(() => {
    if (!user?.uid || !user.email || !householdIds.length) return;
    householdIds.forEach((id) => {
      void updateDoc(doc(db, "households", id, "members", user.uid), { email: user.email });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.email, idsKey]);

  const isOnboarding = pathname === ONBOARDING_PATH;
  const isPicker = pathname === PICKER_PATH;

  // wasRemoved: we're on a specific household URL but our member doc is gone.
  const wasRemoved = !!viewedHouseholdId && !membership.loading && !membership.isMember;
  const clearing = useRef(false);

  useEffect(() => {
    clearing.current = false;
  }, [viewedHouseholdId]);

  useEffect(() => {
    if (!user || loading) return;

    if (wasRemoved) {
      if (!clearing.current) {
        clearing.current = true;
        // Remove the stale pointer, then let the picker route to remaining households
        // (or onboarding if this was the last one).
        void clearRemovedHouseholdPointer(user, viewedHouseholdId!);
        router.replace(PICKER_PATH);
      }
      return;
    }

    // No households yet — must onboard. Picker and onboarding manage themselves.
    if (householdIds.length === 0 && !isOnboarding && !isPicker) {
      router.replace(ONBOARDING_PATH);
    }
    // Already has households but landed on onboarding — go to picker (handles 1 vs 2+).
    if (householdIds.length > 0 && isOnboarding) {
      router.replace(PICKER_PATH);
    }
  }, [user, loading, householdIds, isOnboarding, isPicker, router, wasRemoved, viewedHouseholdId]);

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
        <p className="text-zinc-500">You&apos;ve been removed from this household.</p>
      </div>
    );
  }

  // Suppress children while a redirect is in flight.
  if (householdIds.length === 0 && !isOnboarding && !isPicker) {
    return null;
  }
  if (householdIds.length > 0 && isOnboarding) {
    return null;
  }

  return <>{children}</>;
}
