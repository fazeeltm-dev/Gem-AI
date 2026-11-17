import { json, store, authUser } from '../lib/common.mjs';
export const config = { path: '/api/chats' };

const clean = c => (Array.isArray(c) ? c : []).slice(0, 100).map(x => ({
  id: String(x.id || '').slice(0, 20), title: String(x.title || '').slice(0, 80), ts: +x.ts || 0,
  msgs: (Array.isArray(x.msgs) ? x.msgs : []).slice(-300).map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: String(m.text || '').slice(0, 30000) }))
})).filter(x => x.id);

export default async req => {
  const a = authUser(req);
  if (!a) return json({ error: 'auth' }, 401);
  const st = await store('chats');
  if (req.method === 'GET') {
    const d = (await st.getJSON(a.sub)) || { chats: [], settings: {} };
    return json({ email: a.email, chats: d.chats || [], settings: d.settings || {} });
  }
  if (req.method === 'PUT') {
    const raw = await req.text();
    if (raw.length > 4e6) return json({ error: 'Too large' }, 413);
    let b; try { b = JSON.parse(raw); } catch { return json({ error: 'Bad request' }, 400); }
    const settings = { mode: String(b.settings?.mode || 'quick').slice(0, 20), custom: String(b.settings?.custom || '').slice(0, 1000) };
    await st.setJSON(a.sub, { chats: clean(b.chats), settings, updated: Date.now() });
    return json({ ok: true });
  }
  return json({ error: 'Method not allowed' }, 405);
};
