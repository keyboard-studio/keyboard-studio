-- Managed-PR rate-limit window state (Vercel Postgres / Neon).
--
-- One row per throttled submission attempt inside the sliding window; the
-- application prunes rows older than the window on every check, so the table
-- stays small. Raw IPs are never stored — only their SHA-256 hash.
--
-- Apply once per environment (idempotent — safe to re-apply):
--   psql "$POSTGRES_URL" -f api/submit/schema.sql

CREATE TABLE IF NOT EXISTS managed_pr_rate_limit (
  ip_hash     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS managed_pr_rate_limit_created_at_idx
  ON managed_pr_rate_limit (created_at);

CREATE INDEX IF NOT EXISTS managed_pr_rate_limit_ip_hash_idx
  ON managed_pr_rate_limit (ip_hash);
