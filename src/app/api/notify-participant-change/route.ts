import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

let adminApp: App | undefined;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0]!;
    return adminApp;
  }
  adminApp = initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  return adminApp;
}

// Phase 12.2 — notifies a single member when the bill uploader adds or
// removes them as a participant.
export async function POST(req: NextRequest) {
  const { groupId, billId, billName, ownerName, memberUid, action } = (await req.json()) as {
    groupId: string;
    billId: string;
    billName: string | null;
    ownerName: string;
    memberUid: string;
    action: "added" | "removed";
  };

  if (!groupId || !billId || !ownerName || !memberUid || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const app = getAdminApp();
  const adminDb = getFirestore(app);
  const messaging = getMessaging(app);

  const label = billName ? `"${billName}"` : "a bill";

  const memberSnap = await adminDb
    .collection("households")
    .doc(groupId)
    .collection("members")
    .doc(memberUid)
    .get();

  const fcmTokens = (memberSnap.data()?.fcmTokens ?? {}) as Record<string, string>;
  const entries = Object.entries(fcmTokens);
  if (entries.length === 0) return NextResponse.json({ sent: 0 });

  const title = action === "added" ? "Added to a bill" : "Removed from a bill";
  const body =
    action === "added"
      ? `${ownerName} added you to ${label} — tap to select your items`
      : `${ownerName} removed you from ${label}`;
  const link = action === "added" ? `/groups/${groupId}/bills/${billId}/select` : `/groups/${groupId}`;
  const tag = `participant-${billId}-${memberUid}`;

  // Deduplicate by token value — same token stored under multiple deviceId keys
  // (a legacy artifact from before the cookie-based deviceId) would otherwise
  // produce duplicate push events on the same device.
  const uniqueTokens = [...new Set(entries.map(([, token]) => token))];

  const response = await messaging.sendEachForMulticast({
    tokens: uniqueTokens,
    notification: { title, body },
    webpush: {
      notification: { tag },
      fcmOptions: { link },
    },
    data: { link, tag },
  });

  const staleUpdates: Promise<unknown>[] = [];
  response.responses.forEach((r, i) => {
    if (
      !r.success &&
      (r.error?.code === "messaging/registration-token-not-registered" ||
        r.error?.code === "messaging/invalid-registration-token")
    ) {
      const staleToken = uniqueTokens[i]!;
      for (const [deviceId, token] of entries) {
        if (token === staleToken) {
          staleUpdates.push(
            adminDb
              .collection("households")
              .doc(groupId)
              .collection("members")
              .doc(memberUid)
              .update({ [`fcmTokens.${deviceId}`]: FieldValue.delete() }),
          );
        }
      }
    }
  });
  if (staleUpdates.length > 0) await Promise.all(staleUpdates);

  return NextResponse.json({ sent: response.successCount });
}
