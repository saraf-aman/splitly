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

const FIRST_REMINDER_MS = 24 * 60 * 60 * 1000;
const REPEAT_REMINDER_MS = 72 * 60 * 60 * 1000;
const MAX_REMINDERS = 3;

// Vercel cron (see vercel.json), authenticated via the CRON_SECRET Vercel
// injects as a bearer token on its own invocations. Runs daily; cadence below
// only needs day-granularity so a daily run is enough (no need for Vercel Pro
// hourly crons). Scans every `open` bill and, per not-yet-confirmed
// participant (uploader excluded — 12.6 covers the uploader manually nudging
// people), sends: 1st reminder 24h after the bill opened, then every 72h
// after that, capped at 3 total. State tracked per-member on the bill doc so
// this route is safe to run repeatedly without double-sending.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = getAdminApp();
  const adminDb = getFirestore(app);
  const messaging = getMessaging(app);
  const now = Date.now();

  const openBillsSnap = await adminDb.collection("bills").where("status", "==", "open").get();

  let remindersSent = 0;

  for (const billDoc of openBillsSnap.docs) {
    const bill = billDoc.data();
    const billId = billDoc.id;
    const groupId = bill.householdId as string;
    const uploaderUid = bill.uploadedBy as string;
    const createdAtMs = (bill.createdAt as Timestamp).toMillis();
    const confirmedBy = (bill.confirmedBy ?? {}) as Record<string, boolean>;
    const reminders = (bill.reminders ?? {}) as Record<
      string,
      { count: number; lastSentAt: Timestamp }
    >;

    // Bills predating Phase 12.1 have no participantIds — treat that as
    // "every household member", matching how the rest of the app reads it.
    let participantIds = bill.participantIds as string[] | undefined;
    if (!participantIds) {
      const membersSnap = await adminDb
        .collection("households")
        .doc(groupId)
        .collection("members")
        .get();
      participantIds = membersSnap.docs.map((d) => d.id);
    }

    const dueUids = participantIds.filter((uid) => {
      if (uid === uploaderUid || confirmedBy[uid]) return false;
      const state = reminders[uid];
      if (!state) return now - createdAtMs >= FIRST_REMINDER_MS;
      if (state.count >= MAX_REMINDERS) return false;
      return now - state.lastSentAt.toMillis() >= REPEAT_REMINDER_MS;
    });

    if (dueUids.length === 0) continue;

    const billName = bill.restaurantOrStoreName as string | null;
    const title = "Still waiting on your picks";
    const body = billName
      ? `Don't forget to mark your items on "${billName}".`
      : "Don't forget to mark your items on the open bill.";
    const link = `/groups/${groupId}/bills/${billId}/select`;
    const tag = `bill-reminder-${billId}`;

    const reminderUpdates: Record<string, { count: number; lastSentAt: Timestamp }> = {};

    for (const uid of dueUids) {
      const userSnap = await adminDb.collection("users").doc(uid).get();
      const fcmTokens = (userSnap.data()?.fcmTokens ?? {}) as Record<string, string>;
      const uniqueTokens = [...new Set(Object.values(fcmTokens))];
      if (uniqueTokens.length === 0) continue;

      const response = await messaging.sendEachForMulticast({
        tokens: uniqueTokens,
        notification: { title, body },
        webpush: {
          notification: { tag },
          fcmOptions: { link },
        },
        data: { link, tag },
      });

      if (response.successCount > 0) {
        remindersSent++;
        reminderUpdates[`reminders.${uid}`] = {
          count: (reminders[uid]?.count ?? 0) + 1,
          lastSentAt: Timestamp.now(),
        };
      }

      const staleUpdates: Promise<unknown>[] = [];
      const deviceEntries = Object.entries(fcmTokens);
      response.responses.forEach((r, i) => {
        if (
          !r.success &&
          (r.error?.code === "messaging/registration-token-not-registered" ||
            r.error?.code === "messaging/invalid-registration-token")
        ) {
          const staleToken = uniqueTokens[i]!;
          for (const [deviceId, token] of deviceEntries) {
            if (token === staleToken) {
              staleUpdates.push(
                adminDb.collection("users").doc(uid).update({
                  [`fcmTokens.${deviceId}`]: FieldValue.delete(),
                }),
              );
            }
          }
        }
      });
      if (staleUpdates.length > 0) await Promise.all(staleUpdates);
    }

    if (Object.keys(reminderUpdates).length > 0) {
      await billDoc.ref.update(reminderUpdates);
    }
  }

  return NextResponse.json({ billsScanned: openBillsSnap.size, remindersSent });
}
