# Data model: spec 106

All of these are decision values or derived data. No new stores exist (Constitution Art. III).

## DecisionPointFixture (test-only)

| Field | Type | Notes |
|---|---|---|
| `base` | corpus id (`basic_kbdus`, `basic_kbdfr`, `sil_cameroon_qwerty`, `sil_cameroon_azerty`) | Loaded from `../keyboards/release` via `sc004Harness.loadVfs`. |
| `track` | `copy` \| `adapt` | Chooses `instantiateFromStart` or `instantiateFromExisting`. |
| `profile` | a #2302 case id (e.g. `p1-whole-bafut-kbdus`) | Source of the record. |
| `point` | `marks` \| `carve` \| `assignments` \| `caps` \| `tolerance` (in this order) | The cut point: an explicit allow-list of ids plus sub-field masks (tasks T009). |
| `decisions` | `DecisionSet` JSON | Produced by `recordToDecisionSet(record, point)` and committed. |
| `slices` | assignments, `deadkeyOverlay.ops`, carve sets, `touchLayoutJson`, `fallbackPolicy`, `contextToleranceOverlay` | Store slices that replay does not rebuild (research R1). Derived from `decisions` by the harness, not hand-written. |
| `expect` | `Record<GateId, "pass" \| "expected-fail">` | `expected-fail` maps to `it.fails` and flips per story. |

## ConsistencyGate

`G1`-`G7`; see [contracts/consistency-gates.md](contracts/consistency-gates.md). The gate result
is `{ gate, pass, detail: string[] }`. The detail lists offending rules or characters.

## MarksGuardsInput (projection input)

`{ worklist: PlacementWorklist; outputForm: OutputForm; backspace?: BackspaceBehaviour; stacks?: AttestedStack[]; bareMarkBehaviour?: "swallow" | "emit" }`

- Derived from `MarksTreatmentValue.completion` and `guardSpecification.behaviour`.
- `PlacementWorklist` gains `allowedContexts?: Record<mark, string[]>`, which holds U+0020 when the
  space column is ticked.

## Attachment answer (existing key, new column)

- `marks_attachment.<mark>|<base>` with `base = " "`.
- Default false. Missing means false.
- It is never case-expanded and never part of `alphabet.bases`.

## CarveRemovalItem (extended)

`{ kind; id; provenance: "asked" | "derived" | "extracted" }`. `derived` means a suggested discard
applied as a default.

`CarvedLayoutValue` gains:

- `suggestionFingerprint?: string`: the `recommendedRemovalChars` set whose defaults were applied.
  When the set is unchanged, defaults are not re-applied on a later visit.
- `displacedDeclined?: string[]`: needed characters whose demotion the author declined (FR-043).

Decision-set provenance of `carved-layout`:

- `default` while only derived items are present;
- `asked` once any toggle happens.

## CapsHandlingValue (new decision `caps-handling`)

| Field | Type | Notes |
|---|---|---|
| `mode` | `"cased-keys" \| "explicit-rules" \| "none"` | |
| `keys` | `"letters" \| "azerty-extended" \| string[]` | This is the floor. The projection unions it with the keys that carry a cased pair. |
| `simplification` | `{ offered: boolean; withheldReason?: string; accepted?: boolean }` | Adapt track only. |

Provenance by track:

- **Copy**: `default`.
- **Adapt**, start IR already has `&CasedKeys`: `extracted`.
- **Adapt**, otherwise: `default`, holding the offer.
- **Any track** once the author changes it: `asked`.

## MarksContextToleranceDecision (extended)

- New field `origin?: "default" | "asked"`: `default` when the decision was recorded on the author's
  behalf because the report had gaps.
- It is additive and optional, and needs a zod mirror.

## ClaimedInput (derived, never stored)

`slotKeyFor(vkey, modifiers)`. Sources:

- S-01 `kmnRules`;
- S-08 `altgrKeyList`;
- the S-02 trigger, plus `RALT trigger` when the escape is kept;
- the postfix-compose mark key.
