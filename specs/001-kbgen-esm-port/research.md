# Phase 0 Research: kbgen ESM TypeScript port

All Technical Context items were resolvable from the codebase + INTEGRATION.md
decisions; no open NEEDS CLARIFICATION remain.

## Decision 1 — Conversion strategy: 1:1 file rename, behaviour-preserving

- **Decision**: Convert each `.js` → `.ts` in place, file-for-file, preserving module
  graph and runtime behaviour. No restructuring, no algorithm changes.
- **Rationale**: The issue is a *toolchain* port; SC-003 requires byte-equivalent
  `placement-map.json` for the Milestone-1 fixture. Minimising structural change keeps
  the behaviour-preservation oracle meaningful and the diff reviewable.
- **Alternatives rejected**: "Port + refactor to contracts types" — that is #133's job
  (D-INT-1), blocked by #131; bundling it here would break FR-009 and the oracle.

## Decision 2 — CommonJS → ESM idiom translation

- **Decision**: `require()`/`module.exports` → `import`/`export`; `__dirname` →
  `path.dirname(fileURLToPath(import.meta.url))`; `require.main === module` CLI guard →
  `if (import.meta.url === pathToFileURL(process.argv[1]).href)`. JSON/data loads use
  `fs.readFile` against `import.meta.url`-derived paths (data stays external, not imported).
- **Rationale**: These are the only CommonJS-specific constructs present (grep: every
  source file uses `require`; `__dirname`/`require.main` in `cli.ts`/`fetch-data.ts`).
  `verbatimModuleSyntax` in the base config forbids elided imports, so `import type` is
  used for type-only imports.
- **Alternatives rejected**: `createRequire(import.meta.url)` shim — keeps CommonJS
  semantics alive and would fail the "no remaining `require()`" of FR-001.

## Decision 3 — Build/test wiring mirrors packages/engine, but stays out of the workspace glob

- **Decision**: `package.json` gets `"type": "module"`, `build: tsc -b`,
  `typecheck: tsc --noEmit`, `test: vitest run`, `bin: dist/cli.js`; add a `tsconfig.json`
  extending `../../tsconfig.base.json` and a `vitest.config.ts`. kbgen is **not** added to
  `pnpm-workspace.yaml`.
- **Rationale**: Mirrors the engine shape (FR-002) so a developer uses familiar commands,
  while honoring D-INT-1: a non-conformant tool must not re-enter `pnpm -r` (FR-008). Run
  via `pnpm --dir utilities/kbgen <script>` or `tsx`.
- **Alternatives rejected**: Add to the workspace glob now — would force contracts
  conformance prematurely and risk `pnpm -r typecheck` red.

## Decision 4 — Test migration: node assert → vitest

- **Decision**: Rewrite `test/anchors.test.js`'s assertions as vitest `describe/it/expect`,
  preserving every existing anchor-cascade assertion (SC-002). Remove the `node test/...`
  script.
- **Rationale**: Test-runner consistency (Story 2). vitest 2.x already pinned across the repo.
- **Alternatives rejected**: Keep `node:test` — splits the runner story; not what the issue asks.

## Decision 5 — Final home

- **Decision**: kbgen **stays in `utilities/`** as a built tool for this issue.
- **Rationale**: D-INT-1 separates the toolchain port (#132) from contract conformance
  (#133). Returning to `packages/*` is only safe once `PlacementMap` exists; until then the
  `utilities/` home keeps `pnpm -r` green (FR-007/FR-008). Documented in INTEGRATION.md +
  CLAUDE.md.
- **Alternatives rejected**: Move to `packages/kbgen` now (premature per above).

## Risks

- **Strict-mode surfacing**: `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` will
  flag latent unsafe indexing in the ~1.2k LOC. Mitigation: fix with guards/narrowing, not
  `any`; this is expected porting work, not scope creep.
- **Data-path resolution**: `__dirname`-relative reads of vendored data must resolve
  identically post-port. Mitigation: the Milestone-1 fixture oracle (SC-003) catches any
  path regression.
