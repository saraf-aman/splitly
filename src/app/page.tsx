"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserHousehold } from "@/lib/household";

// Redirect shim — real home is now /households/[householdId].
// HouseholdGate handles the no-household → /onboarding case.
export default function RootPage() {
  const { householdId, loading } = useUserHousehold();
  const router = useRouter();

  useEffect(() => {
    if (loading || !householdId) return;
    router.replace(`/households/${householdId}`);
  }, [loading, householdId, router]);

  return null;
}
