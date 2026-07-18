"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUserHousehold } from "@/lib/household";

export default function ReviewRedirect() {
  const { billId } = useParams<{ billId: string }>();
  const { householdId, loading } = useUserHousehold();
  const router = useRouter();

  useEffect(() => {
    if (loading || !householdId) return;
    router.replace(`/households/${householdId}/bills/${billId}/review`);
  }, [loading, householdId, billId, router]);

  return null;
}
