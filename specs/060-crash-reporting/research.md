# Phase 0 Research: Crash reporting

Decisions the spec left to planning, plus two findings that correct the spec's own assumptions about
existing project infrastructure. Each entry is Decision / Rationale / Alternatives considered.

Cycle-1 probe material lives separately at [research/cycle1-reports.md](research/cycle1-reports.md);
this document records only what was decided *after* the spec was frozen.

---

## D1 — The crash module gets its own top-level directory, `packages/studio/src/crash/`

**Decision.** All crash-capture code (fingerprint, redaction, breadcrumbs, stale-chunk gate, send,
build version, types) lives in one new directory, `packages/studio/src/crash/`, not under
`src/lib/`.

**Rationale.** FR-013's gate must walk "the crash module's reachable import graph." A dedicated
directory makes that expressible as *every file in this directory is an entry point* — a definition
that stays correct as files are added. Scattering the same code through `src/lib/` (which holds ~40
unrelated modules, several of which do value-import the engine) would force the gate to hardcode a
hand-maintained file list, and a list is exactly the thing that silently goes stale when someone adds
`src/lib/crashSomething.ts` next year. The directory boundary is also what makes the constraint
reviewable: a reviewer can see at a glance that a new import into `src/crash/` is load-bearing.

**Alternatives considered.** `src/lib/crash*.ts` — rejected for the staleness reason above. A
separate workspace package (`@keyboard-studio/crash`) — rejected: it would be a workspace value-import
from the studio bundle, adds a build step to the one code path that must not depend on a build
succeeding, and buys nothing the directory boundary doesn't.

---

## D2 — The import-graph gate is a new walker, not a reuse of `api/bundle-safety.test.ts`

**Decision.** `packages/studio/src/crash/engine-reachability.test.ts` is a new test file that
re-implements the walking approach rather than importing anything from `api/bundle-safety.test.ts`.
It differs from that walker in three ways it must handle: it resolves `.tsx` as well as `.ts`; it
must follow relative imports *transitively into the rest of `src/`* (the whole point is catching an
edge into `decisionLogStore.ts`, which lives outside `src/crash/`); and it asserts on the specifier
`@keyboard-studio/engine` specifically rather than the whole `@keyboard-studio/*` scope.

**Rationale.** The two tests answer different questions against different resolution rules. The api
walker asks "does this function bundle value-import any workspace package"; ours asks "does this
studio directory transitively reach one specific package." Sharing the code would mean parameterizing
a test helper across two vitest projects that do not share a config (`/api` is outside `pnpm -r` and
runs in its own CI step), for two assertions that are one regex apart.

Importantly, `@keyboard-studio/contracts` is **not** a violation for the studio-side gate — it is
type-only in practice for this module, and the studio bundle already depends on it everywhere. Only
`@keyboard-studio/engine` is forbidden, because only the engine is the lazily-imported chunk whose
failure the reporter must survive.

**Alternatives considered.** Extending `api/bundle-safety.test.ts` with a second `describe` —
rejected by FR-132 explicitly, and it would put a studio-workspace assertion in a suite that runs
outside the workspace. An ESLint `no-restricted-imports` rule scoped to `src/crash/` — rejected as
*insufficient alone*: ESLint sees direct imports only, not the transitive edge through
`decisionLogStore.ts` that E-4 identified as the actual hazard. Worth adding later as a fast
first-line signal, but it cannot be the gate.

---

## D3 — The accessibility assertion splits across two lanes; `expectNoSeriousAxeViolations` does not exist in vitest

**Decision.** FR-124 / SC-008 are satisfied by **two** tests in two lanes, not one:

- **Playwright (`packages/studio/e2e/`)** — the automated axe scan of the recovery screen and the
  notice. This is the only lane where an axe scan is possible.
- **vitest + Testing Library** — the structural assertions: `role="alert"` present, focus lands on the
  recovery heading on mount, the notice carries `aria-live="polite"` and does *not* move focus, and
  every interactive control is a real button/link.

**Rationale.** This corrects an assumption embedded in the spec's wording. FR-124 names
`expectNoSeriousAxeViolations` "or equivalent" as though it were an existing shared helper; it is
not. A repo-wide search finds that identifier only inside `specs/**` prose — never in code. The sole
axe dependency in the repository is `@axe-core/playwright`, and
`packages/studio/src/components/StudioFooter.a11y.test.tsx` states the constraint outright in its
header: the axe scan half is E2E-only because "this package's jsdom/vitest lane has no axe
integration." A task written as "add an axe scan to the recovery screen's vitest test" would be
unimplementable as specified.

The "or equivalent" escape hatch in FR-124 is what makes this a planning decision rather than a spec
amendment — but the split must be explicit in the tasks, or the a11y requirement gets silently
half-satisfied by whichever lane the implementer reaches for first.

**Alternatives considered.** Adding `jest-axe` / `@axe-core/react` to the studio's vitest lane —
rejected: a new dev dependency and a new scanning lane is its own change, disproportionate to this
feature, and it would create a second, differently-configured axe surface competing with the
Playwright one. Dropping the scan and keeping only structural assertions — rejected: SC-008 asks for
zero new serious/critical violations, which structural assertions cannot establish.

---

## D4 — The new token minter owns its own module-scope cache and its own test reset

**Decision.** `crash-report-installation-token.ts` copies `installation-token.ts`'s structure
including its module-level `_auth` singleton and `_resetAuthCache()` test seam, as **independent
module state** — two separate `createAppAuth` instances live in one process, one per App.

**Rationale.** FR-085 forbids sharing the minter, and the module-scope cache is the reason that
matters mechanically rather than only conceptually: `installation-token.ts` memoizes its `createAppAuth`
instance in a module-level `let _auth`, keyed to nothing. A shared minter would hand whichever App's
credentials loaded first to both pipelines. Two modules, two caches, two `_reset*` functions is the
only shape that keeps the credentials genuinely independent. The duplication is ~60 lines of
env-read-and-decode and is the intended cost of the P0-2 separation.

**Alternatives considered.** Parameterizing `getInstallationToken(appVars)` and calling it from both
— rejected: it re-couples the two Apps through one module and one cache map, which is exactly what
P0-2 exists to prevent, and it would edit a module the managed-PR path depends on for no benefit to
that path.

---

## D5 — Build identity is a Vite `define`, and `packages/studio/vite.config.ts` has no `define` block to extend

**Decision.** Add a `define: { __KS_COMMIT_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? "dev") }`
block to `packages/studio/vite.config.ts`, declare `__KS_COMMIT_SHA__` ambiently in
`packages/studio/src/vite-env.d.ts`, and compose `appVersion` as `<pkg.version>+<sha7>` in
`src/crash/buildVersion.ts`.

**Rationale.** A `define` is textually substituted at build time, so the value is present in the
emitted bundle before any module executes — which is what FR-114 requires for the pre-mount path.
`import.meta.env` would also be inlined by Vite, but reaching it through an env-reading helper module
(the pattern `src/lib/envFlag.ts` establishes for the studio's other flags) reintroduces a module load
on the one path that cannot assume module loads succeeded. Confirmed against the file: `vite.config.ts`
currently has `plugins`, `resolve`, `optimizeDeps`, and `server` keys and no `define`, so this is a new
block rather than an edit to an existing one.

**Alternatives considered.** Reading `VERCEL_GIT_COMMIT_SHA` at runtime — impossible in the browser.
A generated `version.ts` written by a prebuild script — rejected: `prebuild` already codegens several
artifacts and adding a per-deploy one couples the build id to a step that a local `vite build` can
skip, whereas `define` is evaluated on every build by construction.

---

## D6 — The send result reaches the UI through a module-scope subscribable, not React state

**Decision.** `src/crash/send.ts` owns a tiny module-scope store — current send status plus
`{ issueUrl, issueNumber, action }` once resolved — with a subscribe/getSnapshot pair consumed by
`CrashRecoveryScreen` and `CrashNotice` via `useSyncExternalStore`.

**Rationale.** The three capture surfaces are structurally different — one is a React render throw
(the boundary is already rendering its fallback), two are window-level handlers that fire outside any
React tree. They must converge on one notice, and the POST resolves *after* the fallback has already
rendered. A module-scope subscribable is the only shape that serves all three without the crash
module importing React or a zustand store — and it must not be a zustand store, because
`src/stores/*` is where the engine-importing modules live and the FR-012 boundary runs through that
directory. This is the same "plumbing, not React state" category FR-043 already puts the breadcrumb
ring in.

**Alternatives considered.** Passing the send promise into the boundary's state — rejected: the
window-level handlers have no boundary to pass it to. A zustand store under `src/stores/` — rejected
for the import-graph reason above.

---

## D7 — Canonicalization is one pure server function with two input adapters

**Decision.** `crash-report-pipeline.ts` exports one `canonicalizeCrashInput({ kind, message, frames })`
pure function plus a `framesFromRawStack(stack)` adapter (FR-081f). The structured path
(`stackFrames[]`) and the raw-`stack` path both normalize to the same `{ function, modulePath, line,
column }[]` shape *before* canonicalization runs, so there is exactly one canonicalization code path.

**Rationale.** FR-081a says the two paths must "converge on the same canonical shape before hashing,"
and SC-019 asserts a V8-shaped and a Firefox/Safari-shaped raw stack for the same error produce an
identical fingerprint. One function with one input type is the only structure where that convergence
is true by construction rather than by two implementations agreeing. It also satisfies FR-081e's
pure-function requirement directly: no I/O, no headers, no repository state, so it unit-tests against
the FR-081d and FR-081f worked examples with no GitHub stub at all.

**Alternatives considered.** Separate `canonicalizeStructured` / `canonicalizeRaw` functions —
rejected: two implementations of the same three-step algorithm is precisely how the two paths drift
apart, and SC-019 exists because that drift forks one bug into two issues.

---

## D8 — The client-local fingerprint reuses the server's algorithm by specification, not by shared code

**Decision.** `src/crash/fingerprint.ts` implements the FR-081a algorithm independently of
`crash-report-pipeline.ts`. Both are pinned to the FR-081d worked example by their own conformance
test, asserting the identical canonicalized string.

**Rationale.** There is no sharable home. A shared module would have to be a workspace package, which
the client cannot value-import (FR-010's graph constraint) and the server cannot value-import
(bundle safety, `api/bundle-safety.test.ts`). Both halves are independently forbidden from importing
the same workspace code, which leaves specification-level agreement as the only mechanism — and
FR-022 already establishes that nothing depends on the two agreeing anyway, since the client value is
never transmitted and never trusted. Pinning both to the same worked-example fixture is what keeps
the duplication honest.

**Alternatives considered.** Publishing a shared `@keyboard-studio/crash-fingerprint` package —
rejected for the double bundle-safety block above. Having the client skip local hashing and cache by
raw message — rejected: FR-024 needs two occurrences of the same bug to collide in the session cache,
and raw messages carry varying interpolated values.

---

## D9 — The `vercel.json` rewrite must be inserted above the SPA catch-all

**Decision.** `{ "source": "/report/crash", "destination": "/api/report/crash" }` is inserted into the
`rewrites` array *before* the terminal `{ "source": "/(.*)", "destination": "/index.html" }` entry.

**Rationale.** Vercel evaluates `rewrites` in array order and the last entry matches everything. A
rewrite appended after it is dead configuration, and the failure mode is quiet and confusing: the
crash endpoint would return the SPA's `index.html` with a 200, so the client's fire-and-forget POST
(FR-078, which deliberately surfaces nothing) would report success while filing nothing at all. Worth
recording because "append the new rewrite" is the obvious wrong instinct.

**Alternatives considered.** None — this is a positional fact about the existing file, not a choice.

---

## D10 — Flood-control and window constants live in one module per side

**Decision.** Server constants (`CRASH_REPORT_COMMENT_CAP`, `CRASH_REPORT_COMMENT_COOLDOWN_MS`,
`CRASH_REPORT_REOPEN_COOLDOWN_MS`, `CRASH_REPORT_GLOBAL_CREATE_WINDOW_MS`,
`CRASH_REPORT_GLOBAL_CREATE_CAP`) are exported named constants at the top of
`crash-report-pipeline.ts`. Client constants (`CRASH_REPORT_UNDO_WINDOW_MS`,
`STALE_CHUNK_RELOAD_WINDOW_MS`) are exported from the `src/crash/` module that owns each behaviour.

**Rationale.** FR-055 / FR-103 require named, single-source, adjustable constants. Exporting them
(rather than keeping them module-private) is what lets the tests assert against the constant instead
of re-stating its literal — the difference between SC-013 testing the requirement and SC-013 testing a
hardcoded `30000` that can drift from the value the UI actually uses.

**Alternatives considered.** Environment variables — rejected: FR-105 keeps these code-level, and an
env var for a tuning constant adds a deploy-time failure mode (unset/malformed) that a constant cannot
have. A shared `constants.ts` on each side — rejected as premature for seven values that each have an
obvious owning module.
