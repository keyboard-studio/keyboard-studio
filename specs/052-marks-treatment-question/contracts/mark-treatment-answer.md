# Contract: the marks-station answer type

**Owning package**: `@keyboard-studio/engine` · **Module**: `packages/engine/src/marks/treatment.ts` · **Status**: breaking change, §18 process applies

This is the interface the station, the worklist builder, and the strategy projection all code against. Every identifier below is pinned — consumers and tests use these exact strings.

## Types

```ts
/** Does this mark receive a key of its own? */
export type MarkTreatment = "own-key" | "composed";

/** A base+mark combination elected onto a dedicated key. NFC-normalised. */
export type PromotedComposedCharacter = string;

/** The complete S2 answer. One per keyboard. */
export interface MarkTreatmentAnswer {
  /** Class-level treatment, seeded from the prefill. Keyed by MarkClass.id. */
  classTreatment: Record<string, MarkTreatment>;
  /** Per-mark overrides only. An absent mark inherits its class's answer. */
  markTreatment: Record<string, MarkTreatment>;
  /** Promoted composed characters. Independent of treatment (FR-003). */
  promoted: PromotedComposedCharacter[];
  /** One value per keyboard, folded in from the retired S3 station (FR-004). */
  inputOrder: MarkInputOrder;
}
```

`MarkInputOrder` is the existing contract type from `@keyboard-studio/contracts` (`axes.ts`, sub-axis A3a) — reused, not redefined.

## Functions

```ts
/** Resolve one mark's effective treatment: override, else class, else prefill. */
export function treatmentFor(
  mark: string,
  answer: MarkTreatmentAnswer,
  classes: MarkClass[],
  prefills: MarkTreatmentPrefill[],
): MarkTreatment;

/** The prefill each class's answer starts from (FR-009: never an open choice). */
export interface MarkTreatmentPrefill {
  classId: string;
  recommended: MarkTreatment;
  /** Composed characters proposed for promotion, already budget-filtered. */
  promotionProposal: PromotedComposedCharacter[];
  signals: {
    /** Widest attested base count among the class's marks. */
    productivitySpread: number;
    /** The base keyboard's own mechanism, when detectable. */
    baseMechanism: BaseMarkMechanism | null;
    /** False when the key budget cannot seat the promoted keys (FR-015). */
    promotionAffordable: boolean;
    /** Plain-language reason, present iff promotionAffordable is false. */
    unaffordableReason?: string;
  };
}

/** Whether promotion is offered at all for this class (absent vs. unavailable). */
export function promotableCharacters(
  alphabet: ConfirmedAlphabet,
  markClass: MarkClass,
  attachments: Record<string, Record<string, boolean>>,
  bcp47?: string,
): PromotedComposedCharacter[];

/** Additively derive uppercase counterparts of promoted characters (FR-023). */
export function expandCaseCounterpartPromotions(
  alphabet: ConfirmedAlphabet,
  promoted: PromotedComposedCharacter[],
  bcp47?: string,
): PromotedComposedCharacter[];
```

`buildPlacementWorklist`'s input replaces the two old fields with the answer record:

```ts
export interface WorklistInputs {
  alphabet: ConfirmedAlphabet;
  classes: MarkClass[];
  attachments: Record<string, Record<string, boolean>>;
  /** REPLACES `mentalModel` + `markOverrides` + `inputOrder`. */
  treatment: MarkTreatmentAnswer;
  prefills: MarkTreatmentPrefill[];
}
```

## Behavioural guarantees

| Guarantee | Requirement |
|---|---|
| `classTreatment` and `promoted` are independently settable; setting either never clears the other | FR-003 |
| A mark resolving to `own-key` **and** having promoted combinations produces both a `MarkUnit` and the promoted `ownLetterUnits` entries | FR-005, FR-006 |
| `expandCaseCounterpartPromotions` is additive and never removes a member | FR-023 |
| Every mark resolves to a treatment; there is no unanswered state | FR-009 |
| A class may be internally mixed; nothing downstream assumes one treatment per class | mixed-class edge case |
| Promotion is **absent** when there is nothing to promote, and **unavailable with a reason** when the budget cannot seat it — these are distinct states | FR-015, edge cases |
| `composed` is always selectable regardless of budget | FR-017 |

## Removed identifiers

These are **deleted**, not deprecated — the whole point is that the old vocabulary stops existing:

| Removed | Replaced by |
|---|---|
| `MentalModelAnswer` (`"own-letter" \| "letter-plus-mark"`) | `MarkTreatment` (`"own-key" \| "composed"`) |
| `MentalModelPrefill` | `MarkTreatmentPrefill` |
| `computeMentalModelPrefills` | `computeMarkTreatmentPrefills` |
| `WorklistInputs.mentalModel` / `.markOverrides` / `.inputOrder` | `WorklistInputs.treatment` |
| `verifyWorklistCoverage`'s `classified twice` problem string | nothing — the state it reported is now intended (FR-006) |
| `MentalModelStation` (studio component) | `MarkTreatmentStation` |
| `InputOrderStation` (studio component) | folded into `MarkTreatmentStation`; the retired question module `survey/questions/reserve/pb_mark_input_order.ts` stays on disk and remains the content source |

Barrel exports in `packages/engine/src/index.ts` (lines ~190–193) update in the same change.

## §18 change record

`@keyboard-studio/engine` is at `0.1.0`. Under pre-1.0 semver the breaking signal is the **minor**, so this lands as `0.1.0 → 0.2.0`; §18's "major version bump" intent is satisfied by the pre-1.0 convention. A joint engine+content session is required and its outcome is recorded in [docs/spec-signoff.md](../../../docs/spec-signoff.md).

This is **not** the `Pattern` schema, so Constitution Article I's stop-and-escalate does not fire — verified: `MentalModelAnswer` is declared in `packages/engine/src/marks/mental-model-prefill.ts`, is absent from `packages/contracts/src/pattern.ts`, and has no zod mirror or drift guard in `packages/contracts/src/schemas.ts`.
