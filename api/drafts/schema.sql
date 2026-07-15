-- Server-side draft persistence — metadata table (Vercel Postgres / Neon).
--
-- The full draft payload lives in Vercel Blob; this row is the cheap,
-- queryable metadata the resume banner reads without fetching the blob.
--
-- Multi-draft model ("My keyboards"): one row per (github_user_id, draft_id).
-- An un-upgraded single-draft client omits draftId, so its rows land in the
-- 'default' slot (DEFAULT_DRAFT_ID) — the migration below backfills existing
-- single-draft rows into that slot via the DEFAULT on draft_id.
--
-- Apply once per environment:  psql "$POSTGRES_URL" -f api/drafts/schema.sql

-- Fresh environment: this is the only statement that runs (nothing below
-- matches an existing table, so every ALTER/UPDATE/DO block is a no-op).
CREATE TABLE IF NOT EXISTS drafts (
  github_user_id  BIGINT       NOT NULL,
  draft_id        TEXT         NOT NULL DEFAULT 'default',
  github_login    TEXT         NOT NULL,
  keyboard_id     TEXT,
  active_step_id  TEXT         NOT NULL,
  label           TEXT,
  schema_version  INTEGER      NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'draft',
  pr_url          TEXT,
  blob_pathname   TEXT         NOT NULL,
  saved_at        BIGINT       NOT NULL,  -- client epoch ms (StudioDraft.savedAt)
  size_bytes      INTEGER      NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (github_user_id, draft_id)
);

-- Pre-existing environment: an already-provisioned single-draft table has
-- github_user_id as a lone BIGINT PRIMARY KEY and lacks draft_id/status/
-- pr_url entirely. The block below upgrades that shape in place. It is
-- idempotent — every statement is a no-op both against a table already
-- migrated by a previous run of this file and against a table just created
-- by the CREATE TABLE above, so this file is always safe to (re-)apply:
--   psql "$POSTGRES_URL" -f api/drafts/schema.sql

-- New columns, added nullable/defaulted so they backfill existing rows
-- without a table rewrite (Postgres 11+ handles ADD COLUMN ... DEFAULT
-- without rewriting storage).
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS draft_id TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS status   TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS pr_url   TEXT;

-- Backfill: a pre-existing single-draft row has no draft_id yet — put it in
-- the reserved default slot (DEFAULT_DRAFT_ID) that an un-upgraded client
-- (one that never sends draftId) continues to read/write.
UPDATE drafts SET draft_id = 'default' WHERE draft_id IS NULL;

-- Converge draft_id's column definition with the fresh-table shape above
-- (NOT NULL DEFAULT 'default'); safe to re-run, both statements are no-ops
-- once already applied.
ALTER TABLE drafts ALTER COLUMN draft_id SET DEFAULT 'default';
ALTER TABLE drafts ALTER COLUMN draft_id SET NOT NULL;

-- Widen the primary key from (github_user_id) to (github_user_id, draft_id).
-- Guarded so re-running this file never errors: skip entirely once the
-- current primary key already includes draft_id (true on a freshly created
-- table, and true after this block has already run once against an old
-- table). The pre-existing single-draft table declares
-- `github_user_id BIGINT PRIMARY KEY` inline with no explicit constraint
-- name, so Postgres auto-names it drafts_pkey (the standard <table>_pkey
-- default) — DROP CONSTRAINT IF EXISTS targets that name defensively.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.key_column_usage
    WHERE table_name = 'drafts'
      AND column_name = 'draft_id'
      AND constraint_name IN (
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'drafts'
          AND constraint_type = 'PRIMARY KEY'
      )
  ) THEN
    ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_pkey;
    ALTER TABLE drafts ADD PRIMARY KEY (github_user_id, draft_id);
  END IF;
END $$;
