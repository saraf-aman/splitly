"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Always bounce to the groups router, which handles 0/1/2+ cases.
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/groups");
  }, [router]);

  return null;
}
