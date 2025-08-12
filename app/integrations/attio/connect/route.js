import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const runtime = 'nodejs';

export async function GET() {
  const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  const clientId = process.env.ATTIO_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'Missing ATTIO_CLIENT_ID' }, { status: 500 });

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${APP_BASE_URL}/integrations/attio/callback`;

  const authorizeUrl = new URL('https://app.attio.com/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);

  cookies().set('attio_oauth_state', state, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl.toString(), { status: 302 });
}
