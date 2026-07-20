"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ChevronDown, PlusCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useUserGroups, useGroupList } from "@/lib/group";
import { GroupFormCard } from "@/components/GroupFormCard";

export default function GroupsPickerPage() {
  const { loading, groupIds } = useUserGroups();
  const groups = useGroupList(groupIds);
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinMode = searchParams.get("join") === "1";
  const pickerMode = searchParams.get("picker") === "1";
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(joinMode);

  useEffect(() => {
    if (!user) return;
    if (loading) return;
    if (groupIds.length === 0) {
      router.replace("/onboarding");
      return;
    }
    if (groupIds.length === 1 && !joinMode && !pickerMode) {
      router.replace(`/groups/${groupIds[0]}`);
    }
  }, [loading, groupIds, router, joinMode, pickerMode, user]);

  // Show nothing while redirecting (0 or 1 group when not in join/picker mode)
  if (loading || (groupIds.length < 2 && !joinMode && !pickerMode)) return null;

  return (
    <div className="flex flex-1 flex-col items-center gap-4 bg-background px-6 pt-10 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-heading text-foreground">Your groups</h1>
        <p className="text-body text-muted-foreground">Choose one to open</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        {/* Add / Join Group — collapsed by default */}
        <div className="flex flex-col">
          <button
            onClick={() => setFormOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <PlusCircle size={15} className="shrink-0" />
            <span className="flex-1">Add / Join Group</span>
            <ChevronDown
              size={14}
              className="shrink-0 transition-transform"
              style={{ transform: formOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>

          {formOpen && (
            <div className="mt-3">
              <GroupFormCard />
            </div>
          )}
        </div>

        {/* Group list */}
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
    </div>
  );
}
