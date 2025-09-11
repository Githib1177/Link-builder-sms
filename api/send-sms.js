// api/send-sms.js

// --- Pomocné funkce ---
function stripDiacritics(s) {
  if (!s) return '';
  // odstraní diakritiku a nahradí nové řádky mezerou
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\r\n]+/g, ' ').trim();
}
function toUCS2Hex(s) {
  // UCS-2 (BE) → hex string (např. "0044006F0062..." pro "Dob...")
  let hex = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code <= 0xFFFF) {
      hex += code.toString(16).padStart(4, '0');
    } else {
      // převod na surrogate pair
      const cp = code - 0x10000;
      const hi = 0xd800 + (cp >> 10);
      const lo = 0xdc00 + (cp & 0x3ff);
      hex += hi.toString(16).padStart(4, '0') + lo.toString(16).padStart(4, '0');
    }
  }
  return hex;
}
function parseXml(raw) {
  const errMatch = raw.match(/<err>(-?\d+)<\/err>/);
  const idMatch  = raw.match(/<sms_id>(\d+)<\/sms_id>/);
  return { err: errMatch ? Number(errMatch[1]) : null, sms_id: idMatch ? idMatch[1] : null };
}
const ERR_MAP = {
  0: 'OK',
  1: 'Neznámá chyba',
  2: 'Neplatný login',
  3: 'Neplatný hash/password',
  4: 'Neplatný time',
  5: 'Nepovolená IP',
  6: 'Neplatný název akce / parametry',
  7: 'Salt již použit',
  8: 'Chyba DB',
  9: 'Nedostatečný kredit',
  10: 'Neplatné číslo příjemce',
  11: 'Chyba odeslání',
  12: 'Chybný parametr',
};

// --- Odeslání jedné SMS na jeden endpoint ---
async function sendOne({ endpoint, login, password, number, params }) {
  const body = new URLSearchParams({
    login,
    password,
    action: 'send_sms',
    number,
    ...params,
  }).toString();

  console.log('[send-sms] request:', body);

  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const raw = await r.text();
  console.log('[send-sms] response:', r.status, raw);

  const parsed = parseXml(raw);
  return {
    http: r.status,
    raw,
    ...parsed,
    errMessage: parsed.err != null ? (ERR_MAP[parsed.err] || 'Neznámá chyba') : 'Neznámá odpověď',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, text } = req.body || {};
  console.log('[send-sms] body:', { to, text });

  if (!text || !String(text).trim()) return res.status(400).json({ ok: false, error: 'Missing text' });
  if (!to || (Array.isArray(to) && to.length === 0)) return res.status(400).json({ ok: false, error: 'Missing recipient number(s)' });

  const LOGIN = process.env.SMS_LOGIN;
  const PASSWORD = process.env.SMS_PASSWORD;
  console.log('[send-sms] env loaded:', { hasLogin: !!LOGIN, hasPass: !!PASSWORD });
  if (!LOGIN || !PASSWORD) return res.status(500).json({ ok: false, error: 'Missing SMS_LOGIN or SMS_PASSWORD env' });

  // Normalizace cílových čísel
  const toList = Array.isArray(to) ? to : String(to).split(/[,\n;]+/);
  const numbers = toList
    .map(x => String(x).trim())
    .filter(Boolean)
    .map(x => x.replace(/[^\d+]/g, '')) // ponecháme číslice a +
    .map(x => x.replace(/^\+/, ''))     // bez +
    .filter(x => /^\d{8,15}$/.test(x));

  if (numbers.length === 0) return res.status(400).json({ ok: false, error: 'No valid numbers after normalization' });

  // Připravíme texty (bez \n kvůli některým instalacím)
  const plain = String(text).replace(/[\r\n]+/g, ' ').trim();
  const ucs2hex = toUCS2Hex(plain);
  const ascii   = stripDiacritics(plain);

  const ENDPOINTS = [
    'https://api.smsbrana.cz/smsconnect/http.php',
    'https://www.smsbrana.cz/smsconnect/http.php',
  ];

  try {
    const results = [];

    for (const n of numbers) {
      let sent = null;

      // 1) UCS2 varianta: data_code=ucs2 + message=hex
      for (const ep of ENDPOINTS) {
        const r1 = await sendOne({
          endpoint: ep,
          login: LOGIN,
          password: PASSWORD,
          number: n,
          params: { data_code: 'ucs2', message: ucs2hex },
        });
        results.push({ number: n, attempt: 'ucs2-hex', endpoint: ep, ...r1 });
        if (r1.err === 0) { sent = r1; break; }
      }
      if (sent) continue;

      // 2) Fallback: čisté ASCII bez diakritiky (7bit)
      for (const ep of ENDPOINTS) {
        const r2 = await sendOne({
          endpoint: ep,
          login: LOGIN,
          password: PASSWORD,
          number: n,
          params: { message: ascii },
        });
        results.push({ number: n, attempt: 'ascii-7bit', endpoint: ep, ...r2 });
        if (r2.err === 0) { sent = r2; break; }
      }
    }

    const ok = results.some(r => r.err === 0);
    return res.status(200).json({ ok, results });
  } catch (e) {
    console.error('[send-sms] ERROR', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
