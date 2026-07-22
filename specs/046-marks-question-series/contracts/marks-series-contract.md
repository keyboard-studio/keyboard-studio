# Contract: Marks Question Series (046)

The identifiers and shapes consumers and tests code against. These strings are pinned —
implementations must use them exactly as written here.

## Station ids (the series, in order)

| Station | id | Control semantics | Rendered? |
|---|---|---|---|
| S0 | `marks_gate` | computed gate | never (`engine_resolved`-equivalent inside the step host) |
| S1 | `marks_attachment` | one multi-select row per mark over the confirmed base letters | when series runs |
| S2 | `marks_mental_model` | one radio per mark-class (`own-letter` / `letter-plus-mark` / `mixed`) | when series runs |
| S3 | `marks_input_order` | radio (`prefix` / `postfix`), content relocated from `pb_mark_input_order` | only if ≥1 class is `letter-plus-mark` |
| S4 | `marks_output_form` | notice (unambiguous cases) or radio (open case), backspace preview mandatory | only if ≥1 decidable pair exists |
| S5 | `marks_stacking` | bool + attested-stack confirm list | only on stacking evidence |

Skip rule: `marks_gate` skips the entire series when the `marks` store is empty; the
mechanism gallery then receives an empty worklist and uses the existing plain-letter flow.

## Retired question ids (FR-025)

Removed from `content/flows/phase_b_characters.modular.yaml` and
`packages/studio/src/survey/questions/registry.b.ts`, with surrounding `next` routing
retargeted: `pb_accent_marks_gate`, `pb_diacritic_select`, `pb_mark_style`,
`pb_capitals_marks`, `pb_stacking_marks`.
Preserved-and-relocated (content + prefill behavior intact): `pb_mark_input_order` → S3.
Unchanged and out of scope: the digraph question (parallel wording only, FR-026).

## Contract types (packages/contracts/src/confirmedAlphabet.ts — new module)

Additive; zod mirrors land in `packages/contracts/src/schemas.ts` in the same change.

```ts
export type DeclaredRole = "letter" | "mark";

export interface AttestedStack {
  /** Exactly one base letter (NFC grapheme). */
  base: string;
  /** One or more marks, order preserved (closest to base first). */
  marks: string[];
}

export interface ConfirmedAlphabet {
  bases: string[];
  marks: string[];
  attestedStacks: AttestedStack[];
  /** PUA-only, keyed by character; permanent designer classification. */
  declaredRoles: Record<string, DeclaredRole>;
}

export type AttachmentState = "attested" | "plausible-accepted" | "blocked";

export interface MarkUnit {
  mark: string;
  inputOrder: "prefix" | "postfix";
}

export interface BlockedCombination {
  base: string;
  mark: string;
}

/** FR-020: every relevant unit classified into exactly one group. */
export interface PlacementWorklist {
  ownLetterUnits: string[];
  markUnits: MarkUnit[];
  blockedCombinations: BlockedCombination[];
}
```

Session/phase-result surface (additive optional fields):

```ts
// packages/contracts/src/surveyPhaseResult.ts
interface SurveyPhaseResult {
  /* ...existing... */
  alphabet?: ConfirmedAlphabet;         // three-store model; confirmedInventory derived
  marksWorklist?: PlacementWorklist;    // series exit state
}
// packages/contracts/src/surveySession.ts — same two fields merged onto SurveySession.
```

## Engine function seams (packages/engine/src/marks/)

```ts
// nfc-posture-of-inventory.ts — the shared pure function named by
// content/facets/orth/mark-composition-posture.yaml (derivation flips planned → implemented).
export interface PosturePair {
  stack: AttestedStack;
  hasReadyMadeForm: boolean;
  readyMadeForm?: string;
}
export function nfcPostureOfInventory(alphabet: ConfirmedAlphabet): PosturePair[];

// output-form-policy.ts — ordered decision table, house-target-policy row shape:
// first-match-wins, authored explanation text, mandatory default row.
export type OutputForm = "ready-made" | "base-plus-mark";
export function resolveOutputFormProposal(
  posture: PosturePair[],
  hasLetterPlusMarkClass: boolean,
): { form: OutputForm; presentedAs: "notice" | "open-choice"; explanation: string };

// worklist.ts — series answers → the gallery handoff.
export function buildPlacementWorklist(/* series decisions */): PlacementWorklist;
```

```ts
// packages/engine/src/character-discovery/decompose.ts
export function decomposeGrapheme(grapheme: string):
  { base: string; marks: string[] } | null;   // null: no known decomposition (incl. PUA)
```

## Validator + criteria (FR-022)

```ts
// packages/engine/src/validator/layer-b-uniformity.ts — IR-aware, layer-a-prime convention.
export function checkNormalizationUniformity(ir: KeyboardIR): LintFinding[];
// LintFinding.code: "KM_LINT_MARK_NORMALIZATION_UNIFORM", layer: "B"
```

Criteria: one new `layer-c-enforce` row carrying
`lintRuleId: "KM_LINT_MARK_NORMALIZATION_UNIFORM"`; enforced counts bump 148 → 149
(band split 40/**67**/32/10) in `packages/contracts/src/types.test.ts`,
`schemas.test.ts`, and `criteria-summary.md`.

## UI contract (routes / testids consumers and e2e code against)

- New spine step id: `marks` (manifest + `advance.ts` + `expectedSpine`), between `carve`
  and `mechanisms`.
- Forward control follows the survey convention `data-testid="survey-advance"`; station
  container testids: `marks-attachment`, `marks-mental-model`, `marks-input-order`,
  `marks-output-form`, `marks-stacking`; series continue control: `marks-continue`.
- E2E helper: `driveMarksSeries(page, ...)` in `packages/studio/e2e/helpers/surveyFlow.ts`,
  slotted between the characters helpers and `confirmMechanismsEmpty`.
- `MechanismGallery` accepts the worklist as an **optional prop** (`worklist?:
  PlacementWorklist`); absent ⇒ existing flat `lettersToAdd` behavior.

## Designer-facing text constraints

- The words "Unicode" and "normalization" never appear in any S4 prompt/option/help text
  (SC-005 — assert mechanically in the station's tests).
- Every station is prefilled propose-then-confirm; no station renders before the alphabet
  is confirmed (FR-024).
