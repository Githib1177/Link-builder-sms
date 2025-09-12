// middleware.js — Basic Auth pro celý web (bez Next.js importů)
export const config = {
  // uplatní se na všechny cesty; když chceš něco vynechat, uprav matcher
  matcher: ['/(.*)'],
};

// Edge runtime (doporučené u middleware)
export const runtime = 'edge';

export default function middleware(req) {
  // Přihlašovací údaje (zatím natvrdo)
  const USER = 'falconi';
  const PASS = 'Falconi1';

  const auth = req.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');

  // Kontrola Basic auth
  if (scheme === 'Basic' && encoded) {
    // atob existuje v Edge runtime
    const [u, p] = atob(encoded).split(':');
    if (u === USER && p === PASS) {
      // OK -> propustit dál (nic nevracíme)
      return;
    }
  }

  // Neověřeno -> vyžádat přihlášení
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Falconi Link Builder"',
    },
  });
}
