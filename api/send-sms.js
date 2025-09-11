// api/send-sms.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, text } = req.body || {};
  console.log('[send-sms] body:', { to, text });

  // --- Kontrola vstupů ---
  if (!text || !String(text).trim()) {
    return res.status(400).json({ ok: false, error: 'Missing text' });
  }
  if (!to || (Array.isArray(to) && to.length === 0)) {
    return res.status(400).json({ ok: false, error: 'Missing recipient number(s)' });
  }

  // --- Načtení přihlašovacích údajů z env ---
  const LOGIN = process.env.SMS_LOGIN;
  const PASSWORD = process.env.SMS_PASSWORD;
  console.log('[send-sms] env loaded:', { hasLogin: !!LOGIN, hasPass: !!PASSWORD });

  if (!LOGIN || !PASSWORD) {
    return res.status(500).json({ ok: false, error: 'Missing SMS_LOGIN or SMS_PASSWORD env' });
  }

  // --- Normalizace cílových čísel ---
  const toList = Array.isArray(to)
    ? to
    : String(to).split(/[,\n;]+/);

  const numbers = toList
    .map(x => String(x).trim())
    .filter(Boolean)
    .map(x => x.replace(/[^\d+]/g, ''))        // necháme jen čísla a +
    .map(x => x.replace(/^\+/, ''))            // SMSbrána chce bez „+“
    .filter(x => /^\d{8,15}$/.test(x));        // základní validace

  if (numbers.length === 0) {
    return res.status(400).json({ ok: false, error: 'No valid numbers after normalization' });
  }

  // --- Diakritika / UNICODE ---
  // Pokud je v textu jakýkoli znak mimo ASCII, pošleme unicode=1.
  // (Můžeš to klidně dávat vždy, ale takto šetříme segmentaci GSM7.)
  const needsUnicode = /[^\x00-\x7F]/.test(text);

  try {
    // Endpoint, který ti fungoval i v ručním testu
    const endpoint = 'https://smsbrana.cz/smsconnect/http.php';

    const results = [];
    for (const n of numbers) {
      const params = new URLSearchParams();
      params.set('login', LOGIN);
      params.set('password', PASSWORD);
      params.set('action', 'send_sms');
      params.set('number', n);
      if (needsUnicode) params.set('unicode', '1');   // <<< DŮLEŽITÉ
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

      // Zkusíme vytáhnout <err>…</err> a případně <sms_id>…</sms_id>
      const errMatch = raw.match(/<err>(\d+)<\/err>/);
      const idMatch  = raw.match(/<sms_id>(\d+)<\/sms_id>/);
      const errCode  = errMatch ? Number(errMatch[1]) : null;

      results.push({
        number: n,
        http: r.status,
        raw,
        err: errCode,
        sms_id: idMatch ? idMatch[1] : null
      });
    }

    // ok = všechny err === 0
    const ok = results.every(r => r.err === 0);
    return res.status(200).json({ ok, results, unicode: needsUnicode });
  } catch (e) {
    console.error('[send-sms] ERROR', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
