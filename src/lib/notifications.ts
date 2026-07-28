"use client";

import { useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

function getDeviceId(): string {
  // Cookies are shared between Safari and the PWA home screen on iOS (same origin,
  // same cookie jar). localStorage is isolated per browser context, so using it
  // alone would give Safari and the PWA different IDs → two tokens → two notifications.
  const cookieMatch = document.cookie.match(/(?:^|;\s*)splitly_did=([^;]+)/);
  if (cookieMatch?.[1]) return cookieMatch[1];

  // No cookie yet — check localStorage for a legacy ID, or generate a fresh one.
  const id = localStorage.getItem("splitly_device_id") ?? crypto.randomUUID();

  // Write to cookie (1 year, survives PWA reinstall) so future contexts share it.
  document.cookie = `splitly_did=${id}; max-age=${365 * 24 * 60 * 60}; path=/; SameSite=Lax`;
  localStorage.setItem("splitly_device_id", id);
  return id;
}

// Token lives on users/{uid}, not per-household — a device token isn't
// household-specific, and nothing in the UI reads another member's token
// (notify routes run server-side via the Admin SDK, which bypasses rules
// anyway). Used to be duplicated onto every households/{id}/members/{uid}
// doc, which required fanning writes out to every household on every grant —
// that's exactly what caused a bug where non-first households silently never
// got a token (2026-07-28).
async function storeFcmToken(uid: string) {
  if (!VAPID_KEY) return;
  const swReg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!swReg) return;
  const { getMessaging, getToken } = await import("firebase/messaging");
  const { app } = await import("./firebase");
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
  if (!token) return;
  const deviceId = getDeviceId();
  const userRef = doc(db, "users", uid);
  try {
    // Atomic field-path write: replaces only this device's entry in the map.
    await updateDoc(userRef, { [`fcmTokens.${deviceId}`]: token });
  } catch {
    // First-ever token for this user: fcmTokens doesn't exist yet, so the
    // dot-notation write fails. Create it as a fresh map instead.
    await updateDoc(userRef, { fcmTokens: { [deviceId]: token } }).catch(() => {});
  }
}

// Returns whether to show the notification permission banner, and a function
// to call from a button tap (iOS requires a user gesture to trigger the prompt).
// If permission is already granted, silently stores the token in the background.
export function useNotificationSetup(uid: string | undefined) {
  // Initialized to null so we can distinguish "not checked yet" from "default".
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const stored = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !VAPID_KEY) return;
    // Read permission in a microtask so setState is called in a callback,
    // not synchronously in the effect body (enforced by lint rule).
    void Promise.resolve(Notification.permission).then(setPermission);
  }, []);

  useEffect(() => {
    if (!uid || permission !== "granted" || stored.current) return;
    stored.current = true;
    void storeFcmToken(uid).catch(() => {});
  }, [uid, permission]);

  async function requestPermission() {
    if (!uid) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        await storeFcmToken(uid);
      }
    } catch (err) {
      console.error("[splitly] FCM permission request failed:", err);
    }
  }

  const needsPrompt = permission === "default";

  return { needsPrompt, requestPermission };
}
