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

  const tokens: string[] = [];
  const tokenOwner = new Map<string, string>();
  const staleByMember = new Map<string, string[]>();

  for (const { uid, settled } of changes) {
    const memberSnap = await adminDb
      .collection("households")
      .doc(groupId)
      .collection("members")
      .doc(uid)
      .get();

    const fcmTokens = (memberSnap.data()?.fcmTokens ?? []) as string[];
    if (fcmTokens.length === 0) continue;

    const title = settled
      ? "Bill confirmed"
      : "Bill reopened";
    const body = settled
      ? `Your portion of ${label} has been marked as confirmed by ${ownerName}`
      : `Your portion of ${label} has been reopened by ${ownerName}`;
    const link = `/groups/${groupId}/bills/${billId}/grid`;

    const response = await messaging.sendEachForMulticast({
      tokens: fcmTokens,
      notification: { title, body },
      webpush: { fcmOptions: { link } },
      data: { link },
    });

    response.responses.forEach((r, i) => {
      if (
        !r.success &&
        (r.error?.code === "messaging/registration-token-not-registered" ||
          r.error?.code === "messaging/invalid-registration-token")
      ) {
        if (!staleByMember.has(uid)) staleByMember.set(uid, []);
        staleByMember.get(uid)!.push(fcmTokens[i]!);
      }
    });

    for (const t of fcmTokens) { tokens.push(t); tokenOwner.set(t, uid); }
  }

  if (staleByMember.size > 0) {
    await Promise.all(
      Array.from(staleByMember.entries()).map(([uid, staleTokens]) =>
        adminDb
          .collection("households")
          .doc(groupId)
          .collection("members")
          .doc(uid)
          .update({ fcmTokens: FieldValue.arrayRemove(...staleTokens) }),
      ),
    );
  }

  return NextResponse.json({ sent: tokens.length });
}
