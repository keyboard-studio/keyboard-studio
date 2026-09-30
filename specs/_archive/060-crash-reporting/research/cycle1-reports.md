# Cycle 1 research — crash reporting (spec 060)

Three parallel design probes dispatched by km-lead, plus the lead's synthesis and the
user decisions that resolve the open questions. This file is **input to spec.md**, not a
deliverable in itself.

---

## Lead synthesis (read this first)

### Settled by the user before cycle 1

1. Use the **server-side GitHub App installation token**, never the user's OAuth token.
   Crashes usually happen before sign-in, and filing under the user's identity is an
   unauthorized outward write.
2. **Keyboard content is public and may be included.** Only **author identity** is
   redacted: `Attribution.authorName` / `authorEmail` / `copyrightHolder`
   (`packages/contracts/src/attribution.ts`), `packages/studio/src/lib/identity.ts`, and
   anything from an OAuth profile. Quote from the user: "keyboard work is public. the
   repos are public, we need enough references to handle the bug, but not necessarily
   identifying information."
3. One issue per fingerprinted bug; a comment on repeat occurrences.
4. Must respect the `/api` bundle-safety invariant.
5. Stale-chunk dynamic-import failures reload; they do not file an issue.

### Settled by the user after cycle 1

6. **Send gate: auto-send with a notice.** File immediately, then show a non-blocking
   banner ("This error was reported") with a link to the filed issue and a short
   undo/delete window. No consent gate before sending.
7. **Report depth: structural context.** Keyboard id, BCP47 tags, current step id, counts
   (key count, exemplar count), and the tail of the existing decision log. **No** full VFS
   snapshot. No author identity.
8. **Target repo: a new `keyboard-studio/crash-reports`.** The user will create the repo,
   install the existing GitHub App on it, and add `issues:write` to the App's permissions.
   The spec must list this as an explicit prerequisite task, not assume it.

### Conflicts the lead resolved

- **Dedupe mechanism.** km-output rejected `GET /search/issues` (documented index lag of
  seconds-to-minutes, and a 30 req/min limit shared across the installation) in favour of
  a **label** `crash/fp-<hash12>` looked up via
  `GET /repos/{owner}/{repo}/issues?labels=crash/fp-<hash>&state=all`. Labels are primary
  issue metadata, not a derived index, so the lookup is strongly consistent and draws on
  the normal 5,000/hr REST budget. **Adopted.** The fingerprint also goes in the body as
  an HTML comment for human auditability, but the label is the lookup key.
- **Send gate.** km-frontend argued for confirm-before-send; km-output assumed
  fire-and-forget. Resolved by the user in favour of auto-send + notice (decision 6).
- **Keyboard content.** km-frontend proposed opt-in-default-off, which contradicts the
  user's ruling that keyboard work is public. Resolved by decision 7: structural context
  is included by default; the full VFS is not included at all.

### P0 the lead is adding — no probe caught it

km-synthesis found `computeSha256Hex` at `packages/engine/src/codec/hash.ts:14` and
proposed reusing it for the fingerprint. **The spec must not do this.** The engine is
loaded through a dynamic `import()` in `loadEngine()`
(`packages/studio/src/hooks/useKeyboardArtifact.ts:45-61`), and *a failed engine chunk
load is one of the crash classes this feature exists to report*. A reporter that depends
on the chunk that just failed cannot report that failure.

**Requirement:** the entire crash-capture path — hashing, redaction, payload construction,
POST — must be self-contained in the studio's main bundle with **no dynamic import and no
`@keyboard-studio/engine` dependency**. Inline the Web Crypto SHA-256 call
(`crypto.subtle.digest`) rather than importing the engine helper. This is testable: assert
the crash module's import graph reaches no engine module.

### Real gaps confirmed by the survey

- **No runtime build metadata anywhere.** No `import.meta.env.VITE_APP_VERSION`, no
  `__COMMIT_SHA__` Vite `define`, no `VERCEL_GIT_COMMIT_SHA` reference in
  `packages/studio`. `package.json` has `"version": "0.1.0"` but nothing surfaces it at
  runtime. Every filed issue needs a build identifier to be actionable, so this is on the
  critical path.
- **No redaction helper exists.** Identity currently flows in exactly one direction — into
  output. `github-pipeline.ts:128-154` (`buildCommitMessage` / `buildPrBody`) deliberately
  embeds author identity as public attribution. There is no inverse to model from and no
  test asserting identity absence.
- **No shared client fetch wrapper.** Every caller rolls its own. Do not invent one for a
  single fire-and-forget POST; follow the per-caller convention with an injectable fetch
  for testability.

---

## Probe A — km-output: server-side design

### 1. Route contract

`POST /report/crash` → rewrite `{ "source": "/report/crash", "destination": "/api/report/crash" }`
in `vercel.json` (mirrors the `/submit/managed-pr` entry, vercel.json:12).

Request body (new `CrashReportBodySchema`):

```
fingerprint: string, /^[a-f0-9]{12,40}$/   // client-computed, stable per bug
title: string, max 200
body: string, max 65536      // markdown; stack + keyboard content, author-redacted client-side
appVersion: string, max 40
occurredAt: string (ISO datetime)
context?: { browserUA?: string(max 300), os?: string(max 100) }
```

Response 200: `{ issueUrl: string, issueNumber: number, action: "created" | "commented" | "reopened" }`.
Errors: `400 invalid_request`, `429 rate_limited` (+`Retry-After`),
`502 submission_unavailable` / `upstream_error`, `503 reporting_not_configured` — the same
vocabulary as `github-pipeline.ts`'s `mapNonOk` (github-pipeline.ts:215-229).

### 2. Where the code lives

New sibling files next to the managed-PR pair:

- `utilities/oauth-backend/src/crash-report-schemas.ts` (parallels `managed-pr-schemas.ts`)
- `utilities/oauth-backend/src/crash-report-pipeline.ts` (parallels `github-pipeline.ts`) —
  exports `submitCrashReport(body, config)` returning the same discriminated
  `HandlerResult`-shaped union.
- `api/report/crash.ts` — thin Web-fetch adapter, structurally identical to
  `api/submit/managed-pr.ts:1-172` (`envConfig → parse → call pipeline → map status`).
- Reuse `getInstallationToken` from `installation-token.ts` unchanged — same App, no new
  minting logic. Add `"api/report/crash.ts"` to `FUNCTION_ENTRIES` in
  `api/bundle-safety.test.ts:41-50` and to `vercel.json`'s `rewrites`.

Justification: the managed-PR precedent is the load-bearing pattern — pipeline module owns
GitHub calls plus pure helpers, schema module owns zod plus drift guards, adapter owns the
Vercel Request/Response boundary, `server.ts` wires a matching Fastify route for local dev
parity.

### 3. Bundle safety

`crash-report-schemas.ts` must not value-import `@keyboard-studio/*` (only `import type`),
the rule enforced by `api/bundle-safety.test.ts:144-155`. If a fingerprint-format literal
or a `CrashSeverity`-style union also lives in `packages/contracts`, copy it locally with
the `GITHUB_OAUTH_CLIENTS` compile-time drift-guard idiom (schemas.ts:30, :147-157) rather
than importing it as a value.

### 4. Dedupe algorithm

**Do not use the Search API (`GET /search/issues`).** Documented indexing lag (new/updated
issues invisible to search for seconds-to-minutes) and a much lower rate limit (30 req/min,
shared across the installation) than REST.

- Encode the fingerprint as a **label**: `crash/fp-<first12hex>`. Labels are primary issue
  metadata, not a derived index, so lookups are strongly consistent.
- Dedupe lookup:
  `GET /repos/{owner}/{repo}/issues?labels=crash/fp-<hash>&state=all&per_page=5` — subject
  to the standard 5,000/hr token bucket, not the Search API's stricter limit.
- **No match** → create issue with that label; body carries the fingerprint as a trailing
  HTML comment (`<!-- crash-fingerprint: <hash> -->`) for human auditability, not as the
  lookup mechanism.
- **Match, OPEN** → `POST .../issues/{n}/comments` with occurrence context.
- **Match, CLOSED (regression)** → `PATCH .../issues/{n}` to reopen, add a `regression`
  label, then comment.
- **Burst / lag:** because the lookup is REST not Search, index lag is not a real risk. The
  residual race is two near-simultaneous requests both seeing "no match" and both creating
  an issue. Accept as a rare, self-healing duplicate (a human closes one) rather than
  adding distributed locking.
- **Rate limits:** list-by-label, comment, and create all draw from the installation's
  normal 5,000/hr budget. Respect `429` / `Retry-After` exactly as
  `github-pipeline.ts:219-227` already does.
- **Comment-flood cap (crash loops):** the label-lookup response already returns `comments`
  (count) and `updated_at` for the matched issue — use those for a **stateless** cap: skip
  the comment write (still return 200) if `comments >= 20` or `updated_at` is within a
  10-minute cooldown. No KV or Redis needed; GitHub's own issue metadata is the throttle
  state.
- **Dedupe-lookup failure (network / 5xx on the label GET):** fail **open** to
  `createIssue`, not closed — losing a crash report is worse than an occasional duplicate.

### 5. Target repo

Recommend a dedicated repo, e.g. `keyboard-studio/crash-reports`, not
`keyboard-studio/keyboards`. The keyboards repo is a curated content corpus (managed-pr's
target, github-pipeline.ts:94-105); mixing crash noise into its issue tracker pollutes it
for content reviewers. Per the installation-token constraint documented at
github-pipeline.ts:96-102, the App has "no cross-repo contributor affordance" — it must be
**installed on** whatever repo receives issues. This is an operational step, not code: add
the new repo to the existing installation and extend the App's declared permissions with
**`issues: write`** (currently only `contents:write` + `pull_requests:write` per the
handlers.ts:61 comment). Permission changes require the installation owner to re-approve —
surface this to the user as a manual GitHub Settings action, do not assume it.

### 6. Abuse and hardening

Concrete risks: spam issue creation (many distinct fingerprints), oversized payloads,
malicious markdown, residual identity or secret leakage into a now-public issue, comment
flooding from a client-side crash loop.

Mitigations: hard zod caps on every field (title 200, body 64 KiB, context strings ≤300 B)
mirroring `ManagedPRBodySchema` (managed-pr-schemas.ts:15-33); the Vercel ~4.5 MB body
ceiling as a coarse backstop; a server-side regex scrub for secret-shaped strings (`ghp_`,
`gho_`, `github_pat_`, `sk-`, `AKIA`, `xox[bp]-`, generic ≥32-char hex/base64 blobs) and
email-shaped strings, applied to `body` and `context` before any GitHub write — defence in
depth, given that constraint 2 makes the client responsible for identity redaction; strict
fingerprint regex validation so it cannot be used to inject into the label or query string.
Distributed per-IP rate limiting is **not** proposed for v1 (no KV store exists in this
stack outside drafts' Blob+Postgres).

### 7. Failure modes

GitHub down, or 401/403 from a misconfigured token → `502 submission_unavailable`, the
identical vocabulary to `github-pipeline.ts:212-218`, never revealing which credential is
wrong. App not configured at all → `503 reporting_not_configured`, mirroring
`submission_not_configured` (server.ts:394-396). The SPA's crash-reporting call should be
**fire-and-forget**: never surface a reporting failure to the user as an actionable error,
since the user is already dealing with the original crash. Log locally at most; do not
retry-loop, which would itself cause the comment-flood scenario in §4.

### 8. Open decisions raised (all now resolved by the lead or the user)

1. Target repo name and provisioning — **resolved**: `keyboard-studio/crash-reports`, user
   does the App install and permission bump.
2. Regression handling — **resolved**: reopen + `regression` label + comment.
3. Rate-limiting infra — **resolved**: v1 ships schema caps plus the GitHub-side comment
   cooldown, no external KV.
4. Comment cap constants (20 comments / 10-minute cooldown) — **accepted as specified**,
   but the spec should name them as tunable constants, not magic numbers.
5. Fingerprint computation client-side — **resolved**: yes, client-side. The server
   validates format only, and does not attempt to re-derive stability.

---

## Probe B — km-frontend: client-side design

### 0. Ground truth check

Confirmed: **no ErrorBoundary exists anywhere in `packages/studio/src`** (grep returned
nothing). A render throw anywhere in the tree currently produces a blank white screen with
no recovery path. `packages/studio/src/main.tsx`'s `mountApp()` / `mountCallbackScreen()`
have no try/catch around them either — a throw before `createRoot(...).render(...)` (for
example `requireRoot()` at line 21, or a `localeReady` rejection at line 33) is a fully
uncaught exception with zero UI.

### 1. Capture surfaces

- **React render throws** — needs exactly **one** `ErrorBoundary`, placed *inside*
  `AppRoot.tsx`'s `<I18nProvider>` (main.tsx:80-84 mounts `AppRoot` around all three
  subtrees — StudioShell, LintDemo, OAuthCallbackScreen — so one boundary there covers all
  three, and the fallback can still use `<Trans>`). Files a report.
- **`window.onerror`** — catches sync errors outside React (worker callbacks, event
  handlers). Files.
- **`unhandledrejection`** — catches un-awaited rejections. Files. Note
  `warmExemplarSource().catch(() => {})` (main.tsx:47) already self-swallows and correctly
  never reaches this.
- **`vite:preloadError`** — fires specifically for a failed dynamically-imported chunk.
  Does **not** file; drives the stale-chunk reload instead. Must call
  `event.preventDefault()` or it *also* fires as an unhandled rejection.
- **`useKeyboardArtifact`'s `Stage: "error"`** (hooks/useKeyboardArtifact.ts:165-182) —
  already a modelled, recoverable state with its own Retry UX
  (components/PreviewPaneOverlay.tsx:56-72). Do **not** auto-file every occurrence;
  `fetch` and `compile` errors are usually transient or environmental. Exception:
  `loadEngine()`'s catch (useKeyboardArtifact.ts:45-61, wrapping
  `import(/* @vite-ignore */ "@keyboard-studio/engine")`) can produce the exact cited
  symptom and needs the stale-chunk check applied before any "report this" affordance
  appears.

### 2. Stale-chunk carve-out

Detection: `vite:preloadError` is authoritative. Fall back to a regex on message text for
paths outside Vite's preload machinery (raw `import()` calls such as `loadEngine`):
`/failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i`.

Recovery: on detection, read a `sessionStorage` timestamp (`ks.staleChunkReloadedAt`). If
absent or older than 60 s, set it and `location.reload()` once. If a reload already
happened within the window, **stop** — a second failure of the same class within 60 s of a
fresh load means the chunk is genuinely unreachable (CDN, CORS, ad-blocker), not a stale
deploy. Surface a plain retry notice and only then allow filing. This bounds the behaviour
to one automatic reload per incident.

### 3. Fingerprint

Inputs: error kind (render / onerror / rejection), normalized message (stack-trace
addresses and quoted user strings stripped), and the top 3-5 stack frames as
`function@modulePath` with **line and column dropped** (they shift on any rebuild
independent of a logic change) and chunk-hash suffixes canonicalized
(`main-DLGH1X0S.js` → `main.js`, via `/-[\w-]{8,12}\.js$/`).

Version/commit: **exclude from the hash input**, include as a plain payload field instead.
Hashing it in forks a new issue every deploy, defeating "one issue per bug"; leaving it out
of the hash but in the payload lets the server record "seen again in build X" for
regression tracking without forking.

Hash: `crypto.subtle.digest("SHA-256", ...)` over the canonicalized string, hex-encoded,
first 16 chars as the dedupe key. Async is fine — capture is event-driven, not on the
300 ms cycle.

### 4. Debug log and breadcrumbs

Fixed-size (~50) circular buffer, module scope (the same category as `window.__ksE2E__` in
lib/e2eHook.ts — diagnostic plumbing, not React state). Installed once at bootstrap by
wrapping `console.error` / `.warn`: call the original **and** push to the ring, never
replace existing behaviour. Worth recording: hash-route changes, step completions, `Stage`
transitions, OAuth callback entry, locale changes.

**No timer is added anywhere in this design** except the one-shot sessionStorage timestamp
check in §2, which is a comparison rather than a debounce and produces no diagnostic — the
same argument CLAUDE.md already applies to `AUTOSAVE_DEBOUNCE_MS` and
`CLOUD_SYNC_DEBOUNCE_MS` in lib/draftPersistence.ts. D3 is not engaged.

### 5. Payload shape

Always: `fingerprint`, `kind`, `message`, `stackFrames[]`, `route`, `breadcrumbs[]`,
`appVersion` / `commitSha`, `userAgent`, `timestamp`.

Included when available: `compileStage` (from `Stage`), `bcp47Tags[]`,
`hasWorkingCopy: boolean`.

Never included: `Attribution.authorName` / `authorEmail` / `copyrightHolder`, anything from
`IdentitySession` (GitHub `login` or token, Google `sub` / `email` / `name` / `picture`),
full working-copy VFS content.

### 6. Redaction

**Allowlist, not denylist**, enforced by a single typed `CrashReportPayload` builder that
reads named primitives off approved sources and never spreads an `Attribution` or
`IdentitySession` object. A future contributor adding a field must extend the typed
interface, which is visible in review; there is no object in the pipeline holding a name or
email that a denylist could forget to strip.

Redaction runs **at capture-time construction**, not at send time. A strip-at-send step
implies the disallowed fields existed in an intermediate structure (the ring buffer, a
stored draft) reachable by some other future path, such as a "copy debug info" button.
Building the allowlisted object directly means the disallowed fields are never held
anywhere in the report's data structure.

### 7. UX

(Probe recommended confirm-before-send; the user has since chosen auto-send with a notice.
The accessibility and i18n requirements below still apply to whatever UI is shown.)

Boundary-rendered fallback screen: heading, recovery affordance, and the reporting notice.
`role="alert"`, focus moved to the heading on mount (per docs/accessibility.md focus
management — this is a whole-page state change, not an `aria-live` update). i18n ids
following spec 046 format: `crash.report.title`, `crash.report.sent.notice`,
`crash.report.issue.link`.

**Pre-mount crash** (React never mounted): the boundary cannot help. `main.tsx`'s
`mountApp()` / `mountCallbackScreen()` need a top-level try/catch that reveals a static,
dependency-free `<div>` baked into `index.html` — no i18n, no React — with plain English
text and a bare `fetch` POST of `{message, stack}` only, since nothing else has run yet.
Best-effort, short timeout, swallow failure.

### 8. Open decisions raised

- Auto-send vs confirm-then-send — **resolved by the user**: auto-send with a notice.
- **Per-session dedupe** — recommend caching "already reported this fingerprint" in
  `sessionStorage` so a crash loop does not POST-storm. The lead accepts this: it composes
  with, rather than replaces, the server-side comment cooldown in Probe A §4.
- VFS/keyboard-content inclusion — **resolved by the user**: structural context only, no
  VFS snapshot.

---

## Probe C — km-synthesis: reuse survey

### 1. Hashing / fingerprinting

**REUSE (with the lead's P0 caveat):** `packages/engine/src/codec/hash.ts:14` —
`computeSha256Hex(text): Promise<string>`, Web Crypto (`globalThis.crypto.subtle`), works
in browser and Node, no dependencies. Re-exported through
`packages/engine/src/codec/index.ts`.

**Lead override:** do not import it from the crash path — see the P0 note in the synthesis
above. Inline the equivalent `crypto.subtle.digest` call in the studio bundle instead.

**Correction to the brief's premise:** the `<shortHash>` in `add/<keyboardId>-<shortHash>`
(`utilities/oauth-backend/src/github-pipeline.ts:164`, `buildManagedBranchName`) is **not**
a computed content hash — it is `commitSha.slice(0, 7)`, the SHA that Git itself returns
from the tree-commit API call. There is no reusable short-hash helper there.

### 2. GitHub API client code

**DUPLICATION RISK; extraction blocked by bundle safety.**
`packages/engine/src/output/github.ts` (Option A, user-token fork+PR) and
`utilities/oauth-backend/src/github-pipeline.ts` (Option B, org-token managed PR) are an
explicitly documented vendored pair (github-pipeline.ts:9, "Vendored from
packages/engine/src/output/github.ts — keep in sync"). A crash-reporter route filing issues
via the installation token is a **third** hand-rolled GitHub REST caller (auth headers,
`mapNonOk` / 429 / 401 / 403 handling, fetch abstraction) alongside these two.

Extraction into a shared package is a **non-starter for the server side** given
`api/bundle-safety.test.ts:144` — any new `@keyboard-studio/*` workspace package imported
as a *value* from the reachable graph of `api/**` breaks the same way contracts-data does.
(Verified: `utilities/oauth-backend/src` currently imports `@keyboard-studio/*` only as
`import type`, in `schemas.ts`.) The established escape hatch is "copy the literal locally
behind a compile-time drift guard" (the `GITHUB_OAUTH_CLIENTS` pattern in
`utilities/oauth-backend/src/schemas.ts`), not a shared runtime module.

The spec should explicitly choose one of: (a) hand-write a third minimal GitHub caller
inside oauth-backend for issue-create and issue-comment — a small surface, two endpoints,
no tree/branch/PR machinery — and accept the divergence, honestly documented the way
github-pipeline.ts:9-24 documents its own; or (b) extract only the pure, non-fetch helpers
(header building, 401/403/429 status mapping) as copy-pasted-with-guard functions, the way
branch naming is handled today. Full client extraction is not feasible.

### 3. Error modelling

**REUSE the *pattern*, not a type.** Three existing discriminated-union error shapes are
internally consistent but domain-specific; none is a generic "app error" the crash report
can import directly:

- `Stage` (`packages/studio/src/hooks/useKeyboardArtifact.ts:165`) — compile-pipeline stage,
  `{kind: "error"; step; message; compileResult?}`.
- `HandlerResult` (`utilities/oauth-backend/src/handlers.ts:72`) —
  `HandlerSuccess | HandlerError`, server-route result.
- `PublishManagedPRError` (`packages/contracts/src/outputService.ts`, mapped in
  `packages/studio/src/lib/publishManagedPRErrorMessage.ts:30-38`) — the closest structural
  precedent: an exhaustive `kind`-discriminated union with a `satisfies readonly Kind[]`
  array forcing new kinds through both the runtime guard and the message-mapping switch.

**GAP, but with a template.** There is no existing "unhandled application error" type. The
crash report's own error union (name, message, stack, fingerprint, context) should follow
the `PublishManagedPRError` idiom — `kind`-discriminated, exhaustive array, `isXError` type
guard — rather than invent a looser shape. That is the convention this codebase enforces at
build time.

### 4. Client fetch / route-calling

**GAP — no shared fetch wrapper exists; every caller rolls its own.** Checked
`managed-pr.ts` (engine, POSTs via an injectable `ManagedPRFetchFn`),
`packages/studio/src/lib/githubOAuth.ts`, `serverDraftStore.ts`, `localBaseBrowser.ts` —
each defines its own local fetch-response interface and its own status-code-to-error
mapping inline. There is no `lib/apiClient.ts` and no retry helper.

**DUPLICATION RISK:** do not invent a shared wrapper for this one caller either — an
unjustified abstraction for a single fire-and-forget POST. Follow the established
per-caller convention: a narrow local fetch injection point (as managed-pr.ts:24-31 does)
for testability, with the POST best-effort so a broken reporter never itself crashes the
app.

### 5. App version / build metadata

**GAP.** No `import.meta.env.VITE_APP_VERSION`, no `__COMMIT_SHA__` Vite `define`, no
`VERCEL_GIT_COMMIT_SHA` reference anywhere in `packages/studio` (checked `vite.config.ts`,
`vite-env.d.ts`, all `lib/*` env-flag files). `packages/studio/package.json` has
`"version": "0.1.0"` but nothing surfaces it at runtime. The spec must add a Vite `define`
(commit SHA, ideally from Vercel's `VERCEL_GIT_COMMIT_SHA` build env). Greenfield work —
name it explicitly rather than leaving it implicit.

### 6. Breadcrumbs / logging

**PARTIAL REUSE — high value but narrower than it looks.** `specs/053-decision-audit` plus
`packages/studio/src/decisions/decisionLogStore.ts` is a real, already-shipped append-only
trail (`DecisionRecord` / `DecisionEntry`, `stepId` plus `recordedAt`, zustand store,
`packages/contracts/src/decisionRecord.ts`). It captures *authoring decisions* — survey
answers, editor actions — with timestamps and step ids, and is genuinely useful as
**working-copy context** for a crash report. The spec should read the last N entries via
the existing store rather than reimplement step tracking.

It does **not** cover generic UI navigation, console output, or arbitrary breadcrumb events
(button clicks, route changes, warnings) — it is domain-scoped to decisions, not a general
debug log. **GAP remains:** a separate small ring buffer over `console.error` /
`console.warn` and step-view transitions is still needed for the breadcrumb half. Do not
conflate the two: reuse `decisionLogStore` for context, build new for the breadcrumb ring.

### 7. Redaction

**GAP — no inverse exists to model from.** No redaction or anonymization helper found
(searches for `redact`, `anonymiz` came back empty). The output/PR path does the opposite
on purpose: `packages/contracts/src/attribution.ts` (`authorName`, `authorEmail?`,
`copyrightHolder`) and `github-pipeline.ts:128-154` (`buildCommitMessage` / `buildPrBody`)
**deliberately embed** author identity into commits and PR bodies as public attribution.
Correct behaviour there, and it confirms identity currently flows in exactly one direction
— into output, never stripped. The spec must write its own redaction step against
`Attribution` and `IdentitySession` (`packages/studio/src/lib/identity.ts:21-56`)
explicitly. There is no existing "strip PII" utility to point to, and no test asserting
identity absence to model a new one on.

### Top 3 integration risks

1. **Third GitHub caller.** Without an explicit decision to keep it minimal and
   hand-documented (as github-pipeline.ts documents its own divergence), this becomes
   silent duplication #3 of a pattern the codebase already flags as fragile.
2. **Conflating decision-log context with breadcrumbs.** If the spec assumes
   `decisionLogStore` already provides console and navigation breadcrumbs, the ring-buffer
   requirement gets dropped by omission.
3. **App version is a real gap, not an edge case.** Every issue this feature files needs a
   build identifier to be actionable; today there is nothing to read at runtime, so this is
   on the critical path.
