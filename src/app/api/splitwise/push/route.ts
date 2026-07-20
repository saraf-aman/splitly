import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { calculateSplit } from "@/lib/splitCalc";

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

function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

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

  const { billId } = (await req.json()) as { billId: string };
  if (!billId) {
    return NextResponse.json({ error: "Missing billId" }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());

  // Fetch bill and verify caller is the uploader
  const billSnap = await db.collection("bills").doc(billId).get();
  if (!billSnap.exists) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }
  const bill = billSnap.data()!;
  if (bill.uploadedBy !== uid) {
    return NextResponse.json({ error: "Only the bill uploader can push to Splitwise" }, { status: 403 });
  }

  const groupId = bill.householdId as string;

  // Fetch group for splitwiseGroupId
  const groupSnap = await db.collection("households").doc(groupId).get();
  if (!groupSnap.exists) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  const splitwiseGroupId = groupSnap.data()?.splitwiseGroupId as number | undefined;
  if (!splitwiseGroupId) {
    return NextResponse.json({ error: "No Splitwise group linked" }, { status: 400 });
  }

  // Fetch uploader's Splitwise access token
  const userSnap = await db.collection("users").doc(uid).get();
  const accessToken = userSnap.data()?.splitwise?.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "Not connected to Splitwise" }, { status: 400 });
  }
  const uploaderSwId = userSnap.data()?.splitwise?.splitwiseUserId as number | undefined;

  // Fetch all household members
  const membersSnap = await db.collection("households").doc(groupId).collection("members").get();
  const members = membersSnap.docs.map((d) => ({
    uid: d.id,
    ...(d.data() as { displayName: string; email: string; splitwiseUserId?: number; splitwiseEmail?: string }),
  }));
  const memberIds = members.map((m) => m.uid);

  // Fetch items and shared charges
  const [itemsSnap, chargesSnap] = await Promise.all([
    db.collection("bills").doc(billId).collection("items").get(),
    db.collection("bills").doc(billId).collection("sharedCharges").get(),
  ]);

  const items = itemsSnap.docs.map((d) => ({
    price: d.data().price as number,
    selections: d.data().selections as Record<string, { included: boolean; shares: number }>,
  }));
  const charges = chargesSnap.docs.map((d) => ({ amount: d.data().amount as number }));

  // Calculate per-member totals
  const totals = calculateSplit(items, charges, memberIds);

  // Resolve Splitwise user IDs via splitwiseUserId first, then email fallback
  // Fetch Splitwise group members to support email matching
  let swGroupMembers: { id: number; email: string }[] = [];
  try {
    const swGroupRes = await fetch(
      `https://secure.splitwise.com/api/v3.0/get_group/${splitwiseGroupId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (swGroupRes.ok) {
      const swGroupData = (await swGroupRes.json()) as {
        group: { members: { id: number; email: string }[] };
      };
      swGroupMembers = swGroupData.group.members ?? [];
    }
  } catch {
    // non-fatal — email matching just won't work
  }

  const swEmailToId = new Map(swGroupMembers.map((m) => [m.email.toLowerCase(), m.id]));

  // Build resolved map: uid → splitwiseUserId
  const resolved = new Map<string, number>();
  for (const m of members) {
    if (m.splitwiseUserId) {
      resolved.set(m.uid, m.splitwiseUserId);
      continue;
    }
    const emailKey = (m.splitwiseEmail ?? m.email ?? "").toLowerCase();
    const swId = emailKey ? swEmailToId.get(emailKey) : undefined;
    if (swId) resolved.set(m.uid, swId);
  }

  // Only include members who are resolved AND have a non-zero share
  const participants = members.filter((m) => resolved.has(m.uid) && (totals[m.uid] ?? 0) > 0);
  if (participants.length === 0) {
    return NextResponse.json({ error: "No resolved members with a non-zero share" }, { status: 400 });
  }

  // Total cost = sum of resolved participants' shares only
  const totalCents = participants.reduce((s, m) => s + (totals[m.uid] ?? 0), 0);

  // Build Splitwise expense payload
  // Payer (uploader) paid_share = totalCents; everyone else paid 0.
  // Each participant's owed_share = their calculated total.
  const payerSwId = uploaderSwId ?? resolved.get(uid);
  if (!payerSwId) {
    return NextResponse.json(
      { error: "Your Splitwise account could not be resolved. Please reconnect." },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    cost: centsToDecimal(totalCents),
    description: (bill.restaurantOrStoreName as string | null) ?? "Group expense",
    group_id: String(splitwiseGroupId),
    currency_code: "USD",
    split_equally: "false",
  });

  participants.forEach((m, i) => {
    const swId = resolved.get(m.uid)!;
    const share = centsToDecimal(totals[m.uid] ?? 0);
    const paid = swId === payerSwId ? centsToDecimal(totalCents) : "0.00";
    params.set(`users__${i}__user_id`, String(swId));
    params.set(`users__${i}__paid_share`, paid);
    params.set(`users__${i}__owed_share`, share);
  });

  const swRes = await fetch("https://secure.splitwise.com/api/v3.0/create_expense", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!swRes.ok) {
    const body = await swRes.text();
    console.error("[splitwise/push] Splitwise API error:", swRes.status, body);
    return NextResponse.json({ error: "Splitwise rejected the expense" }, { status: 502 });
  }

  const swData = (await swRes.json()) as { expenses?: { id: number }[] };
  const expenseId = swData.expenses?.[0]?.id;

  if (expenseId) {
    await db.collection("bills").doc(billId).update({ splitwiseExpenseId: expenseId });
  }

  const unresolved = members.filter((m) => !resolved.has(m.uid)).map((m) => m.uid);

  return NextResponse.json({ expenseId, unresolved });
}
