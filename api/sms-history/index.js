// api/sms-history/index.js
export const config = { runtime: 'edge' };
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || '');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const ok  = (data, status=200) => new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json', ...CORS }});
const err = (status, msg)      => ok({ error: msg }, status);

const auth = req => {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)/i);
  return !!(m && m[1] && m[1] === process.env.SMSHIST_TOKEN);
};

async function ensureTable(){
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
const toCsv   = arr => Array.isArray(arr) ? arr.join(',') : '';
const fromCsv = s   => (s || '').split(',').map(v => v.trim()).filter(Boolean);

export default async function handler(req){
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!auth(req)) return err(401, 'Unauthorized');
  await ensureTable();

  try{
    if (req.method === 'GET'){
      const url = new URL(req.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
      const rows = await sql`
        SELECT id, ts, guest, lang, to_numbers, text_body, link
        FROM sms_history
        ORDER BY ts DESC
        LIMIT ${limit};
      `;
      const out = rows.map(r => ({
        id: r.id,
        ts: Number(r.ts),
        guest: r.guest || '',
        lang: r.lang || '',
        to: fromCsv(r.to_numbers),
        text: r.text_body || '',
        link: r.link || ''
      }));
      return ok(out);
    }

    if (req.method === 'POST'){
      const { id, ts, guest, lang, to, text, link } = await req.json().catch(() => ({}));
      if (!id || !ts || !text || !Array.isArray(to)) return err(400, 'Missing fields (id, ts, to[], text)');
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
      return ok({ ok: true, id });
    }

    if (req.method === 'DELETE'){
      await sql`DELETE FROM sms_history;`;
      return ok({ ok: true });
    }

    return err(405, 'Method Not Allowed');
  }catch(e){
    return err(500, e.message || String(e));
  }
}
