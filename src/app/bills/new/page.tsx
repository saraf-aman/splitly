"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { useUserHousehold } from "@/lib/household";
import { createBill, parseBillImage } from "@/lib/bills";

export default function NewBillPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { householdId } = useUserHousehold();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  async function handleUpload() {
    if (!file || !user || !householdId) return;
    setSubmitting(true);
    setError(null);
    try {
      const parsed = await parseBillImage(file);
      await createBill(user, householdId, parsed);
      router.push("/");
    } catch {
      setError("Couldn't parse that receipt. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Upload a receipt</h1>

      <label className="flex w-full max-w-xs cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Receipt preview" className="max-h-64 rounded-md object-contain" />
        ) : (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Tap to take a photo or choose a receipt image
          </span>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </label>

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || submitting}
        className="w-full max-w-xs rounded-full bg-indigo-600 px-6 py-3 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {submitting ? "Parsing receipt..." : "Upload & parse"}
      </button>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
