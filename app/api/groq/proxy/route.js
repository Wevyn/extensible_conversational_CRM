// app/api/groq/proxy/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GROQ_API_KEY" }, { status: 500 });
    }

    const { endpoint, payload } = await req.json();

    // Allow only specific Groq endpoints (tighten as needed)
    const allowed = new Set(["chat/completions", "responses"]);
    if (!allowed.has(endpoint)) {
      return NextResponse.json({ error: "Unsupported endpoint" }, { status: 400 });
    }

    const upstream = await fetch(`https://api.groq.com/openai/v1/${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const text = await upstream.text();
    return new NextResponse(text || "{}", {
      status: upstream.status,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("GROQ proxy error:", err);
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}