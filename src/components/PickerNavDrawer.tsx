"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CircleUserRound, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { setProfileReturnPath } from "@/lib/profileReturn";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Lightweight counterpart to NavDrawer for screens with no household context
// (currently just the group picker) — keeps the hamburger/drawer header
// consistent across the whole app even where there's nothing household-scoped
// to show yet.
export function PickerNavDrawer({ isOpen, onClose }: Props) {
  const { user } = useAuth();
  const router = useRouter();

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  function nav(href: string) {
    close();
    router.push(href);
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-30"
        style={{
          background: "rgba(26,26,31,0.36)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 200ms ease",
        }}
        onClick={close}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="fixed inset-y-0 right-0 z-40 flex w-72 flex-col overflow-y-auto bg-card shadow-xl"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms ease-out",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b border-border px-5"
          style={{ height: 62 }}
        >
          <span className="truncate pr-4 text-sm font-semibold text-foreground">Menu</span>
          <button
            onClick={close}
            aria-label="Close menu"
            className="flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            style={{ width: 32, height: 32 }}
          >
            <X size={15} />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 p-3">
          <button
            onClick={() => {
              setProfileReturnPath("/groups");
              nav("/profile");
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="h-[18px] w-[18px] shrink-0 rounded-full object-cover"
              />
            ) : (
              <CircleUserRound size={18} className="shrink-0 text-muted-foreground" />
            )}
            Profile
          </button>
        </nav>
      </div>
    </>
  );
}
