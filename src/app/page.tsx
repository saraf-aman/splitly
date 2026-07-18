"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Always bounce to the households router, which handles 0/1/2+ cases.
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/households");
  }, [router]);

  return null;
}
