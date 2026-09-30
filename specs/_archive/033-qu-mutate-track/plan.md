# Implementation Plan: Mutate track — route the track fork through the manifest reducer/mutate seam

**Branch**: `km/qu-mutate-track` (original) | **Date**: 2026-08-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/033-qu-mutate-track/spec.md`

## Summary

**This is a retroactive plan.** Spec.md's own header framed this feature as "GATED on the spec #9 loop-primitive resolution" — but that framing does not survive inspection: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §3.2's own status note states the loop-primitive decision only gates the *later* gallery-decomposition specs (`pb_build_list`, `carve`, `mechanisms`, `touch`) — never `track`/`project_name`, which "remains at the manifest level" independent of that decision. Spec 033's own Assumptions section even concedes "if BUILD is chosen instead, no major fork re-modeling is expected." The gate never actually applied to this spec's real scope.

Independently of the gate question, the feature's functional requirements are already fully implemented — folded into the broader Unified Survey Architecture migration (specs 026/028/029) rather than landing as an isolated PR. This plan documents the as-shipped architecture against each FR.

## Constitution Check

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS (non-interference)** | No `Pattern`/`Criterion` field touched. |
| II. KeyboardIR is the engine spine | **PASS** | Identity writes (`header.name`, `header.keyboardId`) route through the existing mutate() seam's declared-writes containment (spec 014); no new IR mutation pattern introduced. |
| III. Single persistent working copy | **PASS** | No change to working-copy instantiation. |
| IV. Validator layering / one 300ms debounce | **PASS (non-interference)** | Not touched. |
| V. VirtualFS only during authoring | **PASS** | Not touched. |
| VI. Team boundaries | **PASS** | Engine-owned (SPA routing/reducer internals). |
| VII. Out of scope for v1 | **PASS** | Nothing here touches the out-of-scope list. |
| VIII. House conventions | **PASS** | Shipped commits follow `<prefix>(<area>): <description>`. |
| IX. No survey surface outside the manifest | **PASS** | This is precisely what the feature enforces: `track`/`project_name` are manifest-declared steps (`trackStep`/`projectNameStep` in `registerEditorSteps.ts`), not a hand-coded `if` fork. |

**No violations.**

## Project Structure

As-shipped, spread across the Unified Survey Architecture migration rather than one PR:

```text
packages/studio/src/steps/
├── registerEditorSteps.ts   # trackStep (flowRefs:["track"]), projectNameStep
│                            #   (writes: [irPath("header","name"), irPath("header","keyboardId")],
│                            #   flowRefs:["project_name"])
├── manifest.ts               # M4b: project_name is spine:false, joinTarget:"characters"
├── reducer.ts                 # applyStepCompletion()'s generic isMutateRequest(result) branch
│                             #   (top of the function, before any step-id switch) routes ANY
│                             #   step's declared-writes mutate request through the flag-gated
│                             #   mutate() seam uniformly -- no project_name-specific case needed
└── flags/mutateFlag.ts       # isMutateSeamEnabled() reads VITE_KM_MUTATE_SEAM (FR-007)

packages/studio/src/StudioShell.tsx   # handleTrackSelected/handleProjectNameNext: CONFIRMED ABSENT
                                       # (zero grep matches) -- deleted by commit d4f787b2 (spec 028
                                       # Stage 5, "SurveyView hand-placement dies")

content/flows/track.modular.yaml, project_name.modular.yaml   # spec 023's thin flows, still live
```

**Structure Decision**: No new files — this feature's scope was absorbed into the manifest/reducer generalization work of specs 026 (survey session store), 028 (generic StepHost), and 029 (FlowStepHost factory), landing across commits `7ba08030` (P4b foundation: manifest + reducer + register adapters), `6baa4ad6` (promote track/project_name to manifest steps + fix copy-track double-instantiation), and `d4f787b2` (spec 028 Stage 5, deletes the hand-coded fork).
