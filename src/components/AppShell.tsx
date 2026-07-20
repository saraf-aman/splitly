"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { NavDrawer } from "@/components/NavDrawer";

const SHELLLESS_PATHS = ["/login", "/onboarding"];
const PICKER_PATH = "/groups";

// Nav height matches Meridian: 62px
const NAV_H = 62;
// Space reserved below the nav for the floating home button on inner screens
const PILL_H = 52;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const hhMatch = pathname.match(/^\/groups\/([^/]+)/);
  const hhId = hhMatch?.[1] ?? "";

  const isShellLess = SHELLLESS_PATHS.includes(pathname);
  const isPicker = pathname === PICKER_PATH;
  const isHouseholdHome = !!hhId && pathname === `/groups/${hhId}`;
  const isInnerScreen = !!hhId && !isHouseholdHome;

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  if (isShellLess) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <header
        className="fixed inset-x-0 top-0 z-20 border-b border-border"
        style={{
          background: "rgba(244,242,239,0.92)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        {/* Top bar — 62px, matches Meridian nav height */}
        <div
          className="flex items-center justify-between px-6"
          style={{ height: NAV_H }}
        >
          <Link
            href={`${PICKER_PATH}?picker=1`}
            className="text-foreground"
            style={{ fontSize: "1.15rem", fontWeight: 700, letterSpacing: "-0.04em" }}
          >
            Splitly
          </Link>

          {isPicker && (
            <button
              onClick={handleSignOut}
              aria-label="Sign out"
              className="text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              style={{ width: 36, height: 36, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <LogOut size={16} />
            </button>
          )}

          {hhId && (
            // Custom hamburger spans — thinner and more refined than Lucide Menu icon
            <button
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="text-foreground transition-colors hover:bg-secondary"
              style={{ width: 36, height: 36, borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "4px 6px" }}
            >
              <span style={{ display: "block", width: 18, height: 1.5, background: "currentColor", borderRadius: 2 }} />
              <span style={{ display: "block", width: 18, height: 1.5, background: "currentColor", borderRadius: 2 }} />
              <span style={{ display: "block", width: 18, height: 1.5, background: "currentColor", borderRadius: 2 }} />
            </button>
          )}
        </div>

      </header>

      <main style={{ paddingTop: NAV_H }} className="flex flex-1 flex-col">
        {children}
      </main>

      {hhId && (
        <Suspense>
          <NavDrawer
            householdId={hhId}
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
