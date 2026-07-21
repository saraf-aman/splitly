/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { initializeApp, getApps } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Firebase realtime traffic (Firestore listeners, Auth, FCM) must never be
// intercepted by the SW — caching or delaying these breaks realtime sync silently.
const firebaseNetworkOnly = {
  matcher: ({ url }: { url: URL }) =>
    [
      "firestore.googleapis.com",
      "firebase.googleapis.com",
      "fcmregistrations.googleapis.com",
      "identitytoolkit.googleapis.com",
    ].includes(url.hostname),
  handler: new NetworkOnly(),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [firebaseNetworkOnly, ...defaultCache],
});

serwist.addEventListeners();

// Firebase Messaging background handler — shows push notifications when the
// PWA is backgrounded or closed. NEXT_PUBLIC_ vars are inlined at build time.
const firebaseApp =
  getApps().length > 0
    ? getApps()[0]!
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });

const messagingInstance = getMessaging(firebaseApp);

onBackgroundMessage(messagingInstance, (payload) => {
  const title = payload.notification?.title ?? "Splitly";
  const body = payload.notification?.body ?? "New activity in your household";
  const data = (payload.data ?? {}) as Record<string, string>;
  const link = data.link ?? "/";
  // tag collapses duplicate showNotification calls from the same push event
  // firing more than once (e.g. two tokens pointing at the same device).
  // The OS replaces the first notification with the second silently — no flicker,
  // because both notifications have identical content.
  const tag = data.tag;
  void self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag,
    data: { link },
  });
});

self.addEventListener("notificationclick", (event) => {
  const e = event as NotificationEvent;
  e.notification.close();
  const link = (e.notification.data as { link?: string } | undefined)?.link ?? "/";
  e.waitUntil((self as ServiceWorkerGlobalScope).clients.openWindow(link));
});
