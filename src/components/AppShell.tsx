"use client";

import { Suspense, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavDrawer } from "@/components/NavDrawer";
import { PickerNavDrawer } from "@/components/PickerNavDrawer";
import { OfflineBanner, OFFLINE_BANNER_H } from "@/components/OfflineBanner";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { getProfileReturnPath } from "@/lib/profileReturn";

// Never changes during a mount, so subscribe is a no-op — this just gets us
// a client-only sessionStorage read without the set-state-in-effect penalty.
function subscribeNoop() {
  return () => {};
}
function getServerProfileReturnPath() {
  return "/groups";
}

const SHELLLESS_PATHS = ["/login", "/onboarding", "/privacy", "/terms", "/data-deletion"];
const PICKER_PATH = "/groups";

// Nav height matches Meridian: 62px
const NAV_H = 62;
// Space reserved below the nav for the floating home button on inner screens
const PILL_H = 52;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isOnline = useOnlineStatus();
  const offlineOffset = isOnline ? 0 : OFFLINE_BANNER_H;

  const hhMatch = pathname.match(/^\/groups\/([^/]+)/);
  const hhId = hhMatch?.[1] ?? "";

  const isShellLess = SHELLLESS_PATHS.includes(pathname);
  const isPicker = pathname === PICKER_PATH;
  const isHouseholdHome = !!hhId && pathname === `/groups/${hhId}`;
  const isInnerScreen = !!hhId && !isHouseholdHome;
  const isProfile = pathname === "/profile";

  // On /profile there's no hhId to derive a logo target from — fall back to
  // wherever the drawer that opened it recorded as the origin (a household
  // or the picker).
  const profileReturnPath = useSyncExternalStore(
    subscribeNoop,
    getProfileReturnPath,
    getServerProfileReturnPath,
  );

  const logoHref = hhId
    ? `/groups/${hhId}`
    : isProfile
      ? profileReturnPath
      : `${PICKER_PATH}?picker=1`;

  if (isShellLess) {
    return (
      <>
        {!isOnline && <OfflineBanner />}
        <div className="flex flex-1 flex-col" style={{ paddingTop: offlineOffset }}>
          {children}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {!isOnline && <OfflineBanner />}
      <header
        className="fixed inset-x-0 z-20 border-b border-border"
        style={{
          top: offlineOffset,
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
            href={logoHref}
            className="text-foreground"
            style={{ fontSize: "1.15rem", fontWeight: 700, letterSpacing: "-0.04em" }}
          >
            Splitly
          </Link>

          {(isPicker || hhId) && (
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

      <main style={{ paddingTop: NAV_H + offlineOffset }} className="flex flex-1 flex-col">
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

      {isPicker && (
        <PickerNavDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      )}
    </div>
  );
}
