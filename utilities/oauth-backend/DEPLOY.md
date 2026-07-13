# Deploying the OAuth backend (co-located on Vercel)

This is the production deploy runbook for issue #550 — "Sign up with GitHub".
The token-exchange logic is co-located with the studio SPA as Vercel serverless
functions in [`api/oauth/`](../../api/oauth/), which reuse this service's tested
core (`src/handlers.ts`, `src/schemas.ts`). The standalone Fastify entrypoint
(`src/server.ts`) remains for local `pnpm start` and is unchanged.

Result: `/oauth/exchange`, `/oauth/refresh`, `/oauth/health` are served from the
**same origin** as the SPA, so the SPA leaves `VITE_OAUTH_BACKEND_URL` empty and
there is no cross-origin / CORS step.

## What the code already does

- `api/oauth/{exchange,refresh,health}.ts` — Web-standard Vercel functions.
- `vercel.json` (repo root) — rewrites `/oauth/{exchange,refresh,health}` →
  `/api/oauth/*`, keeps the `kbd-proxy` / `local-kbd-proxy` rewrites, and adds
  the SPA fallback (`/(.*)` → `/index.html`) so `/oauth/callback` — a **client**
  route handled in `main.tsx` — still loads the app.
- The SPA derives its callback as `${window.location.origin}/oauth/callback`
  and POSTs to `/oauth/exchange` when `VITE_OAUTH_BACKEND_URL` is empty.

## Human-gated steps (the actual #550 work)

### 1. Switch the Vercel project Root Directory to the repo root

> ⚠️ Deploy-time prerequisite. The functions import the tested core from
> `utilities/oauth-backend/`, which lives **outside** `packages/studio`. They
> resolve only when the project Root Directory is the **repo root** (so both the
> SPA build and the cross-tree import + its installed deps are in scope).
> `utilities/oauth-backend` is now a pnpm workspace member, so the root
> `pnpm install` installs its deps for the function bundle.

In Vercel → Project → Settings → General:
- **Root Directory:** _(blank / repo root)_ — was `packages/studio`.
- Build Command / Output Directory come from the root `vercel.json`
  (`pnpm build` → `packages/studio/dist`).

After this cutover verifies (step 4), delete the now-superseded
`packages/studio/vercel.json` (its rewrites are migrated into the root file).

### 2. Register a prod GitHub OAuth App (org-owned)

github.com → org `keyboard-studio` → Settings → Developer settings → OAuth Apps
→ New (separate from the dev app — one callback URL per app):
- **Authorization callback URL:** `https://<prod-domain>/oauth/callback`
- Copy the **Client ID** and generate a **Client secret**.

### 3. Set environment variables

Backend (Vercel project env — server-side only, never exposed to the SPA):
- `GITHUB_CLIENT_ID` = prod client id
- `GITHUB_CLIENT_SECRET` = prod client secret
- `OAUTH_ALLOWED_ORIGINS` — not required for same-origin co-location; only set it
  if you later split the backend to another origin.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — **optional; only for "Sign up with
  Google".** Set both to enable `/oauth/google/exchange`. Both absent (or either
  one absent) → the endpoint returns `503 google_oauth_not_configured` and the
  Google button is a no-op; GitHub sign-in is unaffected. Unlike the standalone
  Fastify server there is **no `GOOGLE_OAUTH_ENABLED` flag** in the serverless
  deploy — the presence of both creds is the gate. Register the client under
  Google Cloud → APIs & Services → Credentials → OAuth client ID (Web), with
  Authorized redirect URI `https://<prod-domain>/oauth/google/callback`.

SPA (Vite build-time env):
- `VITE_GITHUB_CLIENT_ID` = prod client id (public — safe in the bundle)
- `VITE_OAUTH_BACKEND_URL` = _(leave empty — same origin)_
- `VITE_GOOGLE_CLIENT_ID` = Google OAuth client id (public — safe in the bundle).
  Only needed when the Google button should appear; leave empty for a
  GitHub-only deployment.

### 4. Verify end-to-end in prod

- `GET https://<prod-domain>/oauth/health` → `{ "status": "ok" }`.
- In the SPA `#output` step → "Sign up with GitHub" → consent →
  `/oauth/callback` → signed-in state (token in tab `sessionStorage`).
- (If Google enabled) "Sign up with Google" → consent → `/oauth/google/callback`
  → signed-in state (identity claims in tab `sessionStorage`, key
  `ks.google.identity`; no Google token stored). A quick negative check without
  the browser: `curl -sX POST https://<prod-domain>/oauth/google/exchange -d '{}'
  -H 'content-type: application/json'` → `400 invalid_request` when configured,
  `503 google_oauth_not_configured` when the creds are unset.

### 5. Update [`docs/github_flow.md`](../../docs/github_flow.md) Status

Flip the two "Not started" Option A rows (OAuth App registration, backend
deploy) to **Done** and bump the progress bar.

## Local check

```
npx vitest run --config api/vitest.config.ts   # glue tests (method/validation/mapping)
pnpm --filter oauth-backend test               # the 30 core specs
```
