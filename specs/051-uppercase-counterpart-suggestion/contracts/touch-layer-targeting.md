# Contract: touch-layer targeting (engine)

**Feature**: [../spec.md](../spec.md) · **Rationale**: [../research.md](../research.md) R5–R7

Today both touch appliers mutate the phone platform's `"default"` layer and nothing else, so a touch
placement cannot express which case-layer it belongs to. This contract adds that capability. It is the
prerequisite for FR-005 and the actual substance of FR-006.

## The `layer` slot value

```ts
// MechanismRef.slotValues — a new KEY on an existing Record<string, string>.
{ hostKey: "K_A", char: "Á", layer: "shift" }
```

| Property | Contract |
|---|---|
| Type | `string`. No contracts-package type change ([../research.md](../research.md) R8). |
| Vocabulary | Touch layer ids as produced by `comboToTouchLayerId` — `"default"`, `"shift"`, `"caps"`, … |
| **Absent** | Treated as `"default"`. Every pre-existing assignment, fixture, and stored draft behaves byte-identically. This is the compatibility guarantee the whole change rests on. |
| Producer | `buildTouchMechanismRef` derives it from the placed character's case: `\p{Lu}` → `"shift"`, otherwise `"default"` (FR-006). |
| `hostKey` | Meaning unchanged — a resolved vkey. The layer is **not** encoded into it. `extractMechanismHostKey` and `promoteOnManualEdit` keep working untouched. |

## `applyTouchAssignments` (IR path)

**File**: [applyTouchAssignments.ts](../../../packages/engine/src/pattern-apply/applyTouchAssignments.ts)

Current signature is unchanged; the behavior generalizes from "the default layer" to "the layer each
mechanism names".

| Rule | Contract |
|---|---|
| Layer resolution | Per **mechanism**, not per assignment — one character may carry mechanisms on different layers. Resolve `slotValues.layer ?? "default"` against `phonePlatform.layers` by `id`. |
| Target layer missing | Push `[touch-apply] target layer "<id>" not found in phone platform — assignment for "<char>" skipped` and skip **that mechanism only**. Never throw. Never fall back to `"default"`. |
| Host key missing in the target layer | Existing warning, now naming the layer: `host key "<hostKey>" not found in phone layer "<id>"`. |
| Structural sharing | Preserved. Only layers that actually gained a key are rebuilt; every other layer and platform is returned by reference. Today's single-`defaultLayerIndex` rebuild becomes a per-touched-layer rebuild. |
| Purity | Unchanged — no input object is mutated. |
| Platform scope | Unchanged — phone only. Widening to tablet is out of scope. |

## `applyTouchAssignmentsToRawJson` (faithful-edit path)

**File**: [applyTouchAssignmentsToRawJson.ts](../../../packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.ts)

Same generalization, same warning shape, same never-throws guarantee. Specifically:

- The pre-built lookup is currently `platformName → { keyId → RawKey }` for the `"default"` layer only
  (L88–99). It becomes keyed by layer id as well, built lazily or across all layers present.
- The "found in NO platform's default layer" warning becomes "found in no platform's `<layer>` layer".
- `defaultHint: "dot"` promotion is unchanged in trigger and scope (a platform that gained any new
  `sk[]` entry, on any layer).
- Splice-in-place fidelity is unchanged: unmodified keys, layers, platforms, and unknown fields are
  copied verbatim.

## Where the shift layer comes from

The scaffolder already emits a phone `shift` layer whose keys carry the **same ids** as the default
layer (`K_A` in both), differing only in `text`
([scaffoldTouchLayout.ts](../../../packages/engine/src/scaffolder/scaffoldTouchLayout.ts) —
`buildLetterKey` / `resolveKeyText`). So a `layer: "shift"` placement targets an existing key; no new
key or layer is created by this feature.

The `caps` layer is **not** emitted for phone. A `layer: "caps"` ref therefore hits the
missing-target-layer path above and is skipped with a warning — deliberately, rather than inventing a
layer ([../research.md](../research.md) R6).

## Test surface

| Assertion | Where |
|---|---|
| Absent `layer` behaves exactly as today (regression floor) | `applyTouchAssignments.test.ts`, `applyTouchAssignmentsToRawJson.test.ts` — existing cases pass unmodified |
| `layer: "default"` is identical to absent | both test files |
| `layer: "shift"` places on the shift layer and leaves default untouched | both test files |
| Two mechanisms on one character, different layers, both applied | `applyTouchAssignments.test.ts` |
| Unknown layer → warning, skip, no throw, no default fallback | both test files |
| Host key absent from the target layer but present in another → warning + skip | both test files |
| Untouched layers/platforms returned by reference (structural sharing) | `applyTouchAssignments.test.ts` |
| Raw-JSON path preserves unknown fields and key order | `applyTouchAssignmentsToRawJson.test.ts` |
