import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

async function deleteBill(adminDb: FirebaseFirestore.Firestore, billRef: FirebaseFirestore.DocumentReference) {
  const [itemsSnap, chargesSnap] = await Promise.all([
    billRef.collection("items").get(),
    billRef.collection("sharedCharges").get(),
  ]);
  await Promise.all([
    ...itemsSnap.docs.map((d) => d.ref.delete()),
    ...chargesSnap.docs.map((d) => d.ref.delete()),
  ]);
  await billRef.delete();
}

// Second tier of Phase 12.10's retention policy — 12.10's client-side feed
// filter hides old settled bills instantly for free; this daily cron is the
// async cleanup that actually deletes them so Firestore storage doesn't grow
// forever. Groups with `retentionMonths` null/undefined ("Never") are
// skipped entirely. Age is measured from `bill.createdAt`, the same field
// the client-side hide filter uses, so hide and delete stay in sync.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminDb = getFirestore(getAdminApp());
  const now = Date.now();

  const householdsSnap = await adminDb.collection("households").get();

  let billsScanned = 0;
  let billsDeleted = 0;
  let stoppedEarly = false;

  outer: for (const householdDoc of householdsSnap.docs) {
    const retentionMonths = householdDoc.data().retentionMonths as number | null | undefined;
    if (!retentionMonths) continue; // null/undefined = "Never" — keep forever
    const retentionMs = retentionMonths * 30 * 24 * 60 * 60 * 1000;

    const billsSnap = await adminDb
      .collection("bills")
      .where("householdId", "==", householdDoc.id)
      .where("status", "==", "open")
      .get();

    for (const billDoc of billsSnap.docs) {
      billsScanned++;
      const bill = billDoc.data();
      const createdAt = bill.createdAt as FirebaseFirestore.Timestamp | undefined;
      if (!createdAt || now - createdAt.toMillis() <= retentionMs) continue;

      const confirmedBy = (bill.confirmedBy ?? {}) as Record<string, boolean>;
      let participantIds = bill.participantIds as string[] | undefined;
      if (!participantIds) {
        const membersSnap = await adminDb
          .collection("households")
          .doc(householdDoc.id)
          .collection("members")
          .get();
        participantIds = membersSnap.docs.map((d) => d.id);
      }
      const isSettled = participantIds.length > 0 && participantIds.every((id) => confirmedBy[id]);
      if (!isSettled) continue;

      try {
        await deleteBill(adminDb, billDoc.ref);
        billsDeleted++;
      } catch (e) {
        // Most likely Firestore's free-tier daily write/delete quota —
        // stop for today, the cron just picks up the rest tomorrow.
        console.error("[cleanup-bills] delete failed, stopping run:", e);
        stoppedEarly = true;
        break outer;
      }
    }
  }

  return NextResponse.json({ billsScanned, billsDeleted, stoppedEarly });
}
