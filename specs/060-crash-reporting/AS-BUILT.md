# Spec 060 Crash reporting: as built

**Status:** Retired 2026-09-29. Shipped in PR #1543 (squash `606986f1`, 2026-08-06); a stale-chunk recovery follow-up landed in #1541. Tasks: 58/58 complete.
**Full docs:** [specs/_archive/060-crash-reporting/](../_archive/060-crash-reporting/) (spec, plan, tasks, research D1-D10, data-model, contracts, runbook, sc-coverage). Not read by default.
**Pinned here:** none. The owner-facing setup and kill-switch doc is `runbook.md` in the archive; nothing links it, and it links back to the archived `spec.md`. Move it to `docs/` if operators need it.

## What shipped

- Any uncaught studio failure (render throw, `onerror`, `unhandledrejection`, pre-mount) files a structural-only crash report to a private-ish GitHub repo through a serverless route, deduplicated by fingerprint.
- A recovery screen (render throw) and a polite notice (page still usable) tell the author a report was sent, link the issue, and offer a 30 s Undo that retracts it.
- Stale-chunk failures after a deploy (`vite:preloadError`, dynamic-import errors) trigger one guarded reload instead of a report.
- Client and server scrub secrets, emails, mentions and images; no VirtualFS or file content is ever sent.

## Public contracts

- `POST /report/crash` and `POST /report/crash/retract`: rewrites in `vercel.json` above the SPA catch-all; adapters `api/report/crash.ts`, `api/report/crash-retract.ts`, both in `FUNCTION_ENTRIES` of `api/bundle-safety.test.ts`.
- Server modules in `utilities/oauth-backend/src/`: `crash-report-schemas.ts` (`CrashReportBodySchema`, `CrashRetractBodySchema`), `crash-report-pipeline.ts`, `crash-report-installation-token.ts`, `crash-report-retraction-token.ts`. None may value-import `@keyboard-studio/*`.
- Response codes: 200 `{ issueUrl, issueNumber, action: created|commented|reopened, commentId?, retractionToken? }`, 400 `invalid_request`, 405, 429 `rate_limited`, 502 `submission_unavailable` / `upstream_error`, 503 `reporting_not_configured`.
- Env: `CRASH_REPORT_APP_ID`, `CRASH_REPORT_APP_PRIVATE_KEY`, `CRASH_REPORT_APP_INSTALLATION_ID`. Never falls back to the managed-PR `GITHUB_APP_*` vars. Target repo is the source constant `keyboard-studio/crash-reports`.
- Issue identity: label `crash/fp-<hash12>` (lookup key), `regression` on reopen, title `bug(studio): <summary>` (72 chars max), body trailer `<!-- crash-fingerprint: -->`.
- Flood constants (exported, `crash-report-pipeline.ts`): comment cap 20, comment and reopen cooldown 600000 ms, global create cap 200 per 600000 ms; retraction token TTL 120000 ms.
- Client `packages/studio/src/crash/`: `globalHandlers.ts`, `preMount.ts`, `send.ts`, `fingerprint.ts`, `redact.ts`, `breadcrumbs.ts`, `buildVersion.ts`, `staleChunk.ts` (`handleStaleChunkFailure`, `recoverFromStaleChunk`, `importOrReload`, `setStaleChunkReload`, `STALE_CHUNK_RELOAD_WINDOW_MS = 60_000`); `CRASH_REPORT_UNDO_WINDOW_MS = 30_000` in `components/CrashNotice.tsx`.
- i18n ids: `crash.report.{title,sent.notice,issue.link,undo.button,undo.confirmed,retry.notice}`. The `index.html` pre-mount text is hard-coded English by design.
- Retraction is a stateless HMAC capability token derived from the App key; undo of `created` closes the issue, undo of `commented` deletes only this session's comment.

## Key decisions

- Own directory `src/crash/`, gated by a self-contained import-graph walker rather than reusing `bundle-safety` (D1, D2).
- Send result reaches the UI via a module-scope subscribable, not React state (D6).
- Canonicalization is one pure server function with two input adapters; the client fingerprint reuses the algorithm by specification, not shared code (D7, D8).
- Rewrite must sit above the SPA catch-all (D9). Constants live in one module per side (D10).
- No server state store: races may double-create and tokens may replay within TTL; both accepted (runbook residual risks).

## Gotchas and limits

- Kill switch: unset any one `CRASH_REPORT_APP_*` variable and redeploy; the route returns 503 and the client stays silent.
- The classifier must see the original import rejection, not the synthetic "Engine failed to load" string (`useKeyboardArtifact`).
- Send is fire-and-forget: never retried, never surfaced. `Stage: "error"` in `useKeyboardArtifact` must not auto-file.
- The stale-chunk pattern includes `failed to load module script` (Chrome's wording when the catch-all rewrite serves `index.html` for a missing chunk).

## Divergences from the spec

None found in constants, routes, ids or schemas checked against the code.

## Follow-ups and open issues

- Four manual live checks remain operator work (archive `runbook.md`): create the repo and App, set env vars, add the Vercel firewall rule.
- No inbound links to this folder from outside `specs/`.
