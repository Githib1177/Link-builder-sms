// api/send-sms.js

function toAsciiFallback(s) {
  if (!s) return '';
  let out = s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  out = out.replace(/[\r\n]+/g, ' ').trim();
  return out;
}

const ERR_MAP = {
  0: 'OK',
  1: 'Chyba přihlášení (login/heslo)',
  2: 'Chybí parametr',
  3: 'Neplatné číslo',
  4: 'Nedostatečný kredit',
  5: 'Zakázaná akce',
  6: 'Chybná zpráva (formát/kódování)',
  7: 'Systémová chyba',
};

function parseXml(raw) {
  const errMatch = raw.match(/<err>(\d+)<\/err>/);
  const idMatch  = raw.match(/<sms_id>(\d+)<\/sms_id>/);
  return {
    err: errMatch ? Number(errMatch[1]) : null,
    sms_id: idMatch ? idMatch[1] : null,
  };
}

async function sendOne({ endpoint, login, password, number, message, useUnicode }) {
  const params = new URLSearchParams();
  params.set('login', login);
  params.set('password', password);
  params.set('action', 'send_sms');
  params.set('number', number);
  if (useUnicode) params.set('unicode', '1');
  params.set('message', message);

  const body = params.toString();
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

  const toList = Array.isArray(to) ? to : String(to).split(/[,\n;]+/);
  const numbers = toList
    .map(x => String(x).trim())
    .filter(Boolean)
    .map(x => x.replace(/[^\d+]/g, ''))
    .map(x => x.replace(/^\+/, ''))  // bez +
    .filter(x => /^\d{8,15}$/.test(x));

  if (numbers.length === 0) return res.status(400).json({ ok: false, error: 'No valid numbers after normalization' });

  const endpoint = 'https://smsbrana.cz/smsconnect/http.php';

  try {
    const results = [];
    // Text bez zalomení (některým instalacím vadí \n) – pošleme jej v unicode i fallbacku
    const textNoNL = String(text).replace(/[\r\n]+/g, ' ').trim();

    for (const n of numbers) {
      // 1) Unicode pokus
      const firstTry = await sendOne({
        endpoint,
        login: LOGIN,
        password: PASSWORD,
        number: n,
        message: textNoNL,
        useUnicode: true,
      });

      if (firstTry.err === 0) {
        results.push({ number: n, attempt: 'unicode', ...firstTry });
        continue;
      }

      // 2) Fallback: ASCII bez diakritiky, bez unicode
      const asciiText = toAsciiFallback(textNoNL);
      const secondTry = await sendOne({
        endpoint,
        login: LOGIN,
        password: PASSWORD,
        number: n,
        message: asciiText,
        useUnicode: false,
      });

      results.push({ number: n, attempt: 'fallback-ascii', firstTry, ...secondTry });
    }

    const ok = results.some(r => r.err === 0 || (r.firstTry && r.firstTry.err === 0));
    return res.status(200).json({ ok, results });
  } catch (e) {
    console.error('[send-sms] ERROR', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
