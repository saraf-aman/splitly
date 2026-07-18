"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserHousehold } from "@/lib/household";

export default function NewBillRedirect() {
  const { householdId, loading } = useUserHousehold();
  const router = useRouter();

  useEffect(() => {
    if (loading || !householdId) return;
    router.replace(`/households/${householdId}/bills/new`);
  }, [loading, householdId, router]);

  return null;
}
