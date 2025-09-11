// /api/send-sms.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const { to, text } = req.body || {};
  if (!text || !Array.isArray(to) || !to.length) {
    return res.status(400).json({error:'Missing to[]/text'});
  }

  const LOGIN = process.env.SMSBRANA_LOGIN;     // nastav v prostředí
  const PASSWORD = process.env.SMSBRANA_PASSWORD;

  const endpoint = 'https://api.smsbrana.cz/smsconnect/http.php';

  try {
    const results = [];
    for (const num of to) {
      const params = new URLSearchParams();
      params.set('login', LOGIN);
      params.set('password', PASSWORD);
      params.set('action', 'send_sms');            // dle nastavení SMS Connect
      params.set('number', String(num).replace(/\s+/g,''));
      params.set('message', text);

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type':'application/x-www-form-urlencoded'},
        body: params.toString()
      });

      const body = await r.text();
      if (!r.ok) throw new Error(body || 'Gateway error');
      results.push({to:num, raw:body});
    }
    res.status(200).json({ok:true, results});
  } catch (e) {
    res.status(502).json({ok:false, error: e.message});
  }
}
