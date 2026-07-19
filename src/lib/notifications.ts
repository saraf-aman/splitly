"use client";

import { useEffect, useRef, useState } from "react";
import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

async function storeFcmToken(uid: string, groupId: string) {
  if (!VAPID_KEY) return;
  const swReg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!swReg) return;
  const { getMessaging, getToken } = await import("firebase/messaging");
  const { app } = await import("./firebase");
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
  if (!token) return;
  await updateDoc(doc(db, "households", groupId, "members", uid), {
    fcmTokens: arrayUnion(token),
  });
}

// Returns whether to show the notification permission banner, and a function
// to call from a button tap (iOS requires a user gesture to trigger the prompt).
// If permission is already granted, silently stores the token in the background.
export function useNotificationSetup(uid: string | undefined, groupId: string | null) {
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
    if (!uid || !groupId || permission !== "granted" || stored.current) return;
    stored.current = true;
    void storeFcmToken(uid, groupId).catch(() => {});
  }, [uid, groupId, permission]);

  async function requestPermission() {
    if (!uid || !groupId) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        await storeFcmToken(uid, groupId);
      }
    } catch (err) {
      console.error("[splitly] FCM permission request failed:", err);
    }
  }

  const needsPrompt = permission === "default";

  return { needsPrompt, requestPermission };
}
