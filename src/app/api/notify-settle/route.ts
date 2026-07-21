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

export async function POST(req: NextRequest) {
  const { groupId, billId, billName, ownerName, changes } = (await req.json()) as {
    groupId: string;
    billId: string;
    billName: string | null;
    ownerName: string;
    changes: { uid: string; settled: boolean }[];
  };

  if (!groupId || !billId || !ownerName || !changes?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const app = getAdminApp();
  const adminDb = getFirestore(app);
  const messaging = getMessaging(app);

  const label = billName ? `"${billName}"` : "the bill";

  let totalSent = 0;
  const staleUpdates: Promise<unknown>[] = [];

  for (const { uid, settled } of changes) {
    const memberSnap = await adminDb
      .collection("households")
      .doc(groupId)
      .collection("members")
      .doc(uid)
      .get();

    const fcmTokens = (memberSnap.data()?.fcmTokens ?? {}) as Record<string, string>;
    const entries = Object.entries(fcmTokens);
    if (entries.length === 0) continue;

    const title = settled ? "Bill confirmed" : "Bill reopened";
    const body = settled
      ? `Your portion of ${label} has been marked as confirmed by ${ownerName}`
      : `Your portion of ${label} has been reopened by ${ownerName}`;
    const link = `/groups/${groupId}/bills/${billId}/grid`;
    const tag = `settle-${billId}`;

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

    totalSent += response.successCount;

    response.responses.forEach((r, i) => {
      if (
        !r.success &&
        (r.error?.code === "messaging/registration-token-not-registered" ||
          r.error?.code === "messaging/invalid-registration-token")
      ) {
        const staleToken = uniqueTokens[i]!;
        // Remove every deviceId entry pointing to this token.
        for (const [deviceId, token] of entries) {
          if (token === staleToken) {
            staleUpdates.push(
              adminDb
                .collection("households")
                .doc(groupId)
                .collection("members")
                .doc(uid)
                .update({ [`fcmTokens.${deviceId}`]: FieldValue.delete() }),
            );
          }
        }
      }
    });
  }

  if (staleUpdates.length > 0) await Promise.all(staleUpdates);

  return NextResponse.json({ sent: totalSent });
}
