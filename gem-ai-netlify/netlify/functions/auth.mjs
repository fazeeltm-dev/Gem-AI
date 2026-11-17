import crypto from 'node:crypto';
import { json, store, sign, hashPw, checkPw, emailKey } from '../lib/common.mjs';
export const config = { path: '/api/auth' };

export default async req => {
  if (req.method === 'GET') return json({ inviteRequired: !!process.env.SIGNUP_CODE });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
  if (email.length > 254 || !/^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
  const users = await store('users'), key = emailKey(email);

  if (b.action === 'signup') {
    if (pw.length < 8 || pw.length > 200) return json({ error: 'Password must be at least 8 characters.' }, 400);
    if (process.env.SIGNUP_CODE && String(b.invite || '') !== process.env.SIGNUP_CODE) return json({ error: 'The invite code is not correct.' }, 403);
    if (await users.getJSON(key)) return json({ error: 'An account with this email already exists. Sign in instead.' }, 409);
    const u = { id: crypto.randomUUID(), email, hash: await hashPw(pw), created: Date.now() };
    await users.setJSON(key, u);
    return json({ token: sign({ sub: u.id, email }), email });
  }
  if (b.action === 'login') {
    const tries = await store('usage'), fk = 'fail_' + key;
    let f = (await tries.getJSON(fk)) || { n: 0, t: 0 };
    if (Date.now() - f.t > 15 * 60e3) f = { n: 0, t: 0 };
    if (f.n >= 8) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    const u = await users.getJSON(key);
    if (!u || !(await checkPw(pw, u.hash))) {
      f.n++; f.t = Date.now(); await tries.setJSON(fk, f);
      return json({ error: 'Wrong email or password.' }, 401);
    }
    if (f.n) await tries.del(fk);
    return json({ token: sign({ sub: u.id, email: u.email }), email: u.email });
  }
  return json({ error: 'Bad request' }, 400);
};
