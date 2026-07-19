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

  // Collect FCM tokens from all members except the uploader, mapping each
  // token back to its owner so stale tokens can be cleaned up per-member.
  const tokens: string[] = [];
  const tokenOwner = new Map<string, string>(); // token → memberId

  for (const memberDoc of membersSnap.docs) {
    if (memberDoc.id === uploaderUid) continue;
    const fcmTokens = (memberDoc.data().fcmTokens ?? []) as string[];
    for (const token of fcmTokens) {
      tokens.push(token);
      tokenOwner.set(token, memberDoc.id);
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

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: { fcmOptions: { link } },
    data: { link },
  });

  // Remove tokens that the FCM service reports as invalid/unregistered.
  const staleByMember = new Map<string, string[]>();
  response.responses.forEach((r, i) => {
    if (
      !r.success &&
      (r.error?.code === "messaging/registration-token-not-registered" ||
        r.error?.code === "messaging/invalid-registration-token")
    ) {
      const memberId = tokenOwner.get(tokens[i]!);
      if (memberId) {
        if (!staleByMember.has(memberId)) staleByMember.set(memberId, []);
        staleByMember.get(memberId)!.push(tokens[i]!);
      }
    }
  });

  if (staleByMember.size > 0) {
    await Promise.all(
      Array.from(staleByMember.entries()).map(([memberId, staleTokens]) =>
        adminDb
          .collection("households")
          .doc(groupId)
          .collection("members")
          .doc(memberId)
          .update({ fcmTokens: FieldValue.arrayRemove(...staleTokens) }),
      ),
    );
  }

  return NextResponse.json({ sent: response.successCount });
}
