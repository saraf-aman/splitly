"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Home, Settings, ArrowLeftRight, LogOut, X } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useHousehold, useMembers } from "@/lib/household";

interface Props {
  householdId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function NavDrawer({ householdId, isOpen, onClose }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);

  const me = members.find((m) => m.id === user?.uid);
  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  async function handleSignOut() {
    onClose();
    await signOut(auth);
    router.replace("/login");
  }

  function nav(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-30"
        style={{
          background: "rgba(26,26,31,0.36)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 200ms ease",
        }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="fixed inset-y-0 right-0 z-40 flex w-72 flex-col bg-card shadow-xl"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms ease-out",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border px-5"
          style={{ height: 62 }}
        >
          <span className="truncate pr-4 text-sm font-semibold text-foreground">
            {household?.name ?? "—"}
          </span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            style={{ width: 32, height: 32 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Primary nav */}
        <nav className="flex flex-col gap-0.5 p-3">
          <button
            onClick={() => nav(`/households/${householdId}`)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Home size={16} className="shrink-0 text-muted-foreground" />
            Home
          </button>

          {isAdmin && (
            <button
              onClick={() => nav(`/households/${householdId}/household`)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <Settings size={16} className="shrink-0 text-muted-foreground" />
              Manage
            </button>
          )}
        </nav>

        <div className="mx-3 border-t border-border" />

        {/* Secondary nav */}
        <nav className="flex flex-col gap-0.5 p-3">
          <button
            onClick={() => nav("/households")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeftRight size={16} className="shrink-0 text-muted-foreground" />
            Switch Household
          </button>

          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-destructive/10"
            style={{ color: "var(--destructive)" }}
          >
            <LogOut size={16} className="shrink-0" />
            Sign out
          </button>
        </nav>
      </div>
    </>
  );
}
