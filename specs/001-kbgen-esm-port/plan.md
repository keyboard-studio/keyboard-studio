# Implementation Plan: kbgen ESM TypeScript port

**Branch**: `km/kbgen-esm-port` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-kbgen-esm-port/spec.md`

## Summary

Port the `utilities/kbgen` placement seeder (12 CommonJS files, ~1,242 LOC) to ESM
TypeScript, mirroring the `packages/engine` package shape (`tsc -b` build,
`tsc --noEmit` typecheck, `vitest run` test). The port is **behaviour-preserving**
and **toolchain-only**: no `@keyboard-studio/contracts` dependency and no
`PlacementMap` type (deferred to #133, blocked by #131). kbgen **stays in
`utilities/`** so it does not enter the `pnpm -r` glob until it conforms (D-INT-1).
The §13 no-compile boundary is preserved — kbgen emits source only.

## Technical Context

**Language/Version**: TypeScript 5.4 (ESM, `"type": "module"`), Node ≥ 20

**Primary Dependencies**: none added; dev-only `typescript ^5.4.5`, `vitest ^2.0.5`, `tsx` for CLI run. Existing vendored Unicode 16 / CLDR 46.1 data (SHA-256 pinned) unchanged.

**Storage**: filesystem — vendored data under `data/`, emits `placement-map.json` + Keyman source files. N/A for DB.

**Testing**: vitest 2.x (`vitest run`), migrating `test/anchors.test.js`.

**Target Platform**: Node CLI (run via `tsx` in dev, compiled `dist/` for build verification).

**Project Type**: standalone CLI tool in `utilities/` — NOT a `packages/*` workspace member (kept out of the `pnpm -r` glob per Article VII boundary discipline / D-INT-1).

**Performance Goals**: N/A — batch CLI; port must not regress the Milestone-1 fixture runtime.

**Constraints**: extends `tsconfig.base.json` (strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); `pnpm -r build/typecheck/test` must stay green; no `.kmn`→`.kmp` compile step (§13).

**Scale/Scope**: 12 source files / ~1,242 LOC + 1 test file; CommonJS idioms to convert — `require()`/`module.exports` throughout, `__dirname` (data paths), `require.main === module` CLI guards.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against [.specify/memory/constitution.md](../../.specify/memory/constitution.md):

| Article | Applies? | Verdict |
|---|---|---|
| **I. Pattern schema locked** | **Yes — by exclusion** | PASS. FR-009 forbids touching `@keyboard-studio/contracts` or adding `PlacementMap`. No schema surface is touched. The constitution's "stop and escalate if a plan edits the schema" clause does not fire. |
| **II. KeyboardIR is the spine** | No | N/A. kbgen does not parse/emit `.kmn` via the codec; it is an upstream seeder. The port adds no IR coupling. |
| **III. Single working copy** | No | N/A. No studio working-copy interaction. |
| **IV. Validator layering / 300ms debounce** | No | N/A. No validator or studio debounce code touched. |
| **V. VirtualFS only during authoring** | No | N/A. kbgen is a build-time CLI, not studio authoring; writing `placement-map.json` to disk from a CLI is outside the authoring path. |
| **VI. Team boundaries (§12/§13)** | **Yes** | PASS. Owner = **Engine team** (toolchain/code per D-INT-4). The port touches only `analyze.js`/`place.js`/`emit.js`/`cli.js` etc. — engine territory. Content-owned `data/supplement.json` is **not** modified. |
| **VII. Out of scope (§16)** | **Yes** | PASS. No CJK/Ethiopic, LDML, mobile, etc. The §13 **no-compile boundary** is the live constraint: FR-006 + SC-005 forbid any compile step; compilation stays with WASM `kmcmplib`. |
| **VIII. House conventions** | **Yes** | PASS (binding on implementation): no emoji in CLI output, markdown links in docs, no GitHub issue numbers in shipped code, `<prefix>(<area>): <desc>` commits (`chore(tools)` / `refactor(tools)`). |

**Governance note (Article IX):** This feature changes no spec text and reopens no
decision; it *implements* the toolchain item the D-INT-1 cycle already separated
from contract conformance. No joint session required.

**Gate result: PASS — no violations. Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/001-kbgen-esm-port/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── cli.md           # kbgen CLI contract (the tool's external interface)
└── checklists/
    └── requirements.md  # spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

kbgen stays in place; files convert `.js` → `.ts` 1:1, plus new build config.

```text
utilities/kbgen/
├── package.json              # → "type": "module"; add build/typecheck/test scripts; bin → dist/cli.js
├── tsconfig.json             # NEW — extends ../../tsconfig.base.json, outDir dist/
├── vitest.config.ts          # NEW — resolves the migrated test
├── cli.ts                    # ← cli.js   (require.main guard → import.meta CLI guard)
├── analyze.ts                # ← analyze.js
├── place.ts                  # ← place.js
├── emit.ts                   # ← emit.js
├── map.ts                    # ← map.js
├── layout.ts                 # ← layout.js
├── fetch-data.ts             # ← fetch-data.js (__dirname → import.meta.url)
├── corpus-diff.ts            # ← corpus-diff.js
├── sources/
│   ├── cldr.ts  ucd.ts  confusables.ts
├── data/                     # UNCHANGED (vendored, SHA-256 pinned) — incl. content-owned supplement.json
└── test/
    └── anchors.test.ts       # ← anchors.test.js, migrated to vitest
```

**Structure Decision**: kbgen remains a standalone tool under `utilities/` (NOT
`packages/*`). It is excluded from `pnpm-workspace.yaml`'s package glob, so the TS
port does **not** make `pnpm -r` typecheck it against contracts it does not yet
satisfy. Returning it to `packages/*` is deferred until #133 lands `PlacementMap`
(D-INT-1). Build/typecheck/test are invoked directly (`pnpm --dir utilities/kbgen ...`
or via `tsx`), not through the recursive runner.

## Complexity Tracking

> Not required — Constitution Check passed with no violations.
