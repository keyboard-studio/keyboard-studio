# SC-001 – SC-020 (+ SC-012a): which test discharges each

Walked at the close of implementation (T058), re-walked after review cycle 10's two P0 fixes. A
passing suite is not evidence a criterion is covered — this table names the specific test for each
one, and says so plainly where nothing does.

| SC | Discharged by | State |
|---|---|---|
| **SC-001** — every render / onerror / rejection capture files or comments exactly once | `api/report/crash.test.ts` (create path, 200 shape) · `utilities/oauth-backend/src/crash-report-dedupe.test.ts` (open match → comment, no create) · `packages/studio/src/crash/send.test.ts` (one POST per capture) | covered |
| **SC-002** — 100 repeats create zero extra issues | `crash-report-dedupe.test.ts::open match › 100 repeats create zero extra issues` | covered |
| **SC-003** — stale chunk reloads and files nothing; a recurrence files once | `packages/studio/src/crash/staleChunk.test.ts::one-shot reload gate` (all six cases) | covered |
| **SC-004** — a crash after `loadEngine()` failed is still captured and filed | `packages/studio/src/crash/send.test.ts::reporting an engine-surface load failure` (behavioural) · `engine-reachability.test.ts` (static) | **covered for the criterion as written; a stronger scenario is not** — see the note below |
| **SC-005** — a fully-identified author's report reveals nothing about them | `packages/studio/src/crash/redact.test.ts::identity absence` — asserts value absence from the serialized payload, not merely that the builder ran | covered |
| **SC-006** — ≤1 extra POST across 100 in-session repeats; ≤N across 25 sessions | `send.test.ts::session dedupe cache › POSTs once for two occurrences` (client half) · `crash-report-dedupe.test.ts::100 repeats create zero extra issues` (cross-session half) | covered |
| **SC-007** — pre-mount fallback renders, POST attempted, no second exception | `packages/studio/src/crash/preMount.test.ts` (12 cases, incl. every failure mode of the POST) | covered |
| **SC-008** — recovery-screen a11y; notice never steals focus | `CrashRecoveryScreen.a11y.test.tsx` (structural, jsdom) · `e2e/crash-recovery-a11y.spec.ts` (axe, Playwright — **executed**, 4/4) | covered, both lanes |
| **SC-009** — every new string resolves through the catalog; i18n gates pass | `pnpm lint` → `i18n-catalog-lint` and `content-i18n-lint`, both green with the six new `crash.*` ids | covered by gate |
| **SC-010** — crew-lint, bundle-safety with the new entry, engine-reachability all pass | `pnpm crew-lint` (7/7) · `api/bundle-safety.test.ts` (both crash entries) · `engine-reachability.test.ts` | covered by gate |
| **SC-011** — no report ever carries an empty build identifier | `redact.test.ts::always carries a non-empty appVersion` · `preMount.test.ts::carries a non-empty build identifier` — the pre-mount path is the one that could plausibly omit it | covered |
| **SC-012** — retraction closes or removes a comment, never deletes | `crash-report-dedupe.test.ts::retraction` (7 cases, incl. "never deletes the ISSUE") · `api/report/crash-retract.test.ts` (handler-level: created → comment-then-close, commented → comment delete only) | covered |
| **SC-012a** — no unauthorized retraction reaches GitHub (FR-074a) | `crash-report-retraction-token.test.ts` (16 rejection cases: wrong key, re-encoded payload, tampered expiry, flipped/truncated MAC, unknown version, post-signature shape checks, TTL at both edges) · `crash-report-dedupe.test.ts::retraction authorization` (no write call for any of them) · `api/report/crash-retract.test.ts::authorization` (403 with one identical body, no GitHub call) · round trip in `::retraction token issuance` | covered |
| **SC-013** — Undo present for exactly the window, absent after | `CrashNotice.test.tsx::Undo window` — both edges, fake timers | covered |
| **SC-014** — a forged fingerprint cannot redirect a report | `crash-report-pipeline.test.ts::ignores a forged fingerprint-shaped extra field` · `api/report/crash.test.ts::ignores a client-supplied fingerprint` · FR-081d worked example pinned exactly | covered |
| **SC-015** — the ORIGINAL rejection reaches the classifier | `staleChunk.test.ts::loadEngine rejection forwarding` — including the negative case, that the synthetic string alone does not match | covered |
| **SC-016** — 50 distinct fingerprints at the global cap create nothing | `crash-report-dedupe.test.ts::bursts › 50 distinct fingerprints at the global cap create nothing` (stub now pages by `per_page`/`page`) · `crash-report-dedupe.test.ts::global creation cap — pagination` (7 cases, incl. the derived page bound) · `api/report/crash.test.ts::reads a second page` | covered, and demonstrated red |
| **SC-017** — 50 requests against a closed issue reopen exactly once | `crash-report-dedupe.test.ts::bursts › 50 requests against a closed issue reopen it exactly once` | covered |
| **SC-018** — the FR-062 pre-mount body validates and files as `pre-mount` | `crash-report-schemas.test.ts::pre-mount body` · `api/report/crash.test.ts::accepts a pre-mount body` | covered |
| **SC-019** — V8 and Firefox/Safari stacks converge on one fingerprint | `crash-report-pipeline.test.ts::raw-stack extraction — FR-081f worked example` | covered |
| **SC-020** — a post-mount body with no frames is rejected 400 | `crash-report-schemas.test.ts::post-mount conditional validation` (all three kinds) | covered |

## Not discharged by the automated suite

Two things in this table are gates rather than assertions, and one class of verification is
deliberately absent:

- **SC-009 and SC-010 are discharged by lint/gate runs, not by a test file.** They are green as of
  this walk. A future change that breaks them fails CI rather than a named test.
- **SC-016's row previously said "covered" against a stub that could not fail.** Worth recording,
  because it is the failure mode this whole document exists to catch and it got past it: the cap-probe
  stub ignored `per_page` and returned a 200-element page, so the criterion passed while the cap it
  described was unreachable in production (FR-106 / P0-5). The row now names the pagination cases, and
  both they and the reworked SC-016 case were **demonstrated red** — with
  `CRASH_REPORT_CREATE_PROBE_MAX_PAGES` pinned back to 1 — before being trusted green. The same
  demonstration was run for SC-012a with the signature comparison removed (6 failures across three
  files). An assertion that has never failed is not evidence.
- **No criterion is verified against a live GitHub App.** Every server assertion runs against an
  injected fetch stub. That is by design — Prerequisites 1–5 are dashboard actions that block the
  route's live function, not its implementation — but it does mean the first real filed issue is
  also the first end-to-end proof. [runbook.md](runbook.md) has the four manual checks for that.
- **The two Playwright specs have now been executed, and both found something.** They were authored
  but never run; running them turned up one defect in this feature and one beyond it.

  - `crash-recovery-a11y.spec.ts` — **4/4 pass, after a fix.** It failed first: `.crash-notice` and
    `.crash-recovery` carried class names with no CSS rule behind them, so the notice's Undo button
    and issue link fell back to UA defaults (ButtonFace, default link blue) over the dark app
    background — two serious `color-contrast` violations, WCAG 1.4.3. Fixed in `src/index.css` with
    token-based rules; every pairing clears AA, the button at 9.7:1. The scan also surfaced a
    **pre-existing** violation this feature does not own: the studio's primary green buttons pair
    `#e6edf3` on `#238636` for **3.91:1** against a required 4.5:1, at roughly eight call sites
    (`AccountControl`, `SignUpPanel`, `WelcomeScreen`, `MechanismGallery`, `dashboard/tokens`). The
    notice's scan is now scoped to the notice with that reasoning recorded at the call site; the
    green-button contrast needs a spec-056 palette decision and a tracker row of its own.
  - `crash-engine-chunk-blocked.spec.ts` — **1 expected failure, 1 pass, and the expected failure is
    a real finding.** Both cases were previously vacuous: the route pattern
    `/\/assets\/.*engine.*\.js/i` matched nothing in either lane (the dev server has no `/assets/`
    graph; a production build has no chunk with "engine" in its name, since Rollup names the engine's
    chunk after its entry, `index.js`). Its own vacuous-pass guard caught that. With the pattern
    corrected to what the dev lane serves, blocking is real — and **the studio then renders nothing
    at all**: `#root` stays empty and no report is filed, because `main.tsx` statically imports the
    engine through `lib/services.ts:29-30` and `lib/persistWorkingCopy.ts:54`, so a failed engine
    fetch aborts the entry graph before `installGlobalCrashHandlers()` at that file's top level ever
    runs. The reporter's *code* is engine-free — research D6 and `engine-reachability.test.ts` still
    hold — but its *installation* is not, which is exactly the gap a source-graph walk scoped to
    `src/crash/**` cannot see. Recorded as `test.fail()` so it is asserted in both directions rather
    than deleted or weakened; the fix is a bootstrap-graph change (dynamic-import those two modules),
    owned outside this feature.

  SC-004's row is narrowed accordingly. The criterion as written — a crash **after** `loadEngine()`
  rejected, i.e. with the app already mounted — is still covered by `send.test.ts`. The stronger
  reading, "the engine is unreachable from the start", is **not** satisfied, and the row no longer
  claims a third lane covering it.
