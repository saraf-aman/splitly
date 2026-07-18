"use client";

import { Bell } from "lucide-react";
import { useNotificationSetup } from "@/lib/notifications";
import { useAuth } from "@/lib/auth-context";
import { useUserHousehold } from "@/lib/household";
import { Button } from "@/components/ui/button";

export function NotificationBanner() {
  const { user } = useAuth();
  const { householdId } = useUserHousehold();
  const { needsPrompt, requestPermission } = useNotificationSetup(user?.uid, householdId);

  if (!needsPrompt) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3">
      <Bell className="size-5 shrink-0 text-primary" />
      <p className="flex-1 text-sm text-muted-foreground">
        Enable notifications to know when new bills are ready.
      </p>
      <Button size="sm" onClick={() => void requestPermission()}>
        Enable
      </Button>
    </div>
  );
}
