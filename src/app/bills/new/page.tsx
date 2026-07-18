"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { Camera } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useUserHousehold } from "@/lib/household";
import { createBill, parseBillImage } from "@/lib/bills";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
      const billId = await createBill(user, householdId, parsed);
      router.push(`/bills/${billId}/review`);
    } catch {
      setError("Couldn't parse that receipt. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6">
      <h1 className="text-heading text-foreground">Upload a receipt</h1>

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

      <Button
        size="lg"
        className="h-12 w-full max-w-xs px-8 text-base"
        onClick={handleUpload}
        disabled={!file || submitting}
      >
        {submitting ? "Parsing receipt..." : "Upload & parse"}
      </Button>

      {error && <p className="text-caption text-destructive">{error}</p>}
    </div>
  );
}
