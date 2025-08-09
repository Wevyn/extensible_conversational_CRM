import { NextRequest, NextResponse } from "next/server";

const ATTIO_BASE = "https://api.attio.com/v2";

async function isTokenValid(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${ATTIO_BASE}/objects/people`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const has = req.cookies.get("attio_token");
  return NextResponse.json({ linked: Boolean(has?.value) });
}

export async function POST(req: NextRequest) {
  try {
    const { token, validate } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    if (validate) {
      const ok = await isTokenValid(token);
      if (!ok) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set("attio_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to save token" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("attio_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
