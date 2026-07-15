"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Receipt, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Login/onboarding have nothing to navigate to yet, so they stay shell-less.
const SHELL_LESS_PATHS = ["/login", "/onboarding"];

const TABS = [
  { href: "/", label: "Home", icon: House, isActive: (path: string) => path === "/" },
  { href: "/bills/new", label: "Bills", icon: Receipt, isActive: (path: string) => path.startsWith("/bills") },
  { href: "/household", label: "Household", icon: Users, isActive: (path: string) => path.startsWith("/household") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (SHELL_LESS_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex flex-1 flex-col pb-20">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {TABS.map(({ href, label, icon: Icon, isActive }) => {
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
