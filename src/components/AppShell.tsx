"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Receipt, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const SHELL_LESS_PATHS = ["/login", "/onboarding"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Parse householdId from the URL — shell only renders inside /households/[id]/...
  const hhMatch = pathname.match(/^\/households\/([^/]+)/);
  const hhId = hhMatch?.[1] ?? "";

  if (SHELL_LESS_PATHS.includes(pathname) || !hhId) {
    return <>{children}</>;
  }

  const tabs = [
    {
      href: `/households/${hhId}`,
      label: "Home",
      icon: House,
      isActive: (p: string) => p === `/households/${hhId}`,
    },
    {
      href: `/households/${hhId}/bills/new`,
      label: "Bills",
      icon: Receipt,
      isActive: (p: string) => p.startsWith(`/households/${hhId}/bills`),
    },
    {
      href: `/households/${hhId}/household`,
      label: "Household",
      icon: Users,
      isActive: (p: string) => p.startsWith(`/households/${hhId}/household`),
    },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex flex-1 flex-col pb-20">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {tabs.map(({ href, label, icon: Icon, isActive }) => {
            const active = isActive(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 2} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
