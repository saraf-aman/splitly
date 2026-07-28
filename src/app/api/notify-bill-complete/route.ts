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

// Called (fire-and-forget, safe to call repeatedly) after any confirmedBy
// write. Only actually sends once per bill: the uploader gets pushed the
// moment every participant has confirmed, but only if they haven't already
// pushed the bill to Splitwise (at that point they've already seen the final
// split) and only if this bill hasn't already sent this notification once.
export async function POST(req: NextRequest) {
  const { billId, groupId } = (await req.json()) as { billId: string; groupId: string };

  if (!billId || !groupId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const app = getAdminApp();
  const adminDb = getFirestore(app);
  const messaging = getMessaging(app);

  const billRef = adminDb.collection("bills").doc(billId);
  const billSnap = await billRef.get();
  const bill = billSnap.data();
  if (!bill) return NextResponse.json({ sent: 0 });

  if (bill.completionNotifiedAt || bill.splitwiseExpenseId) {
    return NextResponse.json({ sent: 0 });
  }

  // Bills predating Phase 12.1 have no participantIds — treat that as "every
  // household member", matching how the rest of the app reads it.
  let participantIds = bill.participantIds as string[] | undefined;
  if (!participantIds) {
    const membersSnap = await adminDb.collection("households").doc(groupId).collection("members").get();
    participantIds = membersSnap.docs.map((d) => d.id);
  }

  const confirmedBy = (bill.confirmedBy ?? {}) as Record<string, boolean>;
  const allConfirmed = participantIds.length > 0 && participantIds.every((id) => confirmedBy[id]);
  if (!allConfirmed) {
    return NextResponse.json({ sent: 0 });
  }

  // Atomically claim the "notified" flag so two near-simultaneous confirms
  // (each triggering this route) can't both pass the check above and send twice.
  const claimed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(billRef);
    if (snap.data()?.completionNotifiedAt) return false;
    tx.update(billRef, { completionNotifiedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed) return NextResponse.json({ sent: 0 });

  const uploaderUid = bill.uploadedBy as string;
  const userSnap = await adminDb.collection("users").doc(uploaderUid).get();
  const fcmTokens = (userSnap.data()?.fcmTokens ?? {}) as Record<string, string>;
  const entries = Object.entries(fcmTokens);
  if (entries.length === 0) return NextResponse.json({ sent: 0 });

  const billName = bill.restaurantOrStoreName as string | null;
  const title = "Everyone's made their picks";
  const body = billName
    ? `Everyone's made their picks on "${billName}" — check the final split.`
    : "Everyone's made their picks — check the final split.";
  const link = `/groups/${groupId}/bills/${billId}/grid`;
  const tag = `bill-complete-${billId}`;

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
              .collection("users")
              .doc(uploaderUid)
              .update({ [`fcmTokens.${deviceId}`]: FieldValue.delete() }),
          );
        }
      }
    }
  });

  if (staleUpdates.length > 0) await Promise.all(staleUpdates);

  return NextResponse.json({ sent: response.successCount });
}
