import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "guest";

// users/{userId} — reverse index from auth uid to the user's groups, for post-login routing
export interface UserDoc {
  householdIds: string[]; // Firestore field name — do not rename
  splitwise?: {
    accessToken: string;
    splitwiseUserId: number;
  };
  // Device push tokens, centralized here (not per-household) since a token
  // isn't household-specific and nothing in the UI reads another member's
  // token — notify routes read it via the Admin SDK, which bypasses rules
  // anyway. Used to live duplicated on every households/{id}/members/{uid}
  // doc; that required fanning writes out to every household on every grant,
  // which is exactly the bug that motivated centralizing it (2026-07-28).
  fcmTokens?: Record<string, string>; // deviceId → FCM token
}

// households/{groupId}
export interface Group {
  name: string;
  createdAt: Timestamp;
  createdBy: string; // userId of the creator — lets Firestore rules bootstrap the first admin member
  splitwiseGroupId?: number;
  splitwiseGroupName?: string;
}

// households/{groupId}/members/{userId}
export interface Member {
  displayName: string;
  photoUrl: string;
  email: string;
  role: Role;
  addedAt: Timestamp;
  splitwiseUserId?: number; // set by self-connect (via OAuth callback); persists across disconnect; admin cannot overwrite
  splitwiseEmail?: string;  // admin-set alternate Splitwise email, only used when splitwiseUserId is absent
}

export type BillStatus = "pending_review" | "open" | "settled";

// AI's raw guess at the receipt contents, stored on the bill doc as soon as
// parsing succeeds. The review screen (Phase 2.3) edits a working copy of
// this; confirming (Phase 2.4) is what writes the real `items`/`sharedCharges`
// subcollections — this field itself is never treated as the source of truth.
export interface ParsedReceiptItem {
  name: string;
  price: number; // cents
  lowConfidence: boolean; // AI parser flagged this for double-checking
}

export interface ParsedReceipt {
  items: ParsedReceiptItem[];
  tax: number | null; // cents
  tip: number | null; // cents
  serviceCharge: number | null; // cents
  total: number | null; // cents
}

// bills/{billId}
export interface Bill {
  householdId: string; // Firestore field name — do not rename
  uploadedBy: string; // userId
  restaurantOrStoreName: string | null;
  billDate: Timestamp;
  status: BillStatus;
  createdAt: Timestamp;
  parsedResult: ParsedReceipt;
  confirmedBy?: Record<string, boolean>; // uid → true when member has confirmed their selections
  splitwiseExpenseId?: number; // set after a successful push to Splitwise
  // Subset of household members this bill applies to; uploader always included.
  // Optional for backward compat with bills created before Phase 12.1 — treat
  // a missing value as "every household member" everywhere it's read.
  participantIds?: string[];
  // Set once the "everyone's made their picks" push has been sent to the
  // uploader (Phase 12.4) — guards against sending it more than once per bill,
  // even if a member is later un-settled and re-confirms.
  completionNotifiedAt?: Timestamp;
  // Reminder-nudge state (Phase 12.5), keyed by not-yet-confirmed participant
  // uid. Read/written only by the reminder cron via the Admin SDK.
  reminders?: Record<string, { count: number; lastSentAt: Timestamp }>;
}

// bills/{billId}/items/{itemId}
export interface BillItem {
  name: string;
  price: number; // cents
  lowConfidence: boolean;
  selections: Record<string, { included: boolean; shares: number; setBy: string }>; // keyed by userId
}

export type SharedChargeType = "tax" | "tip" | "service_charge" | "other";

// bills/{billId}/sharedCharges/{chargeId}
export interface SharedCharge {
  type: SharedChargeType;
  amount: number; // cents
}
