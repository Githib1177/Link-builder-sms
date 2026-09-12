import { neon } from '@neondatabase/serverless';
import { isAuthorized } from '../_auth.js';

const toCsv = arr => Array.isArray(arr) ? arr.join(',') : '';
const fromCsv = value => (value || '').split(',').map(item => item.trim()).filter(Boolean);

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS sms_history (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      guest TEXT,
      lang TEXT,
      to_numbers TEXT,
      text_body TEXT,
      link TEXT
    );
  `;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Přihlášení vypršelo. Přihlaste se znovu.' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Historie není připojená k databázi.' });

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureTable(sql);

    if (req.method === 'GET') {
      const requestedLimit = Number.parseInt(String(req.query?.limit || '50'), 10);
      const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 200);
      const rows = await sql`
        SELECT id, ts, guest, lang, to_numbers, text_body, link
        FROM sms_history
        ORDER BY ts DESC
        LIMIT ${limit};
      `;
      return res.status(200).json(rows.map(row => ({
        id: row.id,
        ts: Number(row.ts),
        guest: row.guest || '',
        lang: row.lang || '',
        to: fromCsv(row.to_numbers),
        text: row.text_body || '',
        link: row.link || ''
      })));
    }

    if (req.method === 'POST') {
      const { id, ts, guest, lang, to, text, link } = req.body || {};
      if (!id || !ts || !text || !Array.isArray(to)) {
        return res.status(400).json({ error: 'Chybí povinné údaje historie.' });
      }
      await sql`
        INSERT INTO sms_history (id, ts, guest, lang, to_numbers, text_body, link)
        VALUES (${id}, ${String(ts)}, ${guest ?? null}, ${lang ?? null},
                ${toCsv(to)}, ${text}, ${link ?? null})
        ON CONFLICT (id) DO UPDATE SET
          ts = EXCLUDED.ts,
          guest = EXCLUDED.guest,
          lang = EXCLUDED.lang,
          to_numbers = EXCLUDED.to_numbers,
          text_body = EXCLUDED.text_body,
          link = EXCLUDED.link;
      `;
      return res.status(200).json({ ok: true, id });
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM sms_history;`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Nepovolená metoda.' });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Historii se nepodařilo načíst.' });
  }
}
