"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useUserGroups, useGroupList } from "@/lib/group";
import { GroupFormCard } from "@/components/GroupFormCard";

export default function GroupsPickerPage() {
  const { loading, groupIds } = useUserGroups();
  const groups = useGroupList(groupIds);
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinMode = searchParams.get("join") === "1";
  const pickerMode = searchParams.get("picker") === "1";

  useEffect(() => {
    if (loading) return;
    if (groupIds.length === 0) {
      router.replace("/onboarding");
      return;
    }
    if (groupIds.length === 1 && !joinMode && !pickerMode) {
      router.replace(`/groups/${groupIds[0]}`);
    }
  }, [loading, groupIds, router, joinMode, pickerMode]);

  // Show nothing while redirecting (0 or 1 group when not in join/picker mode)
  if (loading || (groupIds.length < 2 && !joinMode && !pickerMode)) return null;

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-6 pt-12 pb-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-heading text-foreground">Your groups</h1>
        <p className="text-body text-muted-foreground">Choose one to open</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => router.push(`/groups/${g.id}`)}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-secondary active:bg-secondary"
          >
            <span className="text-sm font-medium text-foreground">{g.name}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      <div className="w-full pt-2">
        <GroupFormCard />
      </div>
    </div>
  );
}
