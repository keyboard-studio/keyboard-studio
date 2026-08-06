# Data Model: 061 — Honest progress and outstanding work

Three entities are introduced and three existing types are extended. Nothing in
`@keyboard-studio/contracts` changes; every type below is studio-local.

## New — `OutstandingSection`

The per-section unit of "what does this owe", produced by `lib/outstandingWork.ts`.

| Field | Type | Rule |
|---|---|---|
| `stepId` | `string` | A manifest step id. Never a character token, never a view mode (FR-033). |
| `count` | `number` | Required items still owed: uncovered inventory characters plus unanswered required stops. Always `> 0` — a section owing nothing is absent from the list, not present with `0` (FR-010). |
| `location` | `Location` | Names the step, no `question`, so arrival hands off to the section's own in-page navigation (FR-015). |
| `label` | `string` | Localized section name, from the **one** label source shared with the row (FR-020). |

**Validation**: `count` counts *required* items only — an optional unanswered stop contributes
nothing (FR-007), and a marked-for-later character still contributes (FR-014, A3). Characters are
counted from the coverage gate, never from the walk map (FR-013).

## New — `OutstandingWork`

The whole derivation's result — what both consumers read.

| Field | Type | Rule |
|---|---|---|
| `sections` | `readonly OutstandingSection[]` | Manifest order. Includes sections ahead of and behind the author; consumers filter. |
| `byStepId` | `ReadonlyMap<string, OutstandingSection>` | Lookup for the row, which asks about one step at a time. Same objects as `sections`. |
| `nudgeTarget` | `OutstandingSection \| null` | The **earliest** section strictly behind the author's position that owes required work. `null` when nothing behind is owed — the nudge is then absent, not empty (FR-018, FR-022). |

**State transitions**: none — this is a derived value with no lifecycle. It is recomputed from its
inputs on every render that changes them, which is why no timer is involved (FR-034).

**Relationships**: `nudgeTarget` is always a member of `sections` or `null`; it is never a fifth
section synthesized for the banner. Exactly one derivation produces all three fields, which is what
FR-009 requires.

## New — `OutstandingWorkInputs`

The pure module's parameter object. Named explicitly so the unit tests can construct the
restored-draft case (an empty walk map with a blocked coverage gate) that FR-013 turns on.

| Field | Type | Source |
|---|---|---|
| `coverage` | `InventoryCoverageGate` | `useInventoryCoverageGate()` — read, never forked (FR-012). Its `touchLayoutCorrupted` fail-closed behaviour passes through untouched (FR-035). |
| `manifest` | `readonly Step[]` | `steps/manifest.ts`, for order and membership. |
| `walks` | `StepWalkMap` | `stepWalkStore`. May be **empty** — an absent walk never reads as completeness. |
| `activeStepId` | `string` | `surveySessionStore`, for the behind/ahead split. |
| `visited` | `readonly string[]` | `surveySessionStore`'s monotonic high-water mark — what makes "behind the author" mean "actually walked". |
| `label` | `(stepId: string) => string` | Injected, so the pure module has no i18n dependency (the `formatCoverageBannerParts` idiom). |

## Extended — `StepWalkPosition` (`lib/stepWalk.ts`)

| Change | Rule |
|---|---|
| `+ required?: boolean` | Additive and optional. **Absent means not required** (research R4). Character walks and marks stations publish `true`; `SurveyRunner` publishes per question. |

Existing fields `id`, `label?`, `done` are unchanged.

## Extended — `ProgressDot` (`decisions/progressDots.ts`)

| Change | Rule |
|---|---|
| `+ outstandingCount?: number` | Set **only** on a mark for a section behind the author that owes required work. Its presence is what distinguishes "outstanding behind" from "not yet reached" in the accessible name (FR-008), so the renderer branches on structure rather than inferring position. |

`ProgressDotKind` stays exactly `"completed" | "current" | "upcoming"` — no fourth member, no
fourth shape (FR-031, Q4). A hollow-behind mark is `kind: "upcoming"` **plus**
`outstandingCount`.

## Extended — `surveySessionStore` traversal action

| Change | Rule |
|---|---|
| One section-id-taking backward-landing action replaces `jumpToStep` + `backToUnfinishedGallery` | Truncates `history` when the target is present in it; takes the balanced-pop path when the target is in `visited` only. Backward-only — a target in neither is still a no-op, so a lock can never be skipped. |

This is a consolidation, not a new slice: no field is added to the store's state, and the
`markedForLaterDesktop` / `markedForLaterTouch` slices keep their current meaning (FR-014).

## Not modeled, deliberately

- **No per-letter entity.** A character is never an addressable unit of the row (FR-001, FR-033).
- **No "skipped deliberately" record.** Unanswered and never-asked stay indistinguishable in the
  decision record; `required` alone decides what is owed (spec Out of scope).
- **No persisted walk.** Walks stay session-scoped; reload correctness comes from sourcing coverage
  from the working copy instead (research R5).
