"use client";

import type { User } from "firebase/auth";
import {
  doc,
  collection,
  deleteDoc,
  getDoc,
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
import type { Group, Member, Role } from "@/types/firestore";

// Group creation is 3 sequential writes, not a batch: the member-doc
// bootstrap rule reads the group doc via get(), and within a single
// batched/transactional commit Firestore rules see only pre-commit state —
// a batch would make that get() see a group that "doesn't exist yet".
export async function createGroup(user: User, name: string): Promise<string> {
  const groupRef = doc(collection(db, "households"));
  await setDoc(groupRef, {
    name,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
  await setDoc(doc(groupRef, "members", user.uid), {
    displayName: user.displayName ?? "",
    photoUrl: user.photoURL ?? "",
    email: user.email ?? "",
    role: "admin",
    fcmTokens: {},
    addedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "users", user.uid), { householdIds: arrayUnion(groupRef.id) }, { merge: true });
  return groupRef.id;
}

export async function joinGroup(user: User, groupId: string): Promise<void> {
  const trimmedId = groupId.trim();
  await setDoc(doc(db, "households", trimmedId, "members", user.uid), {
    displayName: user.displayName ?? "",
    photoUrl: user.photoURL ?? "",
    email: user.email ?? "",
    role: "guest",
    fcmTokens: {},
    addedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "users", user.uid), { householdIds: arrayUnion(trimmedId) }, { merge: true });
}

type UserGroupsState = { loading: boolean; groupIds: string[] };

export function useUserGroups(): UserGroupsState {
  const { user } = useAuth();
  const [state, setState] = useState<UserGroupsState>({ loading: true, groupIds: [] });

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      // Fall back to legacy `householdId` string so docs written before 8.1 still work.
      const ids: string[] = data?.householdIds ?? (data?.householdId ? [data.householdId as string] : []);
      setState({ loading: false, groupIds: ids });
    });
  }, [user]);

  return user ? state : { loading: false, groupIds: [] };
}

type UserGroupState = { loading: boolean; groupId: string | null };

// Compatibility wrapper for legacy redirect shims that need a single groupId.
export function useUserGroup(): UserGroupState {
  const { loading, groupIds } = useUserGroups();
  return { loading, groupId: groupIds[0] ?? null };
}

export function useGroupList(ids: string[]): (Group & { id: string })[] {
  const idsKey = ids.join(",");
  const [groups, setGroups] = useState<(Group & { id: string })[]>([]);

  useEffect(() => {
    if (!ids.length) return;
    const results = new Map<string, Group & { id: string }>();
    const flush = () =>
      setGroups(ids.flatMap((id) => { const g = results.get(id); return g ? [g] : []; }));
    const unsubs = ids.map((id) =>
      onSnapshot(
        doc(db, "households", id),
        (snap) => { if (snap.exists()) results.set(id, { id: snap.id, ...(snap.data() as Group) }); else results.delete(id); flush(); },
        () => { results.delete(id); flush(); },
      )
    );
    return () => { unsubs.forEach((u) => u()); setGroups([]); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return groups;
}

export function useGroup(groupId: string | null): (Group & { id: string }) | null {
  const [group, setGroup] = useState<(Group & { id: string }) | null>(null);

  useEffect(() => {
    if (!groupId) return;
    return onSnapshot(
      doc(db, "households", groupId),
      (snap) => {
        setGroup(snap.exists() ? { id: snap.id, ...(snap.data() as Group) } : null);
      },
      // Permission-denied (e.g. we were just removed from the group) —
      // don't keep showing stale cached data.
      () => setGroup(null),
    );
  }, [groupId]);

  return groupId ? group : null;
}

export function useMembers(groupId: string | null): (Member & { id: string })[] {
  const [members, setMembers] = useState<(Member & { id: string })[]>([]);

  useEffect(() => {
    if (!groupId) return;
    const membersQuery = query(
      collection(db, "households", groupId, "members"),
      orderBy("addedAt", "asc"),
    );
    return onSnapshot(
      membersQuery,
      (snap) => {
        setMembers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Member) })));
      },
      () => setMembers([]),
    );
  }, [groupId]);

  return groupId ? members : [];
}

type MembershipState = { loading: boolean; isMember: boolean };

// Watches the current user's own member doc so a removed member's already-open
// tab notices in realtime (Firestore closes the listener with permission-denied
// the instant the doc is deleted, since the group's read rule depends on it
// existing) instead of continuing to show whatever was last loaded.
export function useMembershipStatus(groupId: string | null, uid: string | undefined): MembershipState {
  const key = groupId && uid ? `${groupId}:${uid}` : null;
  const [subscribedFor, setSubscribedFor] = useState<string | null>(null);
  const [state, setState] = useState<MembershipState>({ loading: true, isMember: true });

  // Reset synchronously during render (not in the effect below) whenever we're
  // about to watch a different group/uid pair — otherwise a stale
  // `isMember: false` from a *previous* group/removal can briefly leak
  // into the render for a newly (re)joined one, before the fresh Firestore
  // listener has reported back. This is React's supported "adjust state in
  // response to a prop change" pattern, distinct from setState-in-effect.
  if (key !== subscribedFor) {
    setSubscribedFor(key);
    setState({ loading: true, isMember: true });
  }

  useEffect(() => {
    if (!groupId || !uid) return;
    return onSnapshot(
      doc(db, "households", groupId, "members", uid),
      (snap) => setState({ loading: false, isMember: snap.exists() }),
      () => setState({ loading: false, isMember: false }),
    );
  }, [groupId, uid]);

  return key ? state : { loading: false, isMember: true };
}

// Called when a user discovers they've been removed from a group: removes
// just that groupId from their array so any remaining groups still work.
// If the array is now empty, useUserGroup returns null → routes to onboarding.
export async function clearRemovedGroupPointer(user: User, groupId: string): Promise<void> {
  await updateDoc(doc(db, "users", user.uid), { householdIds: arrayRemove(groupId) });
}

// Self-service leave for any non-creator member (guests and admins alike).
// Deletes the member doc first, then removes the group from the user's
// householdIds array. If the array write fails, GroupGate's wasRemoved
// path self-heals it on next load via clearRemovedGroupPointer.
export async function leaveGroup(user: User, groupId: string): Promise<void> {
  await deleteDoc(doc(db, "households", groupId, "members", user.uid));
  await updateDoc(doc(db, "users", user.uid), { householdIds: arrayRemove(groupId) });
}

export async function updateMemberRole(
  groupId: string,
  memberId: string,
  role: Role,
): Promise<void> {
  await updateDoc(doc(db, "households", groupId, "members", memberId), { role });
}

export async function removeMember(groupId: string, memberId: string): Promise<void> {
  await deleteDoc(doc(db, "households", groupId, "members", memberId));
}

export async function setMemberSplitwiseId(
  groupId: string,
  memberId: string,
  splitwiseUserId: number,
): Promise<void> {
  await updateDoc(doc(db, "households", groupId, "members", memberId), { splitwiseUserId });
}

export async function setMemberSplitwiseEmail(
  groupId: string,
  memberId: string,
  splitwiseEmail: string,
): Promise<void> {
  await updateDoc(doc(db, "households", groupId, "members", memberId), { splitwiseEmail });
}

// Wipes a group entirely: every bill (and its items/sharedCharges), every
// member, then the group doc itself. Every other open client notices via
// the same permission-denied path useMembershipStatus/GroupGate already
// handle for a single removed member — no extra client-side notification
// needed. Must run while the caller is still the creator and still a member
// (rules re-check on every write), so bills/other-members are deleted before
// the caller's own member doc, which is deleted last, right before the group doc.
export async function deleteGroup(groupId: string, creatorUid: string): Promise<void> {
  const billsSnap = await getDocs(query(collection(db, "bills"), where("householdId", "==", groupId)));
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

  const membersSnap = await getDocs(collection(db, "households", groupId, "members"));
  await Promise.all(
    membersSnap.docs.filter((d) => d.id !== creatorUid).map((d) => deleteDoc(d.ref)),
  );
  await deleteDoc(doc(db, "households", groupId, "members", creatorUid));
  await deleteDoc(doc(db, "households", groupId));
}

// Refreshes photoUrl on all the user's member docs from their current Firebase Auth profile.
// Called on every login so profile photos stay up to date even if they changed their Google photo.
export async function refreshMemberPhotoUrl(uid: string, photoURL: string): Promise<void> {
  if (!photoURL) return;
  const userSnap = await getDoc(doc(db, "users", uid));
  const householdIds: string[] = userSnap.data()?.householdIds ?? [];
  await Promise.all(
    householdIds.map((hid) =>
      updateDoc(doc(db, "households", hid, "members", uid), { photoUrl: photoURL }).catch(() => {}),
    ),
  );
}
