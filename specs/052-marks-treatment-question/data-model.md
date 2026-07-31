# Data Model: Marks treatment question

Entities this feature introduces or reshapes, with the fields, relationships, validation rules drawn from the requirements, and the state transitions re-proposal depends on. Identifiers here are the ones the contracts pin — see [contracts/](contracts/).

## 1. `MarkTreatment` — per-mark mechanism (FR-001)

Replaces `MentalModelAnswer` (`"own-letter" | "letter-plus-mark"`), whose vocabulary asserted orthographic unithood.

```ts
/** Does this mark receive a key of its own? (packages/engine/src/marks/treatment.ts) */
export type MarkTreatment = "own-key" | "composed";
```

| Value | Meaning | Worklist consequence |
|---|---|---|
| `own-key` | The mark earns a dedicated key (or deadkey) and combines with any letter it may attach to | One `MarkUnit` in `markUnits`, carrying the keyboard's `inputOrder` |
| `composed` | The mark has no key of its own; each reachable combination is produced as a whole unit | Each reachable base+mark pair enters `ownLetterUnits` |

**Relationships.** Seeded per `MarkClass` (`packages/engine/src/marks/mark-classes.ts`), overridable per mark. Storage keeps the existing two-map shape so the class-then-override path is preserved rather than reinvented:

- `classTreatment: Record<MarkClassId, MarkTreatment>` — the class-level answer, seeded from the prefill.
- `markTreatment: Record<Mark, MarkTreatment>` — per-mark overrides only; absent means "inherit the class".

**Validation rules.**
- Every mark in `alphabet.marks` MUST resolve to a treatment: its own override, else its class's answer, else the prefill recommendation. There is no unanswered state — FR-009 forbids one.
- An override key that is not in `alphabet.marks` is dropped on re-proposal, not carried.
- A class may be internally mixed (some marks `own-key`, some `composed`). This is legal and load-bearing — the spec's mixed-class edge case — so nothing may assume one treatment per class downstream.

**Naming note.** `own-key` / `composed` name the *mechanism*, deliberately. No value name may be read as a claim that a marked form is or is not a letter (FR-007).

## 2. `PromotedComposedCharacter` — the promotion set (FR-002)

```ts
/** A base+mark combination elected onto a dedicated key. NFC-normalised. */
export type PromotedComposedCharacter = string;
```

Stored as a set, **independent of treatment** (FR-003):

- `promoted: Set<PromotedComposedCharacter>` (serialised as a deduped, NFC-normalised, first-appearance-ordered array to match the existing store conventions).

**Relationships.** Each member corresponds to a reachable base+mark pair — a pair whose attachment row is checked at S1. Membership does **not** depend on the pair's mark treatment: a mark may be `own-key` and still have promoted combinations, which is precisely the Cameroonian tone case FR-003 exists for.

**Validation rules.**
- Every member MUST be reachable: its base+mark pair is checked in the (case-expanded) attachment map. A member whose pair becomes blocked by an alphabet edit is withdrawn on re-proposal.
- Members are offered only on **lowercase and caseless** bases, matching the station's existing convention (spec 049 US1). The uppercase counterpart is **derived**, never asked (FR-023).
- **Derivation is additive and never withdraws** (FR-023): promoting `é` adds `É` when `É` is present in `alphabet.bases`-derived case data and has a single-character uppercase form. A cased base whose uppercase form is absent, or which has no single-character uppercase form, is promotable on its own without error (edge case). This reuses the `caseCounterpart` primitive that `expandCaseCounterpartAttachments` already uses — no second casing rule.
- Promotion is **not offered at all** (absent, not empty) when there is nothing to promote: no attested combinations exist, or every reachable combination for the mark is already a dedicated unit because the mark is `composed` (edge cases).
- Promotion is **offered as unavailable with a plain-language reason** when the key budget cannot seat the additional keys (FR-015). Unavailable is distinct from absent: absent means "nothing to decide", unavailable means "a decision exists but the keyboard cannot honour it".

## 3. `MarkInputOrder` — folded in from the retired S3 (FR-004)

```ts
/** Existing contract type, unchanged. (packages/contracts/src/axes.ts — A3a) */
export type MarkInputOrder = "prefix" | "postfix";
```

**One value per keyboard**, not per mark or per class — unchanged from the retired `InputOrderStation`. Now recorded as part of the same S2 answer rather than at its own station, which is what reduces the series from five stations to four (FR-018, SC-003).

**Validation rules.**
- Meaningful only when at least one mark resolves to `own-key`; when every mark is `composed` the value is retained but inert (it describes a mark key that does not exist).
- Prefilled from the base keyboard's own behaviour when detectable (`detectMarkInputOrderFromImport` → `session.axes.markInputOrder`), else `"postfix"` — the existing prefill, preserved.
- `"prefix"` is never withheld from the option set (D5: no touch-only target exists), and is never *producible as a deadkey on touch* — the touch derivation resolves it to a long-press subkey menu (FR-014).

## 4. `KeyBudget` — the single authoritative determination (FR-016)

```ts
/** packages/contracts/src/keyBudget.ts */
export type KeyBudgetBand = "many" | "ralt-only" | "fully-booked";

export interface KeyBudget {
  band: KeyBudgetBand;
  /** Unbound stock keys in the planes the band says are still available. */
  spareKeys: number;
  /** Human-readable measurement provenance (plane counts over the stock layout). */
  notes: string;
}
```

**Relationships.** One determination per base keyboard, measured from its `KeyboardIR`. Two consumers, both **derived** from it, never computed independently:

| Consumer | Derivation |
|---|---|
| Marks-station affordability (FR-015) | `spareKeys` feeds the treatment prefill's promotion gate |
| Facet index `spare-key-budget` | `band` verbatim (the classifier becomes a delegate) |
| Axis A7 `spareKeyAvailability` | Projection, per the mapping table in [contracts/key-budget.md](contracts/key-budget.md). **Definition only** — this feature does not newly seed A7 into the live axis vector (research D2). |

**Validation rules.**
- The band mapping to A7 is **total and bijective** on the three bands, so decision rule 10's `"fully booked"` predicate fires on exactly the set of inputs it does today. This is the boundary FR-016 requires preserving.
- `spareKeys` is never negative. A base binding no stock physical key at all yields no measurement (`null`), and the caller falls back to the classifier's existing honest `undetermined` — it does **not** silently become "many".
- At least one option remains selectable regardless of budget (FR-017): the budget gates *promotion*, never treatment, so `composed` is always available.

## 5. `PlacementWorklist` — shape unchanged, invariant amended

```ts
/** packages/contracts/src/confirmedAlphabet.ts — UNCHANGED */
export interface PlacementWorklist {
  ownLetterUnits: string[];
  markUnits: MarkUnit[];
  blockedCombinations: BlockedCombination[];
}
```

No field is added, renamed, or retyped. A promoted composed character occupies the same `ownLetterUnits` slot a composed unit occupies today, so downstream galleries, runtime schemas, and persisted drafts are unaffected (FR-021, SC-010) — drafts load without migration.

**The invariant changes, not the shape.** Today `verifyWorklistCoverage` reports a `classified twice` problem when a mark appears both as a `MarkUnit` and inside an `ownLetterUnits` entry. FR-006 makes that state **intended**, so:

- The `classified twice` check is **deleted** (not suppressed, not worked around).
- The invariant becomes: every base and every mark in the confirmed alphabet is accounted for by **at least one** placement unit, with nothing unclassified (SC-009).
- Spec 046's SC-007 is amended from "exactly once" to match.

**Production rules** (`buildPlacementWorklist`):

| Input | Output |
|---|---|
| Every plain base letter | one `ownLetterUnits` entry |
| A mark resolving to `own-key` | one `markUnits` entry carrying `inputOrder` |
| A mark resolving to `composed` | each reachable pair → an `ownLetterUnits` entry |
| A promoted composed character | an `ownLetterUnits` entry, **regardless of its mark's treatment** |
| Any unchecked base × mark pair | a `blockedCombinations` entry (unchanged) |

Dedup is by NFC form, as today — so a pair that is both `composed`-produced and promoted yields one entry, and the *dual reachability* FR-006 permits is between the mark key and the dedicated key, not two identical units.

## 6. Derived axes — the US4 projection

The marks series' `SurveyPhaseResult` gains `computedAxes` (an existing additive optional field — no contract change):

```ts
computedAxes: {
  diacriticBehavior: DiacriticBehavior;   // A4, derived from the recorded treatments
  markInputOrder: MarkInputOrder;         // A3a, the recorded order
}
```

**Derivation rules.**
- At least one mark `own-key` with the class carrying two or more distinct mark families → `"multi-family"`; one family of stacking marks → `"stacking-combining"`; every mark `composed` → `"none"`. `"replacing-cycling"` is never derived here — it is a distinct behaviour this station does not elicit.
- A mixed class contributes its **dominant** treatment to the class-level axis, and the mix is surfaced (edge case).
- Precedence: an emitted `computedAxes` value wins over the script-class default-fill prior automatically, because `defaultFillAxes` structurally never overwrites an axis already present. The precedence is nonetheless **stated** in [specs/007-strategy-selection/spec.md](../007-strategy-selection/spec.md) §7.2 rather than left implicit (FR-025).
- FR-024's surfacing check runs on the **selected strategy**, after `selectStrategy` — not on the raw axis. A base whose own behaviour the author knowingly overrode is a legitimate override, not a disagreement (edge case).

## State transitions — re-proposal on an alphabet edit (FR-020)

Every derived input is keyed on the alphabet's **content** (`confirmedAlphabetKey`), as today. An edit that changes the evidence re-seeds **all** affected answers — which now means three, not one (the spec's "re-proposal must cover the new promotion and order answers, not only the treatment answer"):

```
alphabet content changes
  → attachment proposals recomputed
  → treatment prefills recomputed        → classTreatment re-seeded
                                         → markTreatment overrides pruned to surviving marks
  → promotable set recomputed            → promoted pruned to still-reachable pairs
                                         → uppercase derivations recomputed (additive)
  → key budget re-read (base unchanged → unchanged)
  → inputOrder re-seeded from the base prefill only if it had not been explicitly set
  → stationIndex resets to 0            → the affected decisions must be walked again
                                          before the series can complete
```

Skip conditions, unchanged in kind:

| Condition | Behaviour |
|---|---|
| `alphabet.marks` empty | S0 gate skips the whole series; empty worklist (unchanged) |
| A class with nothing to decide | No screen; **every** answer taken from the proposal — treatment, promotion, and order (FR-019) |
| Marks present, nothing attested | Promotion **absent**; treatment still answerable (edge case) |
| A mark attested only on an uppercase base | Treated as confirmed; summary must not render blank (edge case) |
| Caseless script | No case pairs to derive; the derived-capitals note must not claim otherwise (edge case) |
| Exhausted budget **and** high productivity | Both mechanisms constrained; the station still completes (FR-017, edge case) |
