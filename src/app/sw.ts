/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

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
