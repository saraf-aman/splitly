"use client";

import { HouseholdFormCard } from "@/components/HouseholdFormCard";

export default function OnboardingPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6">
      <HouseholdFormCard
        title="Welcome to Splitly"
        description="Create a new household, or join one with an invite ID."
      />
    </div>
  );
}
