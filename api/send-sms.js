// api/send-sms.js
import { isAuthorized } from './_auth.js';

// ---------- Pomocné funkce ----------
function stripDiacritics(s) {
  if (!s) return '';
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\r\n]+/g, ' ').trim();
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
  3: 'Neplatný hash/heslo',
  4: 'Neplatný time',
  5: 'Nepovolená IP',
  6: 'Neplatná akce / parametry / kódování',
  7: 'Salt již použit',
  8: 'Chyba DB',
  9: 'Nedostatečný kredit',
  10: 'Neplatné číslo',
  11: 'Chyba odeslání',
  12: 'Chybný parametr',
};

// ---------- Nízká úroveň: GET/POST volání ----------
async function callGateway({ method, endpoint, query, body }) {
  let url = endpoint;
  const headers = {};

  if (method === 'GET') {
    url += (endpoint.includes('?') ? '&' : '?') + new URLSearchParams(query).toString();
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const requestData = method === 'GET' ? query : body;
  console.log('[send-sms] gateway request', {
    method,
    endpoint,
    number: requestData?.number,
    messageLength: requestData?.message?.length,
  });

  const r = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? new URLSearchParams(body).toString() : undefined,
  });

  const raw = await r.text();
  console.log('[send-sms] response', { status: r.status, raw });

  const parsed = parseXml(raw);
  return { http: r.status, raw, ...parsed, errMessage: parsed.err != null ? (ERR_MAP[parsed.err] || 'Neznámá chyba') : 'Neznámá odpověď' };
}

// ---------- Odeslání jedné SMS ----------
async function sendStrategies({ login, password, number, text }) {
  const plain = String(text).replace(/[\r\n]+/g, ' ').trim();
  const ascii = stripDiacritics(plain);
  const ENDPOINTS = [
    'https://api.smsbrana.cz/smsconnect/',
    'https://api-backup.smsbrana.cz/smsconnect/',
  ];
  let lastError;

  for (const ep of ENDPOINTS) {
    try {
      const result = await callGateway({
        method: 'GET',
        endpoint: ep,
        query: { action: 'send_sms', login, password, number, message: ascii },
      });
      const response = { attempt: 'GET-ascii', endpoint: ep, ...result };
      if (result.err === 0) return response;

      lastError = response;
      // Záložní server má smysl jen při dočasné chybě brány nebo databáze.
      if (![1, 8].includes(result.err)) return response;
    } catch (error) {
      lastError = {
        attempt: 'GET-ascii',
        endpoint: ep,
        err: null,
        errMessage: error instanceof Error ? error.message : 'Chyba spojení',
      };
    }
  }

  return lastError;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'Přihlášení vypršelo' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, text } = req.body || {};
  console.log('[send-sms] request received', {
    recipients: Array.isArray(to) ? to.length : (to ? 1 : 0),
    messageLength: String(text || '').length,
  });

  if (!text || !String(text).trim()) return res.status(400).json({ ok: false, error: 'Missing text' });
  if (!to || (Array.isArray(to) && to.length === 0)) return res.status(400).json({ ok: false, error: 'Missing recipient number(s)' });

  const LOGIN = process.env.SMS_LOGIN;
  const PASSWORD = process.env.SMS_PASSWORD;
  console.log('[send-sms] env loaded:', { hasLogin: !!LOGIN, hasPass: !!PASSWORD });
  if (!LOGIN || !PASSWORD) return res.status(500).json({ ok: false, error: 'Missing SMS_LOGIN or SMS_PASSWORD env' });

  // Normalizace čísel: ponecháme číslice/+, zahodíme + a whitespace
  const toList = Array.isArray(to) ? to : String(to).split(/[,\n;]+/);
  const numbers = toList
    .map(x => String(x).trim())
    .filter(Boolean)
    .map(x => x.replace(/[^\d+]/g, ''))
    .map(x => x.replace(/^\+/, ''))
    .filter(x => /^\d{8,15}$/.test(x));

  if (numbers.length === 0) return res.status(400).json({ ok: false, error: 'No valid numbers after normalization' });

  try {
    const results = [];
    for (const n of numbers) {
      const r = await sendStrategies({ login: LOGIN, password: PASSWORD, number: n, text });
      results.push({ number: n, ...r });
    }
    const ok = results.some(r => r.err === 0);
    const last = results[results.length - 1];
    return res.status(200).json({
      ok,
      results,
      error: ok ? undefined : `SMSBrána: ${last?.errMessage || 'chyba'} (kód ${last?.err ?? '?'})`,
    });
  } catch (e) {
    console.error('[send-sms] ERROR', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

