"use client";

import type { User } from "firebase/auth";
import { addDoc, collection, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

type ParsedBillMeta = {
  restaurantOrStoreName: string | null;
  billDate: string | null;
};

export async function parseBillImage(image: File): Promise<ParsedBillMeta> {
  const formData = new FormData();
  formData.set("image", image);
  const res = await fetch("/api/parse-bill", { method: "POST", body: formData });
  if (!res.ok) throw new Error("Failed to parse receipt.");
  return res.json();
}

export async function createBill(
  user: User,
  householdId: string,
  parsed: ParsedBillMeta,
): Promise<string> {
  const billRef = await addDoc(collection(db, "bills"), {
    householdId,
    uploadedBy: user.uid,
    restaurantOrStoreName: parsed.restaurantOrStoreName,
    billDate: parsed.billDate ? Timestamp.fromDate(new Date(parsed.billDate)) : serverTimestamp(),
    status: "pending_review",
    createdAt: serverTimestamp(),
  });
  return billRef.id;
}
