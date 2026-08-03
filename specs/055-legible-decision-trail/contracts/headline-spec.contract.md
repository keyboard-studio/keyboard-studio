# Contract: headline selection

The pure selection surface in `packages/studio/src/decisions/headline.ts` and the catalog messages it selects. Studio-side; nothing here is persisted.

The split this contract exists to preserve: **`headline.ts` decides which message and with what values; the component renders it.** 053 FR-013 requires that decision to be testable without rendering, and FR-011's zero-suppression plus FR-012's plural agreement both become properties of the *selection* under this shape. Keep them there.

## §1 Function surface

```ts
export interface HeadlineDeps {
  /** Author-facing name for a question, or undefined when none is resolvable. */
  lookupQuestionLabel: (questionId: string) => string | undefined;
}

export function headlineFor(entry: DecisionEntry, deps: HeadlineDeps): HeadlineSpec;
export function headlineOf(
  payload: DecisionPayload,
  provenance: DecisionProvenance,
  deps: HeadlineDeps,
): HeadlineSpec;
```

`lookupQuestionLabel` is **injected**, not imported. That is what lets a unit test assert selection against a stub map with no catalog, no `I18n`, and no DOM.

Its production implementation resolves, in order:

1. `resolveContentString("flowQuestions", questionId, "audit_label", englishAuditLabel, i18n)` when the question declares one;
2. `resolveContentString("flowQuestions", questionId, "prompt", englishPrompt, i18n)`;
3. `undefined`.

This is the seam `QuestionField.tsx` already uses. No second per-question label store is introduced (FR-009).

## §2 `HeadlineSpec`

```ts
export type QuestionName =
  | { known: true; label: string }
  | { known: false };          // selects the FR-014 fallback message

export type HeadlineDimensionKind =
  | "keysRemoved" | "keysAdded" | "mechanismsAssigned" | "touchKeysAffected";

export interface HeadlineDimension {
  kind: HeadlineDimensionKind;
  count: number;               // always present and > 0 — see §3
}

export type HeadlineSpec =
  | { id: "chose"; question: QuestionName; value: string }
  | { id: "acceptedSuggested"; question: QuestionName; value: string; source: string }
  | { id: "fromBase"; question: QuestionName; value: string }
  | { id: "editorStep"; stage: EditorActionType; dimensions: readonly HeadlineDimension[] }
  | { id: "editorStepNoChange"; stage: EditorActionType }
  | { id: "editorStepUnmeasured"; stage: EditorActionType }
  | { id: "baseContribution"; baseName: string; startingKeyCount?: number;
      derivedAxisCount: number; inheritedFieldCount: number };
```

No variant carries a `questionId`, an `actionType` string used as prose, a `stepId`, a message id, or a field name. `stage` is a **code** the component maps to a message; it never reaches text (FR-008).

## §3 Selection rules

**Dimensions (FR-011, SC-004).** `dimensions` contains one entry per count that is **present and non-zero**, in the fixed order `keysRemoved`, `keysAdded`, `mechanismsAssigned`, `touchKeysAffected`. An absent count and a present `0` are both omitted — they are different findings but neither is something that happened, and the headline reports what happened.

**Three editor outcomes, distinguished.** The distinction is the whole point of FR-005 and SC-011:

| Counts | Spec selected | Renders as |
|---|---|---|
| at least one present and non-zero | `editorStep` | the non-zero dimensions only |
| all present, all zero | `editorStepNoChange` | "changed nothing", in words (US1 scenario 5) |
| all absent | `editorStepUnmeasured` | "what this stage did was not recorded" |

A pre-feature record normalized per [record-shape.contract.md](record-shape.contract.md) §5 lands in the third row, which is how SC-011 holds without a banner.

**Question naming (FR-009, FR-014).** `question` is `{ known: true, label }` when the lookup resolves, `{ known: false }` otherwise. The unknown branch selects a fallback message that reads as prose — "a question this build no longer has" — never a blank and never an identifier. Because a prompt is always present for a live question, this branch carries no routine traffic.

**Agency mapping (unchanged from 053).** `hand-set` → `chose`; `tool-proposed` → `acceptedSuggested`; `base-derived` → `fromBase`. The `fromBase` branch stops being dead code once `resolveProposal` is wired (FR-032).

**Value formatting (unchanged).** `formatAnswerValue` keeps its `(blank)` / `(none)` distinction — "the author chose nothing" and "this is missing" are different answers (Edge Cases).

## §4 Message ids

Existing ids keep their meaning and are **not renamed** — an id is a permanent handle (spec 046). `trail.entry.headline.editorStep`'s *meaning* changes (it no longer enumerates four fixed counts), so it is retired in favour of the composed ids below rather than silently repurposed.

| Id | Purpose |
|---|---|
| `trail.entry.headline.chose` | unchanged |
| `trail.entry.headline.acceptedSuggested` | unchanged |
| `trail.entry.headline.fromBase` | unchanged — reachable at last |
| `trail.entry.headline.question.unknown` | new — FR-014 fallback |
| `trail.entry.headline.stage.galleryEdit` | new — stage name |
| `trail.entry.headline.stage.mechanismEdit` | new — stage name |
| `trail.entry.headline.stage.touchEdit` | new — stage name |
| `trail.entry.headline.dimension.keysRemoved` | new — ICU plural |
| `trail.entry.headline.dimension.keysAdded` | new — ICU plural |
| `trail.entry.headline.dimension.mechanismsAssigned` | new — ICU plural |
| `trail.entry.headline.dimension.touchKeysAffected` | new — ICU plural |
| `trail.entry.headline.editorStep.composed` | new — joins stage name + dimension list |
| `trail.entry.headline.editorStep.noChange` | new |
| `trail.entry.headline.editorStep.unmeasured` | new |
| `trail.entry.headline.baseContribution` | new |
| `trail.entry.impact.shared` | new — states the change is shared, names co-decisions |
| `trail.stage.rollUp` | new — the collapsed stage line (US5) |

Every count in a dimension message uses an ICU plural so FR-012 holds in every locale, not by English coincidence.

## §5 Agreement with the reviewer-facing surface (FR-015, SC-007)

`packages/engine/src/decision-audit/prSummary.ts` and this module render the same record and must agree on **stage naming, zero-suppression, and singular/plural discipline** — while each remains responsible for its own text. The engine ships codes and counts; the studio ships the localized sentence (053 FR-016).

Concretely:

- The studio's stage messages **adopt the wording** of the engine's `EDITOR_LABEL` ("Edited the character gallery", "Assigned key mechanisms", "Edited the touch layout"). They do not import it — an engine string in the trail would make it permanently monolingual.
- `formatEditorSummary`'s existing zero-drop is the behaviour §3 formalises; the engine side additionally learns to skip **absent** counts and to say "not measured" when all four are absent, rather than treating `undefined` as falsy alongside `0`.
- `formatEffect` gains a per-file rendering for the widened captured impact and a shared-change note when `sharedWith` is present.

A test that generates both surfaces from one record and compares stage names, mentioned dimensions, and counts is what makes SC-007 mechanical rather than aspirational.

## §6 What must not regress

- `data-testid` values in `DecisionEntryRow.tsx` and `DecisionTrailView.tsx` are the trail-UI contract (053 `trail-ui.contract.md` §2). Grouping adds test ids; it renames none.
- Expanding one entry resolves one impact. Rendering a stage roll-up must not resolve any (FR-021, SC-009).
- Superseded entries stay in the DOM, hidden rather than filtered (053 FR-015).
