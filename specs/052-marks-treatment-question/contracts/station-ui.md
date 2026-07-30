# Contract: the S2 station UI

**Component**: `packages/studio/src/survey/marks/MarkTreatmentStation.tsx` (replaces `MentalModelStation.tsx`) · **Demo widget**: `MarkDemoWidget.tsx`

The handles tests and assistive technology code against. `data-testid` values and ARIA roles are pinned — they are the assertion surface for SC-004, SC-005, and SC-006.

## Station handles

| Handle | Kind | Notes |
|---|---|---|
| `marks-treatment` | `data-testid` on the station `<section>` | Replaces `marks-mental-model`. The jargon and framing assertions read this subtree's `textContent`. |
| `treatment-<classId>` | `data-testid` per class block | Replaces `mental-model-<classId>`. |
| `treatment-option-<classId>-<value>` | `data-testid` per option | `value` ∈ `own-key` \| `composed`. |
| `promotion-<classId>` | `data-testid` on the promotion group | **Absent from the DOM** when there is nothing to promote; **present and disabled** with a visible reason when the budget cannot seat it. The absent/unavailable distinction is asserted on presence, not on text. |
| `promotion-<classId>-<char>` | `data-testid` per promotable character | `char` is the NFC composed character. Offered on lowercase and caseless bases only. |
| `promotion-unavailable-reason-<classId>` | `data-testid` | Present iff promotion is unavailable. Plain language, no jargon. |
| `input-order` | `data-testid` on the folded order group | Same two options as the retired `InputOrderStation`; content still read from `survey/questions/reserve/pb_mark_input_order.ts` (relocated, never duplicated). |
| `marks-continue` | existing `data-testid` | Unchanged. |

## Demonstration handles (US2)

| Handle | Kind | Notes |
|---|---|---|
| `demo-<classId>-<optionValue>` | `data-testid` on each option's demo | One demo per **offered** option (SC-005). |
| `demo-key-<n>` | `data-testid` per demo key, `n` from 1 | Two or three keys, built from the author's own confirmed letters and marks (FR-010). |
| `demo-output` | `data-testid` | The text produced so far. Matches what the finished keyboard would produce for that option. |
| `demo-pending` | `data-testid` | Present **only** in the pending intermediate state of the `prefix` demo (FR-011). |
| `demo-reset` | `data-testid` | Returns the demo to its initial state. |

## ARIA and interaction

| Contract | Requirement |
|---|---|
| Each class's options are a `role="radiogroup"` with an `aria-label` naming the class | existing convention, preserved |
| The promotion group is a set of checkboxes, not radios — promotion is a set, and independent of treatment | FR-002, FR-003 |
| The pending state carries `role="status"` and `aria-live="polite"`, announcing a mark awaiting a letter | FR-011, US2 AC2 |
| Option selection and demo controls are **separately reachable** by keyboard, and neither traps focus | US2 AC6 |
| Operating a demo does **not** change the selection, mutate the working copy, or emit a diagnostic | FR-012, US2 AC1/AC5 |
| Demos advance **only** on author action — no timer, no autoplay | FR-013 |
| The recommended option is pre-selected and tagged `(suggested)`; no option set renders unanswered | FR-009 |

## Assertion surface

These are the checks that make SC-004 "verified by assertion, not review". The precedent is the existing `SC-005: the station never renders the words Unicode or normalization` test in `MarksSeriesStep.test.tsx`.

| Assertion | Requirement |
|---|---|
| Over a fixture matrix (Latin cased, Devanagari dependent vowel sign, Arabic ḥaraka, Hebrew niqqud, caseless), the `marks-treatment` subtree's `textContent` matches **none** of `/letter of the alphabet/i`, `/its own letter/i`, `/alphabet/i` | FR-007, SC-004, US1 AC4 |
| The same subtree matches none of `/dead ?key/i`, `/unicode/i`, `/normali[sz]/i`, `/codepoint/i`, `/precomposed/i` | FR-008, SC-004 |
| Every offered option has a `demo-<classId>-<optionValue>` node | FR-010, SC-005 |
| In the `prefix` demo, after **every** key press the subtree renders either `demo-pending` or non-empty `demo-output` — there is no press after which the demo appears to have done nothing | FR-011, SC-006, US2 AC2 |
| In the `postfix` demo, after the first press `demo-output` shows the bare letter (the side-by-side contrast with pending) | US2 AC3 |
| Operating a demo leaves the selected radio and the working-copy revision unchanged | FR-012 |
| The rendered station count for the whole series is at most 4 | FR-018, SC-003 |
| A fully-attested single-mark orthography still confirms in at most 2 rendered screens | SC-002 |
| A class with nothing to decide renders no screen and takes treatment, promotion, **and** order from the proposal | FR-019, US1 AC6 |
| An alphabet edit re-proposes treatment, promotion, and order, and returns the author to the first station | FR-020, US1 AC7 |

## Series-level changes

`MarksSeriesStep.tsx`:

- `MarksStationId` drops `"marks_input_order"`; the remaining ids are `marks_attachment`, `marks_treatment`, `marks_output_form`, `marks_stacking` — **four**, down from five (FR-018, SC-003).
- `computeMarkTreatmentPrefills` is called with the real key budget: `{ baseIr, keyBudget }` instead of today's `{ baseIr }`.
- The phase result gains `computedAxes` (US4): `{ diacriticBehavior, markInputOrder }`.
- The output-form station remains a **separate whole-keyboard question**, still deriving its proposal from this station's answers (FR-022) — `resolveOutputFormProposal` now reads "at least one mark is `own-key`" where it read `hasLetterPlusMarkClass`.
