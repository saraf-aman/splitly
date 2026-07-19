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

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

function redirectTo(path: string) {
  return NextResponse.redirect(`${APP_URL}${path}`);
}

export async function GET(req: NextRequest) {
  try {
    return await handleCallback(req);
  } catch (err) {
    console.error("[splitwise/callback] Unhandled exception:", err);
    return redirectTo("/groups?picker=1&sw_error=server_error");
  }
}

async function handleCallback(req: NextRequest) {
  const clientId = process.env.SPLITWISE_CLIENT_ID;
  const clientSecret = process.env.SPLITWISE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !APP_URL) {
    console.error("[splitwise/callback] Missing config — clientId:", !!clientId, "clientSecret:", !!clientSecret, "APP_URL:", !!APP_URL);
    return redirectTo("/groups?picker=1&sw_error=config");
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    console.error("[splitwise/callback] Missing params — code:", !!code, "state:", !!state, "all params:", searchParams.toString());
    return redirectTo("/groups?picker=1&sw_error=missing_params");
  }

  const app = getAdminApp();
  const db = getFirestore(app);

  // Look up the state doc to find which user is connecting
  const stateDoc = await db.collection("splitwiseOAuthStates").doc(state).get();
  if (!stateDoc.exists) {
    console.error("[splitwise/callback] State doc not found for state:", state);
    return redirectTo("/groups?picker=1&sw_error=invalid_state");
  }

  const { uid, returnPath, expiresAt } = stateDoc.data() as {
    uid: string;
    returnPath?: string;
    expiresAt: { toDate(): Date };
  };
  const dest = returnPath ?? "/groups";
  if (expiresAt.toDate() < new Date()) {
    await stateDoc.ref.delete();
    console.error("[splitwise/callback] State expired for uid:", uid);
    return redirectTo(`${dest}?sw_error=expired`);
  }

  // Exchange code for access token
  const redirectUri = `${APP_URL}/api/splitwise/callback`;
  console.log("[splitwise/callback] Exchanging token, redirect_uri:", redirectUri);
  const tokenRes = await fetch("https://secure.splitwise.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("[splitwise/callback] Token exchange failed:", tokenRes.status, body);
    await stateDoc.ref.delete();
    return redirectTo(`${dest}?sw_error=token_exchange`);
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Fetch the Splitwise user ID so we can match members later
  const userRes = await fetch("https://secure.splitwise.com/api/v3.0/get_current_user", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userRes.ok) {
    const body = await userRes.text();
    console.error("[splitwise/callback] User fetch failed:", userRes.status, body);
    await stateDoc.ref.delete();
    return redirectTo(`${dest}?sw_error=user_fetch`);
  }

  const { user } = (await userRes.json()) as { user: { id: number } };

  // Persist token + Splitwise user ID on the Firebase user doc
  const userRef = db.collection("users").doc(uid);
  await userRef.set(
    { splitwise: { accessToken: access_token, splitwiseUserId: user.id } },
    { merge: true },
  );

  // Mirror splitwiseUserId to all the user's household member docs so:
  // - admins can see who is linked without reading private user docs
  // - the ID persists even if the user later disconnects (token removed but ID kept)
  const userSnap = await userRef.get();
  const householdIds = (userSnap.data()?.householdIds as string[] | undefined) ?? [];
  if (householdIds.length > 0) {
    const batch = db.batch();
    for (const hid of householdIds) {
      batch.update(
        db.collection("households").doc(hid).collection("members").doc(uid),
        { splitwiseUserId: user.id },
      );
    }
    await batch.commit();
  }

  // Clean up the one-time state doc
  await stateDoc.ref.delete();

  return redirectTo(`${dest}?sw=connected`);
}
