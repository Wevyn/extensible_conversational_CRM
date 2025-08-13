// app/integrations/attio/status/route.js
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = cookies();
  const token = c.get("attio_token_once")?.value || null;
  if (token) c.delete("attio_token_once");
  return NextResponse.json({ access_token: token });
}
