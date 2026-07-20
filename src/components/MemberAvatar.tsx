"use client";

import { useState } from "react";
import type { Member } from "@/types/firestore";

export function MemberAvatar({
  member,
  size = 28,
  ring,
}: {
  member: Member & { id: string };
  size?: number;
  ring: string; // CSS color; use "transparent" for no ring
}) {
  const [imgError, setImgError] = useState(false);
  const initial = member.displayName ? member.displayName.charAt(0).toUpperCase() : "?";

  const sharedStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    boxShadow: ring !== "transparent" ? `0 0 0 2.5px ${ring}` : undefined,
  };

  if (member.photoUrl && !imgError) {
    return (
      <img
        src={member.photoUrl}
        alt={member.displayName}
        onError={() => setImgError(true)}
        style={{ ...sharedStyle, objectFit: "cover", display: "block" }}
      />
    );
  }

  return (
    <span
      style={{
        ...sharedStyle,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#E5E7EB",
        color: "#6B7280",
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
      }}
    >
      {initial}
    </span>
  );
}
