// api/send-sms.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, text } = req.body || {};
  console.log('[send-sms] body:', { to, text });

  if (!text || !String(text).trim()) {
    return res.status(400).json({ ok: false, error: 'Missing text' });
  }
  if (!to || (Array.isArray(to) && to.length === 0)) {
    return res.status(400).json({ ok: false, error: 'Missing recipient number(s)' });
  }

  const LOGIN = process.env.SMS_LOGIN;
  const PASSWORD = process.env.SMS_PASSWORD;
  console.log('[send-sms] env loaded:', { hasLogin: !!LOGIN, hasPass: !!PASSWORD });

  if (!LOGIN || !PASSWORD) {
    return res.status(500).json({ ok: false, error: 'Missing SMS_LOGIN or SMS_PASSWORD env' });
  }

  // rozdělení a normalizace čísel
  const toList = Array.isArray(to) ? to : String(to).split(/[,\n;]+/);
  const numbers = toList
    .map(x => String(x).trim())
    .filter(Boolean)
    .map(x => x.replace(/[^\d+]/g, ''))  // necháme jen číslice a +
    .map(x => x.replace(/^\+/, ''))      // SMSbrána chce bez +
    .filter(x => /^\d{8,15}$/.test(x));

  if (numbers.length === 0) {
    return res.status(400).json({ ok: false, error: 'No valid numbers after normalization' });
  }

  // Bezpečné řešení: vždy unicode=1 (čeština pak nikdy nespadne na err=6)
  const endpoint = 'https://smsbrana.cz/smsconnect/http.php';

  // jednoduché mapování chyb z XML
  const ERR_MAP = {
    0: 'OK',
    1: 'Chyba přihlášení (login/heslo)',
    2: 'Chybí parametr',
    3: 'Neplatné číslo',
    4: 'Nedostatečný kredit',
    5: 'Zakázaná akce',
    6: 'Chybná zpráva (často chybí UNICODE)',
    7: 'Systémová chyba',
  };

  try {
    const results = [];

    for (const n of numbers) {
      const params = new URLSearchParams();
      params.set('login', LOGIN);
      params.set('password', PASSWORD);
      params.set('action', 'send_sms');
      params.set('number', n);
      params.set('unicode', '1');           // <<< DŮLEŽITÉ: vždy posíláme unicode
      params.set('message', text);

      const body = params.toString();
      console.log('[send-sms] request:', body);

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });

      const raw = await r.text();
      console.log('[send-sms] response:', r.status, raw);

      // XML parse (rychlé regexy pro <err> a <sms_id>)
      const errMatch = raw.match(/<err>(\d+)<\/err>/);
      const idMatch  = raw.match(/<sms_id>(\d+)<\/sms_id>/);
      const errCode  = errMatch ? Number(errMatch[1]) : null;

      results.push({
        number: n,
        http: r.status,
        raw,
        err: errCode,
        errMessage: errCode != null ? (ERR_MAP[errCode] || 'Neznámá chyba') : 'Neznámá odpověď',
        sms_id: idMatch ? idMatch[1] : null
      });
    }

    const ok = results.every(r => r.err === 0);
    return res.status(ok ? 200 : 200).json({ ok, results });
  } catch (e) {
    console.error('[send-sms] ERROR', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
