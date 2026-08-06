# Tasks: Crash reporting

**Feature**: 060-crash-reporting · **Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: included. The spec requires them by name — FR-013 (gate demonstrated red), FR-034 (identity
absence), FR-136 (handler-level with injected fetch stub), plus a full Test Surface section.

**Format**: `- [ ] **T###** [P?] [US#] Description · exact/file/path`
`[P]` = independent of the others in its wave (different file, no incomplete dependency).

**Manual prerequisites are not tasks.** Spec Prerequisites 1–5 (create `keyboard-studio/crash-reports`,
create the second GitHub App, install it, provision `CRASH_REPORT_APP_*`, add the Vercel Firewall rule)
are dashboard actions for the repository owner. They block the route's **live function**, not its
implementation or tests — every server task below is fully testable against an injected fetch stub with
no repository, App, or credential in existence.

---

## Phase 1: Setup

**Purpose**: route wiring and the build-identity plumbing that has no dependencies of its own.

**Wave 1 — independent (different files):**

- [x] **T001** [P] Insert `{ "source": "/report/crash", "destination": "/api/report/crash" }` into the `rewrites` array **above** the terminal `/(.*)` → `/index.html` entry — appending it after the catch-all is dead config that silently returns the SPA with a 200 (FR-080, research D9) · `vercel.json`
- [x] **T002** [P] Add a `define` block setting `__KS_COMMIT_SHA__` from `process.env.VERCEL_GIT_COMMIT_SHA` with a `"dev"` fallback — the file has no `define` key today, so this is a new block alongside `plugins`/`resolve`/`optimizeDeps`/`server` (FR-110) · `packages/studio/vite.config.ts`
- [x] **T003** [P] Declare `__KS_COMMIT_SHA__` ambiently as `declare const __KS_COMMIT_SHA__: string` (FR-111) · `packages/studio/src/vite-env.d.ts`
- [x] **T004** [P] Document `CRASH_REPORT_APP_ID` / `CRASH_REPORT_APP_PRIVATE_KEY` / `CRASH_REPORT_APP_INSTALLATION_ID` in the env block of the module header, stating they are distinct from and never fall back to the `GITHUB_APP_*` trio (Prerequisites #4, FR-085) · `utilities/oauth-backend/src/server.ts`

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the crash module, the wire schema, the token minter, the canonicalization core, and the
route skeleton. No user story can begin until this phase is done.

**⚠️ The gate goes first.** T005 exists before any crash-module file so every subsequent file in
`src/crash/` is written against a live constraint rather than audited afterwards.

**Wave 1 — the gate, alone:**

- [ ] **T005** Write the import-graph walker asserting `packages/studio/src/crash/`'s transitive reachable graph contains **zero** edges into `@keyboard-studio/engine`. Resolve `.ts` **and** `.tsx`, and follow relative imports out of `src/crash/` into the rest of `src/` — the hazard is the transitive edge through `decisionLogStore.ts`, not a direct import. **Demonstrate it RED**: add a temporary file importing `../decisions/decisionLogStore.ts`, watch the test fail, then delete the fixture. A gate never seen red is not evidence (FR-013, FR-132, research D2) · `packages/studio/src/crash/engine-reachability.test.ts`

**⟶ Wait for T005, then:**

**Wave 2 — independent leaf modules (different files, no cross-dependency):**

- [ ] **T006** [P] Define the client payload types — `CrashReport`, `StackFrame`, `CrashContext`, `Breadcrumb`. No `@keyboard-studio/engine` import; no fingerprint field on `CrashReport` (FR-021, data-model §1) · `packages/studio/src/crash/types.ts`
- [ ] **T007** [P] Compose `appVersion` as `<pkg.version>+<sha7>` from `__KS_COMMIT_SHA__`. Must never yield `undefined` or `""` (FR-112, FR-114, SC-011) · `packages/studio/src/crash/buildVersion.ts`
- [ ] **T008** [P] Implement the ~50-entry module-scope circular breadcrumb ring. Wrapping `console.error`/`console.warn` MUST call the original **and** push — never replace. Entries carry structural facts only, never free text that could smuggle identity (FR-043, FR-044, FR-047) · `packages/studio/src/crash/breadcrumbs.ts`
- [ ] **T009** [P] Implement the client-local fingerprint: the FR-081a canonicalization, hashed with `crypto.subtle.digest("SHA-256", ...)` called **directly** — `computeSha256Hex` is never imported despite being identical (FR-011, FR-020, FR-023, FR-024, research D8) · `packages/studio/src/crash/fingerprint.ts`
- [ ] **T010** [P] Define `CrashReportBodySchema` with every cap in [contracts/crash-report-api.md](contracts/crash-report-api.md), `kind`/`stackFrames`/`stack`/`appVersion`/`occurredAt` all optional, **no** `fingerprint` and **no** `title` field, plus the `.refine()` requiring `stackFrames` or `stack` whenever `kind` is present and not `"pre-mount"` (FR-081, FR-082) · `utilities/oauth-backend/src/crash-report-schemas.ts`
- [ ] **T011** [P] Implement `getCrashReportInstallationToken()` reading the `CRASH_REPORT_APP_*` trio, with its **own** module-scope `createAppAuth` cache and its own `_reset*` test seam — a shared minter would hand whichever App loaded first to both pipelines (FR-085, research D4) · `utilities/oauth-backend/src/crash-report-installation-token.ts`
- [ ] **T012** [P] Add the six new ids — `crash.report.title`, `crash.report.sent.notice`, `crash.report.issue.link`, `crash.report.undo.button`, `crash.report.undo.confirmed`, `crash.report.retry.notice` — to both catalogs. All new; no existing id repurposed (FR-122, FR-126, FR-127) · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/fr/messages.json`

**⟶ Wait for Wave 2, then:**

**Wave 3 — composed modules (each needs Wave 2 output):**

- [ ] **T013** Build the allowlist payload builder — named primitives read off approved sources, never a spread of an `Attribution` or `IdentitySession`. Redaction happens at **construction**, not strip-at-send, so the disallowed fields are never held in any intermediate structure. Add the FR-032a header comment stating this module does the deliberate opposite of `github-pipeline.ts`'s `buildCommitMessage`/`buildPrBody` (FR-030, FR-031, FR-032, FR-032a, FR-035, FR-046) · `packages/studio/src/crash/redact.ts`
- [ ] **T014** Implement fire-and-forget send: the POST with a short timeout, the `sessionStorage` per-fingerprint dedupe cache, and the module-scope subscribable (subscribe/getSnapshot for `useSyncExternalStore`) carrying `{ status, issueUrl, issueNumber, action }`. Not a zustand store — `src/stores/` is where the engine-importing modules live (FR-078, FR-101, research D6) · `packages/studio/src/crash/send.ts`
- [ ] **T015** Implement the canonicalization core: exported flood-control constants, `canonicalizeCrashInput({ kind, message, frames })` as a **pure** function (no I/O, no headers, no repo state), the `framesFromRawStack()` adapter per FR-081f's regex and rules, the SHA-256 → lowercase hex → first-12 truncation, and the scrub pass (secrets, emails, `@mention` neutralization, markdown/`<img>` stripping). Both input shapes normalize to one frame array **before** canonicalization runs, so there is exactly one canonicalization path (FR-081a–FR-081f, FR-033, FR-033a, FR-033b, FR-103, research D7) · `utilities/oauth-backend/src/crash-report-pipeline.ts`

**⟶ Wait for Wave 3, then:**

**Wave 4 — the GitHub caller and the crash-in-the-reporter guard:**

- [ ] **T016** Add the minimal hand-written REST caller covering exactly list-by-label, create, comment, reopen/label-patch, and comment-delete, with `mapNonOk` reproducing the existing vocabulary (`submission_unavailable` / `upstream_error` / `rate_limited` / 401·403 → 502). Header comment in the `github-pipeline.ts:9-24` vendoring style naming this as caller #3 and why extraction is blocked (FR-084, FR-087, FR-088, FR-089) · `utilities/oauth-backend/src/crash-report-pipeline.ts`
- [ ] **T017** Wrap the entire client capture-and-send path (capture → fingerprint → redact → build → POST) so any internal failure is swallowed silently — at most pushed to the breadcrumb ring — and can never escape as a second unhandled rejection re-entering the same handler (Edge Cases, "crash-in-the-crash-reporter") · `packages/studio/src/crash/send.ts`

**⟶ Wait for Wave 4, then:**

**Wave 5 — route surfaces (independent of each other):**

- [ ] **T018** [P] Add the thin Web-fetch adapter: method guard → env config (503 `reporting_not_configured` when any `CRASH_REPORT_APP_*` is absent) → schema validation (400 `invalid_request`) → pipeline → status mapping, with the `configOverride` test seam. Structurally mirrors `api/submit/managed-pr.ts` (FR-083, FR-087) · `api/report/crash.ts`
- [ ] **T019** [P] Register the matching Fastify `POST /report/crash` route for local-dev parity, gated on a `crashAppConfigured` flag mirroring the existing `appConfigured` gate (FR-083) · `utilities/oauth-backend/src/server.ts`

**⟶ Wait for Wave 5, then:**

**Wave 6 — the bundle-safety gate (needs the adapter to exist on disk):**

- [ ] **T020** Add `"api/report/crash.ts"` to `FUNCTION_ENTRIES` and confirm the suite is green — the "imports no workspace package as a value" assertion must hold for the new function's whole reachable graph (FR-086, FR-131, SC-010) · `api/bundle-safety.test.ts`

**Checkpoint**: the crash module, wire schema, minter, canonicalization, GitHub caller, and route all
exist and are gated. User-story work can begin.

---

## Phase 3: User Story 1 — A crash becomes one actionable issue, with no author identity (Priority: P1) 🎯 MVP

**Goal**: a render throw files exactly one redacted GitHub issue carrying the build id and structural
context, and the author sees a recovery screen linking it.

**Independent Test**: force a render throw in a test build; assert exactly one issue is created against
a stub GitHub API with the expected redacted body and label, and that the recovery screen links it.

### Tests for User Story 1

**Wave 1 — independent (different files):**

- [ ] **T021** [P] [US1] Assert identity **absence** directly: build a payload from a fixture working copy carrying real `Attribution.authorName`/`authorEmail`/`copyrightHolder` and a populated `GitHubIdentitySession` + `GoogleIdentitySession`, then assert none of those values appears anywhere in the serialized payload — not merely that the builder didn't throw (FR-034, SC-005) · `packages/studio/src/crash/redact.test.ts`
- [ ] **T022** [P] [US1] Handler-level create-path test with an injected fetch stub — no real network, no real token. Covers create, `403 → 502 submission_unavailable`, and `503 reporting_not_configured` (FR-136) · `api/report/crash.test.ts`
- [ ] **T023** [P] [US1] Pin the FR-081d worked example: assert the exact canonicalized string, assert the hash is stable across an input differing only in `line`/`column`/chunk-hash suffix, and assert it differs for a genuinely different `message` or `function` (FR-081d, SC-014) · `utilities/oauth-backend/src/crash-report-pipeline.test.ts`

### Implementation for User Story 1

**⟶ Wait for the tests above, then:**

**Wave 2 — the create path and the capture surfaces (different files):**

- [ ] **T024** [P] [US1] Implement the create branch: generated title `bug(studio): <normalized message summary>` ≤72 chars ellipsized and carrying neither `kind` nor fingerprint nor build id; the `crash/fp-<hash12>` label; and the `<!-- crash-fingerprint: <hash> -->` body trailer for auditability (FR-092, FR-093, FR-093a) · `utilities/oauth-backend/src/crash-report-pipeline.ts`
- [ ] **T025** [P] [US1] Add the stateless global creation cap: `GET …?state=all&since=<now-window>&per_page=100`, skip creation at `CRASH_REPORT_GLOBAL_CREATE_CAP`, surface a skip as `429 rate_limited` with `Retry-After` computed from the window (FR-106, SC-016) · `utilities/oauth-backend/src/crash-report-pipeline.ts`
- [ ] **T026** [P] [US1] Build the recovery screen: `role="alert"`, focus moved to its heading on mount, the issue link and any control a real keyboard-operable element (FR-072, FR-120, FR-125) · `packages/studio/src/components/CrashRecoveryScreen.tsx`
- [ ] **T027** [P] [US1] Build the lighter notice: `aria-live="polite"`, never steals focus, names that a report was sent and links the issue. Consumes `send.ts`'s subscribable via `useSyncExternalStore` (FR-071, FR-073, FR-121) · `packages/studio/src/components/CrashNotice.tsx`
- [ ] **T028** [P] [US1] Collect structural context at the **call site** — keyboard id, BCP47 tags, step id, key count, exemplar count, and the decision-log tail from `useDecisionLogStore.getState()` — and pass it into the payload builder as plain data. This module may import the stores; `src/crash/` may not (FR-012, FR-040, FR-041, FR-042, FR-046, E-4) · `packages/studio/src/crash/callerContext.ts` *(lives outside `src/crash/`; place under `src/lib/` if the gate flags it)*

**⟶ Wait for Wave 2, then:**

**Wave 3 — mount the surfaces (each edits a shared bootstrap file):**

- [ ] **T029** [US1] Add the single `ErrorBoundary`, mounted inside `AppRoot`'s `<I18nProvider>` so its fallback can use the catalog and one boundary covers `StudioShell`, `LintDemo`, and `OAuthCallbackScreen` — not three (FR-001) · `packages/studio/src/AppRoot.tsx`, `packages/studio/src/components/CrashErrorBoundary.tsx`
- [ ] **T030** [US1] Install the `window.onerror` and `unhandledrejection` handlers at bootstrap, routing both to the same payload builder. Verify `warmExemplarSource().catch(() => {})` and other deliberate self-swallowers still never reach the rejection handler (FR-002, FR-003, FR-007, FR-008) · `packages/studio/src/main.tsx`
- [ ] **T031** [US1] Confirm `useKeyboardArtifact`'s `Stage: "error"` does **not** auto-file on every occurrence — fetch and compile errors there are transient and already have a Retry UX (FR-005) · `packages/studio/src/hooks/useKeyboardArtifact.ts`

**⟶ Wait for Wave 3, then:**

**Wave 4 — accessibility verification, split across the two lanes (research D3):**

- [ ] **T032** [P] [US1] Structural a11y assertions in the jsdom lane: `role="alert"` present, focus lands on the recovery heading on mount, the notice carries `aria-live="polite"` and does **not** move focus, every control is a real button/link (FR-072, FR-073, SC-008) · `packages/studio/src/components/CrashRecoveryScreen.a11y.test.tsx`
- [ ] **T033** [P] [US1] Automated axe scan of the recovery screen and notice — **Playwright only**. `expectNoSeriousAxeViolations` does not exist in the vitest lane; `@axe-core/playwright` is the repository's sole axe dependency (FR-124, SC-008, research D3) · `packages/studio/e2e/crash-recovery-a11y.spec.ts`

**Checkpoint**: US1 is independently functional — a render throw files one redacted, build-stamped
issue and the author gets a linked recovery screen.

---

## Phase 4: User Story 2 — Repeat crashes don't spam; regressions stay distinguishable (Priority: P1)

**Goal**: a repeat fingerprint comments instead of creating; a closed match reopens with `regression`.

**Independent Test**: file the same fingerprint twice against a stub GitHub API and assert the second
comments rather than creates; close the stub issue, file a third time, assert reopen + `regression` +
comment.

### Tests for User Story 2

- [ ] **T034** [US2] Fixture-driven handler tests: repeat → comment, closed match outside cooldown → reopen + `regression` regardless of comment-cap state, closed match **inside** `CRASH_REPORT_REOPEN_COOLDOWN_MS` → suppressed with the same non-fatal shape a capped comment returns, an **open** match → never a reopen/label call, dedupe-lookup failure → creates anyway, and 100 repeats → zero extra issues (FR-094, FR-095a, FR-096, SC-002, SC-017) · `utilities/oauth-backend/src/crash-report-pipeline.test.ts`

### Implementation for User Story 2

**⟶ Wait for T034, then:**

**Wave 1 — the lookup (everything else branches off it):**

- [ ] **T035** [US2] Implement dedupe lookup via `GET /repos/{owner}/{repo}/issues?labels=crash/fp-<hash12>&state=all&per_page=5`. Add the required call-site comment explaining why `GET /search/issues` MUST NOT be used — indexing lag of seconds to minutes, 30 req/min shared across the whole installation, versus 5,000/hr on ordinary REST. Fail **open** to creation on lookup error (FR-090, FR-091, FR-096) · `utilities/oauth-backend/src/crash-report-pipeline.ts`

**⟶ Wait for T035, then:**

**Wave 2 — the two match branches (distinct code paths, buildable in either order):**

- [ ] **T036** [P] [US2] Open-match branch: add a comment, capped by `CRASH_REPORT_COMMENT_CAP` and `CRASH_REPORT_COMMENT_COOLDOWN_MS` derived statelessly from the matched issue's own `comments` count and `updated_at`. A skipped comment still returns `200 { …, action: "commented" }`. Make **no** state-change call at all — an open issue has no state left to change (FR-094, FR-102, FR-104) · `utilities/oauth-backend/src/crash-report-pipeline.ts`
- [ ] **T037** [P] [US2] Closed-match branch: reopen + add `regression` + comment, bounded by `CRASH_REPORT_REOPEN_COOLDOWN_MS` read off the same `state`/`updated_at` signals. **The first hit after a close always reopens** — the cooldown bounds churn, never the signal (FR-095, FR-095a, SC-017) · `utilities/oauth-backend/src/crash-report-pipeline.ts`

**⟶ Wait for Wave 2, then:**

- [ ] **T038** [US2] Honour GitHub `429` exactly as `github-pipeline.ts` does: surface as `429 rate_limited` with `Retry-After` from the response header, defaulting to 60 when absent or non-numeric (FR-098) · `utilities/oauth-backend/src/crash-report-pipeline.ts`

**Checkpoint**: US1 and US2 both work independently. The tracker holds one issue per bug.

---

## Phase 5: User Story 3 — A stale deployment recovers silently and is never reported (Priority: P1)

**Goal**: a post-deploy chunk 404 reloads once and files nothing.

**Independent Test**: simulate a `vite:preloadError` and, separately, the raw-`import()` failure message
pattern; assert one `location.reload()` and zero POSTs.

### Tests for User Story 3

- [ ] **T039** [US3] Assert the **original** `loadEngine()` rejection text — not the synthetic `"Engine failed to load…"` string — reaches the FR-051 classifier and the carve-out fires; and that a rejection which does **not** match the pattern still reaches ordinary filing, so the fix doesn't over-suppress genuine engine failures (SC-015) · `packages/studio/src/crash/staleChunk.test.ts`

### Implementation for User Story 3

**⟶ Wait for T039, then:**

**Wave 1 — the carve-out module, alone:**

- [ ] **T040** [US3] Implement the carve-out: the FR-051 pattern match, the `ks.staleChunkReloadedAt` `sessionStorage` timestamp check against a named `STALE_CHUNK_RELOAD_WINDOW_MS` (default 60 s, single-source, exported), one `location.reload()` on first detection with **no** report filed, and no reload on recurrence within the window. A one-shot comparison, not a debounce — it engages no D3 timer and emits no diagnostic (FR-050–FR-055, FR-130) · `packages/studio/src/crash/staleChunk.ts`

**⟶ Wait for T040, then:**

**Wave 2 — the two call sites (different files):**

- [ ] **T041** [P] [US3] Install the `vite:preloadError` handler: call `event.preventDefault()` — without it the same failure also surfaces as an unhandled rejection and is double-counted — then route into the carve-out rather than the filing path (FR-004, FR-050) · `packages/studio/src/main.tsx`
- [ ] **T042** [P] [US3] Fix P0-3: preserve the original `import()` rejection (its `message`, and its `cause` where it wraps another error) through `loadEngine()`'s `catch` and forward it to the classifier **before** any pattern match. The caller MAY still show the friendly synthetic string in the `Stage: "error"` UI, but the classifier must see the original text (FR-005a) · `packages/studio/src/hooks/useKeyboardArtifact.ts`

**⟶ Wait for Wave 2, then:**

- [ ] **T043** [US3] On a recurrence inside the window, surface the plain retry notice via `crash.report.retry.notice` and only then allow the failure through to ordinary filing — it is now genuinely unreachable, not stale (FR-053) · `packages/studio/src/components/CrashNotice.tsx`

**Checkpoint**: a deploy no longer floods the tracker; a genuinely unreachable chunk still files.

---

## Phase 6: User Story 4 — The reporter survives what it reports (Priority: P2)

**Goal**: a compile/scaffold/output engine-surface load failure is still captured and filed.

**Independent Test**: the T005 import-graph gate, plus a simulated engine-surface failure past the
stale-chunk carve-out that still files.

**Note**: the gate itself is T005 in Foundational — it must exist before the module it constrains. This
phase adds the behavioural proof.

**Wave 1 — independent (different files):**

- [ ] **T044** [P] [US4] Simulate a compile/scaffold/output engine-surface load failure that has already consumed the stale-chunk reload, and assert the crash path still computes a fingerprint, builds a redacted payload, and POSTs — using none of the failed chunk's exports, and with `crypto.subtle.digest` called directly rather than `computeSha256Hex` (FR-014, SC-004) · `packages/studio/src/crash/send.test.ts`
- [ ] **T045** [P] [US4] Raise the chunk-graph confidence the spec flags as inferred-from-minified-output: a browser-level test that blocks the network request for the lazy engine chunk and asserts the app shell — and the reporter inside it — still renders and can file (Test Surface, "Chunk-graph confidence") · `packages/studio/e2e/crash-engine-chunk-blocked.spec.ts`

**Checkpoint**: the P0 is proven both statically and behaviourally.

---

## Phase 7: User Story 5 — A crash before React mounts still gets reported (Priority: P2)

**Goal**: a throw before `createRoot(...).render(...)` reveals a dependency-free fallback and still
sends a bare report.

**Independent Test**: force `requireRoot()` or the `localeReady` await to throw before `createRoot`;
assert the static `index.html` fallback renders and a bare `fetch` POST is attempted.

### Tests for User Story 5

**Wave 1 — independent (different files):**

- [ ] **T046** [P] [US5] Assert the exact FR-062 body — `{ message, stack, appVersion }`, no `kind`, no `stackFrames`, no `occurredAt` — validates and files with `kind` defaulted to `"pre-mount"` rather than 400ing; and that a **post-mount** `kind` carrying neither `stackFrames` nor `stack` is rejected `400 invalid_request` by the `.refine()` (SC-018, SC-020) · `utilities/oauth-backend/src/crash-report-schemas.test.ts`
- [ ] **T047** [P] [US5] Assert the FR-081f worked example: a V8-shaped and a Firefox/Safari-shaped raw `stack` for the same error extract to the identical frame portion `KeyEditor@assets/main.js|renderWithHooks@assets/vendor.js` and produce the identical fingerprint, while genuinely different frames produce a different one (SC-019) · `utilities/oauth-backend/src/crash-report-pipeline.test.ts`

### Implementation for User Story 5

**⟶ Wait for the tests above, then:**

**Wave 2 — independent (different files):**

- [ ] **T048** [P] [US5] Add the static, hidden, dependency-free fallback element — plain English text baked into the markup, no React, no catalog lookup, since neither can be assumed to have loaded (FR-061, FR-123) · `packages/studio/index.html`
- [ ] **T049** [P] [US5] Wrap `mountApp()` and `mountCallbackScreen()` in a top-level try/catch active **before** `createRoot(...).render(...)`; on catch, reveal the T048 element and attempt a best-effort `fetch` POST of `{ message, stack, appVersion }` with a short timeout whose failure is swallowed silently — nothing here may throw a second time. It MUST NOT read `localStorage`/`sessionStorage` identity or working-copy data, and MUST target the same endpoint as the ordinary path (FR-060, FR-062, FR-063, FR-064, FR-036, SC-007) · `packages/studio/src/main.tsx`

**Checkpoint**: the one crash class an ErrorBoundary structurally cannot reach is now covered.

---

## Phase 8: User Story 6 — An author can retract a report they just triggered (Priority: P3)

**Goal**: an "Undo" on the notice retracts the report within the window.

**Independent Test**: file a report, retract within the window, assert the issue is closed with a
retraction comment (`"created"`) or the session's comment is removed (`"commented"`).

### Tests for User Story 6

- [ ] **T050** [US6] Assert both retract paths and the window: a `"created"` report closes with a retraction comment; a `"commented"` report removes only this session's comment and never touches the issue's state; neither attempts a GitHub delete of the *issue*; and a fake-timer assertion that "Undo" is present for exactly `CRASH_REPORT_UNDO_WINDOW_MS` and absent immediately after (SC-012, SC-013) · `packages/studio/src/components/CrashNotice.test.tsx`

### Implementation for User Story 6

**⟶ Wait for T050, then:**

**Wave 1 — independent (different files):**

- [ ] **T051** [P] [US6] Add the "Undo" affordance to the notice, visible for exactly `CRASH_REPORT_UNDO_WINDOW_MS` (exported constant, default 30 000). Once the window elapses or the notice is dismissed the affordance disappears and the report stands. UI copy must not imply deletion (FR-074, FR-077) · `packages/studio/src/components/CrashNotice.tsx`
- [ ] **T052** [P] [US6] Implement the retract branches: for `"created"`, `PATCH` the issue closed and add a "retracted by reporter" comment — never a delete, which an installation token cannot do; for `"commented"`, `DELETE` only this session's comment and leave the issue's state and every other comment untouched (FR-075, FR-076) · `utilities/oauth-backend/src/crash-report-pipeline.ts`

**Checkpoint**: all six user stories are independently functional.

---

## Phase 9: Polish & cross-cutting

**Wave 1 — independent (different files):**

- [ ] **T053** [P] Wire the FR-045 breadcrumb instrumentation points — hash-route changes, step completions, `Stage` transitions, OAuth callback entry, locale changes. The spec's only SHOULD: a missing breadcrumb degrades debugging convenience, not correctness, so this does not gate the feature · `packages/studio/src/lib/`, step and route call sites
- [ ] **T054** [P] Update any existing test that incidentally asserts today's "no ErrorBoundary" / "blank page on crash" behaviour so it reflects the new recovery behaviour rather than contradicting it (FR-135) · `packages/studio/src/**/*.test.tsx`
- [ ] **T055** [P] Add the prerequisites runbook — repository creation, second App creation with `issues: write` only, install scoped to `crash-reports`, the three `CRASH_REPORT_APP_*` values, and the Vercel Firewall rule (20 req / 60 s per IP, deny 429 for 10 min) — plus how to disable the route instantly by unsetting an env var (Prerequisites, FR-106 residual-risk owner) · `specs/060-crash-reporting/runbook.md`
- [ ] **T056** [P] Confirm no new validation timer was introduced: the stale-chunk check is a one-shot `sessionStorage` comparison and the undo window is a UI notice lifetime — neither validates, neither emits a diagnostic, so the single 300 ms D3 cycle remains the only validation cadence (FR-130) · review `packages/studio/src/crash/`

**⟶ Wait for Wave 1, then:**

**Wave 2 — the full gate sweep:**

- [ ] **T057** Run and green the gates: `pnpm typecheck`, `pnpm -r test`, the `/api` suite (outside `pnpm -r` — its own invocation), `pnpm lint` including both i18n lint tiers, and `pnpm crew-lint` (SC-009, SC-010)
- [ ] **T058** Walk SC-001 – SC-020 against the suite and record which test discharges each, flagging any left uncovered rather than assuming a passing suite covers them

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** — no dependencies; T001–T004 all parallel.
- **Foundational (Phase 2)** — needs Setup. **Blocks every user story.** Six waves: gate (T005) → leaf modules (T006–T012, all parallel) → composed modules (T013–T015) → caller + reporter guard (T016–T017) → route surfaces (T018–T019, parallel) → bundle-safety (T020).
- **US1 (Phase 3)** — needs Foundational. Tests (T021–T023, parallel) → create path + UI + context (T024–T028, parallel) → bootstrap mounts (T029–T031, shared files, sequential) → a11y in both lanes (T032–T033, parallel).
- **US2 (Phase 4)** — needs Foundational. Tests (T034) → lookup (T035) → the two match branches (T036–T037, parallel) → 429 handling (T038).
- **US3 (Phase 5)** — needs Foundational. Tests (T039) → carve-out module (T040) → the two call sites (T041–T042, parallel) → retry notice (T043).
- **US4 (Phase 6)** — needs Foundational; its gate is already T005. T044–T045 parallel.
- **US5 (Phase 7)** — needs Foundational. Tests (T046–T047, parallel) → implementation (T048–T049, parallel).
- **US6 (Phase 8)** — needs Foundational and US1's notice (T027). Tests (T050) → T051–T052 parallel.
- **Polish (Phase 9)** — needs every story you intend to ship. T053–T056 parallel → T057–T058.

### Cross-story notes

- **T043 and T051 both edit `CrashNotice.tsx`** (created by T027). They are in different phases and must not be built concurrently.
- **T024, T025, T035, T036, T037, T038, T052 all edit `crash-report-pipeline.ts`.** Within a wave they are marked `[P]` only where they add genuinely separate branches; sequence them if one implementer holds the file.
- **T030, T041, T049 all edit `main.tsx`.** Three different phases, three different handlers — never concurrent.
- **US2–US6 can proceed in parallel across implementers** once Foundational is done, subject to the shared-file notes above.

### MVP boundary

Setup + Foundational + US1 is the shippable slice: a crash files one redacted, build-stamped,
author-anonymous issue with a linked recovery screen. US2 protects that from noise and should follow
immediately; US3 protects it from deploy floods. US4–US6 extend reach and add courtesy.
