"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUserGroup } from "@/lib/group";

export default function ReviewRedirect() {
  const { billId } = useParams<{ billId: string }>();
  const { groupId, loading } = useUserGroup();
  const router = useRouter();

  useEffect(() => {
    if (loading || !groupId) return;
    router.replace(`/groups/${groupId}/bills/${billId}/review`);
  }, [loading, groupId, billId, router]);

  return null;
}
