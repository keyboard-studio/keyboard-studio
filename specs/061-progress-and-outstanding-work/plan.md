# Implementation Plan: Honest progress — one mark per activity page, and the first work still owed

**Feature**: 061-progress-and-outstanding-work
**Branch**: `km/061-progress-and-outstanding-work`
**Spec**: [spec.md](spec.md) · **Research**: [research.md](research.md) · **Data model**: [data-model.md](data-model.md)
**Created**: 2026-08-05 · **Size**: normal (full plan, all design artifacts)

## Summary

The progress row must mark every activity page the author walked, the top bar must name the
earliest passed section that still owes required work, and an incomplete keyboard must become
downloadable while staying unpublishable. The technical approach is one new pure derivation —
`lib/outstandingWork.ts` with a `hooks/useOutstandingWork.ts` composition seam, exactly the
`accountedForGate.ts` / `useAccountedForGate.ts` idiom already in the tree — consumed by both the
footer row and the nudge, so the two surfaces cannot disagree. Three existing mechanisms are
extended rather than forked: `decisions/progressDots.ts` gains a behind-the-author section mark
(closing D-1/D-2), `MarksSeriesStep` starts publishing a within-step walk of its visible stations
(closing D-4, and making them `Location`-addressable for free through the same
`ctx.stepPositions` path a gallery's character tokens already travel), and the two traversal
primitives `jumpToStep` / `backToUnfinishedGallery` collapse into one section-id-taking action so
the nudge routes through `jumpToLocation` (closing D-6). On the output side the coverage term moves
off `canDownload` and onto a new, independently-derived `canPublish`, and the four places that
today refuse arrival at Output become warnings.

No new dependency, no new stack element, no new store slice. The one new *runtime* surface is a
reuse of the existing `editors/assignLoop/parts/ConfirmDialog.tsx`, whose configurable
Escape/backdrop routing already implements FR-025's dismiss-to-safety requirement.

## Project Structure

```
packages/studio/src/
  lib/
    outstandingWork.ts               NEW — the one derivation (pure; FR-009…FR-012, FR-015, FR-016)
    stepWalk.ts                      + StepWalkPosition.required?          (FR-007)
    jumpToLocation.ts                use the one generalized traversal primitive (FR-019)
    unimplementedInventory.ts        UNCHANGED — read, never forked        (FR-012, FR-035)
    accountedForGate.ts              UNCHANGED — marks still relax only the gallery (FR-014)
  hooks/
    useOutstandingWork.ts            NEW — React seam over the pure module (FR-011)
    useInventoryCoverageGate.ts      UNCHANGED — already working-copy-sourced (FR-013)
    usePreviewArtifact.ts            canDownload loses the coverage term; canPublish gains its own (FR-023, FR-027)
  decisions/
    progressDots.ts                  behind-section mark + outstandingCount (FR-002, FR-006, FR-008)
  components/
    StudioFooter.tsx                 pass outstanding work in; distinct accessible names (FR-008)
    OutstandingWorkNudge.tsx         RENAMED from UnfinishedGalleryIndicator.tsx (FR-017…FR-022)
    OutputScreen.tsx                 complaint dialog; canSubmit off canPublish; banner reword (FR-024…FR-029)
    ManagedPRSubmitPanel.tsx         prop rewiring only
  survey/
    marks/MarksSeriesStep.tsx        publish the station walk; honour an arrival cursor (FR-004)
    SurveyRunner.tsx                 publish per-question `required`      (FR-007)
  editors/adapters/PhaseFGate.tsx    refusal -> warning that names the work (FR-028)
  steps/advance.ts                   `help` routes through to output      (FR-028)
  stores/surveySessionStore.ts       one generalized backward-landing action (FR-019)
  StudioShell.tsx                    wire the nudge; nav tab warns rather than disables (FR-028)
  locales/{en,fr}/messages.json      new ids only, no re-pointing          (FR-021)

specs/057-bulletproof-navigation/spec.md   FR-042 completed-stop class; FR-043 outstanding-behind name
docs/spec-signoff.md                       record the download-vs-publish policy as a 061 decision
```

**Structure Decision**: everything lands in `packages/studio` — this is a studio-surface feature
with no engine or contracts change, so `@keyboard-studio/contracts` and the `Pattern` schema are
untouched. The pure/seam split (`lib/` + `hooks/`) is dictated by the `decisions-layer` depcruise
rule, which forbids `decisions/ -> stores/`: the derivation must be a plain input to
`buildProgressDots`, threaded by `StudioFooter.tsx` exactly as `stepWalks` already is.

## Constitution Check

Gate before Phase 0; re-checked against the final Phase 1 design (both passes identical — no
design decision moved a row).

| Principle | Assessment |
|---|---|
| I. Pattern schema is a locked contract | **PASS** — no `packages/contracts` edit. The one type change is `StepWalkPosition.required?` in `packages/studio/src/lib/stepWalk.ts`, a studio-local type, additive and optional. |
| II. KeyboardIR is the engine spine | **PASS** — no codec, scaffold, or `.kmn` path is touched. Coverage is read through the existing selectors over `KeyboardIR`-derived state, never re-derived from text. |
| III. Single persistent working copy | **PASS** — reinforced. FR-013 requires the outstanding-work count come from the working copy rather than session-scoped walks, which is what makes the row survive a reload. No second copy, no intermediate serialization. |
| IV. Validator layering / one 300 ms debounce | **PASS** — nothing here validates, so no timer is added (FR-034). The nudge and the row recompute on the same state changes that already re-render their consumers; `aria-live` rides those renders, per D3's scope note. |
| V. VirtualFS only during authoring | **PASS** — the download path still stages compiled artifacts into a clone (`buildOutputBundle.ts`), untouched. Relaxing *when* a download is permitted does not change *where* it is built. |
| VI. Team boundaries | **PASS** — Engine team: SPA surfaces, output gating, navigation. The only Content-adjacent artifacts are new message-catalog ids, which FR-021 requires and which follow the 046 id grammar. |
| VII. Out of scope for v1 | **PASS** — no CJK/Ethiopic, no LDML, no touch-first authoring. Q3 explicitly keeps the touch key-grid mode from becoming its own activity page. |
| VIII. House conventions | **PASS** — no emoji; markdown links in prose; no issue numbers in code; commits as `fix(studio):` / `feat(studio):` / `docs(spec):`. |

No violations, so there is no Complexity Tracking table.

One item is **escalated rather than assumed**: FR-028 relaxes `advance.ts`'s `help` case, which is
the Phase F *hard* gate. That is the gate the spec names as blocking arrival, and Q6 resolves the
policy, so the plan implements it — but it is the single most consequential behaviour change here,
and it is called out in [research.md](research.md) R7 with the exact set of terms that must stay
intact so the relaxation cannot leak into emission (FR-030).

## Phase sequencing

Task generation should follow the user-story priority, because each story is independently
shippable and the later two consume the first's derivation:

1. **Foundation** — `lib/outstandingWork.ts` + `hooks/useOutstandingWork.ts` + their unit tests.
   Nothing renders differently yet.
2. **US1 (P1)** — `progressDots.ts` behind-section mark, `StepWalkPosition.required?`, the marks
   walk, the footer's accessible names, and the exact-match row test that closes D-8.
3. **US2 (P2)** — the generalized traversal primitive, `jumpToLocation` using it, and the nudge.
4. **US3 (P2)** — `canPublish`, the complaint dialog, the four arrival relaxations, the banner.
5. **Corpus** — 057 FR-042/FR-043 amendment, `docs/spec-signoff.md` 061 decision, and a
   `utilities/spec-trace acknowledge` in the same commit as the prose edits.

Step 3 is the one place the ordering is load-bearing rather than merely convenient: the nudge must
not ship before the traversal primitive is generalized, or it would reintroduce D-6 for the
duration of a commit.
