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
  const { billId, groupId, uploaderUid, billName } = (await req.json()) as {
    billId: string;
    groupId: string;
    uploaderUid: string;
    billName: string | null;
  };

  if (!billId || !groupId || !uploaderUid) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const app = getAdminApp();
  const adminDb = getFirestore(app);
  const messaging = getMessaging(app);

  const membersSnap = await adminDb
    .collection("households")
    .doc(groupId)
    .collection("members")
    .get();

  // Collect FCM tokens from all members except the uploader.
  // fcmTokens is a deviceId→token map — one entry per browser context,
  // so each physical device only appears once.
  const tokens: string[] = [];
  // token → { memberId, deviceId } so we can remove stale entries by field path.
  const tokenMeta = new Map<string, { memberId: string; deviceId: string }>();

  for (const memberDoc of membersSnap.docs) {
    if (memberDoc.id === uploaderUid) continue;
    const fcmTokens = (memberDoc.data().fcmTokens ?? {}) as Record<string, string>;
    for (const [deviceId, token] of Object.entries(fcmTokens)) {
      tokens.push(token);
      tokenMeta.set(token, { memberId: memberDoc.id, deviceId });
    }
  }

  if (tokens.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const title = "New bill ready";
  const body = billName
    ? `"${billName}" — tap to select your items`
    : "A new bill is ready — tap to select your items";
  const link = `/bills/${billId}/select`;

  const tag = `bill-open-${billId}`;

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: { tag },
      fcmOptions: { link },
    },
    data: { link, tag },
  });

  // Remove tokens that the FCM service reports as invalid/unregistered.
  const staleUpdates: Promise<unknown>[] = [];
  response.responses.forEach((r, i) => {
    if (
      !r.success &&
      (r.error?.code === "messaging/registration-token-not-registered" ||
        r.error?.code === "messaging/invalid-registration-token")
    ) {
      const meta = tokenMeta.get(tokens[i]!);
      if (meta) {
        staleUpdates.push(
          adminDb
            .collection("households")
            .doc(groupId)
            .collection("members")
            .doc(meta.memberId)
            .update({ [`fcmTokens.${meta.deviceId}`]: FieldValue.delete() }),
        );
      }
    }
  });

  if (staleUpdates.length > 0) await Promise.all(staleUpdates);

  return NextResponse.json({ sent: response.successCount });
}
