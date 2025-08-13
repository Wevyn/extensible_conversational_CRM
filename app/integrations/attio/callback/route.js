// app/integrations/attio/route.ts
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // don't cache

function baseUrl() {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host  = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET() {
  const state = crypto.randomUUID();
  const isProd = process.env.NODE_ENV === "production";

  cookies().set("attio_oauth_state", state, {
    httpOnly: true,
    secure: isProd,      // false on http://localhost
    sameSite: "lax",
    path: "/",
    maxAge: 600
  });

  const redirectUri = `${baseUrl()}/integrations/attio/callback`;
  const auth = new URL(process.env.ATTIO_AUTHORIZE_URL ?? "https://api.attio.com/oauth/authorize");
  auth.searchParams.set("client_id", process.env.ATTIO_CLIENT_ID!);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", process.env.ATTIO_SCOPE ?? "");
  auth.searchParams.set("state", state);

  return NextResponse.redirect(auth);
}
