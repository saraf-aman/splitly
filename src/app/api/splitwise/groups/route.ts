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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = await verifyFirebaseIdToken(idToken);
  if (!uid) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getFirestore(getAdminApp());
  const userSnap = await db.collection("users").doc(uid).get();
  const accessToken = userSnap.data()?.splitwise?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ error: "Not connected to Splitwise" }, { status: 400 });
  }

  const swRes = await fetch("https://secure.splitwise.com/api/v3.0/get_groups", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!swRes.ok) {
    return NextResponse.json({ error: "Failed to fetch Splitwise groups" }, { status: 502 });
  }

  const { groups } = (await swRes.json()) as {
    groups: { id: number; name: string }[];
  };

  return NextResponse.json({
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
  });
}
