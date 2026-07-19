"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserGroup } from "@/lib/group";

export default function NewBillRedirect() {
  const { groupId, loading } = useUserGroup();
  const router = useRouter();

  useEffect(() => {
    if (loading || !groupId) return;
    router.replace(`/groups/${groupId}/bills/new`);
  }, [loading, groupId, router]);

  return null;
}
