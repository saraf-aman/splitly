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

  // Bills predating Phase 12.1 have no participantIds — treat that as
  // "every household member", matching how the rest of the app reads it.
  const billSnap = await adminDb.collection("bills").doc(billId).get();
  const participantIds = billSnap.data()?.participantIds as string[] | undefined;

  const membersSnap = await adminDb
    .collection("households")
    .doc(groupId)
    .collection("members")
    .get();

  const recipientIds = membersSnap.docs
    .map((d) => d.id)
    .filter((id) => id !== uploaderUid && (!participantIds || participantIds.includes(id)));

  // FCM tokens live on users/{uid} (Phase 12.2 follow-up), not the household
  // member doc — one extra read per recipient, trivial at this app's scale.
  const tokens: string[] = [];
  // token → { uid, deviceId } so we can remove stale entries by field path.
  const tokenMeta = new Map<string, { uid: string; deviceId: string }>();

  const userSnaps = await Promise.all(
    recipientIds.map((id) => adminDb.collection("users").doc(id).get()),
  );
  for (const userSnap of userSnaps) {
    const fcmTokens = (userSnap.data()?.fcmTokens ?? {}) as Record<string, string>;
    for (const [deviceId, token] of Object.entries(fcmTokens)) {
      tokens.push(token);
      tokenMeta.set(token, { uid: userSnap.id, deviceId });
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

  // Deduplicate by token value. Safari and the PWA home screen on iOS share the same
  // SW registration → same FCM token, but before the cookie-based deviceId fix they
  // stored it under two different keys. Sending the same token twice produces two
  // separate push events → two notifications on the device.
  const uniqueTokens = [...new Set(tokens)];

  const response = await messaging.sendEachForMulticast({
    tokens: uniqueTokens,
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
      const meta = tokenMeta.get(uniqueTokens[i]!);
      if (meta) {
        staleUpdates.push(
          adminDb
            .collection("users")
            .doc(meta.uid)
            .update({ [`fcmTokens.${meta.deviceId}`]: FieldValue.delete() }),
        );
      }
    }
  });

  if (staleUpdates.length > 0) await Promise.all(staleUpdates);

  return NextResponse.json({ sent: response.successCount });
}
