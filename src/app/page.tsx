"use client";

import { signOut } from "firebase/auth";
import Link from "next/link";
import { Receipt, Settings } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useHousehold, useMembers, useUserHousehold } from "@/lib/household";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  const { user } = useAuth();
  const { householdId } = useUserHousehold();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const isAdmin = members.find((m) => m.id === user?.uid)?.role === "admin";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6">
      <p className="text-body text-muted-foreground">
        Signed in as {user?.displayName ?? user?.email}
      </p>

      {household && (
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-1 py-2 text-center">
            <p className="text-heading text-foreground">{household.name}</p>
            <p className="text-caption text-muted-foreground">
              Invite ID: <span className="font-money">{household.id}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {householdId && (
        <Button
          size="lg"
          className="h-12 px-8 text-base"
          nativeButton={false}
          render={<Link href="/bills/new" />}
        >
          <Receipt />
          Upload a bill
        </Button>
      )}

      {isAdmin && (
        <Link
          href="/household"
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Settings className="size-4" />
          Manage household
        </Link>
      )}

      <Button variant="outline" onClick={() => signOut(auth)}>
        Sign out
      </Button>
    </div>
  );
}
