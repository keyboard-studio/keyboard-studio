# Implementation Plan: CharactersStep — self-contained characters step; `charactersSub` dies

**Branch**: `km/qu-027-characters-step` (stacked on `km/qu-026-survey-session-store`) | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-qu-characters-step/spec.md`

**Stage**: 4 of the Unified Survey Architecture refactor. Governing: master plan decision
**D3** (characters step = self-contained `CharactersStep` component, option 2); and
[docs/adr/0001-flow-map-derived-from-one-source.md](../../docs/adr/0001-flow-map-derived-from-one-source.md)
(one source of truth per concern — substage and findings read from the store, not threaded).

## Summary

Introduce `packages/studio/src/survey/CharactersStep.tsx` — an `EditorStepProps` component
that hosts the characters step's `prefill → PhaseB` substage internally, mounting the **same**
`Prefill` and `PhaseB` components in the **same order** as today. Point the manifest
`charactersStep.component` at it (its **first runtime use of `step.component`**), and delete
the survey component's `charactersSub` `useState` plus its five substage handlers. The
substage persists in a new dedicated `charactersSubStage` slot on `surveySessionStore` (spec
026) so back-from-carve re-enters at PhaseB across the remount a history pop causes.
`findingsByQuestionId` is derived inside the component from the `validatorFindings` store
bridge. **Hard parity: zero user-visible screen change** — same components, same order, both
tracks.

## Technical Context

**Language/Version**: TypeScript 5.x (studio package), React 18, Vite.
**Primary Dependencies**: `zustand@^5` (existing dep); `@keyboard-studio/contracts`
(`SurveyPhaseResult`, `BaseKeyboard`, `IdentityLiteResult`); existing studio modules
`survey/Prefill`, `survey/PhaseB`, `survey/SurveyRunner`, `survey/loadModularFlow`,
`stores/surveySessionStore` (026), `stores/workingCopyStore`, `lint/lintToQuestion`
(`buildFindingsByQuestionId`), `steps/types` (`EditorStepProps`).
**Storage**: In-memory client state only (zustand). No persistence, disk, or VFS.
**Testing**: vitest + RTL (`pnpm --filter @keyboard-studio/studio test`); the copy/adapt
screen-sequence walk and the carve-back re-entry test are the parity gate.
**Target Platform**: Browser SPA.
**Project Type**: Web SPA (studio front-end); engine team owns the SPA.
**Performance Goals**: N/A (component extraction; no perf-sensitive path added).
**Constraints**: Zero user-visible screen change; depcruise clean; the `pb_*` mirrored
question tests + spec-026 traversal oracles pass; the drift-guardrail bijection node set is
unmodified.
**Scale/Scope**: One new component (~120 LOC) + its test, one additive store slot + setter,
edits confined to `StudioShell.tsx` (deletions + one mount) and `steps/manifest.ts` (one
component swap). No component-tree change beyond routing the characters step through its
manifest `component`.

## Constitution Check

*GATE: passed. Re-checked post-design — still passing.*

| Article | Verdict | Rationale |
|---------|---------|-----------|
| I. Pattern schema locked | **N/A / PASS** | No `contracts` change. `Step`/`EditorStepProps` are studio-local; the store slot holds a studio string union. |
| II. KeyboardIR spine | **PASS** | Untouched. `charactersStep.writes:[header.bcp47]` and the DEC-D1 subsumption are unchanged; no codec/parse/emit path involved. |
| III. Single working-copy spine | **PASS** | `workingCopyStore` untouched (only *read* for `validatorFindings`). The completion path (`recordPhase`/`applyStepCompletion`/`routeAnswersThroughMutate`) is byte-for-byte the same, just invoked from the `onComplete` the host passes down. One working copy, serialized only at output. |
| IV. Validator layering / one debounce | **PASS** | `useValidator` single call site + 300 ms debounce (D3) stay in the component. `CharactersStep` only *reads* `validatorFindings` from the store bridge; it adds no timer or validation path. |
| V. VirtualFS only during authoring | **PASS** | No FS/disk writes; in-memory state only. |
| VI. Team boundaries | **PASS** | Engine team owns the SPA; change is entirely SPA-internal (`packages/studio/src`). `pb_*` question membership / survey text (content-owned) untouched. |
| VII. Out of scope for v1 | **PASS** | Nothing on the §16 list. Also out of scope for this *stage*: `StepHost`, `steps/advance.ts`, `FlowStepHost`, a `PhaseF` adapter. |
| VIII. House conventions | **PASS** | Commit style `feat(studio): …` / `refactor(studio): …`; no emoji; markdown-link refs; no issue numbers in code. |

**No violations → Complexity Tracking table omitted.**

## Project Structure

### Documentation (this feature)

```text
specs/027-qu-characters-step/
├── spec.md              # Feature spec
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (substage slot shape, findings derivation, re-entry, depcruise)
├── data-model.md        # Phase 1 — charactersSubStage slot + CharactersStep internal state machine
├── quickstart.md        # Phase 1 — how to validate (gate commands + parity proof)
├── contracts/
│   └── CharactersStep.contract.md   # component prop/behaviour contract + store-slot API delta
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks
```

### Source Code (repository root)

```text
packages/studio/src/
├── survey/
│   ├── CharactersStep.tsx          # NEW — hosts prefill → PhaseB; EditorStepProps; reads store; derives findings
│   ├── CharactersStep.test.tsx     # NEW — substage machine, onComplete/onBack, carve-back re-entry at B
│   ├── Prefill.tsx                 # REUSED unchanged
│   └── PhaseB (question battery)   # REUSED unchanged
├── stores/
│   └── surveySessionStore.ts       # EDIT (additive) — charactersSubStage slot + setter; reset() clears it
├── steps/
│   ├── manifest.ts                 # EDIT — charactersStep.component: () => null  →  CharactersStep
│   └── types.ts                    # EditorStepProps (reused); CharactersSubStage type may relocate here
└── StudioShell.tsx                 # EDIT — delete charactersSub + 5 handlers; mount step.component; drop findings thread for characters
```

**Structure Decision**: SPA-internal. The new component lives beside its siblings in
`packages/studio/src/survey/`. The one type consideration mirrors spec 026's approach: the
`CharactersSubStage` union (today local at `StudioShell.tsx:237`) moves to a module both the
store and the component can import without a depcruise violation — candidate `steps/types.ts`
(or co-located with the store). Logic is not moved; only the substage state relocates from a
component `useState` to a store slot.

## Complexity Tracking

No Constitution violations — section intentionally empty.
