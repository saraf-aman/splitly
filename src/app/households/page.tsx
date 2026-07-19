"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useUserHouseholds, useHouseholdList } from "@/lib/household";
import { HouseholdFormCard } from "@/components/HouseholdFormCard";

export default function HouseholdsPickerPage() {
  const { loading, householdIds } = useUserHouseholds();
  const households = useHouseholdList(householdIds);
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinMode = searchParams.get("join") === "1";

  useEffect(() => {
    if (loading) return;
    if (householdIds.length === 0) {
      router.replace("/onboarding");
      return;
    }
    if (householdIds.length === 1 && !joinMode) {
      router.replace(`/households/${householdIds[0]}`);
    }
  }, [loading, householdIds, router, joinMode]);

  // Show nothing while redirecting (0 or 1 household when not in join mode)
  if (loading || (householdIds.length < 2 && !joinMode)) return null;

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-6 pt-12 pb-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-heading text-foreground">Your households</h1>
        <p className="text-body text-muted-foreground">Choose one to open</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        {households.map((h) => (
          <button
            key={h.id}
            onClick={() => router.push(`/households/${h.id}`)}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-secondary active:bg-secondary"
          >
            <span className="text-sm font-medium text-foreground">{h.name}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      <div className="w-full pt-2">
        <HouseholdFormCard />
      </div>
    </div>
  );
}
