# SC-001 – SC-020: which test discharges each

Walked at the close of implementation (T058). A passing suite is not evidence a criterion is
covered — this table names the specific test for each one, and says so plainly where nothing does.

| SC | Discharged by | State |
|---|---|---|
| **SC-001** — every render / onerror / rejection capture files or comments exactly once | `api/report/crash.test.ts` (create path, 200 shape) · `utilities/oauth-backend/src/crash-report-dedupe.test.ts` (open match → comment, no create) · `packages/studio/src/crash/send.test.ts` (one POST per capture) | covered |
| **SC-002** — 100 repeats create zero extra issues | `crash-report-dedupe.test.ts::open match › 100 repeats create zero extra issues` | covered |
| **SC-003** — stale chunk reloads and files nothing; a recurrence files once | `packages/studio/src/crash/staleChunk.test.ts::one-shot reload gate` (all six cases) | covered |
| **SC-004** — a crash after `loadEngine()` failed is still captured and filed | `packages/studio/src/crash/send.test.ts::reporting an engine-surface load failure` (behavioural) · `engine-reachability.test.ts` (static) · `e2e/crash-engine-chunk-blocked.spec.ts` (real chunk graph) | covered, three ways |
| **SC-005** — a fully-identified author's report reveals nothing about them | `packages/studio/src/crash/redact.test.ts::identity absence` — asserts value absence from the serialized payload, not merely that the builder ran | covered |
| **SC-006** — ≤1 extra POST across 100 in-session repeats; ≤N across 25 sessions | `send.test.ts::session dedupe cache › POSTs once for two occurrences` (client half) · `crash-report-dedupe.test.ts::100 repeats create zero extra issues` (cross-session half) | covered |
| **SC-007** — pre-mount fallback renders, POST attempted, no second exception | `packages/studio/src/crash/preMount.test.ts` (12 cases, incl. every failure mode of the POST) | covered |
| **SC-008** — recovery-screen a11y; notice never steals focus | `CrashRecoveryScreen.a11y.test.tsx` (structural, jsdom) · `e2e/crash-recovery-a11y.spec.ts` (axe, Playwright) | covered, both lanes |
| **SC-009** — every new string resolves through the catalog; i18n gates pass | `pnpm lint` → `i18n-catalog-lint` and `content-i18n-lint`, both green with the six new `crash.*` ids | covered by gate |
| **SC-010** — crew-lint, bundle-safety with the new entry, engine-reachability all pass | `pnpm crew-lint` (7/7) · `api/bundle-safety.test.ts` (both crash entries) · `engine-reachability.test.ts` | covered by gate |
| **SC-011** — no report ever carries an empty build identifier | `redact.test.ts::always carries a non-empty appVersion` · `preMount.test.ts::carries a non-empty build identifier` — the pre-mount path is the one that could plausibly omit it | covered |
| **SC-012** — retraction closes or removes a comment, never deletes | `crash-report-dedupe.test.ts::retraction` (7 cases, incl. "never deletes the ISSUE") | covered |
| **SC-013** — Undo present for exactly the window, absent after | `CrashNotice.test.tsx::Undo window` — both edges, fake timers | covered |
| **SC-014** — a forged fingerprint cannot redirect a report | `crash-report-pipeline.test.ts::ignores a forged fingerprint-shaped extra field` · `api/report/crash.test.ts::ignores a client-supplied fingerprint` · FR-081d worked example pinned exactly | covered |
| **SC-015** — the ORIGINAL rejection reaches the classifier | `staleChunk.test.ts::loadEngine rejection forwarding` — including the negative case, that the synthetic string alone does not match | covered |
| **SC-016** — 50 distinct fingerprints at the global cap create nothing | `crash-report-dedupe.test.ts::bursts › 50 distinct fingerprints at the global cap create nothing` | covered |
| **SC-017** — 50 requests against a closed issue reopen exactly once | `crash-report-dedupe.test.ts::bursts › 50 requests against a closed issue reopen it exactly once` | covered |
| **SC-018** — the FR-062 pre-mount body validates and files as `pre-mount` | `crash-report-schemas.test.ts::pre-mount body` · `api/report/crash.test.ts::accepts a pre-mount body` | covered |
| **SC-019** — V8 and Firefox/Safari stacks converge on one fingerprint | `crash-report-pipeline.test.ts::raw-stack extraction — FR-081f worked example` | covered |
| **SC-020** — a post-mount body with no frames is rejected 400 | `crash-report-schemas.test.ts::post-mount conditional validation` (all three kinds) | covered |

## Not discharged by the automated suite

Two things in this table are gates rather than assertions, and one class of verification is
deliberately absent:

- **SC-009 and SC-010 are discharged by lint/gate runs, not by a test file.** They are green as of
  this walk. A future change that breaks them fails CI rather than a named test.
- **No criterion is verified against a live GitHub App.** Every server assertion runs against an
  injected fetch stub. That is by design — Prerequisites 1–5 are dashboard actions that block the
  route's live function, not its implementation — but it does mean the first real filed issue is
  also the first end-to-end proof. [runbook.md](runbook.md) has the four manual checks for that.
- **The two Playwright specs (`crash-recovery-a11y`, `crash-engine-chunk-blocked`) were authored but
  not executed in this session**, which ran the vitest lanes only. They are written against the
  established `helpers/axe` pattern and the existing `?e2e=1` hook, but "written" is not "seen
  green" — the same standard applied to the FR-013 gate, which *was* demonstrated red and then
  green. Run them before merge.
