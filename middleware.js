// middleware.js — chraň všechno kromě /api (tam používáme Bearer token)
import { NextResponse } from 'next/server';

export const config = {
  matcher: [
    // propustí /api a statické soubory
    '/((?!api/|_next/|favicon.ico|manifest.json|linkbuilder-180.png|linkbuilder-192.png|linkbuilder-512.png).*)',
  ],
};

export function middleware(req) {
  const USER = process.env.BASIC_AUTH_USER || 'falconi';
  const PASS = process.env.BASIC_AUTH_PASS || 'heslo';

  if (!USER || !PASS) return NextResponse.next();

  const hdr = req.headers.get('authorization') || '';
  // očekáváme "Basic base64(user:pass)"
  if (hdr.startsWith('Basic ')) {
    try {
      const [u, p] = atob(hdr.slice(6)).split(':');
      if (u === USER && p === PASS) return NextResponse.next();
    } catch (_) { /* ignore decode errors */ }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
  });
}
