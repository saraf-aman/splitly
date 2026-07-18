"use client";

import type { User } from "firebase/auth";
import { addDoc, collection, doc, getDoc, updateDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { Bill, ParsedReceipt } from "@/types/firestore";

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
