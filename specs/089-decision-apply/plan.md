# Implementation Plan: Question decisions write only through `apply` (specs/089-decision-apply)

**Branch**: `km/decision-apply` (stacked on `km/modular-decisions`; implementation begins only after spec 088's `decisionStore` lands on the parent branch and this branch is restacked onto it) | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/089-decision-apply/spec.md`; series plan in [088 HANDOFF.md](../088-modular-decisions/HANDOFF.md) phase 2; 088's store contract from [088 spec.md](../088-modular-decisions/spec.md) FR-001/FR-003.

## Summary

Every question decision's effect on the keyboard moves into its module: `QuestionModule` gains a pure `apply(value, ctx) → WorkingCopyPatch`, and the existing `routeAnswersThroughMutate` becomes the single unconditional runner that executes `apply` through the declared-`writes` containment check (`applyMutatePatch`). The per-flow `onCommit`s in `flowStepOptions.tsx` (track, project_name, help) and the store writes in `IdentityLiteAdapter` are deleted; the session fields they maintained (`identityResult`, `scaffoldSpec`, `identityPhaseResult`, and the stored `surveyContext`) become selectors over 088's `decisionStore`. `VITE_KM_MUTATE_SEAM` / `flags/mutateFlag.ts` are deleted — globally, per the owner's OI-1 ruling (owner ruling 2026-10-06, km-lead proposals Q2): the flag also gates non-question sites the spec does not mention, and all six `isMutateSeamEnabled()` sites become unconditional in 089.

The one hard prerequisite is captured before any code changes: SC-001's golden-walk baseline (scripted Playwright walk, copy track from `basic_kbdfr`, fixed answers, source zip byte-compared) is scripted and its baseline is captured on the pre-089 stacked base (OI-2, ruled — owner ruling 2026-10-06, km-lead proposals Q3). That script is the series oracle — 090–093 reuse it unchanged.

## Technical Context

**Language/Version**: TypeScript (studio package), Node ≥ 22.19.0, pnpm 9 — no change.

**Primary Dependencies**: existing only — zustand stores, `questionRegistry` (`survey/questions/registry.ts`), `applyMutatePatch` (`steps/mutateApply.ts`), Playwright (`packages/studio/e2e/`, helpers in `e2e/helpers/surveyFlow.ts`). No new dependency.

**Storage**: no new persistence. Draft format is 088's (DRAFT_VERSION 2, `decisions` slice); 089 adds no draft field and no version bump.

**Testing**: vitest per package (never bare at repo root); Playwright e2e in `packages/studio/e2e/` (`pnpm --filter studio test:e2e`); the store-level golden-walk oracle `packages/studio/tests/steps/stepHost.goldenWalk.test.tsx`.

**Target Platform**: studio SPA in `pnpm dev`, as the series requires — success criteria are measured in the live app, not in `DecisionsDemo`/`sc004Harness` (088 lesson from 087).

**Project Type**: web app (single package touched: `packages/studio`).

**Performance Goals**: none new. `apply` runs at step completion, outside the 300 ms validation cycle; it adds no timer and no per-keystroke work.

**Constraints**: no `packages/contracts` change (Article I; `Attribution` and `HelpDocsAnswers` are consumed as-is from contracts); no new timer (D3 / Article IV); no i18n id change; R7 completion ordering preserved (decision effects land before `advance`); byte-identical output on the golden walk.

**Scale/Scope**: 4 flows (identity, track, project_name, help), ~24 `il_*`/`g_*`/`pf_*` modules touched at most (most get no `apply` — see data-model), 1 flag deleted, 5 non-question flag readers inventoried in research.md.

## Constitution Check

*GATE: evaluated before Phase 0 research; re-checked after Phase 1 design (below).*

| Article | Assessment |
|---|---|
| I — Pattern schema locked | PASS — no `packages/contracts` file changes. `QuestionModule`, `MutateContext`/`ApplyContext`, and the decision types all live in `packages/studio`. |
| II — KeyboardIR is the engine spine | PASS — the IR channel of a patch is a `Partial<KeyboardIR>` merged by `applyMutatePatch`; no raw `.kmn` handling; opaque fragments untouched. |
| III — Single working copy | PASS — `apply` produces a patch against the one working copy; the runner applies it through the existing store setters. No second copy, no intermediate serialization. |
| IV — Validator layering / D3 | PASS — no new timer, no parallel validation path. The runner fires on step completion, not in the 300 ms cycle. |
| V — VirtualFS only | PASS — no host-disk writes during authoring; the golden-walk baseline zip is a test artifact downloaded by Playwright, not an authoring write. |
| VI — Team boundaries | PASS — Engine owns the registry, runner, and write path. No survey copy, prompts, or gallery ordering change; i18n ids unchanged. |
| VII — Out of scope | PASS — none of the excluded items is touched. |
| VIII — House conventions | PASS — commit titles use the locked vocabulary (`feat(studio):`, `maint(studio):`, `test(studio):`, `docs(spec):`); no issue numbers in code; no emoji in console output. |
| IX — No survey surface outside the decision registry | PASS, and it is the point of the spec — question effects move *into* registry modules, writes route through the one seam, and the step-level `onCommit` side channel is deleted. No new surface is created outside the registry. The factory's remaining `extract` is pure answer-shaping with no store access (research R5). |

**Post-design re-check**: unchanged — the design adds types and a runner inside `packages/studio` only, keeps every gate above, and introduces no Complexity Tracking entry. The single item that could change this assessment was OI-1, and the owner has ruled it: the flag deletion is global in 089 (owner ruling 2026-10-06, km-lead proposals Q2), so the touched surface grows into 090's gallery/projection sites under that ruling — those sites are only un-gated, no new surface is created, and the assessment above stands. The accepted risk is recorded with the ruling in Open Items below.

## Project Structure

### Documentation (this feature)

```text
specs/089-decision-apply/
├── spec.md              # already written (specify phase)
├── plan.md              # this file
├── research.md          # Phase 0: code-verified findings + decisions R1–R8
├── data-model.md        # Phase 1: ApplyContext, WorkingCopyPatch, selectors
├── contracts/
│   └── apply-contract.md  # the apply/runner contract 090 builds on
├── quickstart.md        # Phase 1: validation walkthrough (golden walk + gates)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/studio/src/
├── survey/
│   ├── types.ts                       # QuestionModule.apply; ApplyContext; mutate retired (R1)
│   └── questions/
│       ├── a/il_*.ts                   # composed attribution apply (il_copyright_holder)
│       ├── g/track_choice.ts           # apply: empty patch (spec edge case)
│       ├── g/project_keyboard_id.ts    # composed identity-patch apply (requires project-display-name)
│       ├── b/pb_standard_letters.ts    # mutate body becomes apply (ir channel)
│       └── f/pf_welcome_paragraph.ts  # composed help-docs apply (help-* decisions → patch)
├── steps/
│   ├── reducer.ts                      # routeAnswersThroughMutate → the apply runner, unconditional;
│   │                                   # MutateRequest retired; ReducerDeps gains the patch sink
│   └── mutateApply.ts                  # applyMutatePatch — UNCHANGED (shared with 090 surfaces)
├── decisions/
│   ├── decisionStore.ts                # 088's store — consumed, not modified, except selectors below
│   ├── identitySelectors.ts            # NEW: deriveIdentityResult / deriveScaffoldSpec /
│   │                                   # deriveSurveyContext / identity resume result, over decisionStore
│   └── impact.ts                       # counterfactual re-derivation reads apply (ir channel)
├── editors/adapters/
│   ├── flowStepOptions.tsx             # track/projectName/phaseF onCommits DELETED; seeds read selectors
│   ├── makeFlowStepComponent.tsx       # FlowStepDeps loses the retired setters/fields
│   └── panelAdapters.tsx               # IdentityLiteAdapter writes nothing; forwards the result only
├── stores/
│   └── surveySessionStore.ts           # identityResult / identityPhaseResult / scaffoldSpec /
│                                       # stored surveyContext + their setters DELETED (FR-005)
├── flags/
│   └── mutateFlag.ts                   # DELETED (FR-003) — global deletion ruled (OI-1, owner ruling 2026-10-06)
├── lib/
│   └── confirmRebase.ts                # identitySeedFromSession reads the identity selector
└── e2e/
    └── golden-walk.spec.ts             # NEW: SC-001 walk + baseline capture (reused by 090–093)

../keyboards (sibling checkout)        # basic_kbdfr source for the walk — read-only
```

**Structure Decision**: everything lands in `packages/studio`, in the directories that already own each concern — module contract in `survey/`, runner in `steps/` (the reducer's injected-deps boundary is preserved: `steps/` still imports no stores; the patch sink is a new injected `ReducerDeps` entry wired in `StudioShell`/`StepHost`), selectors beside 088's `decisionStore` in `decisions/`. No new top-level directory, no engine or contracts change.

## Open Items (owner decisions — both RULED 2026-10-06; original questions recorded verbatim)

> **OI-1 — Flag-deletion blast radius.** FR-003 requires `VITE_KM_MUTATE_SEAM` and `flags/mutateFlag.ts` to be deleted, and US2's independent test asserts only that the flag is gone and `pb_standard_letters` writes unconditionally. Verified on this branch: `isMutateSeamEnabled()` has four further readers outside the question-answer path — `steps/reducer.ts` (mechanisms → touch `repropagate` gate), `decisions/impact.ts` (decision-trail counterfactual returns null while the flag is off), `editors/assignLoop/TouchGallery.tsx` (hand-set promotion on manual touch edit), and `lib/projectWorkingCopyVfs.ts` (carve projection seam path and add-gallery seam derivation). The spec mentions none of them; two are spec 090's surface. **Question for the owner: does 089 delete the flag globally (all six sites become unconditional here), or does 089 un-gate only the question-answer runner while the other sites keep a gate until 090 — which leaves `mutateFlag.ts` alive and FR-003/SC-002 partially unmet in 089?** Tasks T021/T022 are sequenced last; everything before them is identical under either answer. **RULED — owner ruling 2026-10-06 (km-lead proposals Q2): GLOBAL deletion. All six `isMutateSeamEnabled()` sites become unconditional in 089; T021/T022 are unblocked and proceed as written. Accepted risk, recorded with the ruling: three currently-dark behaviours activate in 089, a spec before the modules that own them exist — repropagate after every mechanisms completion, hand-set promotion on manual touch edits, and the seam carve path becoming the only path. The golden walk (`basic_kbdfr`) does not exercise repropagate on real edited keyboards; the flag-parity suites bound the carve risk to their fixtures.**

> **OI-2 — Baseline reference for SC-001.** SC-001 says the baseline is "captured from `main` before this spec". This branch is stacked on 088, which is itself no-visible-change (088 FR-009/SC-004) but raises DRAFT_VERSION to 2. **Plan's reading: the baseline is captured on the pre-089 stacked base (088 as landed on `km/modular-decisions`), not on literal `main` — the walk's answers and output are then byte-compared across 089's changes on the same base every later spec in the series also builds on.** **RULED — owner ruling 2026-10-06 (km-lead proposals Q3): the plan's reading is adopted; the baseline is the pre-089 stacked base (088 as landed). T003 additionally captures the baseline on literal `main` and diffs the two zips as a proof step: if the diff is empty, the baseline-identity question is permanently closed; if it is non-empty, capture on the stacked base still stands under this ruling and the differing surface must be named in the baseline record.** (Capture *environment* is not part of this question: research R9 pins it to `VITE_KM_MUTATE_SEAM=1`, because a flag-off baseline makes SC-001 and US2 mutually unsatisfiable — the `kmStandardLetters` store `pb_standard_letters` writes is emitted once the seam is unconditional.)

## Complexity Tracking

No constitution violations to justify; the table is intentionally absent (see Constitution Check).
