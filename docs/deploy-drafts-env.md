# Deploying server-side drafts / "My Keyboards" — Vercel env setup

Status: the feature (PR #1139) is merged to `dev`. The code is deployed but **inert** until the storage below is provisioned. Until then the drafts endpoints return `503 draft_not_configured` and the studio falls back to localStorage-only — no breakage, just no cloud sync / no cross-device "My Keyboards".

**Decision: Option A — Vercel-managed storage (Neon Postgres + Vercel Blob).** No code changes required; the code already targets `@vercel/postgres` + `@vercel/blob`.

---

## For Matt (needs Vercel access)

Vercel project: `keyboard-studio-studio` (scope `ltuse-sil`).

### 1. Create the two managed stores (auto-injects the env vars)
Vercel dashboard -> **Storage**:
- Create/connect a **Postgres** (Neon) store -> injects `POSTGRES_URL` (+ `POSTGRES_*` variants) into the project.
- Create/connect a **Blob** store -> injects `BLOB_READ_WRITE_TOKEN`.

Connect both to the project for the **Preview** environment first (that is what the `dev` branch deploys to), and to **Production** when we promote to `main`.

Note: if for any reason you set `POSTGRES_URL` by hand, use that exact name — not `DATABASE_URL`. The config check accepts either, but the `@vercel/postgres` driver only reads `POSTGRES_URL`; setting only `DATABASE_URL` makes the endpoint look configured (401 instead of 503) while every query fails.

### 2. Redeploy `dev`
Env changes do not apply to existing deployments. Trigger a redeploy of `dev` (Deployments -> Redeploy, or push any commit).

### 3. Apply the schema once, per database
The endpoint does not create the table itself. Against the Neon DB the deploy points at:
```
psql "$POSTGRES_URL" -f api/drafts/schema.sql
```
Idempotent (`CREATE TABLE IF NOT EXISTS` + a guarded `ALTER`) — safe to re-run, safe on a fresh or pre-existing table. Run for the dev DB now, and the prod DB at promotion.

### 4. Verify (30 seconds)
```
curl -i https://<deploy-host>/drafts
```
- `401` -> configured and auth-gating correctly (healthy unauthenticated response).
- `503 draft_not_configured` -> env missing or not redeployed.
- `200` HTML -> wrong host / not the right build.

That is the whole job: connect two stores, redeploy, one `psql` command, per environment.

---

## Escape hatch (if we later move Postgres to SIL infra — Option B)

Cheap and contained, by design. The backend injects a `DraftStore`; `VercelDraftStore` is one implementation. Moving the Postgres half means adding one `PostgresDraftStore` (standard `pg` client) and pointing `POSTGRES_URL` at the SIL DB — a few hours, one file, no client/UI change. The schema is portable standard SQL and the data is tiny. (Blob stays Vercel Blob either way unless separately re-homed.)

---

## Data stored (for any governance review)
- Postgres metadata row: GitHub user id + login, keyboard label / language tag, active step, timestamps, status, PR URL.
- Blob payload: the author's own in-progress keyboard (survey answers + working copy + base64 VFS).
No credentials, no third-party PII — a backup of the author's own work, keyed to their GitHub identity.
