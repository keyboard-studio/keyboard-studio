# Implementation Plan: surveySessionStore — wizard-traversal state migration

**Branch**: `km/qu-026-survey-session-store` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/026-qu-survey-session-store/spec.md`

**Stage**: 3 of the Unified Survey Architecture refactor. Governing: master plan decisions
**D4** (cross-step state → `surveySessionStore`), **D5** (back-nav walked-history stack),
Stage 3; and [docs/adr/0001-flow-map-derived-from-one-source.md](../../docs/adr/0001-flow-map-derived-from-one-source.md)
(one source of truth per concern).

## Summary

Extract the survey wizard's **traversal** state out of the survey component (embedded in
`packages/studio/src/StudioShell.tsx`) into a new zustand store,
`packages/studio/src/stores/surveySessionStore.ts`, mirroring the `workingCopyStore`
pattern. Replace per-handler back branching with a walked-history stack (`popHistory`), and
delete the `selectedTrackRef` mirroring dance (the memoised `onInstantiate` reads the store
via `getState()`). **Pure internal refactor — zero render change**; the parity proof is that
the existing traversal oracle tests (`StudioShell.test.tsx`, `trackRouting.test.ts`,
`prefillRouting.test.ts`) pass unmodified.

## Technical Context

**Language/Version**: TypeScript 5.x (studio package), React 18, Vite.
**Primary Dependencies**: `zustand@^5` (already a direct dep of `@keyboard-studio/studio`);
`@keyboard-studio/contracts` (types: `BaseKeyboard`).
**Storage**: In-memory client state only (zustand store). No persistence, no disk, no VFS.
**Testing**: vitest (`pnpm --filter @keyboard-studio/studio test`); the RTL traversal
oracles are the parity gate.
**Target Platform**: Browser SPA.
**Project Type**: Web SPA (studio front-end). SPA-internal change; engine team owns the SPA.
**Performance Goals**: N/A (state-shape change; no perf-sensitive path added).
**Constraints**: Zero user-visible render/behavior change; depcruise clean; the three
traversal oracles pass **unmodified**.
**Scale/Scope**: One new store (~120 LOC), one new test file, edits confined to
`StudioShell.tsx` + one type-relocation. No component-tree change.

## Constitution Check

*GATE: passed. Re-checked post-design — still passing.*

| Article | Verdict | Rationale |
|---------|---------|-----------|
| I. Pattern schema locked | **N/A / PASS** | No `contracts` change. `Step` is studio-local; the store holds studio types only. No schema edit. |
| II. KeyboardIR spine | **PASS** | Untouched. No codec/parse/emit path involved. |
| III. Single working-copy spine | **PASS** | `workingCopyStore` untouched. Identity still ALSO flows into it via `setIdentity` (unchanged). The session store holds *traversal* state, a distinct lifecycle (start-over vs rebase) — D4 explicitly separates the two. |
| IV. Validator layering / one debounce | **PASS** | `useValidator` single call site and the 300 ms debounce (D3) are untouched — they stay in the component. |
| V. VirtualFS only during authoring | **PASS** | No FS or disk writes; store is in-memory client state. |
| VI. Team boundaries | **PASS** | Engine team owns the SPA; this is entirely SPA-internal (`packages/studio/src`). No content-owned surface touched. |
| VII. Out of scope for v1 | **PASS** | Nothing on the §16 list is implemented. |
| VIII. House conventions | **PASS** | Commit style `refactor(studio): …`; no emoji; markdown-link file refs; no issue numbers in code. |

**No violations → Complexity Tracking table omitted.**

## Project Structure

### Documentation (this feature)

```text
specs/026-qu-survey-session-store/
├── spec.md              # Feature spec
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (type relocation, history semantics, depcruise)
├── data-model.md        # Phase 1 — store state shape + action semantics
├── quickstart.md        # Phase 1 — how to validate (gate commands + parity proof)
├── contracts/
│   └── surveySessionStore.api.md   # the store's public API contract
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks
```

### Source Code (repository root)

```text
packages/studio/src/
├── stores/
│   ├── surveySessionStore.ts        # NEW — the store (D4 shape + advance/popHistory/reset)
│   ├── surveySessionStore.test.ts   # NEW — history semantics, reset, double-advance
│   └── workingCopyStore.ts          # PATTERN reference (unchanged)
├── steps/
│   └── types.ts                     # ActiveStepId relocated here (type-only) so the store can import it
└── StudioShell.tsx                  # EDIT — read store; delete selectedTrackRef; popHistory; reset delegation
```

**Structure Decision**: SPA-internal. New code lives in the existing
`packages/studio/src/stores/` directory beside `workingCopyStore.ts`. The one structural
move is relocating the `ActiveStepId` **type** (currently local at `StudioShell.tsx:237`) to
a module the store can import without violating the depcruise store-import boundary
(candidate: `steps/types.ts`, the manifest step-contract home). Logic is not moved — only
the type declaration; `StudioShell.tsx` re-imports it.

## Complexity Tracking

No Constitution violations — section intentionally empty.
