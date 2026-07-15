"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { clearRemovedHouseholdPointer, useMembershipStatus, useUserHousehold } from "@/lib/household";

const ONBOARDING_PATH = "/onboarding";

export function HouseholdGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { householdId, loading } = useUserHousehold();
  const membership = useMembershipStatus(householdId, user?.uid);
  const pathname = usePathname();
  const router = useRouter();
  const isOnboarding = pathname === ONBOARDING_PATH;
  const wasRemoved = !!householdId && !membership.loading && !membership.isMember;
  const clearing = useRef(false);

  useEffect(() => {
    clearing.current = false;
  }, [householdId]);

  useEffect(() => {
    if (!user || loading) return;

    if (wasRemoved) {
      // We're still holding a users/{uid} -> householdId pointer, but our
      // membership doc is gone (removed by an admin, possibly while this tab
      // was already open) — self-clear the pointer so we route to onboarding
      // instead of continuing to show household data we can no longer read.
      if (!clearing.current) {
        clearing.current = true;
        void clearRemovedHouseholdPointer(user);
      }
      return;
    }

    if (!householdId && !isOnboarding) {
      router.replace(ONBOARDING_PATH);
    }
    if (householdId && isOnboarding) {
      router.replace("/");
    }
  }, [user, loading, householdId, isOnboarding, router, wasRemoved]);

  // AuthGate owns the logged-out / /login case — nothing to gate here yet.
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

  if (!householdId && !isOnboarding) {
    return null;
  }

  if (householdId && isOnboarding) {
    return null;
  }

  return <>{children}</>;
}
