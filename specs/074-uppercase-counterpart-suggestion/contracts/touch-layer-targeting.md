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

- The pre-built lookup is `platformName → layerId → { keyId → RawKey }`, built across all layers
  present (not just `"default"`).
- The "found in NO platform's default layer" warning becomes "found in no platform's `<layer>` layer".
- `defaultHint: "dot"` promotion is unchanged in trigger and scope (a platform that gained any new
  `sk[]` entry, on any layer).
- Splice-in-place fidelity is unchanged: unmodified keys, layers, platforms, and unknown fields are
  copied verbatim.

### Positional-fallback-into-blank-placeholder (id-only lookup was ambiguous on modifier layers)

The id-keyed lookup above is necessary but not sufficient: a shipped modifier layer (`shift`, `caps`,
`rightalt`, or any layout-specific modifier name — nothing here is layer-name-specific) commonly
carries its **un-named** slots as a blank placeholder rather than the desktop vkey id, because Keyman
only assigns a real id to a layer slot once something is bound to it. On the Base/`default` layer the
slot at a given key's position already carries that key's real vkey id (e.g. `K_S`); on a modifier
layer the same position may still be a placeholder (`T_BLANK`, or a layout's own blank sentinel + a
spacer `sp`) — so the id-only lookup misses even though the physical key exists and is a legitimate
touch-assignment target.

The fix is a **positional fallback**, id-only-lookup-miss triggered:

1. **Position source of truth**: `.keyman-touch-layout` row/key arrays are strictly positional and
   same-length across sibling layers of the same platform — the physical key at `(rowIndex, keyIndex)`
   in `"default"` is the same physical key at `(rowIndex, keyIndex)` in every other layer of that
   platform.
2. **Resolution**: when `hostKey` misses the target layer's id-keyed map (but the target layer id
   itself is real — an unknown layer id still takes the pre-existing warn+skip path, never this
   fallback), locate `hostKey`'s `(rowIndex, keyIndex)` in that platform's `"default"` layer, then read
   the key object at that SAME position on the target layer.
3. **"Assignable blank" predicate** (deliberately layer-name- and sentinel-id-agnostic): a slot
   qualifies for promotion when its `id === "T_BLANK"`, OR — the general form, covering layouts that
   use a different (or no) blank sentinel id — its `text` is empty/whitespace-only AND its `sp` is a
   canonical spacer-CLASS value. "Canonical" means `isSpacerKeyClass`/`SPACER_SP_VALUES` (`{8, 10}`)
   from [`packages/contracts/src/touch-coverage.ts`](../../../packages/contracts/src/touch-coverage.ts)
   — the same predicate `KM_LINT_TOUCH_UNCOVERED`'s keys-per-row check uses — **not** "any defined
   `sp`". Real keys carry `sp:0` (normal), `sp:1` (special), or `sp:2` (shift) — e.g. the spacebar ships
   as `{"id":"K_SPACE","text":" ","sp":0}` — and a positionally-aligned real key with blank-ish text
   must never be promoted just because it happens to carry an `sp` field. Anything that isn't a
   canonical spacer class (a real, differently-id'd key already occupying that position) is left
   untouched; the assignment falls through to the ordinary miss/warning path rather than clobbering it.
4. **Promotion, in place**: set the slot's `id` to `hostKey` (so this and any later lookup in the same
   run resolve it directly) and delete its `sp` (spacer style codes render/behave as a non-interactive
   spacer; a real key must not carry one) — **`width`/`pad`, when the blank slot carries them, are
   load-bearing for row alignment and are left untouched**, only `sp` is cleared. Then:
   - **`nextlayer` (sample-from-siblings)**: copy `nextlayer` VERBATIM — including its ABSENCE — from
     the target layer's first existing live (non-blank) key, scanned starting at the promoted slot's own
     row and wrapping around the layer (so every row is visited exactly once and a same-neighborhood key
     wins over an unrelated control key that happens to sit earlier in row order, e.g. a keyboard-wide
     backspace button). A transient modifier layer (e.g. `rightalt`) commonly carries
     `nextlayer:"default"` on its live keys to auto-revert after one tap; a persistent layer (e.g.
     `caps`) deliberately omits `nextlayer` on its live keys to stay put — copying "always default"
     would be wrong for the latter. **Fallback**: when the target layer has zero live keys anywhere to
     sample, set `nextlayer:"default"` — a heuristic, since a layer with no positive evidence either way
     defaults to the common auto-revert case.
   - Apply the mechanism exactly as the ordinary matched-key path does.
   - **Base-text borrow**: once the mechanism has run, if the promoted key's base `text` is still
     empty/whitespace, borrow the DEFAULT-layer key's `text` at the same host key. `touch_key_replace`
     sets `text` itself; `longpress_alternates`/`flick_gestures`/`multitap` do not, so without this a
     longpress-only promotion would keep the blank's empty `text` and render as an invisible button.
5. **No array mutation**: entries are never appended or removed — only the existing blank object at
   that index is mutated, preserving row geometry/widths (same invariant as the desktop-carve
   `T_removed_<n>` placeholder pattern in `applyDesktopModificationsToRawJson.ts`).

This fallback is intentionally scoped to `applyTouchAssignmentsToRawJson` (the faithful-edit / shipped-
touch-layout path). `applyTouchAssignments` (the IR path, Case A — generate-from-scratch touch layouts)
is not implicated: a scaffolded layout has no shipped modifier-layer blank sentinels to promote, so the
asymmetry this fallback closes cannot arise there.

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
| Positional fallback promotes a `T_BLANK` (or other empty-text+`sp` blank) slot on a non-default layer by position, layout-agnostic (invented layer name + invented sentinel id) | `applyTouchAssignmentsToRawJson.test.ts` |
| Positional fallback never clobbers a real, differently-id'd key already at that position | `applyTouchAssignmentsToRawJson.test.ts` |
| A genuinely absent position (target layer shorter than default) still warns, no fallback | `applyTouchAssignmentsToRawJson.test.ts` |
| Real-fixture regression: `rightalt` layer `T_BLANK` promotion (sil_cameroon_qwerty) | `applyTouchAssignmentsToRawJson.test.ts` |
| `isBlankPlaceholder` unit tests: `T_BLANK` true; `sp:8`/`sp:10` + empty/whitespace text true; `sp:0`/`sp:1`/`sp:2` false regardless of text; real text + no `sp` false | `applyTouchAssignmentsToRawJson.test.ts` |
| A real key with `sp:0` or `sp:1` and whitespace text at the aligned position is NOT promoted (spacebar shape) — miss/warning, not clobbering | `applyTouchAssignmentsToRawJson.test.ts` |
| Out-of-bounds: target layer has fewer ROWS than default → warns, no crash; a platform with the target layer but no `"default"` layer → warns, no crash | `applyTouchAssignmentsToRawJson.test.ts` |
| Promoted key copies `nextlayer` from the first live sibling (real fixture: `rightalt` K_Q ← K_W, ~line 1209) | `applyTouchAssignmentsToRawJson.test.ts` |
| Promoted key omits `nextlayer` when the first live sibling omits it (persistent-layer case, modeled on `caps`) | `applyTouchAssignmentsToRawJson.test.ts` |
| Promoted key falls back to `nextlayer:"default"` when the target layer has zero live keys to sample | `applyTouchAssignmentsToRawJson.test.ts` |
| A longpress-only promotion borrows the DEFAULT-layer key's base `text`; `touch_key_replace`'s own text is not overwritten | `applyTouchAssignmentsToRawJson.test.ts` |
| `width`/`pad` on the blank slot survive promotion; only `sp` is cleared | `applyTouchAssignmentsToRawJson.test.ts` |
