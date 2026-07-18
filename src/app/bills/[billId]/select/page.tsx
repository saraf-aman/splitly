"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUserHousehold } from "@/lib/household";

export default function SelectRedirect() {
  const { billId } = useParams<{ billId: string }>();
  const { householdId, loading } = useUserHousehold();
  const router = useRouter();

  useEffect(() => {
    if (loading || !householdId) return;
    router.replace(`/households/${householdId}/bills/${billId}/select`);
  }, [loading, householdId, billId, router]);

  return null;
}
