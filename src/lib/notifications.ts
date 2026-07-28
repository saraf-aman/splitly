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

// A device's FCM token isn't household-specific, but each household's notify
// routes look tokens up from that household's own member doc — so the same
// token has to be written to every household the user belongs to, not just
// whichever one happened to be open when they granted permission. (Bug found
// 2026-07-28: this used to take a single groupId, always the user's *first*
// household, so granting notifications from any other household silently
// never registered a token for it.)
async function storeFcmToken(uid: string, groupIds: string[]) {
  if (!VAPID_KEY || groupIds.length === 0) return;
  const swReg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!swReg) return;
  const { getMessaging, getToken } = await import("firebase/messaging");
  const { app } = await import("./firebase");
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
  if (!token) return;
  const deviceId = getDeviceId();
  await Promise.all(
    groupIds.map(async (groupId) => {
      const memberRef = doc(db, "households", groupId, "members", uid);
      try {
        // Atomic field-path write: replaces only this device's entry in the map.
        await updateDoc(memberRef, { [`fcmTokens.${deviceId}`]: token });
      } catch {
        // Migration fallback: if fcmTokens is still the old string[] schema, the
        // dot-notation write fails. Overwrite the whole field with a fresh map.
        await updateDoc(memberRef, { fcmTokens: { [deviceId]: token } }).catch(() => {});
      }
    }),
  );
}

// Returns whether to show the notification permission banner, and a function
// to call from a button tap (iOS requires a user gesture to trigger the prompt).
// If permission is already granted, silently stores the token in the background.
export function useNotificationSetup(uid: string | undefined, groupIds: string[]) {
  // Initialized to null so we can distinguish "not checked yet" from "default".
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  // Tracks which groupIds set (joined) we've already stored the token for, so
  // joining a *new* household later re-triggers a write for that one too,
  // without re-writing on every unrelated re-render.
  const storedForKey = useRef<string | null>(null);
  const groupIdsKey = groupIds.join(",");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !VAPID_KEY) return;
    // Read permission in a microtask so setState is called in a callback,
    // not synchronously in the effect body (enforced by lint rule).
    void Promise.resolve(Notification.permission).then(setPermission);
  }, []);

  useEffect(() => {
    if (!uid || groupIds.length === 0 || permission !== "granted" || storedForKey.current === groupIdsKey) return;
    storedForKey.current = groupIdsKey;
    void storeFcmToken(uid, groupIds).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, groupIdsKey, permission]);

  async function requestPermission() {
    if (!uid || groupIds.length === 0) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        storedForKey.current = groupIdsKey;
        await storeFcmToken(uid, groupIds);
      }
    } catch (err) {
      console.error("[splitly] FCM permission request failed:", err);
    }
  }

  const needsPrompt = permission === "default";

  return { needsPrompt, requestPermission };
}
