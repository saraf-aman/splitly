"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserHousehold } from "@/lib/household";

export default function HouseholdRedirect() {
  const { householdId, loading } = useUserHousehold();
  const router = useRouter();

  useEffect(() => {
    if (loading || !householdId) return;
    router.replace(`/households/${householdId}/household`);
  }, [loading, householdId, router]);

  return null;
}
