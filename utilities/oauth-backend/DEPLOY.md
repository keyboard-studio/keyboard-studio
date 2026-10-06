# Deploying the OAuth backend (co-located on Vercel)

This is the production deploy runbook for issue #550 — "Sign up with GitHub" and
the org-mediated PR submit, using the dual-app topology (a GitHub App plus an
OAuth App) that shipped with PR #885. The token-exchange logic is co-located
with the studio SPA as Vercel serverless functions in [`api/oauth/`](../../api/oauth/), which reuse this service's tested
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

### 2. Register the two prod GitHub apps (org-owned)

The deploy uses **two** GitHub credentials with distinct jobs (PR #885):

| App | Job | Client id prefix |
|---|---|---|
| **GitHub App** | Default "Sign up with GitHub" identity (user-to-server OAuth, no scope) **and** the server-side installation token that opens Option B (managed) draft PRs | `Iv23...` |
| **OAuth App** | Option A opt-in "fork and submit yourself" only (requests `public_repo`) | `Ov23...` |

The SPA sends a `client` discriminator (`github_app` default, or `oauth_app`) on
`/oauth/exchange`; the backend picks the credential pair from it.

**GitHub App** — github.com → org `keyboard-studio` → Settings → Developer
settings → GitHub Apps (the production app is `keyboard-studio`):
- **Callback URL:** `https://<prod-domain>/oauth/callback`
- **Repository permissions:** Contents: read and write; Pull requests: read and
  write.
- Install it on the org (the staging repo `keyboard-studio/keyboards` must be
  covered — an installation token cannot open a PR on a repo the App is not
  installed on). Note the **App ID** and the **Installation ID**.
- Generate a **private key** (PEM) and a **Client secret**.

**OAuth App** — same Developer settings page → OAuth Apps → New (separate from
the dev app — one callback URL per app):
- **Authorization callback URL:** `https://<prod-domain>/oauth/callback` (the
  SPA uses the same `/oauth/callback` route for both apps)
- Copy the **Client ID** and generate a **Client secret**.

### 3. Set environment variables

Backend (Vercel project env — server-side only, never exposed to the SPA).
Derived from `api/oauth/_shared.ts`, `api/submit/managed-pr.ts`, and
`src/installation-token.ts`:

GitHub App (default sign-in and Option B):
- `GITHUB_CLIENT_ID` = GitHub App client id — **required**; the OAuth routes
  return `500 server_misconfigured` when this or the secret is unset.
- `GITHUB_CLIENT_SECRET` = GitHub App client secret — **required** (same gate).
- `GITHUB_APP_ID` = numeric GitHub App id.
- `GITHUB_APP_PRIVATE_KEY` = **base64 of the whole PEM**, header and footer
  lines included. Scope it to Production. A malformed value makes
  `/submit/managed-pr` return `502 submission_unavailable`.
- `GITHUB_APP_INSTALLATION_ID` = installation id of the org-wide install.
- `GITHUB_ORG_LOGIN` = org login that owns the staging repo (for example
  `keyboard-studio`).
- If any of the three `GITHUB_APP_*` vars or `GITHUB_ORG_LOGIN` is absent or
  empty, `/submit/managed-pr` answers `503 submission_not_configured`.
- `GITHUB_ORG_TOKEN` is **retired** — no code reads it any more. Remove it from
  the deployment env if present.

OAuth App (Option A opt-in only):
- `GITHUB_OAUTH_CLIENT_ID` = OAuth App client id
- `GITHUB_OAUTH_CLIENT_SECRET` = OAuth App client secret
- Both are **optional** at startup. If either is missing, the default
  `github_app` flow still works but an `oauth_app` exchange returns
  `500 server_misconfigured` at request time.

Other:
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
- `VITE_GITHUB_CLIENT_ID` = **GitHub App** client id (public — safe in the
  bundle); used for the default sign-in.
- `VITE_GITHUB_OAUTH_CLIENT_ID` = **OAuth App** client id (public — safe in the
  bundle); used only by the Option A opt-in.
- `VITE_OAUTH_BACKEND_URL` = _(leave empty — same origin)_
- `VITE_GOOGLE_CLIENT_ID` = Google OAuth client id (public — safe in the bundle).
  Only needed when the Google button should appear; leave empty for a
  GitHub-only deployment.

### 4. Verify end-to-end in prod

- `GET https://<prod-domain>/oauth/health` → `{ "status": "ok" }`.
- `/oauth/exchange` and `/submit/managed-pr` answer JSON (405 on GET), which
  shows the functions load. A platform-level `FUNCTION_INVOCATION_FAILED`
  (text/plain) means a bundle-safety regression, not a config problem.
- In the SPA `#output` step → "Sign up with GitHub" (GitHub App) → consent →
  `/oauth/callback` → signed-in state (token in tab `sessionStorage`).
- Option B: submit from the `#output` step and confirm a draft PR appears on
  `keyboard-studio/keyboards`. `503 submission_not_configured` means a
  `GITHUB_APP_*` / `GITHUB_ORG_LOGIN` var is missing; `502 submission_unavailable`
  points at the private key value.
- Option A: use the fork-and-submit opt-in (OAuth App, `public_repo`) and confirm
  a draft PR from the user's fork.
- (If Google enabled) "Sign up with Google" → consent → `/oauth/google/callback`
  → signed-in state (identity claims in tab `sessionStorage`, key
  `ks.google.identity`; no Google token stored). A quick negative check without
  the browser: `curl -sX POST https://<prod-domain>/oauth/google/exchange -d '{}'
  -H 'content-type: application/json'` → `400 invalid_request` when configured,
  `503 google_oauth_not_configured` when the creds are unset.

### 5. Update [`docs/github_flow.md`](../../docs/github_flow.md) Status

Flip the rows that remain unverified there (callback URLs, backend secrets,
`GITHUB_ORG_TOKEN` removal, the end-to-end Option A and Option B PRs from prod)
as each is confirmed, and bump the progress bars.

## Local check

```
npx vitest run --config api/vitest.config.ts   # glue tests (method/validation/mapping)
pnpm --filter oauth-backend test               # the 30 core specs
```
