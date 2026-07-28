# Implementation Plan: Suggest the uppercase counterpart when a lowercase cased letter is placed

**Branch**: `051-uppercase-counterpart-suggestion` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/051-uppercase-counterpart-suggestion/spec.md](spec.md)

## Summary

Make the already-shipping physical-key case-pair companion **consistent across all three placement
mechanisms** — physical key, combo/dead-key, and touch — by extracting it into one shared hook plus one
shared banner, and by giving touch placements the layer awareness they currently lack.

The work splits cleanly in two:

1. **Studio (UI).** Lift `pendingCompanion` + its banner out of
   [MechanismGallery.tsx](../../packages/studio/src/editors/assignLoop/MechanismGallery.tsx) into
   `useCasePairCompanion` + `CasePairProposalBanner`, then raise proposals from four apply sites (swap,
   dead key, sequence, touch). `caseCounterpart` stays the sole casing source; the physical confirm
   logic — including the subtle CAPS-quad branch — moves verbatim.

2. **Engine (enabling change).** Both touch appliers hardcode the phone platform's `"default"` layer, so
   "put the capital on the shift layer" is currently **unexpressible**. Add an optional `layer` slot
   value on touch mechanism refs (a new key on an existing `Record<string, string>` — no locked-schema
   change) and generalize `applyTouchAssignments` / `applyTouchAssignmentsToRawJson` to target the named
   layer, defaulting to `"default"` when absent so every existing assignment and fixture is unaffected.

Three spec premises were corrected during research; each is recorded with evidence in
[research.md](research.md) and reflected in the design artifacts:

- **R3** — the case-shifted element of a parallel combo is the **base/content letter**, not the dead-key
  trigger. A shifted accent key would be a broken rule.
- **R5** — the touch defect is mis-described. `K_A` already resolves to the default layer, so lowercase
  `á` is *not* landing on the uppercase key; what is broken is that case is **unrepresentable** in a
  touch placement, so accented **uppercase** letters land on the lowercase layer. The fix (derive the
  layer from the letter's case) satisfies FR-006's intent and fixes the inverse case too.
- **R2** — the combo mechanism is two call sites, not one: S-02 dead key lives in MechanismGallery, S-03
  sequence in SequenceBuilderPanel.

## Technical Context

**Language/Version**: TypeScript 5.x, Node ≥ 22.19.0, pnpm 9

**Primary Dependencies**: React 18 + Vite (studio), Lingui (i18n macros/catalogs),
`@keyboard-studio/contracts` (dependency root), `@keyboard-studio/engine`
(`character-discovery/casePair`, `pattern-apply/shiftRules`, `pattern-apply/applyTouchAssignments*`)

**Storage**: In-memory VirtualFS + the single persistent working copy (Zustand `useWorkingCopyStore`).
No host-disk writes during authoring.

**Testing**: vitest per package (`pnpm --filter <pkg> test`); Playwright E2E under
`packages/studio/e2e/` (not required for this feature — the existing touch walk specs are the
regression net)

**Target Platform**: Browser SPA (studio) + Node-side engine library

**Project Type**: TypeScript monorepo — `packages/studio` (React SPA) + `packages/engine` (library)

**Performance Goals**: No new render or validation cost. The proposal is computed once per Apply
(`caseCounterpart` is a handful of regex tests on one code point), never per keystroke or per render.

**Constraints**: No second debounce timer and no parallel validation path (D3). Touch-layer targeting
must preserve the appliers' purity, structural sharing, and never-throws contract. Absent `layer` must
be byte-identical to today.

**Scale/Scope**: ~4 studio files touched + 2 new studio files; 2 engine appliers + 1 studio touch-logic
helper. Four apply sites raise proposals. No new package.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design (below).*

| Article | Verdict | Basis |
|---|---|---|
| **I. Pattern schema is a locked contract** | **PASS** | No `Pattern` / `Criterion` / `MechanismRef` field is renamed, retyped, or removed, and no zod mirror changes. The touch `layer` addition is a new **key** in `MechanismRef.slotValues`, typed `Record<string, string>` ([assignmentMap.ts](../../packages/contracts/src/assignmentMap.ts) L51) — data, not schema ([research.md](research.md) R8). No escalation required. |
| **II. KeyboardIR is the engine spine** | **PASS** | The physical path emits `.kmn` rule-line text through the existing `buildShiftRuleLines` / `buildCasePairRuleLines` builders, folded in by `applyAssignments`. No raw `.kmn` manipulation, no new codec construct. The touch path operates on `TouchLayoutIR` (and the faithful raw-JSON editor, which is an established, documented second path — not a new one). |
| **III. Single persistent working copy** | **PASS** | Proposals mutate the one working copy through each gallery's existing record path. No second copy, no intermediate serialization. |
| **IV. Validator layering is fixed** | **PASS** | No validator change and no new timer. The CAPS-quad branch exists precisely to keep Layer-A Check #10 satisfied and moves verbatim ([research.md](research.md) R10). |
| **V. VirtualFS only during authoring** | **PASS** | No host-disk write. Output serialization is unchanged. |
| **VI. Team boundaries** | **PASS — Engine team owns this change.** Studio SPA + engine appliers are both Engine-owned (spec §12). No `content/patterns/**`, survey text, gallery ordering, or criteria file is touched: the touch gallery's refs are code-applied, not YAML-substituted ([research.md](research.md) R8). New user-facing banner strings are i18n catalog entries, not content records. |
| **VII. Out of scope for v1** | **PASS** | Caseless scripts (CJK/Ethiopic, Arabic, Devanagari) raise no proposal — `caseCounterpart` returns `null` and no gallery is emptied. This is *touch suggestion inside the existing touch gallery*, not touch-first authoring (Decision 6): the desktop layout still drives placement. Uppercase→lowercase, bulk "add all capitals", and changes to `caseCounterpart` itself are all explicitly excluded. |
| **VIII. House conventions** | **PASS** | No emoji. New i18n ids follow `area ( "." segment )+` and extend the shipped `editor.assignLoop.companion.*` namespace rather than renaming it (a rename orphans translations). No GitHub issue numbers in code or comments. Commits use `feat(studio)` / `feat(engine)`. |

**Post-Phase-1 re-check**: no verdict changed. The design added no locked-type edit, no timer, no
content-team file, and no new package. **Complexity Tracking is empty — no violations to justify.**

## Project Structure

### Documentation (this feature)

```text
specs/051-uppercase-counterpart-suggestion/
├── spec.md                         # Feature spec (input)
├── plan.md                         # This file
├── research.md                     # Phase 0 — R1..R10, three spec corrections
├── data-model.md                   # Phase 1 — CasePairProposal, TouchLayerId, layer slot
├── contracts/
│   ├── case-pair-proposal.md       # Shared studio hook + banner + per-mechanism confirm
│   └── touch-layer-targeting.md    # Engine applier contract for the layer slot
├── quickstart.md                   # Phase 1 — runnable validation, SC-001..SC-005
└── tasks.md                        # Phase 2 — created by /speckit-tasks, NOT by this command
```

### Source Code (repository root)

```text
packages/studio/src/editors/assignLoop/
├── casePairCompanion.ts            # NEW — useCasePairCompanion, CasePairProposal union
├── casePairCompanion.test.ts       # NEW — suppression + locale cases
├── CasePairProposalBanner.tsx      # NEW — the one Accept/Deny affordance (FR-011)
├── MechanismGallery.tsx            # EDIT — remove local pendingCompanion + inline banner;
│                                   #        adopt the hook; raise from swap (FR-003) and
│                                   #        dead-key (FR-004) applies
├── SequenceBuilderPanel.tsx        # EDIT — raise the S-03 parallel-combo proposal (FR-004)
├── TouchGallery.tsx                # EDIT — editingLayer; case-derived layer on refs (FR-006);
│                                   #        raise the shift-layer proposal (FR-005)
├── touchBehavior.ts                # EDIT — casePairTouchLayer(), TouchLayerId
├── MechanismGallery.test.tsx       # EDIT — existing companion cases must pass unchanged (SC-005)
├── SequenceBuilderPanel.test.tsx   # EDIT — parallel combo + multi-char-content suppression
└── TouchGallery.test.tsx           # EDIT — layer on refs, shift-layer proposal

packages/engine/src/pattern-apply/
├── applyTouchAssignments.ts             # EDIT — per-mechanism layer resolution
├── applyTouchAssignments.test.ts        # EDIT — absent-layer floor + new layer cases
├── applyTouchAssignmentsToRawJson.ts    # EDIT — same, faithful-edit path
└── applyTouchAssignmentsToRawJson.test.ts  # EDIT — same

packages/studio/src/locales/                # EDIT — extracted catalog entries for new ids
```

**Unchanged, deliberately**: `packages/engine/src/character-discovery/casePair.ts` (spec Out of scope),
`packages/engine/src/pattern-apply/shiftRules.ts`, `packages/contracts/**`, `content/patterns/**`.

**Structure Decision**: the existing monorepo layout, no new package. Studio-local UI state stays in
`packages/studio/src/editors/assignLoop/` alongside the galleries that consume it; the pure
layer-resolution work lands in the engine appliers that already own touch application. The one new
shared helper (`casePairTouchLayer`) goes in `touchBehavior.ts`, the established home for the touch
gallery's non-render logic, rather than a new file.

## Implementation sequencing

Ordered so each step is independently verifiable and the risky change lands behind a proven floor.

1. **Engine layer targeting** ([touch-layer-targeting.md](contracts/touch-layer-targeting.md)) — first,
   because nothing in touch can be case-correct without it. Land the absent-`layer` regression floor
   (every existing applier test passing unmodified) before adding the new layer cases.
2. **Extract the shared hook + banner** ([case-pair-proposal.md](contracts/case-pair-proposal.md)) with
   the physical mechanism as its only consumer. Gate: MechanismGallery's existing companion tests pass
   **unedited** — that is SC-005, and it is what proves the extraction was behavior-preserving.
3. **US2 — combo/dead-key**: raise from the S-02 apply in MechanismGallery and the S-03 apply in
   SequenceBuilderPanel, case-shifting the base/content letter and the output only.
4. **US3 — touch**: `editingLayer` + case-derived `layer` on refs (FR-006), then the shift-layer
   proposal (FR-005) on top.
5. **i18n extraction + repo gates** (`pnpm typecheck`, `pnpm -r test`, `pnpm lint`).

Steps 3 and 4 are independent of each other and can run in parallel once step 2 lands. Step 1 is
independent of step 2 and can run concurrently with it.

## Risks

| Risk | Mitigation |
|---|---|
| The extraction silently changes physical-key behavior (SC-005) | Existing `MechanismGallery.test.tsx` companion cases must pass **without edits**; the CAPS-quad branch moves verbatim, not re-derived. |
| Touch-layer change regresses existing touch output | Absent `layer` ≡ `"default"` is the contract; the entire pre-existing applier test suite is the floor, and no existing fixture may be edited to make it pass. |
| A second casing path creeps in | `useCasePairCompanion.propose` owns the `caseCounterpart` call; callers cannot pass a counterpart in. Reviewable as "zero new `toUpperCase()` on the proposal path". |
| i18n id churn orphans translations | Reuse the shipped `editor.assignLoop.companion.*` ids with their current English messages; new mechanism wording is additive ids. |
| FR-006's inverse case (uppercase on the lowercase layer) is missed because the spec did not name it | Explicitly covered in [quickstart.md](quickstart.md) §5 step 5 and in the TouchGallery test surface. |

## Complexity Tracking

No Constitution Check violations. Table intentionally empty.
