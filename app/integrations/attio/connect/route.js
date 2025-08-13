// app/integrations/attio/connect/route.js
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function baseUrl() {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host  = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET() {
  const clientId = process.env.ATTIO_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Missing ATTIO_CLIENT_ID" }, { status: 500 });

  const state = crypto.randomUUID();

  // Store state in an httpOnly cookie for 10 minutes
  const isHttps = baseUrl().startsWith("https://");
  cookies().set("attio_oauth_state", state, {
    httpOnly: true,
    secure: isHttps,        // true on Vercel, false on http://localhost
    sameSite: "lax",
    path: "/",
    maxAge: 600
  });

  const APP_BASE_URL = process.env.APP_BASE_URL || baseUrl();
  const redirectUri = `${APP_BASE_URL}/integrations/attio/callback`;

  const authorizeUrl = new URL(process.env.ATTIO_AUTHORIZE_URL ?? "https://app.attio.com/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  if (process.env.ATTIO_SCOPE) authorizeUrl.searchParams.set("scope", process.env.ATTIO_SCOPE);

  return NextResponse.redirect(authorizeUrl.toString(), { status: 302 });
}
