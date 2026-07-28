"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { ArrowLeft, Camera, PenLine } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { createBill, parseBillImage } from "@/lib/bills";
import { useMembers } from "@/lib/group";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type EntryMode = "photo" | "manual";

export default function NewBillPage() {
  const router = useRouter();
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const members = useMembers(groupId);
  const uid = user?.uid ?? "";
  const otherMembers = members.filter((m) => m.id !== uid);

  const [mode, setMode] = useState<EntryMode>("photo");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Who this bill applies to — everyone pre-checked, uploader unchecks who's not
  // involved. Only ever holds ids the uploader actively unchecked, so members
  // who load in later (or drop out of the household) don't need reconciling —
  // the final participant list is always derived fresh from `otherMembers`.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  function toggleMember(memberId: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  async function handleUpload() {
    if (!file || !user || !groupId) return;
    setSubmitting(true);
    setError(null);
    try {
      const parsed = await parseBillImage(file);
      const participantIds = [uid, ...otherMembers.filter((m) => !excludedIds.has(m.id)).map((m) => m.id)];
      const billId = await createBill(user, groupId, parsed, participantIds);
      router.push(`/groups/${groupId}/bills/${billId}/review`);
    } catch {
      setError("Couldn't parse that receipt. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Manual entry skips the Gemini call entirely — the review screen already
  // supports adding/editing items and tax/tip/service from a blank slate, so
  // we just create the bill with an empty parsed result and hand off to it.
  async function handleManualCreate() {
    if (!user || !groupId) return;
    setSubmitting(true);
    setError(null);
    try {
      const participantIds = [uid, ...otherMembers.filter((m) => !excludedIds.has(m.id)).map((m) => m.id)];
      const billId = await createBill(
        user,
        groupId,
        { items: [], tax: null, tip: null, serviceCharge: null, total: null, restaurantOrStoreName: null, billDate: null },
        participantIds,
      );
      router.push(`/groups/${groupId}/bills/${billId}/review`);
    } catch {
      setError("Couldn't create the bill. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex flex-1 flex-col items-center gap-6 overflow-y-auto bg-background px-6 py-16">
      <Link
        href={`/groups/${groupId}`}
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft size={15} />
        Home
      </Link>

      <h1 className="text-heading text-foreground">
        {mode === "photo" ? "Upload a receipt" : "Enter a bill manually"}
      </h1>

      <div className="flex w-full max-w-xs gap-2 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode("photo")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-caption font-medium transition-colors ${
            mode === "photo" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Camera size={14} />
          Photo
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-caption font-medium transition-colors ${
            mode === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <PenLine size={14} />
          Enter manually
        </button>
      </div>

      {mode === "photo" ? (
        <Card className="w-full max-w-xs p-0">
          <CardContent className="p-0">
            <label className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Receipt preview" className="max-h-64 rounded-md object-contain" />
              ) : (
                <>
                  <Camera className="size-8 text-primary" />
                  <span className="text-body text-muted-foreground">
                    Tap to take a photo or choose a receipt image
                  </span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>
          </CardContent>
        </Card>
      ) : (
        <p className="w-full max-w-xs text-center text-body text-muted-foreground">
          You&apos;ll add item names and prices on the next screen.
        </p>
      )}

      {otherMembers.length > 0 && (
        <div className="w-full max-w-xs">
          <p className="mb-2 text-caption font-medium uppercase tracking-wide text-muted-foreground">
            Who&apos;s this bill for?
          </p>
          <Card className="p-0">
            <CardContent className="flex flex-col divide-y divide-border p-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked disabled className="size-5 shrink-0 accent-primary opacity-60" />
                <span className="flex-1 text-body text-foreground">You</span>
              </div>
              {otherMembers.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 cursor-pointer accent-primary"
                    checked={!excludedIds.has(m.id)}
                    onChange={() => toggleMember(m.id)}
                  />
                  <span className="flex-1 text-body text-foreground">{m.displayName || "Member"}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Button
        size="lg"
        className="h-12 w-full max-w-xs px-8 text-base"
        onClick={mode === "photo" ? handleUpload : handleManualCreate}
        disabled={mode === "photo" ? !file || submitting : submitting}
      >
        {mode === "photo"
          ? submitting
            ? "Parsing receipt..."
            : "Upload & parse"
          : submitting
            ? "Creating bill..."
            : "Continue"}
      </Button>

      {error && <p className="text-caption text-destructive">{error}</p>}
    </div>
  );
}
