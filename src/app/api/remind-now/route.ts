import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
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

async function verifyFirebaseIdToken(idToken: string): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { users?: { localId: string }[] };
  return data.users?.[0]?.localId ?? null;
}

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Manual per-member remind icon (Phase 12.6) — separate from the automated
// cron (Phase 12.5): bypasses that cadence entirely and doesn't touch its
// `reminders` counters, gated only by this per-member 24h cooldown
// (`manualReminderSentAt.{targetUid}`) so reminding one person never blocks
// reminding a different one.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const uid = await verifyFirebaseIdToken(idToken);
  if (!uid) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { billId, targetUid } = (await req.json()) as { billId: string; targetUid: string };
  if (!billId || !targetUid) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const app = getAdminApp();
  const adminDb = getFirestore(app);
  const messaging = getMessaging(app);

  const billRef = adminDb.collection("bills").doc(billId);

  // Atomically check-and-claim the cooldown so two rapid taps can't both pass.
  const claim = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(billRef);
    const bill = snap.data();
    if (!bill) return { ok: false as const, error: "Bill not found" };
    if (bill.uploadedBy !== uid) {
      return { ok: false as const, error: "Only the uploader can send a reminder" };
    }
    const confirmedBy = (bill.confirmedBy ?? {}) as Record<string, boolean>;
    if (confirmedBy[targetUid]) {
      return { ok: false as const, error: "This member has already confirmed" };
    }
    const manualReminderSentAt = (bill.manualReminderSentAt ?? {}) as Record<string, Timestamp>;
    const lastSentAt = manualReminderSentAt[targetUid];
    if (lastSentAt && Date.now() - lastSentAt.toMillis() < COOLDOWN_MS) {
      const remainingMs = COOLDOWN_MS - (Date.now() - lastSentAt.toMillis());
      return { ok: false as const, error: "cooldown", remainingMs };
    }
    tx.update(billRef, { [`manualReminderSentAt.${targetUid}`]: FieldValue.serverTimestamp() });
    return { ok: true as const, bill };
  });

  if (!claim.ok) {
    if (claim.error === "cooldown") {
      return NextResponse.json(
        { error: "cooldown", remainingMs: claim.remainingMs },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: claim.error }, { status: 403 });
  }

  const bill = claim.bill;
  const groupId = bill.householdId as string;

  const userSnap = await adminDb.collection("users").doc(targetUid).get();
  const fcmTokens = (userSnap.data()?.fcmTokens ?? {}) as Record<string, string>;
  const entries = Object.entries(fcmTokens);
  if (entries.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const billName = bill.restaurantOrStoreName as string | null;
  const title = "Reminder";
  const body = billName
    ? `Don't forget to mark your items on "${billName}".`
    : "Don't forget to mark your items on the open bill.";
  const link = `/groups/${groupId}/bills/${billId}/select`;
  const tag = `bill-reminder-${billId}`;
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
              .doc(targetUid)
              .update({ [`fcmTokens.${deviceId}`]: FieldValue.delete() }),
          );
        }
      }
    }
  });
  if (staleUpdates.length > 0) await Promise.all(staleUpdates);

  return NextResponse.json({ sent: response.successCount });
}
