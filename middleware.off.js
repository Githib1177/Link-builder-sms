// middleware.js — chraň všechno kromě /api (tam používáme Bearer token)
import { NextResponse } from 'next/server';

export const config = {
  matcher: [
    // povolit /api a statické soubory bez Basic Auth
    '/((?!api/|_next/|favicon.ico|manifest.json|linkbuilder-180.png|linkbuilder-192.png|linkbuilder-512.png|sw.js).*)',
  ],
};

export function middleware(req) {
  const USER = process.env.BASIC_AUTH_USER || 'falconi';
  const PASS = process.env.BASIC_AUTH_PASS || 'heslo';

  if (!USER || !PASS) return NextResponse.next();

  const hdr = req.headers.get('authorization') || '';
  // očekáváme "Basic base64(user:pass)"; v Edge je k dispozici atob()
  if (hdr.startsWith('Basic ')) {
    try {
      const [u, p] = atob(hdr.slice(6)).split(':');
      if (u === USER && p === PASS) return NextResponse.next();
    } catch (_) {}
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
  });
}
