# Phase 1 Data Model: Uppercase-counterpart suggestion

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

No locked contract type changes (see [research.md](research.md) R8). Everything below is either new
studio-local UI state or a new **slot value** on an existing `MechanismRef`.

---

## 1. `CasePairProposal` (new, studio-local)

The spec's "Case-pair suggestion" entity. A discriminated union over the four mechanisms, so the
mechanism-specific apply data is type-checked rather than optional-everything.

**Location**: `packages/studio/src/editors/assignLoop/casePairCompanion.ts`

```ts
interface CasePairProposalCommon {
  /** The lowercase character whose placement raised this proposal. */
  originalChar: string;
  /** The uppercase counterpart, from caseCounterpart() only. Never derived locally. */
  counterpart: string;
}

type CasePairProposal =
  | (CasePairProposalCommon & {
      mechanism: "physical";
      vkey: string;
      capsHandling: boolean;
      /** Identity (object reference) of the assignment this was raised for. */
      baseAssignment: MechanismAssignment;
    })
  | (CasePairProposalCommon & {
      mechanism: "combo";
      /** S-02 dead key or S-03 sequence — selects the apply shape. */
      combo: DeadkeyCombo | SequenceCombo;
      baseAssignment: MechanismAssignment;
    })
  | (CasePairProposalCommon & {
      mechanism: "touch";
      hostKey: string;
      /** Layer the parallel placement targets — casePairTouchLayer(editingLayer). */
      targetLayer: TouchLayerId;
      /** Identity of the touch mechanism ref this was raised for. */
      baseRef: MechanismRef;
    })
  | (CasePairProposalCommon & {
      mechanism: "ralt-layer";
      vkey: string;
      /** The lowercase placement's own modifiers (e.g. ["RALT"]) — never
       *  includes SHIFT itself; the confirm handler adds it. */
      baseModifiers: ModifierToken[];
      baseAssignment: MechanismAssignment;
    });
```

### Fields and rules

| Field | Rule |
|---|---|
| `originalChar` | Exactly one code point, `\p{Ll}`. NFC — guaranteed upstream by `mergePhaseResults` (see `SequenceBuilderPanel` L236–244). |
| `counterpart` | **Only** from `caseCounterpart(originalChar, bcp47)` with `direction === "toUpper"`. A `null` result means no proposal is constructed (FR-002). |
| `capsHandling` | Physical only. From `planShiftAssignment(ir, "main", vkey).capsHandling`. Selects the confirm branch (research R10). |
| `baseAssignment` / `baseRef` | Object identity, never target/index (FR-008). A proposal whose base object is no longer present in the assignment list is **stale**: dismiss silently, record nothing. |
| `targetLayer` | Touch only. Always `casePairTouchLayer(editingLayer)`; never a literal. |
| `baseModifiers` | RAlt-layer only. The lowercase placement's own `ModifierToken`s (e.g. `["RALT"]`), captured at the moment the S-08 suggestion is accepted. Never includes `SHIFT` — the confirm handler adds it when building the parallel `altgrKeyList`. |

### Lifecycle

```
(no proposal) --apply of a lowercase cased letter--> pending
pending --confirm--> uppercase recorded on parallel slot --> (no proposal)
pending --dismiss--> nothing recorded                     --> (no proposal)
pending --currentChar changes--> (no proposal)
pending --base assignment no longer present--> (no proposal), nothing recorded
```

At most **one** proposal is pending per gallery at any time. Transient per apply (research R9) — no
persistence, so no stale dismissal state.

### Suppression conditions (all → no proposal is constructed)

1. `caseCounterpart` returns `null`, or `direction !== "toUpper"` (FR-002, uppercase→lowercase is out of scope).
2. Physical: `!shiftLayerAllowed` (mnemonic layout) or the apply targeted the shift layer already (FR-010).
3. Combo: the input side is not a single cased character with a non-null counterpart (research R4).
4. Touch: no counterpart, or `casePairTouchLayer(editingLayer)` returns `null`.
5. RAlt-layer: raised only from the S-08 suggestion-accept path (never the manual "Assign to a key"
   RAlt combo picker, which has no reliable signal that an arbitrary chosen combo is a lowercase
   case-pair's RAlt layer); suppressed when `baseModifiers` already includes `SHIFT`.
6. Any mechanism: the counterpart is **already produced on the parallel slot** (spec Edge Cases) — for
   RAlt-layer, this means `counterpart` already has a `PATTERN_RALT` mechanism whose `altgrKeyList`
   names the same `vkey`.

---

## 2. `DeadkeyCombo` / `SequenceCombo` (new, studio-local)

The two combo shapes, mirroring the existing slot vocabulary exactly (research R2/R3). Case-shifting
applies to the **base/content letter and the output**, never to the trigger/indicator.

```ts
interface DeadkeyCombo {           // PATTERN_DEADKEY, S-02
  kind: "deadkey";
  triggerKey: string;              // unchanged in the parallel combo
  deadkeyName: string;             // unchanged
  accentChar: string;              // unchanged
  baseLetter: string;              // case-shifted in the parallel combo
}

interface SequenceCombo {          // PATTERN_SEQUENCE, S-03
  kind: "sequence";
  content: string;                 // firstLetterOut — case-shifted; single cased char only
  indicator: string;               // secondLetter — unchanged (a physical key by construction)
}
```

### Derived parallel slot values

| Source mechanism | Slot | Parallel value |
|---|---|---|
| S-02 | `triggerKey`, `deadkeyName`, `accentChar` | unchanged |
| S-02 | `baseLetters` | `caseCounterpart(baseLetter).counterpart` |
| S-02 | `accentedForms` | `counterpart` (the uppercase output) |
| S-03 | `secondLetter` | unchanged |
| S-03 | `firstLetterOut` | `caseCounterpart(content).counterpart` |
| S-03 | `collapsedChar` | `counterpart` |

Both the input side and the output side must resolve through `caseCounterpart`; if either returns
`null`, no proposal (research R3/R4).

---

## 3. `TouchLayerId` + `casePairTouchLayer` (new)

**Location**: `packages/studio/src/editors/assignLoop/touchBehavior.ts` (existing touch-logic module).

```ts
/** Touch layer ids, matching comboToTouchLayerId's vocabulary. */
type TouchLayerId = "default" | "shift" | "caps" | string;

/** The casing-parallel layer for `editingLayer`, or null when there is none. */
function casePairTouchLayer(editingLayer: TouchLayerId): TouchLayerId | null;
```

| `editingLayer` | Returns | Note |
|---|---|---|
| `"default"` | `"shift"` | The only case reachable in v1 (research R6) |
| `"shift"`, `"caps"` | `null` | Already an uppercase layer — nothing to pair |
| anything else | `null` | No defined casing parallel; caller raises no proposal |

`editingLayer` is a new explicit value in TouchGallery, fixed to `"default"` in v1 — named so a future
layer selector widens this mapping instead of rewriting the proposal site.

---

## 4. Touch mechanism `layer` slot value (extended)

**Type**: unchanged. `MechanismRef.slotValues` is `Record<string, string>`
([assignmentMap.ts](../../packages/contracts/src/assignmentMap.ts) L51) — this is a new **key**, not a
new field (research R8).

```ts
// buildTouchMechanismRef output, all four touch methods:
{ patternId, slotValues: { hostKey, char, layer? , direction? } }
```

| Property | Rule |
|---|---|
| Producer | `buildTouchMechanismRef`, from the placed letter's case (FR-006): `\p{Lu}` → `"shift"`, else `"default"`. |
| Absent | Treated as `"default"` by both appliers — every existing assignment and fixture stays byte-identical. |
| Consumers | `applyTouchAssignments`, `applyTouchAssignmentsToRawJson`. |
| Unknown value | Warn + skip that mechanism. Never throw; never fall back to `default` (research R7). |
| Not consumed by | `extractMechanismHostKey`, `promoteOnManualEdit` — `hostKey` keeps its exact current meaning (a resolved vkey). |

**Dedup impact**: `mechanismRefEquals` (TouchGallery L1304) compares the full `slotValues` key set, so
`{K_A, á, default}` and `{K_A, Á, shift}` are correctly distinct refs. `appendMechanismToChar` is keyed
by character, and the counterpart is a different character — no interaction with the
`touch_inherited` exclusivity rules.

---

## 5. Existing entities touched (no shape change)

| Entity | Change |
|---|---|
| `MechanismAssignment` | None. Confirmed proposals produce assignments in the existing shapes. |
| `pendingCompanion` (MechanismGallery) | Replaced by the shared hook's `proposal`. Physical behavior byte-identical (SC-005). |
| `suggestionResolved` (TouchGallery) | **Untouched** — it governs the placement suggestion card, a different object (research R9). |
| `Pattern`, `Criterion`, zod schemas | None. Article I not engaged. |
| `content/patterns/touch/*.yaml` | None — touch refs are code-applied, not YAML-substituted (research R8). |

---

## Invariants

1. **One casing source.** Every uppercase character in this feature originates from
   `caseCounterpart(char, bcp47)`. No `toUpperCase()` call is introduced anywhere on the proposal path
   (FR-002). The one existing `.toUpperCase()` in TouchGallery L1194 builds a **vkey name** (`K_A`), not
   a letter, and stays.
2. **Identity, not identity-by-value.** Confirm resolves its base by object reference (FR-008).
3. **Propose, never apply.** No code path records an uppercase placement without an explicit confirm
   (FR-001, spec §3c).
4. **One pending proposal per gallery**, cleared on confirm / dismiss / character change.
5. **Absent `layer` === `"default"`**, so the change is backward-compatible with every stored
   assignment and every existing fixture.
