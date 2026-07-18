"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { addDoc, collection, doc, getDoc, onSnapshot, updateDoc, writeBatch, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { Bill, BillItem, ParsedReceipt, SharedCharge, SharedChargeType } from "@/types/firestore";

type ParsedBill = ParsedReceipt & {
  restaurantOrStoreName: string | null;
  billDate: string | null;
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
  charges: ConfirmCharge[]
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

  batch.update(doc(db, "bills", billId), { status: "open" });

  await batch.commit();

  // Phase 7 will replace this with a real FCM push to all household members.
  console.log("[splitly] bill confirmed, stub notification fired:", billId);
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

export async function createBill(user: User, householdId: string, parsed: ParsedBill): Promise<string> {
  const { restaurantOrStoreName, billDate, ...parsedResult } = parsed;
  const billRef = await addDoc(collection(db, "bills"), {
    householdId,
    uploadedBy: user.uid,
    restaurantOrStoreName,
    billDate: billDate ? Timestamp.fromDate(new Date(billDate)) : serverTimestamp(),
    status: "pending_review",
    createdAt: serverTimestamp(),
    parsedResult,
  });
  return billRef.id;
}
