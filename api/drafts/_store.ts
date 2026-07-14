// Vercel-backed DraftStore: the draft payload lives in Vercel Blob (private,
// deterministic per-user pathname), the queryable metadata row in Vercel
// Postgres. This is the only place the Vercel storage SDKs are used — the core
// logic in utilities/oauth-backend/src/draft-handlers.ts stays infra-agnostic
// (see the DraftStore injection contract there), and the standalone Fastify dev
// server uses MemoryDraftStore instead, so it pulls in none of this.
//
// @vercel/blob and @vercel/postgres are declared in
// utilities/oauth-backend/package.json (the installed workspace member), the
// same way api/submit/managed-pr.ts reaches @octokit/auth-app — the /api tree
// itself carries no dependencies and is outside pnpm -r.
//
// The blob is `access: 'private'`, so knowing the (guessable) pathname is not
// enough to read it — reads go through this server-side code holding
// BLOB_READ_WRITE_TOKEN. The content endpoint proxies the bytes; the blob URL
// never reaches the browser.

import { put, get, del } from "@vercel/blob";
import { sql } from "@vercel/postgres";
import type { DraftMeta } from "../../utilities/oauth-backend/src/draft-schemas.js";
import type { DraftStore, StoredDraft } from "../../utilities/oauth-backend/src/draft-store.js";

/** Deterministic per-user blob pathname. Overwritten in place on each save. */
function blobPathname(userId: number): string {
  return `drafts/${userId}.json`;
}

/** Map a Postgres row (BIGINT columns arrive as strings) to a DraftMeta. */
function rowToMeta(row: Record<string, unknown>): DraftMeta {
  return {
    savedAt: Number(row["saved_at"]),
    activeStepId: String(row["active_step_id"]),
    label: row["label"] === null ? null : String(row["label"]),
    keyboardId: row["keyboard_id"] === null ? null : String(row["keyboard_id"]),
    schemaVersion: Number(row["schema_version"]),
  };
}

export class VercelDraftStore implements DraftStore {
  async getMeta(userId: number): Promise<DraftMeta | null> {
    const { rows } = await sql`
      SELECT saved_at, active_step_id, label, keyboard_id, schema_version
      FROM drafts WHERE github_user_id = ${userId}
    `;
    const row = rows[0];
    return row === undefined ? null : rowToMeta(row);
  }

  async getDraft(userId: number): Promise<StoredDraft | null> {
    const meta = await this.getMeta(userId);
    if (meta === null) return null;

    const result = await get(blobPathname(userId), {
      access: "private",
      token: process.env["BLOB_READ_WRITE_TOKEN"],
    });
    // Metadata row exists but the blob is gone (manual deletion / partial
    // write) — treat as no draft rather than surfacing a corrupt half-state.
    if (result === null || result.statusCode !== 200 || result.stream === null) {
      return null;
    }

    // `stream` is a plain ReadableStream<Uint8Array> (no .text()); wrap it in a
    // Response to drain it to a string portably on the Node runtime.
    const text = await new Response(result.stream).text();
    let draft: unknown;
    try {
      draft = JSON.parse(text);
    } catch {
      return null;
    }
    return { meta, draft };
  }

  async putDraft(userId: number, login: string, meta: DraftMeta, draft: unknown): Promise<void> {
    const body = JSON.stringify(draft);
    const sizeBytes = new TextEncoder().encode(body).length;
    const pathname = blobPathname(userId);

    await put(pathname, body, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
      token: process.env["BLOB_READ_WRITE_TOKEN"],
    });

    await sql`
      INSERT INTO drafts (
        github_user_id, github_login, keyboard_id, active_step_id, label,
        schema_version, blob_pathname, saved_at, size_bytes, updated_at
      ) VALUES (
        ${userId}, ${login}, ${meta.keyboardId}, ${meta.activeStepId}, ${meta.label},
        ${meta.schemaVersion}, ${pathname}, ${meta.savedAt}, ${sizeBytes}, now()
      )
      ON CONFLICT (github_user_id) DO UPDATE SET
        github_login   = EXCLUDED.github_login,
        keyboard_id    = EXCLUDED.keyboard_id,
        active_step_id = EXCLUDED.active_step_id,
        label          = EXCLUDED.label,
        schema_version = EXCLUDED.schema_version,
        blob_pathname  = EXCLUDED.blob_pathname,
        saved_at       = EXCLUDED.saved_at,
        size_bytes     = EXCLUDED.size_bytes,
        updated_at     = now()
    `;
  }

  async deleteDraft(userId: number): Promise<void> {
    // Delete the row first so a listing never points at a missing blob; the
    // blob del is best-effort (idempotent — no error if already absent).
    await sql`DELETE FROM drafts WHERE github_user_id = ${userId}`;
    try {
      await del(blobPathname(userId), { token: process.env["BLOB_READ_WRITE_TOKEN"] });
    } catch {
      // Blob already gone or transient del failure — the row is what gates
      // GET, so the draft is effectively cleared regardless.
    }
  }
}
