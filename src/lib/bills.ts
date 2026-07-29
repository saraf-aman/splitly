"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { addDoc, collection, deleteField, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where, writeBatch, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { Bill, BillItem, ParsedReceipt, SharedCharge, SharedChargeType } from "@/types/firestore";

type ParsedBill = ParsedReceipt & {
  restaurantOrStoreName: string | null;
  billDate: string | null;
  currency: string | null; // Phase 14 — Gemini's raw guess; null for manual entry or if undetectable
};

const MAX_DIMENSION = 1600;

// Downscales the receipt photo client-side before it ever leaves the device —
// keeps the upload small and the Gemini call's image tokens (and Vercel
// Hobby's 10s function budget) in check without needing a server-side
// image library.
async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.8);
  });
}

export async function parseBillImage(image: File): Promise<ParsedBill> {
  const downscaled = await downscaleImage(image);
  const formData = new FormData();
  formData.set("image", downscaled, "receipt.jpg");
  const res = await fetch("/api/parse-bill", { method: "POST", body: formData });
  if (!res.ok) throw new Error("Failed to parse receipt.");
  return res.json();
}

export async function confirmSelections(
  billId: string,
  uid: string,
  items: Array<{ id: string; selections: Record<string, { included: boolean; shares: number; setBy: string }> }>,
): Promise<void> {
  if (items.length > 0) {
    const batch = writeBatch(db);
    for (const item of items) {
      const sel = item.selections[uid];
      batch.update(doc(db, "bills", billId, "items", item.id), {
        [`selections.${uid}`]: {
          included: sel?.included ?? true,
          shares: sel?.shares ?? 1,
          setBy: uid,
        },
      });
    }
    await batch.commit();
  }

  await updateDoc(doc(db, "bills", billId), {
    [`confirmedBy.${uid}`]: true,
  });
}

export async function forceSettleBill(billId: string, memberIds: string[]): Promise<void> {
  const confirmedBy: Record<string, boolean> = {};
  for (const id of memberIds) confirmedBy[`confirmedBy.${id}`] = true;
  await updateDoc(doc(db, "bills", billId), confirmedBy);
}

// Updates individual members' settled state. Pass true to mark confirmed,
// false to remove their confirmedBy entry (un-settle).
export async function updateMemberSettleStates(
  billId: string,
  states: Record<string, boolean>,
): Promise<void> {
  const updates: Record<string, boolean | ReturnType<typeof deleteField>> = {};
  for (const [uid, settled] of Object.entries(states)) {
    updates[`confirmedBy.${uid}`] = settled ? true : deleteField();
  }
  await updateDoc(doc(db, "bills", billId), updates);
}

export async function updateItemSelection(
  billId: string,
  itemId: string,
  uid: string,
  selection: { included: boolean; shares: number },
  setBy?: string, // defaults to uid; pass the uploader's uid when overriding another member
): Promise<void> {
  await updateDoc(doc(db, "bills", billId, "items", itemId), {
    [`selections.${uid}`]: { ...selection, setBy: setBy ?? uid },
  });
}

export async function getBill(billId: string): Promise<Bill | null> {
  const snap = await getDoc(doc(db, "bills", billId));
  return snap.exists() ? (snap.data() as Bill) : null;
}

export async function updateBillParsedResult(billId: string, parsedResult: ParsedReceipt): Promise<void> {
  await updateDoc(doc(db, "bills", billId), { parsedResult });
}

export interface ConfirmItem {
  name: string;
  price: number; // cents
  lowConfidence: boolean;
}

export interface ConfirmCharge {
  type: SharedChargeType;
  amount: number; // cents
}

export async function confirmBill(
  billId: string,
  items: ConfirmItem[],
  charges: ConfirmCharge[],
  currency: string,
): Promise<void> {
  const batch = writeBatch(db);

  const itemsRef = collection(db, "bills", billId, "items");
  for (const item of items) {
    batch.set(doc(itemsRef), { ...item, selections: {} });
  }

  const chargesRef = collection(db, "bills", billId, "sharedCharges");
  for (const charge of charges) {
    batch.set(doc(chargesRef), charge);
  }

  // parsedResult.total is recomputed from the actual confirmed items/charges,
  // not left as Gemini's original guess — it stays null forever for manual
  // entry (no Gemini call), and goes stale for any AI-parsed bill whose items
  // were edited during review. The home feed's bill card total reads this
  // field, so a stale/null value there hides the amount entirely.
  const total = items.reduce((sum, item) => sum + item.price, 0) + charges.reduce((sum, c) => sum + c.amount, 0);

  // currency is re-written here (not just at createBill) because the review
  // screen lets the uploader change the picker right up until Confirm.
  batch.update(doc(db, "bills", billId), { status: "open", currency, "parsedResult.total": total });

  await batch.commit();
}

export function useBill(billId: string | null) {
  const [bill, setBill] = useState<(Bill & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!billId) return;
    return onSnapshot(
      doc(db, "bills", billId),
      (snap) => {
        setBill(snap.exists() ? { id: snap.id, ...(snap.data() as Bill) } : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [billId]);

  return { bill, loading: billId === null ? false : loading };
}

export function useSharedCharges(billId: string | null) {
  const [charges, setCharges] = useState<(SharedCharge & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!billId) return;
    return onSnapshot(
      collection(db, "bills", billId, "sharedCharges"),
      (snap) => {
        setCharges(snap.docs.map((d) => ({ id: d.id, ...(d.data() as SharedCharge) })));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [billId]);

  return { charges, loading: billId === null ? false : loading };
}

export function useBillItems(billId: string | null) {
  const [items, setItems] = useState<(BillItem & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!billId) return;
    return onSnapshot(
      collection(db, "bills", billId, "items"),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as BillItem) })));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [billId]);

  return { items, loading: billId === null ? false : loading };
}

export function useGroupBills(groupId: string | null, uid: string | null) {
  const [bills, setBills] = useState<(Bill & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId || !uid) return;
    // Firestore rules gate bill reads on participantIds, so the query itself
    // must filter on it too — rules reject a query that could return a
    // document it can't prove satisfies the rule, they don't silently
    // redact non-matching docs from a broader query.
    return onSnapshot(
      query(
        collection(db, "bills"),
        where("householdId", "==", groupId),
        where("participantIds", "array-contains", uid),
        orderBy("createdAt", "desc"),
      ),
      (snap) => {
        setBills(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Bill) })));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [groupId, uid]);

  return { bills, loading };
}

// Phase 14 currency fallback chain, tiers 2-3 (tier 1, Gemini's own guess, is
// already on `parsed.currency` by the time this runs; tier 4, "USD", is the
// final default below). Not called for manual entry's tier-1-less path only
// in the sense that it's the same fallback either way.
async function resolveDefaultCurrency(groupId: string): Promise<string> {
  const recentSnap = await getDocs(
    query(
      collection(db, "bills"),
      where("householdId", "==", groupId),
      orderBy("createdAt", "desc"),
      limit(1),
    ),
  );
  const recentCurrency = recentSnap.docs[0]?.data()?.currency as string | undefined;
  if (recentCurrency) return recentCurrency;

  const groupSnap = await getDoc(doc(db, "households", groupId));
  return (groupSnap.data()?.defaultCurrency as string | undefined) ?? "USD";
}

export async function createBill(
  user: User,
  groupId: string,
  parsed: ParsedBill,
  participantIds: string[],
): Promise<string> {
  const { restaurantOrStoreName, billDate, currency: parsedCurrency, ...parsedResult } = parsed;
  const currency = parsedCurrency ?? (await resolveDefaultCurrency(groupId));
  const billRef = await addDoc(collection(db, "bills"), {
    householdId: groupId,
    uploadedBy: user.uid,
    restaurantOrStoreName,
    billDate: billDate ? Timestamp.fromDate(new Date(billDate)) : serverTimestamp(),
    status: "pending_review",
    createdAt: serverTimestamp(),
    parsedResult,
    currency,
    // Uploader must always be able to see/act on their own bill.
    participantIds: participantIds.includes(user.uid) ? participantIds : [...participantIds, user.uid],
  });
  return billRef.id;
}

// Phase 12.2 — uploader-only participant management after a bill exists.
// Firestore rules restrict changes to `participantIds` to the bill's
// uploader; the "has this member already interacted" check that gates
// removal happens client-side (grid page) before this is ever called. A
// single overwrite (rather than per-toggle arrayUnion/arrayRemove calls) so
// the manage-participants sheet can stage several changes and write — and
// notify — them all at once on Save, instead of firing a push per checkbox tap.
export async function setBillParticipants(billId: string, participantIds: string[]): Promise<void> {
  await updateDoc(doc(db, "bills", billId), { participantIds });
}
