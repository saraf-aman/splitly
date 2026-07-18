"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { NavDrawer } from "@/components/NavDrawer";

const SHELLLESS_PATHS = ["/login", "/onboarding"];
const PICKER_PATH = "/households";

// Nav height matches Meridian: 62px
const NAV_H = 62;
// Space reserved below the nav for the floating home button on inner screens
const PILL_H = 52;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const hhMatch = pathname.match(/^\/households\/([^/]+)/);
  const hhId = hhMatch?.[1] ?? "";

  const isShellLess = SHELLLESS_PATHS.includes(pathname);
  const isPicker = pathname === PICKER_PATH;
  const isHouseholdHome = !!hhId && pathname === `/households/${hhId}`;
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
            href={PICKER_PATH}
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

      {/* Floating liquid glass home button — outside the header, inner screens only */}
      {isInnerScreen && (
        <Link
          href={`/households/${hhId}`}
          aria-label="Go to household home"
          className="fixed z-10 inline-flex items-center justify-center"
          style={{
            top: NAV_H + 10,
            left: 24,
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.5)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.8)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.7)",
            fontSize: "18px",
            lineHeight: 1,
          }}
        >
          🏠
        </Link>
      )}

      <main style={{ paddingTop: isInnerScreen ? NAV_H + PILL_H : NAV_H }} className="flex flex-1 flex-col">
        {children}
      </main>

      {hhId && (
        <NavDrawer
          householdId={hhId}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}
