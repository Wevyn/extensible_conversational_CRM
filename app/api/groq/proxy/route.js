// app/api/groq/complete/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { payload } = await req.json(); // whatever your AttioCRMProcessor/GROQ needs
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing GROQ_API_KEY" }, { status: 500 });

  // Example: proxy a Groq request (adjust to your exact call shape)
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return NextResponse.json({ error: "GROQ request failed", detail: t }, { status: 502 });
  }
  const data = await r.json();
  return NextResponse.json(data);
}
