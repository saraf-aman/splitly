import { NextResponse } from "next/server";

// Stub for now — Phase 2.2 replaces this with a real Claude vision call that
// extracts items/tax/tip/total from the image. This step only wires up the
// upload → parse → create-bill plumbing, so it just validates an image came
// through and returns a minimal placeholder result.
export async function POST(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof Blob) || image.size === 0) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  return NextResponse.json({
    restaurantOrStoreName: null,
    billDate: new Date().toISOString(),
  });
}
