# Implementation Plan: Crash reporting

**Feature**: 060-crash-reporting · **Branch**: `km/crash-reporting-spec` · **Spec**: [spec.md](spec.md)

**Created**: 2026-08-06

## Summary

An unrecoverable studio error must become exactly one actionable, author-anonymous GitHub issue in a
dedicated `keyboard-studio/crash-reports` repository, filed with a second, crash-only GitHub App
installation token — never the author's OAuth token. The client half is greenfield: the studio has no
`ErrorBoundary`, no window-level handlers, and no runtime build identifier today. The server half is
not greenfield — it copies the structure the managed-PR pipeline already proves, adding a fifth
sibling set under `utilities/oauth-backend/src` (schema, pipeline, token minter) plus a thin Web-fetch
adapter at `api/report/crash.ts` and a Fastify mirror in `server.ts`.

Two constraints shape everything. First, **the reporter must survive what it reports**: the crash
module's own source-level import graph must never reach `@keyboard-studio/engine`, because a failed
engine chunk is one of the crash classes being reported. That forbids reusing `computeSha256Hex` and
forbids importing `decisionLogStore.ts` (which value-imports the engine at line 37) — structural
context is read by the *caller* and passed in as plain data. Second, **the fingerprint is computed
server-side from raw inputs**: the client sends `kind` / `message` / `stackFrames[]` and never a hash,
so no caller-supplied value can redirect a report onto an issue its own content does not hash to.

No new stack is introduced. Client work is React 19 + zustand + Vite in `packages/studio`; server work
is zod + `@octokit/auth-app` in `utilities/oauth-backend`, tested with vitest and an injected fetch
stub. The one piece of genuinely new build infrastructure is a Vite `define` surfacing
`VERCEL_GIT_COMMIT_SHA` as `__KS_COMMIT_SHA__` — `packages/studio/vite.config.ts` has no `define`
block today.

## Project Structure

```
packages/studio/
  index.html                                  # + static, dependency-free pre-mount fallback (FR-061)
  vite.config.ts                              # + define: __KS_COMMIT_SHA__ (FR-110)
  src/
    vite-env.d.ts                             # + ambient declare const __KS_COMMIT_SHA__ (FR-111)
    main.tsx                                  # + top-level try/catch around mountApp/mountCallbackScreen (FR-060)
    AppRoot.tsx                               # + <CrashErrorBoundary> inside <I18nProvider> (FR-001)
    crash/                                    # NEW — the self-contained crash module (FR-010)
      fingerprint.ts                          #   canonicalize + crypto.subtle.digest, local cache key only (FR-020)
      redact.ts                               #   allowlist payload builder (FR-030, FR-032a header comment)
      breadcrumbs.ts                          #   ~50-entry module-scope ring, wraps console.error/warn (FR-043)
      staleChunk.ts                           #   pattern match + one-shot sessionStorage reload gate (FR-050)
      send.ts                                 #   fire-and-forget POST + sessionStorage dedupe cache (FR-078, FR-101)
      buildVersion.ts                         #   __KS_COMMIT_SHA__ + package version -> appVersion (FR-112)
      types.ts                                #   client-side payload types (no engine types)
      engine-reachability.test.ts             #   NEW gate: import-graph walk (FR-013, FR-132)
    components/
      CrashRecoveryScreen.tsx                 # role="alert" + focus-to-heading fallback (FR-072)
      CrashNotice.tsx                         # aria-live="polite" notice + Undo (FR-073, FR-074)
    hooks/useKeyboardArtifact.ts              # loadEngine() preserves original rejection (FR-005a)
    locales/{en,fr}/messages.json             # + the 6 crash.* ids (FR-122)

utilities/oauth-backend/src/
  crash-report-schemas.ts                     # NEW — CrashReportBodySchema (FR-081)
  crash-report-pipeline.ts                    # NEW — canonicalization, hash, GitHub caller #3 (FR-081a, FR-084)
  crash-report-installation-token.ts          # NEW — CRASH_REPORT_APP_* minter (FR-085)
  server.ts                                   # + POST /report/crash Fastify mirror (FR-083)

api/
  report/crash.ts                             # NEW — thin Web-fetch adapter (FR-083)
  bundle-safety.test.ts                       # + "api/report/crash.ts" in FUNCTION_ENTRIES (FR-086)

vercel.json                                   # + /report/crash -> /api/report/crash, above the catch-all (FR-080)
```

**Structure Decision**: the server half mirrors the managed-PR quartet exactly (schema / pipeline /
adapter / Fastify mirror) plus a separate token minter, because that split is what keeps the pipeline
unit-testable with an injected fetch stub and keeps `api/**` free of workspace value-imports. The
client half gets its own top-level `src/crash/` directory rather than living under `src/lib/` — a
dedicated directory is what makes the FR-013 import-graph gate expressible as "walk this directory's
entry points" instead of "walk a hand-maintained file list scattered through `lib/`".

## Constitution Check

Assessed against `.specify/memory/constitution.md` v1.1.0. Re-checked after Phase 1 design — no
assessment changed.

| Article | Assessment | Basis |
|---|---|---|
| I — Pattern schema is a locked contract | **PASS** | No `Pattern` or `Criterion` field is read, added, renamed, or retyped. The one new zod schema (`CrashReportBodySchema`) is a wire contract local to `oauth-backend`, not a mirror of a `contracts` type, so no drift guard is owed. |
| II — KeyboardIR is the engine spine | **PASS** | Not engaged. The feature never parses, emits, or mutates `.kmn`; the "structural context" it carries (keyboard id, BCP47 tags, counts) is derived read-only telemetry the caller supplies as plain primitives. |
| III — Single persistent working copy | **PASS** | Read-only. FR-134 forbids any change to the working-copy spine or the decision record's append-only model; the decision-log tail is read via `getState()` and never appended to. No second working copy exists at any point. |
| IV — Validator layering / one 300 ms debounce | **PASS** | FR-130. The feature runs no validation and emits no diagnostic, so it adds nothing to the D3 cycle. Two timers are introduced — the FR-052 stale-chunk `sessionStorage` comparison (a one-shot check, not a debounce) and `CRASH_REPORT_UNDO_WINDOW_MS` (a UI notice lifetime) — and both fall under the same carve-out CLAUDE.md already grants `AUTOSAVE_DEBOUNCE_MS` / `CLOUD_SYNC_DEBOUNCE_MS`: they race nothing and produce no diagnostics. |
| V — VirtualFS only during authoring | **PASS** | FR-133. Nothing is written to the VFS, the emitted `.kmp`/`.zip`, or any submitted PR. Crash telemetry is entirely out-of-band from the authoring output, and the studio still never writes to host disk. |
| VI — Team boundaries | **PASS** | **Engine team** owns this change end to end (spec §12): the SPA, the serverless route, and the output-adjacent build metadata are all Engine surfaces. No pattern library, survey text, gallery ordering, LLM prompt, or criteria triage is touched. The six new `crash.*` message ids are UI chrome strings authored with the code, not content-owned survey copy. |
| VII — Out of scope for v1 | **PASS** | Touches none of the prohibited items (CJK/Ethiopic reorder, LDML, mobile, hosting, `welcome.htm` variants, `.kpj.user`, touch-first authoring, multi-source merge, opaque-fragment editing, byte-identical round-trip). |
| VIII — House conventions | **PASS** | Generated issue titles follow the locked grammar as `bug(studio): <summary>` (FR-093a). No emoji in any console output. FR-087's `issueNumber` / `issueUrl` are runtime values read back from a live GitHub response, not issue-number literals baked into source, so the §18 rule is not engaged. |

No violations — Complexity Tracking omitted.

## Phase gates

- **Prerequisites 1–4 block the server route's live function**, not its implementation or tests. Every
  server task is fully testable against an injected fetch stub with no repository, App, or credential
  in existence. Only operational verification (a real filed issue) waits on the manual steps.
- **The FR-013 import-graph gate must be demonstrated red before it is trusted green.** An assertion
  that has never failed is not evidence. This is a task, not a note.
