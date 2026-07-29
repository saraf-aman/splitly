// One-time migration for Phase 12.10: existing groups predate `retentionMonths`.
// Sets retentionMonths=6 on every household that doesn't already have the field,
// so the new per-group setting doesn't silently change their hide behavior from
// the old hardcoded ~30-day filter to "forever" by default.
//
// Run from the repo root: node --env-file=.env.local migrate-retention.mjs
// Scratch-only — delete this file after running.

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore(app);

const snap = await db.collection("households").get();
let migrated = 0;
let skipped = 0;

for (const doc of snap.docs) {
  if ("retentionMonths" in doc.data()) {
    skipped++;
    continue;
  }
  await doc.ref.update({ retentionMonths: 6 });
  migrated++;
}

console.log(`Migrated ${migrated}, skipped ${skipped} (already had retentionMonths)`);
