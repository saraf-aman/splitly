import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

// Vercel Hobby plan caps functions at 10s — no Storage/Pro plan needed for
// this app (see CLAUDE.md), so the parsing call must fit inside that window.
export const maxDuration = 10;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    restaurantOrStoreName: { type: Type.STRING, nullable: true },
    billDate: { type: Type.STRING, nullable: true, description: "ISO 8601 date, e.g. 2026-07-15" },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          price: { type: Type.NUMBER, description: "price in cents, e.g. $4.50 -> 450" },
          lowConfidence: { type: Type.BOOLEAN, description: "true if this line was hard to read or ambiguous" },
        },
        required: ["name", "price", "lowConfidence"],
      },
    },
    tax: { type: Type.NUMBER, nullable: true, description: "cents" },
    tip: { type: Type.NUMBER, nullable: true, description: "cents" },
    serviceCharge: { type: Type.NUMBER, nullable: true, description: "cents" },
    total: { type: Type.NUMBER, nullable: true, description: "cents" },
  },
  required: ["restaurantOrStoreName", "billDate", "items", "tax", "tip", "serviceCharge", "total"],
};

const PROMPT = `You are extracting structured data from a photo of a grocery or restaurant receipt.
Return every line item with its name and price. Prices must be integer cents (e.g. $4.50 becomes 450), never dollars or floats.
Separately identify tax, tip, and service charge amounts if present (null if not present on the receipt) — do not include them in the items list.
Flag "lowConfidence": true on any item whose name or price was blurry, cut off, or otherwise uncertain.
If the receipt has a store or restaurant name, include it; otherwise null. If a date is printed on the receipt, return it as an ISO 8601 date; otherwise null.`;

export async function POST(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof Blob) || image.size === 0) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  const bytes = Buffer.from(await image.arrayBuffer());

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: image.type || "image/jpeg", data: bytes.toString("base64") } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini");
    return NextResponse.json(JSON.parse(text));
  } catch (err) {
    console.error("parse-bill failed:", err);
    return NextResponse.json({ error: "Couldn't parse that receipt." }, { status: 502 });
  }
}
