// api/sms-history/[id].js
export const config = { runtime: 'edge' };
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || '');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE,OPTIONS',
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

export default async function handler(req){
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!auth(req)) return err(401, 'Unauthorized');
  await ensureTable();

  if (req.method !== 'DELETE') return err(405, 'Method Not Allowed');

  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  const id = parts[parts.length - 1] || '';
  if (!id) return err(400, 'Missing id');

  try{
    await sql`DELETE FROM sms_history WHERE id = ${id};`;
    return ok({ ok: true });
  }catch(e){
    return err(500, e.message || String(e));
  }
}
