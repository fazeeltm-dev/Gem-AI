// Shared helpers: JSON responses, storage (Netlify Blobs), password hashing, signed login tokens.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(crypto.scrypt);

export const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/* Storage. In production this is Netlify Blobs. MEMORY_STORE=1 is only for automated tests. */
const mem = new Map();
export async function store(name) {
  if (process.env.MEMORY_STORE) {
    return {
      getJSON: async k => (mem.has(name + k) ? JSON.parse(mem.get(name + k)) : null),
      setJSON: async (k, v) => { mem.set(name + k, JSON.stringify(v)); },
      del: async k => { mem.delete(name + k); }
    };
  }
  const { getStore } = await import('@netlify/blobs');
  const s = getStore({ name, consistency: 'strong' });
  return { getJSON: k => s.get(k, { type: 'json' }), setJSON: (k, v) => s.setJSON(k, v), del: k => s.delete(k) };
}

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET is missing or too short (use 32+ random characters).');
  return s;
};
const b64u = b => Buffer.from(b).toString('base64url');
const hmac = d => crypto.createHmac('sha256', secret()).update(d).digest('base64url');

export function sign(payload, days = 30) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + days * 86400 }));
  return `${h}.${p}.${hmac(h + '.' + p)}`;
}
export function authUser(req) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [h, p, s] = t.split('.');
  if (!h || !p || !s) return null;
  try {
    const a = Buffer.from(hmac(h + '.' + p)), b = Buffer.from(s);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp > Date.now() / 1000 && d.sub ? d : null;
  } catch { return null; }
}

export async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + (await scrypt(pw, salt, 64)).toString('hex');
}
export async function checkPw(pw, stored) {
  const [s, h] = String(stored).split(':');
  if (!s || !h) return false;
  const d = await scrypt(pw, Buffer.from(s, 'hex'), 64), e = Buffer.from(h, 'hex');
  return d.length === e.length && crypto.timingSafeEqual(d, e);
}
export const emailKey = e => 'u_' + crypto.createHash('sha256').update(e.toLowerCase()).digest('hex');
