// Operator CLI (not a route — the leading underscore keeps it out of
// Vercel's function routing, like _store.ts): purge every server draft
// for one GitHub user id (spec 098, FR-002 — the owner-purge execution
// step for erasure requests that arrive through any channel).
//
// Identity verification is procedural and happens BEFORE this runs
// (account control, docs/privacy/dsar-procedure.md); this tool is the
// execution step only. It prints the completion record as JSON to
// stdout — file that record against the request-register row.
//
// It lives beside _store.ts so no cross-package import drags the
// Vercel store into the oauth-backend typecheck program. Run it with
// the oauth-backend workspace's tsx, from the repo root, with
// production env set (POSTGRES_URL / DATABASE_URL and
// BLOB_READ_WRITE_TOKEN):
//
//   utilities/oauth-backend/node_modules/.bin/tsx api/drafts/_purge-cli.ts <githubUserId>
//
// Exit codes: 0 purged (record on stdout); 1 usage/config error;
// 2 storage failure (nothing is claimed deleted in that case).

import { VercelDraftStore } from "./_store.js";
import {
  purgeUserDrafts,
  type DraftHandlerConfig,
} from "../../utilities/oauth-backend/src/draft-handlers.js";

async function main(): Promise<void> {
  const raw = process.argv[2];
  const userId = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(userId) || userId <= 0) {
    console.error("usage: _purge-cli <githubUserId> (positive integer)");
    process.exit(1);
  }
  const hasDb =
    (process.env["POSTGRES_URL"] ?? "").trim() !== "" ||
    (process.env["DATABASE_URL"] ?? "").trim() !== "";
  const hasBlob = (process.env["BLOB_READ_WRITE_TOKEN"] ?? "").trim() !== "";
  if (!hasDb || !hasBlob) {
    console.error(
      "_purge-cli: storage env not configured (POSTGRES_URL/DATABASE_URL + BLOB_READ_WRITE_TOKEN required)",
    );
    process.exit(1);
  }

  // The purge path never verifies a bearer token — the operator's env
  // and the procedure's prior verification are the authority — so the
  // config's verifyUser is a stub that purgeUserDrafts never calls.
  const config: DraftHandlerConfig = {
    store: new VercelDraftStore(),
    verifyUser: () => Promise.resolve(null),
  };

  try {
    const record = await purgeUserDrafts(userId, config);
    console.log(JSON.stringify(record));
  } catch {
    console.error("_purge-cli: storage failure — the purge did not complete; do not report deletion");
    process.exit(2);
  }
}

void main();
