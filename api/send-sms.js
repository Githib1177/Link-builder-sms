// /api/send-sms.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, text } = req.body || {};
  if (!text || !Array.isArray(to) || to.length === 0) {
    return res.status(400).json({ ok: false, error: 'Missing to[]/text' });
  }

  const LOGIN = process.env.SMS_LOGIN;         // ← čte stejné názvy jako ve Vercelu
  const PASSWORD = process.env.SMS_PASSWORD;   // ← čte stejné názvy jako ve Vercelu
  if (!LOGIN || !PASSWORD) {
    return res.status(500).json({ ok: false, error: 'Missing SMS API credentials (env)' });
  }

  const endpoint = 'https://api.smsbrana.cz/smsconnect/http.php';

  try {
    const results = [];
    for (const num of to) {
      const params = new URLSearchParams();
      params.set('login', LOGIN);
      params.set('password', PASSWORD);
      params.set('action', 'send_sms');                       // SMS connect přes HTTP
      params.set('number', String(num).replace(/\s+/g, ''));
      params.set('message', text);

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const bodyText = await r.text();
      if (!r.ok) {
        return res.status(502).json({ ok: false, error: 'Gateway error', detail: bodyText });
      }
      // Pro ladění ti vrátím i surovou odpověď SMSBrána:
      results.push({ to: num, response: bodyText });
    }
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
