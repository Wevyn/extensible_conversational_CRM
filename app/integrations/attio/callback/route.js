// app/integrations/attio/callback/route.js
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

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieState = cookies().get("attio_oauth_state")?.value || null;
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  if (!state || !cookieState || state !== cookieState) {
    cookies().delete("attio_oauth_state");
    return NextResponse.json({ error: "Invalid state" }, { status: 403 });
  }

  const APP_BASE_URL = process.env.APP_BASE_URL || baseUrl();
  const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || APP_BASE_URL;

  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("code", code);
  form.set("redirect_uri", `${APP_BASE_URL}/integrations/attio/callback`);
  form.set("client_id", process.env.ATTIO_CLIENT_ID || "");
  form.set("client_secret", process.env.ATTIO_CLIENT_SECRET || "");

  const tokenResp = await fetch(process.env.ATTIO_TOKEN_URL ?? "https://app.attio.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store"
  });

  if (!tokenResp.ok) {
    const body = await tokenResp.text().catch(() => "");
    console.error("Token exchange failed", tokenResp.status, body);
    cookies().delete("attio_oauth_state");
    return NextResponse.json({ error: "Token exchange failed" }, { status: 500 });
  }

  const { access_token } = await tokenResp.json();
  if (!access_token) {
    cookies().delete("attio_oauth_state");
    return NextResponse.json({ error: "No access_token" }, { status: 500 });
  }

  // one-shot polling cookie (optional)
  const isHttps = APP_BASE_URL.startsWith("https://");
  cookies().set("attio_token_once", access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 120
  });

  cookies().delete("attio_oauth_state");

  // Close popup and notify opener
  const html = `<!doctype html>
<meta charset="utf-8"/>
<title>Connected to Attio</title>
<script>
  (function () {
    try {
      var msg = { type: 'ATTIO_OAUTH_SUCCESS', access_token: ${JSON.stringify(access_token)} };
      window.opener && window.opener.postMessage(msg, ${JSON.stringify(FRONTEND_ORIGIN)});
    } catch (e) {}
    window.close();
  })();
</script>
<p>You can close this window.</p>`;

  const res = new NextResponse(html, { status: 200 });
  res.headers.set("Content-Type", "text/html; charset=utf-8");
  return res;
}
