import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "guest";

// users/{userId} — reverse index from auth uid to the user's households, for post-login routing
export interface UserDoc {
  householdIds: string[];
}

// households/{householdId}
export interface Household {
  name: string;
  createdAt: Timestamp;
  createdBy: string; // userId of the creator — lets Firestore rules bootstrap the first admin member
}

// households/{householdId}/members/{userId}
export interface Member {
  displayName: string;
  photoUrl: string;
  email: string;
  role: Role;
  fcmTokens: string[];
  addedAt: Timestamp;
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
  householdId: string;
  uploadedBy: string; // userId
  restaurantOrStoreName: string | null;
  billDate: Timestamp;
  status: BillStatus;
  createdAt: Timestamp;
  parsedResult: ParsedReceipt;
  confirmedBy?: Record<string, boolean>; // uid → true when member has confirmed their selections
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
