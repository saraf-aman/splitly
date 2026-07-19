"use client";

import { GroupFormCard } from "@/components/GroupFormCard";

export default function OnboardingPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6">
      <GroupFormCard
        title="Welcome to Splitly"
        description="Create a new group, or join one with an invite code."
      />
    </div>
  );
}
