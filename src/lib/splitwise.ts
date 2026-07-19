"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc, deleteField } from "firebase/firestore";
import { db } from "./firebase";

interface SplitwiseConnection {
  accessToken: string;
  splitwiseUserId: number;
}

interface SplitwiseStatus {
  loading: boolean;
  connected: boolean;
  connection: SplitwiseConnection | null;
}

export function useSplitwiseStatus(uid: string | undefined): SplitwiseStatus {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<SplitwiseConnection | null>(null);

  useEffect(() => {
    if (!uid) {
      void Promise.resolve().then(() => { setLoading(false); setConnection(null); });
      return;
    }
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      const data = snap.data();
      setConnection(data?.splitwise ?? null);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  return { loading, connected: !!connection, connection };
}

export async function disconnectSplitwise(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { splitwise: deleteField() });
}

export async function saveGroupSplitwise(
  groupId: string,
  swGroupId: number,
  swGroupName: string,
): Promise<void> {
  await updateDoc(doc(db, "households", groupId), {
    splitwiseGroupId: swGroupId,
    splitwiseGroupName: swGroupName,
  });
}

export async function clearGroupSplitwise(groupId: string): Promise<void> {
  await updateDoc(doc(db, "households", groupId), {
    splitwiseGroupId: deleteField(),
    splitwiseGroupName: deleteField(),
  });
}
