-- Server-side draft persistence — metadata table (Vercel Postgres / Neon).
--
-- The full draft payload lives in Vercel Blob; this row is the cheap,
-- queryable metadata the resume banner reads without fetching the blob.
--
-- Single-draft model (v1): one row per GitHub user, keyed by the numeric
-- GitHub user id (rename-stable). A future multi-project "My keyboards"
-- changes the primary key to (github_user_id, draft_id) and adds a draft_id
-- column — no other column changes.
--
-- Apply once per environment:  psql "$POSTGRES_URL" -f api/drafts/schema.sql

CREATE TABLE IF NOT EXISTS drafts (
  github_user_id  BIGINT       PRIMARY KEY,
  github_login    TEXT         NOT NULL,
  keyboard_id     TEXT,
  active_step_id  TEXT         NOT NULL,
  label           TEXT,
  schema_version  INTEGER      NOT NULL,
  blob_pathname   TEXT         NOT NULL,
  saved_at        BIGINT       NOT NULL,  -- client epoch ms (StudioDraft.savedAt)
  size_bytes      INTEGER      NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
