import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, type Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

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

interface Successor {
  id: string;
  promote: boolean; // true if they're a guest being promoted to admin as part of the transfer
}

// Silent auto-transfer, per PROJECT_PLAN.md §17: prefer the longest-tenured
// other admin; if there isn't one, fall back to the longest-tenured guest
// (promoting them to admin as part of the handoff). null = no one to hand
// off to — that household blocks deletion.
async function findSuccessor(
  adminDb: Firestore,
  groupId: string,
  uid: string,
): Promise<Successor | null> {
  const membersSnap = await adminDb.collection("households").doc(groupId).collection("members").get();
  const others = membersSnap.docs
    .filter((d) => d.id !== uid)
    .map((d) => ({ id: d.id, role: d.data().role as string, addedAt: d.data().addedAt as Timestamp }));

  const byTenure = (a: { addedAt: Timestamp }, b: { addedAt: Timestamp }) =>
    a.addedAt.toMillis() - b.addedAt.toMillis();

  const admins = others.filter((m) => m.role === "admin").sort(byTenure);
  if (admins.length > 0) return { id: admins[0]!.id, promote: false };

  const guests = others.filter((m) => m.role === "guest").sort(byTenure);
  if (guests.length > 0) return { id: guests[0]!.id, promote: true };

  return null;
}

// Phase 15 — see PROJECT_PLAN.md §17. Deletes the caller's account: leaves
// every household they belong to, deletes their users/{uid} doc, then the
// Firebase Auth user itself. For any household they created, ownership is
// silently auto-transferred to a successor (see findSuccessor) rather than
// blocking — blocking only happens if a household has no other member at
// all to hand off to, and in that case NOTHING is mutated (checked before
// any writes) so a blocked attempt never leaves a partial transfer behind.
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

  const adminDb = getFirestore(getAdminApp());
  const userRef = adminDb.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const householdIds: string[] = userSnap.data()?.householdIds ?? [];

  const groupSnaps = await Promise.all(
    householdIds.map((id) => adminDb.collection("households").doc(id).get()),
  );
  const ownedIds = groupSnaps
    .filter((snap) => snap.exists && snap.data()?.createdBy === uid)
    .map((snap) => snap.id);

  const successors = new Map<string, Successor>();
  const blocked: { id: string; name: string }[] = [];

  for (const id of ownedIds) {
    const successor = await findSuccessor(adminDb, id, uid);
    if (successor) {
      successors.set(id, successor);
    } else {
      const snap = groupSnaps.find((s) => s.id === id)!;
      blocked.push({ id, name: snap.data()?.name as string });
    }
  }

  if (blocked.length > 0) {
    return NextResponse.json({ error: "owns_households", households: blocked }, { status: 409 });
  }

  await Promise.all(
    ownedIds.map(async (id) => {
      const successor = successors.get(id)!;
      const writes: Promise<unknown>[] = [
        adminDb.collection("households").doc(id).update({ createdBy: successor.id }),
      ];
      if (successor.promote) {
        writes.push(
          adminDb.collection("households").doc(id).collection("members").doc(successor.id).update({
            role: "admin",
          }),
        );
      }
      await Promise.all(writes);
    }),
  );

  await Promise.all(
    householdIds.map((id) =>
      adminDb.collection("households").doc(id).collection("members").doc(uid).delete(),
    ),
  );

  await userRef.delete();
  await getAuth(getAdminApp()).deleteUser(uid);

  return NextResponse.json({ success: true });
}
