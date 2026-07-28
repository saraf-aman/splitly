"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLastGroupId } from "@/lib/group";

// Jump straight back into the last group actually viewed on this device,
// skipping the picker → Firestore round trip on every app open. If we've
// never recorded one (fresh login, cleared storage), fall back to the
// picker, which handles the 0/1/2+ group cases. Either way, GroupGate still
// verifies real membership once its data loads and corrects course if the
// cached group is stale (removed, deleted, etc).
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const lastGroupId = getLastGroupId();
    router.replace(lastGroupId ? `/groups/${lastGroupId}` : "/groups");
  }, [router]);

  return null;
}
