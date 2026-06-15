# Feature Specification: kbgen ESM TypeScript port

**Feature Branch**: `km/kbgen-esm-port`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "Port utilities/kbgen to ESM TypeScript and wire it into the monorepo workspace (GitHub issue #132, epic #130, blocked by #131 for the emitted placement type)."

> **Governing spec** (per the constitution's hybrid model, this feature cites
> [spec.md](../../spec.md) rather than re-deriving scope):
> - **§8 Phase B** — kbgen is the *placement seeder* that runs ahead of the survey to propose data-driven character placements.
> - **§13 team boundaries / no-compile boundary** — placement + source emission is engine-team territory; kbgen emits source only and delegates compilation to the WASM `kmcmplib` service.
> - **§7.6 placement priors** — the seeder's eventual typed output (`PlacementMap`) is the §7.6 artifact.
> - Decisions **D-INT-1…D-INT-4** (recorded in [utilities/kbgen/INTEGRATION.md](../../utilities/kbgen/INTEGRATION.md), KM-crew cycle 2026-06-15) resolve the contract-type, extraction-architecture, strategy-scope, and ownership questions that this port must respect.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - kbgen builds and typechecks under the workspace toolchain (Priority: P1)

An engine-team developer runs the standard workspace commands (`pnpm build`, `pnpm typecheck`, `pnpm test`) and kbgen participates as a first-class TypeScript tool — compiled from ESM TypeScript sources, typechecked with the shared compiler, with no bespoke `node` invocation required.

**Why this priority**: This is the core of the issue. Until kbgen is ESM TypeScript with workspace-wired scripts, it cannot conform to `@keyboard-studio/contracts` types (the dependency that #133 builds on) and remains a CommonJS island that the toolchain can't verify.

**Independent Test**: Run `pnpm --filter kbgen typecheck` and `pnpm --filter kbgen build` from a clean checkout; both succeed with no errors. Delivers a buildable, typechecked tool even before tests are migrated.

**Acceptance Scenarios**:

1. **Given** a clean checkout, **When** a developer runs the kbgen build script, **Then** ESM TypeScript sources compile to `dist/` with no errors and no CommonJS `require()` remaining.
2. **Given** the ported sources, **When** a developer runs the kbgen typecheck script, **Then** it passes under the repo's shared `tsconfig.base.json`.
3. **Given** kbgen's CLI entry, **When** invoked after build, **Then** it produces the same `placement-map.json` output as the pre-port CommonJS tool for the Milestone-1 Latin-extended/QWERTY fixture (behaviour-preserving port).

---

### User Story 2 - kbgen's tests run under vitest (Priority: P2)

A developer (or CI) runs the project's test command and kbgen's anchor-cascade tests execute under vitest alongside every other package's suite, rather than via a standalone `node test/anchors.test.js`.

**Why this priority**: Test-runner consistency is required for the tool to be trustworthy in the workspace and to gate future changes (#133 contract conformance). It depends on Story 1 (ESM TS) but is independently demonstrable.

**Independent Test**: Run the kbgen test script; the migrated anchor tests pass under vitest and report through the same reporter as other packages.

**Acceptance Scenarios**:

1. **Given** the migrated test file, **When** the kbgen test script runs, **Then** the anchor-cascade assertions pass under vitest.
2. **Given** the legacy `node test/anchors.test.js`, **When** the port is complete, **Then** the legacy runner is removed and no assertion coverage is lost relative to it.

---

### User Story 3 - kbgen's final home is decided and the workspace stays green (Priority: P3)

A maintainer can see, from the tool's documentation and its placement on disk, whether kbgen lives in `utilities/` as a built tool or has returned to `packages/*`, and the decision is consistent with whether it yet conforms to `@keyboard-studio/contracts`. Whichever home is chosen, `pnpm -r build`, `pnpm -r typecheck`, and `pnpm -r test` stay green.

**Why this priority**: This is the third AC checkbox. Per D-INT-1, contract conformance (the `PlacementMap` type) is a *separate* issue (#133); this port should not force kbgen into `packages/*` before that type exists, or it would re-enter the `pnpm -r` glob while still non-conformant.

**Independent Test**: Confirm the chosen home is documented in INTEGRATION.md and CLAUDE.md, and that `pnpm -r build && pnpm -r typecheck && pnpm -r test` is green with kbgen in that location.

**Acceptance Scenarios**:

1. **Given** the home decision, **When** a maintainer reads INTEGRATION.md and CLAUDE.md, **Then** the rationale (conformance state vs `pnpm -r` membership) is stated.
2. **Given** kbgen in its chosen home, **When** `pnpm -r` build/typecheck/test runs, **Then** all three stay green.

---

### Edge Cases

- What happens to constructs the CommonJS sources use that have no clean ESM equivalent (e.g. `__dirname`, dynamic `require`, `require.main === module` CLI guards)? They must be translated to ESM idioms (`import.meta.url`, top-level CLI guard) without behaviour change.
- How does the port handle kbgen's vendored, SHA-256-pinned Unicode/CLDR data files? Data files and their pinning are unchanged by the toolchain port — only code is converted.
- If kbgen returns to `packages/*` before #131/#133 land, the `pnpm -r` glob would typecheck it against contracts it doesn't yet satisfy — the home decision MUST avoid this.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: kbgen MUST be authored in ESM TypeScript (`"type": "module"`), with no remaining CommonJS module syntax (`require`/`module.exports`).
- **FR-002**: kbgen MUST provide `build`, `typecheck`, and `test` scripts that match the shape of [packages/engine/package.json](../../packages/engine/package.json) and run under the workspace toolchain.
- **FR-003**: kbgen MUST include a `tsconfig.json` extending the repo's shared base config, emitting to `dist/`.
- **FR-004**: The existing anchor-cascade coverage in `test/anchors.test.js` MUST be migrated to vitest with no loss of assertions, and the standalone `node` test runner removed.
- **FR-005**: The port MUST be behaviour-preserving — the CLI MUST produce equivalent `placement-map.json` output for the Milestone-1 Latin-extended/QWERTY fixture before and after the port.
- **FR-006**: The port MUST preserve the §13 no-compile boundary — kbgen emits source only and MUST NOT add any `.kmn` → `.kmp` compilation step; compilation stays with the WASM `kmcmplib` service.
- **FR-007**: kbgen's final home MUST be decided and documented (INTEGRATION.md + CLAUDE.md), consistent with D-INT-1's separation of toolchain port (#132) from contract conformance (#133).
- **FR-008**: Whichever home is chosen, `pnpm -r build`, `pnpm -r typecheck`, and `pnpm -r test` MUST remain green.
- **FR-009**: The port MUST NOT introduce the `PlacementMap` contract type or any `@keyboard-studio/contracts` dependency — that is #133's scope (blocked by #131). This issue is the toolchain port only.

### Key Entities *(include if feature involves data)*

- **kbgen package**: the standalone placement-seeder tool — sources (`analyze.js`, `place.js`, `emit.js`, `map.js`, `layout.js`, `cli.js`, `sources/*`), vendored pinned Unicode/CLDR data, and tests.
- **placement-map.json**: kbgen's current ad-hoc output artifact. In scope here only as the behaviour-preservation oracle; its typed successor `PlacementMap` is out of scope (#133).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can build, typecheck, and test kbgen using only standard workspace commands — zero bespoke `node` invocations.
- **SC-002**: 100% of the anchor-cascade assertions present in the legacy `node` test are present and passing under vitest.
- **SC-003**: The Milestone-1 fixture produces byte-equivalent `placement-map.json` before and after the port (behaviour preserved).
- **SC-004**: `pnpm -r build && pnpm -r typecheck && pnpm -r test` is green with kbgen in its decided home.
- **SC-005**: Zero `.kmn`/`.kmp` compilation logic exists in kbgen after the port (no-compile boundary intact).

## Assumptions

- The toolchain port can proceed in parallel with #131 (per the issue): no `@keyboard-studio/contracts` type is required to convert CommonJS → ESM TypeScript.
- Per D-INT-1, the `PlacementMap` contract type is deliberately deferred to #133; this feature stops at the toolchain boundary.
- Per D-INT-3, kbgen stays scoped to S-01 (substitution) + S-08 (RALT layer); the port does not add new strategy coverage.
- Per D-INT-4, ownership of `data/supplement.json` (content team) vs the code (engine team) is settled and unchanged by this port.
- The vendored, SHA-256-pinned Unicode 16 / CLDR 46.1 data files are unchanged by the port.
- The recommended home (default assumption, to be confirmed in planning): kbgen **stays in `utilities/`** as a built tool until #133 lands the contract type, so it does not enter the `pnpm -r` glob while still non-conformant.
