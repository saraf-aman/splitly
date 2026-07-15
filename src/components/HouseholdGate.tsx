"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useUserHousehold } from "@/lib/household";

const ONBOARDING_PATH = "/onboarding";

export function HouseholdGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { householdId, loading } = useUserHousehold();
  const pathname = usePathname();
  const router = useRouter();
  const isOnboarding = pathname === ONBOARDING_PATH;

  useEffect(() => {
    if (!user || loading) return;
    if (!householdId && !isOnboarding) {
      router.replace(ONBOARDING_PATH);
    }
    if (householdId && isOnboarding) {
      router.replace("/");
    }
  }, [user, loading, householdId, isOnboarding, router]);

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

  if (!householdId && !isOnboarding) {
    return null;
  }

  if (householdId && isOnboarding) {
    return null;
  }

  return <>{children}</>;
}
