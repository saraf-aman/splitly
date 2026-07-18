"use client";

import type { User } from "firebase/auth";
import {
  doc,
  collection,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { useAuth } from "./auth-context";
import type { Household, Member, Role } from "@/types/firestore";

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
    email: user.email ?? "",
    role: "admin",
    fcmTokens: [],
    addedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "users", user.uid), { householdIds: arrayUnion(householdRef.id) }, { merge: true });
  return householdRef.id;
}

export async function joinHousehold(user: User, householdId: string): Promise<void> {
  const trimmedId = householdId.trim();
  await setDoc(doc(db, "households", trimmedId, "members", user.uid), {
    displayName: user.displayName ?? "",
    photoUrl: user.photoURL ?? "",
    email: user.email ?? "",
    role: "guest",
    fcmTokens: [],
    addedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "users", user.uid), { householdIds: arrayUnion(trimmedId) }, { merge: true });
}

type UserHouseholdState = { loading: boolean; householdId: string | null };

export function useUserHousehold(): UserHouseholdState {
  const { user } = useAuth();
  const [state, setState] = useState<UserHouseholdState>({ loading: true, householdId: null });

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      // Fall back to legacy `householdId` string so docs written before 8.1 still work.
      const ids: string[] = data?.householdIds ?? (data?.householdId ? [data.householdId as string] : []);
      setState({ loading: false, householdId: ids[0] ?? null });
    });
  }, [user]);

  return user ? state : { loading: false, householdId: null };
}

export function useHousehold(householdId: string | null): (Household & { id: string }) | null {
  const [household, setHousehold] = useState<(Household & { id: string }) | null>(null);

  useEffect(() => {
    if (!householdId) return;
    return onSnapshot(
      doc(db, "households", householdId),
      (snap) => {
        setHousehold(snap.exists() ? { id: snap.id, ...(snap.data() as Household) } : null);
      },
      // Permission-denied (e.g. we were just removed from the household) —
      // don't keep showing stale cached data.
      () => setHousehold(null),
    );
  }, [householdId]);

  return householdId ? household : null;
}

export function useMembers(householdId: string | null): (Member & { id: string })[] {
  const [members, setMembers] = useState<(Member & { id: string })[]>([]);

  useEffect(() => {
    if (!householdId) return;
    const membersQuery = query(
      collection(db, "households", householdId, "members"),
      orderBy("addedAt", "asc"),
    );
    return onSnapshot(
      membersQuery,
      (snap) => {
        setMembers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Member) })));
      },
      () => setMembers([]),
    );
  }, [householdId]);

  return householdId ? members : [];
}

type MembershipState = { loading: boolean; isMember: boolean };

// Watches the current user's own member doc so a removed member's already-open
// tab notices in realtime (Firestore closes the listener with permission-denied
// the instant the doc is deleted, since the household's read rule depends on it
// existing) instead of continuing to show whatever was last loaded.
export function useMembershipStatus(householdId: string | null, uid: string | undefined): MembershipState {
  const key = householdId && uid ? `${householdId}:${uid}` : null;
  const [subscribedFor, setSubscribedFor] = useState<string | null>(null);
  const [state, setState] = useState<MembershipState>({ loading: true, isMember: true });

  // Reset synchronously during render (not in the effect below) whenever we're
  // about to watch a different household/uid pair — otherwise a stale
  // `isMember: false` from a *previous* household/removal can briefly leak
  // into the render for a newly (re)joined one, before the fresh Firestore
  // listener has reported back. This is React's supported "adjust state in
  // response to a prop change" pattern, distinct from setState-in-effect.
  if (key !== subscribedFor) {
    setSubscribedFor(key);
    setState({ loading: true, isMember: true });
  }

  useEffect(() => {
    if (!householdId || !uid) return;
    return onSnapshot(
      doc(db, "households", householdId, "members", uid),
      (snap) => setState({ loading: false, isMember: snap.exists() }),
      () => setState({ loading: false, isMember: false }),
    );
  }, [householdId, uid]);

  return key ? state : { loading: false, isMember: true };
}

// Called when a user discovers they've been removed from a household: removes
// just that householdId from their array so any remaining households still work.
// If the array is now empty, useUserHousehold returns null → routes to onboarding.
export async function clearRemovedHouseholdPointer(user: User, householdId: string): Promise<void> {
  await updateDoc(doc(db, "users", user.uid), { householdIds: arrayRemove(householdId) });
}

export async function updateMemberRole(
  householdId: string,
  memberId: string,
  role: Role,
): Promise<void> {
  await updateDoc(doc(db, "households", householdId, "members", memberId), { role });
}

export async function removeMember(householdId: string, memberId: string): Promise<void> {
  await deleteDoc(doc(db, "households", householdId, "members", memberId));
}

// Wipes a household entirely: every bill (and its items/sharedCharges), every
// member, then the household doc itself. Every other open client notices via
// the same permission-denied path useMembershipStatus/HouseholdGate already
// handle for a single removed member — no extra client-side notification
// needed. Must run while the caller is still the creator and still a member
// (rules re-check on every write), so bills/other-members are deleted before
// the caller's own member doc, which is deleted last, right before the
// household doc.
export async function deleteHousehold(householdId: string, creatorUid: string): Promise<void> {
  const billsSnap = await getDocs(query(collection(db, "bills"), where("householdId", "==", householdId)));
  for (const billDoc of billsSnap.docs) {
    const [itemsSnap, chargesSnap] = await Promise.all([
      getDocs(collection(billDoc.ref, "items")),
      getDocs(collection(billDoc.ref, "sharedCharges")),
    ]);
    await Promise.all([
      ...itemsSnap.docs.map((d) => deleteDoc(d.ref)),
      ...chargesSnap.docs.map((d) => deleteDoc(d.ref)),
    ]);
    await deleteDoc(billDoc.ref);
  }

  const membersSnap = await getDocs(collection(db, "households", householdId, "members"));
  await Promise.all(
    membersSnap.docs.filter((d) => d.id !== creatorUid).map((d) => deleteDoc(d.ref)),
  );
  await deleteDoc(doc(db, "households", householdId, "members", creatorUid));
  await deleteDoc(doc(db, "households", householdId));
}
