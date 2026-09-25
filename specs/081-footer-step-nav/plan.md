# Implementation Plan: Survey progress buttons live in the footer

**Branch**: `km/footer-step-nav` | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/081-footer-step-nav/spec.md](spec.md) (refs #1778)

## Summary

This plan moves every in-scope survey step's Back / Skip / forward button (Appendix A, 18 rows)
out of the step body and into `StudioFooter`. The layout is a left nav cluster, then the project
label, then the right-aligned dot row. Behaviour stays identical.

The mechanism is a small publish/subscribe channel:

- The single walk-owning component in each step calls `usePublishStepNav(spec)`.
- The hook tags the spec with the step id that StepHost provides through context, so a late
  publish from an outgoing step can never render on the incoming one.
- A zustand store keeps one entry per step, with an owner token and an equality guard.
- The footer renders only the entry for `activeStepId`, keyed on it, so the cluster remounts on a
  step change.

Button gains a `compact` size. The frame becomes 40 px under a fine pointer and 52 px under a
coarse one. Carve's strings are relocalised under their retired catalog ids. The research
decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, React 18. Node ≥ 22.19.0, pnpm 9.

**Primary Dependencies**: zustand (the existing store idiom), Lingui (i18n), and the existing
`ui/Button` and `index.css` utility classes.

**Storage**: N/A. Ephemeral in-memory UI state only; nothing is persisted or enters the draft
envelope ([data-model.md](data-model.md)).

**Testing**: Vitest plus Testing Library through `src/test/renderWithI18n.tsx` (gaining
`withStepNav`), Playwright E2E with axe (`packages/studio/e2e`), and the rule 12 manual keyboard
walk.

**Target Platform**: Browser SPA (`packages/studio`), with fine and coarse pointers.

**Project Type**: Web application, frontend package only.

**Performance Goals**: A no-change republish notifies no subscriber (FR-050), so a keystroke in
a step body does not re-render the footer. There is no paint frame between steps without the new
step's buttons (`useLayoutEffect` publish).

**Constraints**:

- The footer is exactly 40 px under a fine pointer and at most 52 px under a coarse pointer.
- Nav labels never clip at 375 px and above.
- The footer keeps a single `role="status"` region.
- No new timer (D3).
- StepHost's direct-parent DOM contract is untouched.

**Scale/Scope**: About 18 step or screen publishers across about 14 files, 1 new store, 1 hook,
1 component, 1 Button prop, 2 catalogs, and about 20 unit test files moved to `withStepNav`
(Appendix B).

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after the Phase 1 design.*

| Article | Verdict | Note |
|---|---|---|
| I. Pattern schema locked | PASS | No contracts or schema change. |
| II. KeyboardIR spine | PASS | No IR, codec or mutation path is touched. |
| III. Single working copy | PASS | Nav state is UI-only and never serialized. |
| IV. Validator layering / D3 | PASS | Nothing validates. No timer is added; publishing runs in a layout effect. |
| V. VirtualFS only | PASS | No FS or output involvement. |
| VI. Team boundaries | PASS | Owner is **Engine** (studio SPA). The new catalog string `footer.nav.groupLabel` is Content-reviewed text. Restored Carve ids keep their original copy. |
| VII. Out of scope v1 | PASS | Touch *authoring* is unaffected; this only re-hosts existing touch-gallery nav. |
| VIII. House conventions | PASS | No issue numbers in code or comments. Commits use `feat(studio)` / `fix(studio)`. Console output uses `[WARN]`-style text (the DEV one-publisher error). |
| IX. Manifest is the survey surface | PASS | Adds no step and no survey content, and does not change ordering. StepHost remains the manifest renderer; the context provider only annotates it. |

**Post-design re-check**: PASS. The design adds one context provider inside StepHost, around the
component, as a sibling of the existing `QuestionRecorderContext` and `JumpContext`. It adds no
DOM node, and no manifest, IR or validator surface.

## Project Structure

### Documentation (this feature)

```text
specs/081-footer-step-nav/
├── spec.md
├── plan.md                         # this file
├── research.md                     # R-01..R-11 design decisions
├── data-model.md                   # NavAction / StepNavSpec / store transitions
├── quickstart.md                   # validation runbook
├── contracts/step-nav-contract.md  # publisher, store, footer, and harness contract
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks (not yet created)
```

### Source Code (repository root)

```text
packages/studio/src/
├── stores/stepNavStore.ts (+ .test.ts)            NEW    entries, publish/clear/reset, sameSpec, owner guard
├── hooks/usePublishStepNav.ts (+ .test.tsx)       NEW    StepNavContext, ref-wrapped handlers, layout-effect publish
├── components/StepNavCluster.tsx                  NEW    labelled group, back/secondary/forward
├── components/StudioFooter.tsx (+ .a11y.test)     EDIT   cluster first, dot row right-aligned, visibility disjunct
├── components/StepHost.tsx                        EDIT   StepNavContext.Provider value=resolvedStep.id
├── ui/Button.tsx                                  EDIT   size="compact"
├── index.css                                      EDIT   .ks-studio-footer 40px / coarse 52px
├── test/renderWithI18n.tsx, test-setup.ts         EDIT   withStepNav option, afterEach reset
├── test/studioShellMocks/*                        EDIT   use the real handles (FR-041)
├── survey/SurveyRunner.tsx, Prefill.tsx, PhaseB.tsx,
│   punctuation/PunctuationStep.tsx, invisibles/InvisiblesStep.tsx,
│   convenience/ConvenienceCharsStep.tsx, marks/MarksSeriesStep.tsx     EDIT  publishers (rows 1-8)
├── editors/panels/BaseResolution.tsx, carve/CarveGalleryV2.tsx,
│   assignLoop/{MechanismGallery,TouchGallery,IntroSplash}.tsx,
│   assignLoop/parts/GalleryEmptyState.tsx,
│   touchSeedSource/TouchSeedSourcePanel.tsx                            EDIT  publishers (rows 9-17)
├── adaptation/InheritancePostureStep.tsx                               EDIT  publisher (row 18, US7)
└── locales/{en,fr}/messages.json                                       EDIT  extract/sort; restore editor.carve.*
packages/studio/e2e/{journey-strip-badges,footer-progress,copy-edit,base-resolution*}.spec.ts  EDIT  Appendix B scoping
specs/056-ada-accessibility/wcag-2.2-aa-tracker.md                      EDIT  FR-035 evidence
specs/079-survey-answer-persistence/contracts/journey-strip-contract.md EDIT  §6 coarse-pointer amendment note
```

**Structure Decision**: studio package only. The channel follows the existing store-bridge
precedent (`stepWalkStore`, `startOverStore`). Each Appendix A row is migrated in place in its
own file.

## Delivery phases (input to `/speckit-tasks`)

The spec has seven user stories. Under the constitution's one-phase-per-conversation rule,
implementation stops after each phase.

1. **Setup and Foundational** (rides with P1): the store, hook, context, cluster, footer layout,
   compact Button, frame CSS, harness and `afterEach` reset, plus the FR-050 and FR-052 tests.
   Nothing migrates yet. The footer shows no cluster because no step publishes.
2. **P1: US1, US2 and US3 together.** Migrating a row inherently delivers all three: the
   placement, the parity, and no duplicates. Order: SurveyRunner (row 1, which covers every
   question-flow step) → rows 2-8 (survey) → rows 9-17 (editors). One commit per row group.
   Each row's existing tests move to `withStepNav` with unchanged assertions (R-11). Add the
   transition test (SC-005) and the Appendix B e2e scoping.
3. **P2: US4 and US5.** Tab-order and describedby tests, and the FR-015 loading, error and empty
   Back for BaseResolution and Carve. Remove the Convenience inert Back. Restore the Carve
   catalog ids and do the fr catalog work. Record the tracker evidence and the rule 12 walk.
4. **P3: US6 and US7.** Width and pointer measurements (quickstart §5), the 079 §6 amendment
   note, InheritancePostureStep, and the follow-up issues (FR-007 dead-panel deletion, FR-031
   skip link or shortcut, and FR-042 if the walk says so).

## Risks

| Risk | Mitigation |
|---|---|
| A late publish renders an outgoing step's button on the incoming step | Context-supplied step id (R-01), footer read keyed on `activeStepId`, and cluster `key`. Covered by the transition test. |
| A wrapper double-publishes, and a boundary Back replaces the walk Back | Owner token with a first-wins rule and a DEV `console.error` (R-04). Covered by a unit test. |
| A dangling `aria-describedby` when a hint is conditional | The publisher passes the id only while the hint is mounted (R-09). Axe in e2e. |
| Hook called after an early return | Contract §2 rule 2. Reviewed for each row; the loading-state tests catch it. |
| Standalone tests lose their handles | `withStepNav` harness plus a global reset (R-07). |

## Flagged refinement

- **FR-044 loading id**: the plan reuses the retired `editor.carve.loadingKeyboard` id for
  `Loading keyboard…`, whose en and fr text are identical to what V2 shows. The spec's literal
  text asks for a new id. Rationale: [research.md R-08](research.md#r-08-carve-strings-fr-044).
  This needs the reviewer's nod; otherwise only the id string changes.

## Complexity Tracking

No constitution violations, so this section is empty.
