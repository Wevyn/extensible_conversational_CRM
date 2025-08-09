import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Invalid text" }, { status: 400 });
    }

    const systemMessage =
      "You are a CRM intelligence assistant. Return ONLY a valid JSON array of objects (person/company/deal/task/relationship).";
    const prompt = `Extract structured updates from the following transcript and return a JSON array only. Transcript: """${text}"""`;

    // Prefer Groq if configured
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      const body = {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      };

      const res = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || "";
        const cleaned = raw.replace(/```json|```/g, "").trim();
        const start = cleaned.indexOf("[");
        const end = cleaned.lastIndexOf("]");
        const slice =
          start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : "[]";
        let parsed: any[] = [];
        try {
          parsed = JSON.parse(slice);
        } catch {
          parsed = [];
        }
        return NextResponse.json(parsed);
      }
    }

    // Fallback to OpenRouter if configured
    const orKey = process.env.OPENROUTER_API_KEY;
    if (orKey) {
      const body = {
        model: "deepseek/deepseek-r1:free",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      };
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${orKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_ORIGIN || "http://localhost:3000",
          "X-Title": "Attio CRM Parser",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      const slice =
        start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : "[]";
      let parsed: any[] = [];
      try {
        parsed = JSON.parse(slice);
      } catch {
        parsed = [];
      }
      return NextResponse.json(parsed);
    }

    return NextResponse.json([], { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: "Parse failure" }, { status: 500 });
  }
}

