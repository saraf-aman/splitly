"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUserGroup } from "@/lib/group";

export default function GridRedirect() {
  const { billId } = useParams<{ billId: string }>();
  const { groupId, loading } = useUserGroup();
  const router = useRouter();

  useEffect(() => {
    if (loading || !groupId) return;
    router.replace(`/groups/${groupId}/bills/${billId}/grid`);
  }, [loading, groupId, billId, router]);

  return null;
}
