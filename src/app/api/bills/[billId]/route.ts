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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ billId: string }> },
) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = await verifyFirebaseIdToken(idToken);
  if (!uid) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { billId } = await params;
  if (!billId) {
    return NextResponse.json({ error: "Missing billId" }, { status: 400 });
  }

  const adminDb = getFirestore(getAdminApp());
  const billRef = adminDb.collection("bills").doc(billId);
  const billSnap = await billRef.get();

  if (!billSnap.exists) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }

  const billData = billSnap.data() as { uploadedBy?: string };
  if (billData.uploadedBy !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete subcollections first, then the bill doc
  const [itemsSnap, chargesSnap] = await Promise.all([
    billRef.collection("items").get(),
    billRef.collection("sharedCharges").get(),
  ]);

  await Promise.all([
    ...itemsSnap.docs.map((d) => d.ref.delete()),
    ...chargesSnap.docs.map((d) => d.ref.delete()),
  ]);

  await billRef.delete();

  return NextResponse.json({ success: true });
}
