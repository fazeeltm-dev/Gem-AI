import { json, store, authUser } from '../lib/common.mjs';
export const config = { path: '/api/chat' };

/* "Modes" are what users see. Models and instructions stay on the server.
   Override a mode's models without code changes via env vars: MODELS_QUICK, MODELS_THINK, ... (comma list, tried in order). */
const MODES = {
  quick: { env: 'MODELS_QUICK', models: 'gemini-3.5-flash-lite,gemini-3.5-flash', sys: 'You are Gem AI, a helpful assistant. Give clear, concise answers.' },
  think: { env: 'MODELS_THINK', models: 'gemini-3.5-flash,gemini-3.5-flash-lite', sys: 'You are Gem AI. Think carefully, reason step by step when it helps, and double-check your answer before replying.' },
  code:  { env: 'MODELS_CODE',  models: 'gemini-3.5-flash,gemini-3.5-flash-lite', sys: 'You are Gem AI, an expert programming partner. Give working code, explain the key idea briefly, and point out pitfalls.' },
  write: { env: 'MODELS_WRITE', models: 'gemini-3.5-flash,gemini-3.5-flash-lite', sys: 'You are Gem AI, a sharp writing editor and writer. Improve clarity and tone, keep the user\'s voice, and offer a clean final version.' },
  learn: { env: 'MODELS_LEARN', models: 'gemini-3.5-flash,gemini-3.5-flash-lite', sys: 'You are Gem AI, a patient teacher. Explain step by step in simple words with a concrete example, then check understanding.' },
  ideas: { env: 'MODELS_IDEAS', models: 'gemini-3.5-flash,gemini-3.5-flash-lite', sys: 'You are Gem AI, a creative brainstorming partner. Offer varied, specific ideas and say which you like best and why.' }
};

export default async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const a = authUser(req);
  if (!a) return json({ error: 'auth' }, 401);
  if (!process.env.GEMINI_KEY) return json({ error: 'not configured' }, 500);
  let b; try { b = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const contents = (Array.isArray(b.messages) ? b.messages : []).slice(-30).map(m => ({
    role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.text || '').slice(0, 12000) }]
  }));
  if (!contents.length || contents[contents.length - 1].role !== 'user') return json({ error: 'Bad request' }, 400);

  // Daily per-user cap protects the free quota.
  const lim = +process.env.DAILY_LIMIT || 80, uk = `d_${a.sub}_${new Date().toISOString().slice(0, 10)}`, us = await store('usage');
  const used = (await us.getJSON(uk))?.n || 0;
  if (used >= lim) return json({ error: 'limit', limit: lim }, 429);
  await us.setJSON(uk, { n: used + 1 });

  const def = MODES[b.mode] || MODES.quick;
  const system = def.sys + (b.custom ? '\n\nUser preferences: ' + String(b.custom).slice(0, 1000) : '');
  const payload = JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents });
  let up = null;
  for (const model of (process.env[def.env] || def.models).split(',').map(s => s.trim()).filter(Boolean)) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_KEY }, body: payload
    });
    if (r.ok) { up = r; break; }
    if (![404, 429, 503].includes(r.status)) return json({ error: 'upstream' }, 502);
  }
  if (!up) return json({ error: 'busy' }, 429);

  // Re-emit in a neutral stream format: data: {"t":"text"}
  const { readable, writable } = new TransformStream();
  (async () => {
    const w = writable.getWriter(), enc = new TextEncoder(), dec = new TextDecoder(), rd = up.body.getReader();
    let buf = '', sent = false;
    try {
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const l of lines) {
          if (!l.startsWith('data:')) continue;
          let j; try { j = JSON.parse(l.slice(5)); } catch { continue; }
          for (const p of j.candidates?.[0]?.content?.parts || [])
            if (p.text && !p.thought) { sent = true; await w.write(enc.encode('data: ' + JSON.stringify({ t: p.text }) + '\n\n')); }
          if (!sent && (j.promptFeedback?.blockReason || j.candidates?.[0]?.finishReason === 'SAFETY'))
            await w.write(enc.encode('data: ' + JSON.stringify({ e: 'blocked' }) + '\n\n'));
        }
      }
    } catch {} finally { try { await w.close(); } catch {} }
  })();
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' } });
};
