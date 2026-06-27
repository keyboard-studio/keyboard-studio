# Implementation Plan: IRPath + declared `inputs`/`writes` + folder-per-question opt-in

**Branch**: `claude/survey-modularity-cyoa-plan-pcpg9a` | **Date**: 2026-06-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-irpath-inputs-writes/spec.md`

**Governing source**: P2 of [docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) (§3.3, §3.8, §6 P2); contract versioning per spec §18 (joint engine+content session, 2026-06-26) and Constitution Article I.

## Summary

Introduce `IRPath` — a net-new typed path algebra over the nested `KeyboardIR`
union — and extend the studio `QuestionModule` contract with optional
`inputs?: IRPath[]` / `writes?: IRPath[]` static-data declarations, populated
across all 93 question modules. `inputs` and `writes` share **one** `IRPath`
address space so an orphan-input lint is well-defined. An invalid path is a
**compile error** (Design AC) and a `writes` path absent from `keyboard-ir.ts`
fails typecheck (Drift AC). The handful of modules with companion artifacts
graduate to the `<id>/index.ts` + `extras/` folder form (registry still resolves
by `definition.id`). `mutate()` stays a documented stub (P5, gated on #5b/#232).
The `IRPath`/`inputs`/`writes` data shape is locked and exported as a named
contract so the P0 dashboard spec consumes it directly.

**Technical approach** (from Phase 0 research): realize `IRPath` as a
**derived typed key-path** over `KeyboardIR` (recursive conditional types over
the real interface tree, bounded at the touch `keys[]` level), so validity and
drift are enforced by the type system with no codegen. Coverage, orphan-input,
and write-surface checks are CI gates; per-question tests move to a mirrored tree.

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode, Bundler module resolution with **explicit `.ts`/`.tsx` import extensions** (e.g. `import … from "../types.ts"`). Node ≥ 20, pnpm 9 workspace.

**Primary Dependencies**: `@keyboard-studio/contracts` (canonical types + zod mirror in `schemas.ts` with compile-time drift guards), `@keyboard-studio/studio` (survey question modules + registry). No new runtime dependencies expected; `IRPath` is a type-level addition plus a small runtime helper/builder.

**Storage**: N/A (in-memory types + static module data; no persistence). VirtualFS authoring unchanged.

**Testing**: vitest (per-package `vitest run`). Per-question tests move to the mirrored tree `packages/studio/tests/survey/questions/<phase>/<id>.test.ts`. Type-level tests for `IRPath` (compile-error assertions via `// @ts-expect-error` and `expectTypeOf`-style checks). No Playwright change in P2.

**Target Platform**: Browser SPA (studio) + Node test/build env; contracts is platform-agnostic.

**Project Type**: TypeScript monorepo — a shared contract package (`packages/contracts`) consumed by an app package (`packages/studio`). Not web-service/mobile; closest to "library + app".

**Performance Goals**: No runtime hot-path impact. `validate()` stays <5 ms within the single 300 ms debounce cycle (D3) — `inputs`/`writes` are static data read off-cycle, not evaluated in the debounce. Typecheck/CI cost is the only added budget; keep `IRPath` recursion depth bounded so `tsc -b` does not regress materially.

**Constraints**:
- `mutate()` MUST remain a stub — **no** new IR write path (Constitution Article II).
- MUST NOT edit locked `Pattern` schema fields (Article I); reads `Pattern.strategyId` only.
- Adding `IRPath` + `inputs`/`writes` is a **breaking contract change** → version bump of `@keyboard-studio/contracts` (see research R5 for the pre-1.0 numbering decision).
- Explicit-extension imports must be preserved by any move/rename (folder-per-question becomes `…/<id>/index.ts`).
- The §7.7 typed assignment-map write surface is built incrementally; FR-008's test is a **conditional gate** against the available surface (clarification Q3).

**Scale/Scope**: 93 question modules (Phase A 30 / B 55 / F 8); one new contracts type module + helpers; ~3 CI gates (coverage, orphan-input lint, write-surface test) + the existing missing-mirrored-test check; a handful of folder-form conversions (exact set discovered in Phase 1 / tasks).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| I — Pattern schema locked | No rename/type-change/removal of `Pattern` fields; schema edits escalate to user. | **PASS** — reads `Pattern.strategyId`; does not edit `Pattern`. FR-013 routes any such edit to escalation. |
| II — KeyboardIR is the spine | All mutation operates on the IR; no raw `.kmn`; opaque fragments preserved. | **PASS** — `IRPath` is a typed path *over* `KeyboardIR`; no mutation added; `mutate()` stays a stub. |
| III — Single persistent working copy | No second working copy / intermediate serialization. | **PASS** — no working-copy or serialization change. |
| IV — Validator layering / single 300 ms debounce | No second debounce timer; no parallel validation path. | **PASS** — `inputs`/`writes` are static data; the new checks are CI gates, not debounce-cycle work. |
| V — VirtualFS only during authoring | No host-disk writes during authoring. | **PASS** — no authoring I/O change. |
| VI — Team boundaries | Declare owning team; stay in boundary. | **PASS (joint)** — Engine owns `contracts` `IRPath` + the lint/test gates; Content owns populating `inputs`/`writes` + question layout. The §18 joint engine+content session (2026-06-26) authorizes the cross-team contract change. |
| VII — Out of scope for v1 | No touch-first authoring, no `mutate` execution, etc. | **PASS** — `mutate()` stub only; per-key provenance (§3.6) and `staleness` slice (§3.5) explicitly deferred to P4a/P5. |
| VIII — House conventions | No emoji in console; markdown links in prose; `<prefix>(<area>)` commits; no issue numbers in shipped code. | **PASS** — followed; commit area will be `contracts` / `studio`. |

**Result: PASS — no violations.** Complexity Tracking table omitted (nothing to justify).

## Project Structure

### Documentation (this feature)

```text
specs/010-irpath-inputs-writes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output — the named IRPath/inputs/writes contract
│   └── irpath-contract.md
├── checklists/
│   └── requirements.md   # from /speckit-specify (+ /speckit-clarify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/contracts/src/
├── keyboard-ir.ts            # EXISTING — the KeyboardIR union IRPath is derived from (unchanged shape)
├── ir-path.ts                # NEW — IRPath type (derived key-path) + builder/format helpers
├── ir-path.test.ts           # NEW — type-level (compile-error) + runtime tests for IRPath
├── pattern.ts                # EXISTING — read Pattern.strategyId; NOT edited
├── schemas.ts                # EXISTING — assess whether IRPath needs a zod mirror (research R4)
└── index.ts                  # EXISTING — add IRPath export (the named contract; FR-012)

packages/studio/src/survey/
├── types.ts                  # EDIT — add inputs?/writes?: IRPath[] to QuestionModule (mutate stays stub)
└── questions/
    ├── registry.{a,b,f}.ts   # EXISTING — resolution stays keyed on definition.id
    ├── a/  <id>.ts | <id>/index.ts (+extras/)   # EDIT all 30 — declare inputs/writes; folder opt-in where needed
    ├── b/  <id>.ts | <id>/index.ts (+extras/)   # EDIT all 55
    └── f/  <id>.ts | <id>/index.ts (+extras/)   # EDIT all 8

packages/studio/tests/survey/questions/        # mirror root (sibling of src/)
├── a/ <id>.test.ts                             # MOVE colocated per-question tests here
├── b/ <id>.test.ts
└── f/ <id>.test.ts

packages/studio/  (check/lint locations — exact home decided in tasks)
├── orphan-input lint                # manifest-scoped: inputs ⊆ upstream writes (FR-007)
├── coverage check                   # inputs/writes field PRESENT on every module (FR-006)
├── missing-mirrored-test check      # module without tests/.../<id>.test.ts fails CI (FR-009)
└── write-surface test               # declared writes == Pattern.strategyId surface, §7.7-conditional (FR-008)
```

**Structure Decision**: Reuse the existing monorepo layout. The only **new**
files are in `packages/contracts/src/` (`ir-path.ts` + test, plus an `index.ts`
export) and the mirrored test tree under `packages/studio/tests/`. Everything
else is an in-place edit (`survey/types.ts`, the 93 modules) or a move
(colocated per-question tests → mirror; companion-artifact modules → folder
form). `IRPath` lives in **contracts** (not studio) because it is derived from
`KeyboardIR` and is the exported named contract the P0 dashboard consumes; the
`QuestionModule` field additions live in **studio** but type against the
contracts-exported `IRPath`.

## Complexity Tracking

*No Constitution violations — section intentionally omitted.*
