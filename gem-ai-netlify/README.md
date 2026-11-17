# Gem AI — Netlify site with sign-in

Static site + 3 serverless functions. Accounts, chat history and the AI key all live on Netlify; nothing else to host.

```
public/index.html            the whole app (sign-in screen, chat, modes)
netlify/functions/auth.mjs   sign up / sign in
netlify/functions/chats.mjs  saves & loads each user's chats (Netlify Blobs)
netlify/functions/chat.mjs   AI proxy: checks sign-in, maps "modes" to models, hides your key
netlify/lib/common.mjs       shared helpers (password hashing, signed login tokens)
netlify.toml  package.json
```

## Deploy (about 10 minutes)

1. **GitHub:** create a repository and upload this whole folder (keep the structure; `public` and `netlify` are folders).
2. **Netlify:** Add new site -> Import an existing project -> pick the repo. Settings are read from `netlify.toml`; just click Deploy.
3. **Environment variables** (Site configuration -> Environment variables), then redeploy:

| Name | Value |
|---|---|
| `GEMINI_KEY` | your AI API key (create a NEW one at aistudio.google.com/apikey; don't reuse one you pasted in a chat). Mark as secret. |
| `JWT_SECRET` | any random string, 32+ characters. Browser console: `crypto.randomUUID()+crypto.randomUUID()`. Mark as secret. |
| `SIGNUP_CODE` | optional. If set, new accounts need this invite code. |
| `DAILY_LIMIT` | optional. Messages per user per day (default 80) to protect your free quota. |

4. Open your Netlify URL, create an account, chat. Sign in on another device and your chats are there.

## What users see
Modes instead of model names: Quick answers, Think it through, Code & debug, Write & edit, Learn something, Brainstorm.
You choose which model backs each mode at the top of `netlify/functions/chat.mjs` (or override with env vars `MODELS_QUICK`, `MODELS_THINK`, `MODELS_CODE`, `MODELS_WRITE`, `MODELS_LEARN`, `MODELS_IDEAS`, each a comma list tried in order). Model names are never sent to the browser.

## Run locally
`npm i -g netlify-cli`, copy `.env.example` to `.env` and fill it in, then `netlify dev` and open http://localhost:8888.

## Known limits (be aware)
- No email verification and no password reset yet. A user who forgets a password needs a new account.
- Per-user chat limits: 100 chats, 300 messages each.
- Netlify's free plan has usage limits; check netlify.com/pricing for current numbers.
