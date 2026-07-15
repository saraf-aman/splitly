"use client";

import type { User } from "firebase/auth";
import { doc, collection, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { useAuth } from "./auth-context";
import type { Household } from "@/types/firestore";

// Household creation is 3 sequential writes, not a batch: the member-doc
// bootstrap rule reads the household doc via get(), and within a single
// batched/transactional commit Firestore rules see only pre-commit state —
// a batch would make that get() see a household that "doesn't exist yet".
export async function createHousehold(user: User, name: string): Promise<string> {
  const householdRef = doc(collection(db, "households"));
  await setDoc(householdRef, {
    name,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
  await setDoc(doc(householdRef, "members", user.uid), {
    displayName: user.displayName ?? "",
    photoUrl: user.photoURL ?? "",
    role: "admin",
    fcmTokens: [],
    addedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "users", user.uid), { householdId: householdRef.id });
  return householdRef.id;
}

export async function joinHousehold(user: User, householdId: string): Promise<void> {
  const trimmedId = householdId.trim();
  await setDoc(doc(db, "households", trimmedId, "members", user.uid), {
    displayName: user.displayName ?? "",
    photoUrl: user.photoURL ?? "",
    role: "guest",
    fcmTokens: [],
    addedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "users", user.uid), { householdId: trimmedId });
}

type UserHouseholdState = { loading: boolean; householdId: string | null };

export function useUserHousehold(): UserHouseholdState {
  const { user } = useAuth();
  const [state, setState] = useState<UserHouseholdState>({ loading: true, householdId: null });

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      setState({
        loading: false,
        householdId: snap.exists() ? (snap.data().householdId as string) : null,
      });
    });
  }, [user]);

  return user ? state : { loading: false, householdId: null };
}

export function useHousehold(householdId: string | null): (Household & { id: string }) | null {
  const [household, setHousehold] = useState<(Household & { id: string }) | null>(null);

  useEffect(() => {
    if (!householdId) return;
    return onSnapshot(doc(db, "households", householdId), (snap) => {
      setHousehold(snap.exists() ? { id: snap.id, ...(snap.data() as Household) } : null);
    });
  }, [householdId]);

  return householdId ? household : null;
}
