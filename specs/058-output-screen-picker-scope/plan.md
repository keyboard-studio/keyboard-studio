# Implementation Plan: Output-screen picker scope

**Branch**: `km/057-output-picker-scope` | **Date**: 2026-08-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/058-output-screen-picker-scope/spec.md`

> ## Retroactive plan (2026-08-18)
>
> This plan is written **after** the feature landed. `spec.md` already carries
> `Status: Implemented (US1–US3, FR-001…FR-010)` plus a review-cycle amendments
> log dated 2026-08-05; the code (`PickerPane.tsx`, `OutputScreen.tsx`,
> `outputKeyboardId.ts`, `surveySessionStore.backToChooseBase`) matches the spec
> exactly, module-comment cross-references included. This directory's
> `.spec-context.json` was created during the 2026-08-18 spec-number-collision
> cleanup (#1643), which is what routed 058 through `/speckit.companion.plan`
> now rather than at authoring time. The plan below documents the design that
> was actually built, verified against the current source, rather than
> proposing new work.
>
> **Verification addendum (2026-08-19).** The "module-comment cross-references
> included" claim above had one exception: `outputKeyboardId.ts:5` read
> "spec 063 D4" instead of "spec 058 D4" — a stale reference from before this
> feature was renumbered 057 → 058 (see spec.md's numbering note). Caught by
> `/speckit-companion-implement`'s km-doc review pass and corrected in the same
> commit, so the claim now holds exactly.

## Summary

The Output screen's left pane (`PickerPane`) was shaped for `PreviewScreen`,
its original co-tenant, and kept offering a base-source mode toggle and an
editable base picker even after an author has an instantiated working copy —
misreporting how the keyboard was created (D1), exposing a destructive
re-base behind only a native `confirm()` (D2), and computing the download
button's accessible name from a different expression than the emitted
filename (D4). The fix adds a `PickerPaneVariant` (`"full"` | `"shipping"`)
to the existing shared component: `OutputScreen` selects `"shipping"` from a
live `isInstantiated()` store subscription once a working copy exists, and
falls back to the historical `"full"` pane on cold arrival at `#output`
(spec's documented standalone entry point). The `"shipping"` variant renders
the base as read-only provenance and replaces in-place re-basing with a
"Change base keyboard" control that is a pure **navigation** action —
`surveySessionStore.backToChooseBase()` plus `navigateTo("survey")` — so the
existing `confirmRebaseTo` gate at `choose_base` remains the only place a
re-base is confirmed or discarded. The aria-label/filename divergence (D4) is
closed by extracting both derivations to one function,
`resolveOutputKeyboardId`, called from both `OutputScreen` and
`serializeWorkingCopy`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, explicit `.ts`/`.tsx` import
extensions), React 18, Vite. Node ≥ 22.19, pnpm 9.

**Primary Dependencies**: `@keyboard-studio/contracts` (`BaseKeyboard` — read
only, no field added); `usePreviewArtifact` (existing hook supplying
`baseKeyboard`/`pickerMode`/`handlePickerModeChange`, unchanged); the
`workingCopyStore` predicate `isInstantiated()` (existing, reused as the
single source of "has a working copy" — Key Entities); `surveySessionStore`'s
`backTo*` action family; Lingui (`@lingui/react/macro`) for every new string.

**Storage**: N/A — no new persisted state. `PickerPaneVariant` is derived at
render time, never stored (Key Entities).

**Testing**: vitest + Testing Library. Dedicated spec:
`packages/studio/src/components/OutputScreen.pickerScope.test.tsx` (variant
selection, live-subscription flip, provenance rendering, change-base
navigation). Existing `OutputScreen.test.tsx`,
`OutputScreen.coverageBanner.test.tsx`, and `OutputScreen.kmp.test.tsx` cover
the untouched banners/downloads and were re-run, not rewritten, to prove no
regression on cold arrival (US3).

**Target Platform**: Browser SPA (studio) — no platform change.

**Project Type**: Single-package front-end change, wholly inside
`@keyboard-studio/studio`. No `packages/contracts` edit.

**Performance Goals**: None new — presentational branch plus one navigation
call. No change to the compile/validate hot path.

**Constraints**: FR-010 — no new debounce timer, validation cycle, or
working-copy mutation path (Constitution Art. IV). The variant must be a live
store subscription, not a mount-once read, to close the late-instantiation
race named in Edge Cases and mirrored from D1.

**Scale/Scope**: One new prop (`variant`) + one new optional slot
(`changeBaseSlot`) on an existing component (`PickerPane`); one new pure
helper module (`outputKeyboardId.ts`); one new store action
(`backToChooseBase`) in the existing `backTo*` family; one aria-label
derivation removed. No new screens, no new store, no schema change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Gate | Verdict |
|---|---|---|
| **I. Pattern schema is a locked contract** | Does this rename/retype/remove a `Pattern` field or its zod mirror? | **PASS.** No `Pattern`/contracts schema touched. `BaseKeyboard` is read-only here. |
| **II. KeyboardIR is the engine spine** | Does it bypass the IR or drop opaque fragments? | **PASS.** Presentational + navigation only; no IR read or write added. |
| **III. Single persistent working copy** | Does it add a second working copy or intermediate serialization? | **PASS.** `backToChooseBase` returns the author to the *existing* survey step; the re-base itself still goes through the one working copy via the pre-existing `confirmRebaseTo`/`instantiateFromBase` path (FR-006). No new copy, no new serialization point. |
| **IV. Validator layering is fixed (one 300 ms debounce)** | Does it add a second debounce or a parallel validation path? | **PASS (FR-010).** No debounce timer added; the pane variant is a plain derived render branch. |
| **V. VirtualFS only during authoring** | Does it write to host disk during authoring? | **PASS.** No I/O added. |
| **VI. Team boundaries** | Which team owns this, and does it stay in bounds? | **PASS.** Engine-owned surface (SPA component + store action); no content-catalog or pattern-library edit. |
| **VII. Out of scope for v1** | Does it implement a §16 forbidden item? | **PASS.** No touch-first authoring, no CJK/Ethiopic, no multi-source merge, no publishing-path change. |
| **VIII. House conventions** | Console emoji? backticked file refs in user text? issue numbers in shipped code? commit style? | **PASS.** No console emoji. Spec/code comments cross-reference "spec 058" (a spec number, not a GitHub issue number), matching the house rule that forbids issue numbers, not spec citations. Commit style `fix(studio): …` observed on the landed PR. |

**Constitution Check: PASS on all articles.** No Complexity Tracking entries — no violation was taken.

## Project Structure

### Documentation (this feature)

```text
specs/058-output-screen-picker-scope/
├── plan.md              # This file (/speckit.companion.plan, retroactive)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output — PickerPane variant contract
└── tasks.md             # Phase 2 output (/speckit-tasks — not generated retroactively; work already shipped)
```

### Source Code (repository root)

**(EDIT)** marks files the shipped change modified; **(NEW)** marks files it added. Paths verified against the current tree.

```text
packages/studio/src/
  components/
    PickerPane.tsx                       # (EDIT) PickerPaneVariant "full" | "shipping"; BaseProvenance;
                                          #        changeBaseSlot prop; mode toggle + picker slot suppressed
                                          #        in "shipping"
    OutputScreen.tsx                     # (EDIT) live isInstantiated() subscription selects the variant;
                                          #        handleChangeBase (backToChooseBase + navigateTo("survey"));
                                          #        downloadKeyboardId/aria-labels routed through
                                          #        resolveOutputKeyboardId
    OutputScreen.pickerScope.test.tsx    # (NEW) US1–US3 + D4 coverage
    previewOutputLayout.ts               # (EDIT) PANE_SECONDARY_BUTTON extracted (shared by the two mode-toggle
                                          #        buttons and "Change base keyboard")
  lib/
    outputKeyboardId.ts                  # (NEW) resolveOutputKeyboardId — single id derivation (D4 fix)
    serializeWorkingCopy.ts              # (EDIT) filename derivation now calls resolveOutputKeyboardId
  stores/
    surveySessionStore.ts                # (EDIT) backToChooseBase action (rewinds history to the
                                          #        pre-choose_base prefix, clears baseConfirmed)
    createStudioDecisionRecorder.ts      # (EDIT) D4 sibling fix — now calls the canonical project-key
                                          #        derivation instead of restating it (decisions/)
```

**Structure Decision**: Single-package change confined to `@keyboard-studio/studio`. No cross-package boundary crossed and no `packages/contracts` edit, so no §18 session was required. `outputKeyboardId.ts` is deliberately its own module (not exported from `serializeWorkingCopy.ts`) because `OutputScreen.test.tsx` and `ManagedPRSubmitPanel.test.tsx` `vi.mock` that module wholesale — a re-export from it would read as `undefined` in exactly the tests covering the aria-label the fix targets.

## Complexity Tracking

No entries — the Constitution Check passed with no violations.
