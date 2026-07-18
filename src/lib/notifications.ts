"use client";

import { useEffect, useRef } from "react";
import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

// Requests notification permission, obtains an FCM token via the serwist SW,
// and stores it on the member doc so the server can send pushes to this device.
// No-ops in dev (serwist SW is disabled), when permission is denied, or when
// NEXT_PUBLIC_FIREBASE_VAPID_KEY is not set.
export function useFcmRegistration(uid: string | undefined, householdId: string | null) {
  const registered = useRef(false);

  useEffect(() => {
    if (!uid || !householdId || registered.current) return;
    if (typeof window === "undefined" || !("Notification" in window) || !VAPID_KEY) return;

    registered.current = true;

    void (async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Use the serwist SW that already controls this page. In dev the SW is
        // disabled, so getRegistration returns undefined — skip silently.
        const swReg = await navigator.serviceWorker.getRegistration("/sw.js");
        if (!swReg) return;

        const { getMessaging, getToken } = await import("firebase/messaging");
        const { app } = await import("./firebase");
        const messaging = getMessaging(app);

        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
        if (!token) return;

        await updateDoc(doc(db, "households", householdId, "members", uid), {
          fcmTokens: arrayUnion(token),
        });
      } catch (err) {
        console.error("[splitly] FCM registration failed:", err);
      }
    })();
  }, [uid, householdId]);
}
