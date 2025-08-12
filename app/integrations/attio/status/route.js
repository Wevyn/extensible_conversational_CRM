import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function GET() {
  const c = cookies();
  const token = c.get('attio_token_once')?.value || null;
  if (token) c.delete('attio_token_once');
  return NextResponse.json({ access_token: token });
}
