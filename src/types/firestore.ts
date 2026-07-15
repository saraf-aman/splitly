import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "guest";

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
  role: Role;
  fcmTokens: string[];
  addedAt: Timestamp;
}

export type BillStatus = "pending_review" | "open" | "settled";

// bills/{billId}
export interface Bill {
  householdId: string;
  uploadedBy: string; // userId
  restaurantOrStoreName: string | null;
  billDate: Timestamp;
  status: BillStatus;
  createdAt: Timestamp;
}

// bills/{billId}/items/{itemId}
export interface BillItem {
  name: string;
  price: number; // cents
  lowConfidence: boolean;
  selections: Record<string, { included: boolean; shares: number }>; // keyed by userId
}

export type SharedChargeType = "tax" | "tip" | "service_charge" | "other";

// bills/{billId}/sharedCharges/{chargeId}
export interface SharedCharge {
  type: SharedChargeType;
  amount: number; // cents
}
