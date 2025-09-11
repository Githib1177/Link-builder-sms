// api/send-sms.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, text } = req.body || {};
  console.log('[send-sms] body:', { to, text });

  const LOGIN = process.env.SMS_LOGIN;
  const PASSWORD = process.env.SMS_PASSWORD;
  console.log('[send-sms] env loaded:', { hasLogin: !!LOGIN, hasPass: !!PASSWORD });

  try {
    const endpoint = 'https://api.smsbrana.cz/smsconnect/http.php';
    const params = new URLSearchParams();
    params.set('login', LOGIN);
    params.set('password', PASSWORD);
    params.set('action', 'send_sms');
    params.set('number', Array.isArray(to) ? to[0] : to); // jen první číslo pro test
    params.set('message', text);

    console.log('[send-sms] request:', params.toString());

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const raw = await r.text();
    console.log('[send-sms] response:', r.status, raw);

    return res.status(200).json({ ok: true, status: r.status, raw });
  } catch (e) {
    console.error('[send-sms] ERROR', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
