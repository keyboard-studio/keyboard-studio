# Deploy security settings — Vercel project `keyboard-studio-studio`

Operator reference for the edge and environment settings the serverless routes under `/api`
rely on. Everything here is a **dashboard (or CLI) action**, not code. Scope `ltuse-sil`.

Last verified 2026-10-05. Re-check with the commands in [Re-audit](#re-audit).

## Hosting shape

`kbstudio.langtech.cloud` is a **DNS-only** CNAME to Vercel (Cloudflare does not proxy it). The
custom domain and every `*.vercel.app` alias reach the same Vercel edge, so the project firewall
applies to all of them alike — there is no side door to close. That changes if Cloudflare
proxying is ever switched on; see [Putting Cloudflare in front](#putting-cloudflare-in-front-later).

## 1. Firewall rate limit (configured)

The Hobby plan allows **one** rate-limit rule, so one rule covers every route that spends the
project's GitHub App budget, sharing a single per-IP counter:

| Rule | Paths | Limit | On trip |
|---|---|---|---|
| `api-per-ip` | prefix `/oauth`, equals `/submit/managed-pr`, prefix `/report/crash` | 60 req / 60 s per IP, fixed window | deny `429` for 5m |

**Why these paths.** OAuth exchange/refresh use the client secrets, managed PR spends the org
bot's GitHub budget, and crash reports file issues through the crash App. `/drafts*` is left out:
it is the noisiest legitimate traffic (cloud sync, debounced to ≥ 20 s by
`CLOUD_SYNC_DEBOUNCE_MS`) and every request is verified against the *caller's* GitHub token, not
the project's.

**Why 60.** The paths share one counter, and keyboard workshops often put a whole room behind
one address; 60/min absorbs a room signing in together. The crash runbook's tighter 20/min is
staged as a separate, **disabled** rule (`Rate limit crash reports per IP`) to enable if the plan
ever allows a second rate-limit rule. Until then the in-code flood controls (session dedupe,
fingerprint dedupe, global creation cap of 200 per 10 minutes) sit behind the shared rule.

**If authors report `429`s** from a shared venue, raise the limit on `api-per-ip` rather than
removing it.

To recreate the rule (Windows PowerShell 5.1 needs the inner quotes backslash-escaped):

```powershell
vercel firewall rules add api-per-ip --action rate_limit `
  --condition '{\"type\":\"path\",\"op\":\"pre\",\"value\":\"/oauth\"}' --or `
  --condition '{\"type\":\"path\",\"op\":\"eq\",\"value\":\"/submit/managed-pr\"}' --or `
  --condition '{\"type\":\"path\",\"op\":\"pre\",\"value\":\"/report/crash\"}' `
  --rate-limit-keys ip --rate-limit-window 60 --rate-limit-requests 60 `
  --rate-limit-action deny --duration 5m --yes
vercel firewall diff
vercel firewall publish
```

## 2. Deployment Protection (configured)

Settings → Deployment Protection → **Vercel Authentication: Standard Protection**. Preview and
per-deployment URLs require a Vercel login on the team; the production domains stay public. CI
does not call preview URLs, so nothing in the repository depends on them being open. Preview links
shared with testers outside the team will prompt for a Vercel login.

## 3. Environment hygiene

- Each secret has exactly one name, and every name in `vercel env ls` is read by code. When adding
  one, grep `api/` and `utilities/oauth-backend/src/` for the exact name first — a misspelled
  duplicate means a future rotation can update the wrong copy.
- `VITE_*` variables are compiled into the public bundle. Never put a secret in one, whatever its
  type says in the dashboard.

## 4. Crash reporting credentials (when enabling crash reports)

Follow [specs/060-crash-reporting/runbook.md](../specs/060-crash-reporting/runbook.md) steps 1–4:
a separate `crash-reports` repo, a second GitHub App with **Issues: read and write only**,
installed on that repo only, and the three `CRASH_REPORT_APP_*` variables. Never reuse
`GITHUB_APP_*` — that App can write keyboard source. Its step 5 firewall rule is covered by
`api-per-ip` above.

## 5. Draft storage (when enabling "My keyboards")

Follow [deploy-drafts-env.md](deploy-drafts-env.md), plus:

- **Mark `BLOB_READ_WRITE_TOKEN` and `POSTGRES_URL` as Sensitive** when connecting the stores
  (Settings → Environment Variables). Sensitive values cannot be read back through the dashboard
  or `vercel env pull`.
- **The `draftId` allowlist must be deployed.** `draftId` is restricted to `[A-Za-z0-9_-]{1,80}`
  on every drafts route, so it cannot carry `..` or `/` into the Blob pathname
  (`drafts/<userId>/<draftId>.json`).
- **Decide on an edge limit for `/drafts*`.** It has no rule today. Either add a `/drafts` prefix
  group to `api-per-ip` and raise its limit (cloud sync is about 3–6 requests per author per
  minute), or move to a plan with a second rate-limit rule (suggested: 120 req / 60 s per IP).

## Putting Cloudflare in front (later)

Only relevant if `kbstudio.langtech.cloud` is switched to Cloudflare-proxied:

- Vercel would see Cloudflare edge IPs, so `api-per-ip` must key on
  `header:cf-connecting-ip` instead of `ip`, or every visitor shares a handful of buckets.
- The `*.vercel.app` aliases would then bypass Cloudflare. Lock the origin: a Cloudflare Transform
  Rule adds a secret request header, and a Vercel custom (non-rate-limit) rule denies requests
  without it. Otherwise a forged `cf-connecting-ip` defeats the rate limit.
- SSL/TLS mode must be **Full (strict)**. Vercel's documentation advises against a proxy in front
  of it; Cloudflare Free also offers only one rate-limiting rule, so the gain is mostly its custom
  WAF rules and bot tools.

## Re-audit

```powershell
vercel firewall status            # Firewall: Enabled
vercel firewall rules list --json # api-per-ip active; "hasDraft": false
vercel env ls                     # names only; values stay hidden
```
