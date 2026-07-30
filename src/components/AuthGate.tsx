"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Loading } from "@/components/Loading";

// Signed-in users get redirected away from these (no reason to see the
// login screen once authenticated).
const UNAUTH_ONLY_PATHS = ["/login"];

// Reachable with or without a session, no redirect either direction — legal
// pages required to be viewable outside the app (Google Play policy, App
// Review, or just a link someone opens cold from a browser).
const ALWAYS_PUBLIC_PATHS = ["/login", "/privacy", "/terms", "/data-deletion"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isUnauthOnlyPath = UNAUTH_ONLY_PATHS.includes(pathname);
  const isAlwaysPublicPath = ALWAYS_PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !isAlwaysPublicPath) {
      router.replace("/login");
    }
    if (user && isUnauthOnlyPath) {
      router.replace("/");
    }
  }, [loading, user, isAlwaysPublicPath, isUnauthOnlyPath, router]);

  if (loading) {
    return <Loading />;
  }

  if (!user && !isAlwaysPublicPath) {
    return null;
  }

  if (user && isUnauthOnlyPath) {
    return null;
  }

  return <>{children}</>;
}
