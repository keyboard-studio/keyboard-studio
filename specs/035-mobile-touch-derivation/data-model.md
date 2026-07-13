# Phase 1 Data Model: Mobile/touch layout derivation

This feature adds **no new locked contract type** (Constitution I). It reuses existing
`@keyboard-studio/contracts` types and introduces two engine-internal input shapes plus one
session flag. Entities below map the spec's Key Entities to concrete types.

---

## Reused contract types (no change)

| Type | Location | Role in this feature |
|---|---|---|
| `TouchLayoutIR` | [keyboard-ir.ts:305](../../packages/contracts/src/keyboard-ir.ts) | The touch **seed** and the derived/edited output. `platforms[].id ∈ {phone,tablet,desktop}`, `layers[].rows[].keys[]`. |
| `TouchKeyIR` | keyboard-ir.ts:88 | A key node: `text`/`output`/`sk`/`flick`/`multitap`/`sp`/`width`/`pad`/`provenance`. |
| `TouchKeyProvenance` | keyboard-ir.ts:83 | `"base-derived" \| "physical-suggested" \| "hand-set"` — the no-clobber axis (R6). |
| `TouchAssignment` (= `MechanismAssignment`) | [assignmentMap.ts:60](../../packages/contracts/src/assignmentMap.ts) | Phase E touch edits: `{ scope, target, modality:"touch", mechanisms[], source }`. |
| `MechanismRef` | assignmentMap.ts:38 | `{ patternId, strategyId?, slotValues? }` — `patternId ∈ {longpress_alternates, flick_gestures, multitap, touch_key_replace, touch_inherited}`. |
| `KeyboardIR` | keyboard-ir.ts | Source of the projection: `groups[].rules[]` (desktop rules), `recognizedPatterns` (S-02 deadkeys), optional `touchLayout`. |

---

## Entity 1 — Touch seed *(spec Key Entity "Touch seed")*

The `TouchLayoutIR` the touch stage starts from. Two origins selected by the seed-source fork:

- **Imported (US1, default)** — the base's shipped `.keyman-touch-layout`, located by
  `resolveBaseTouchJson(baseVfs)`; applied via the Case B raw-JSON path (preserves every
  unmodified field verbatim).
- **Reseeded (US2, fallback)** — `scaffoldTouchLayout(baseIr)` compact phone projection
  (Case A). Keys tagged `provenance: "physical-suggested"`.

**Invariant**: the seed is always derived (imported or projected) — never the empty-keyMap
`buildMinimalPhoneTouchLayout()` fallback as the *author-facing* seed (FR-001).

## Entity 2 — Desktop-modification set *(spec Key Entity)*

The locked desktop work replayed onto the seed. Engine-internal input to
`applyDesktopModifications` (not a contract type):

```ts
interface DesktopModifications {
  /** Characters removed on desktop (Phase D carve) — dropped from every touch platform. */
  removals: readonly string[];
  /** Desktop Phase C individual letter placements to reflect on touch. */
  placements: readonly { char: string; hostKey: string }[];
}
```

- `removals`: derived from post-lockDesktop `baseIr` rules vs the base's original rules
  (equivalently the working copy `deletedNodeIds`/`deletedItemIds` overlay).
- `placements`: from `TouchGallery.desktopAssignments` (physical + `scope:"individual"`),
  the same source the current per-character suggestion logic reads.

**Validation rules**:
- A `removal` MUST NOT drop a character that is the sole realization of an inventory letter
  (edge case in spec) — enforced by the coverage guard (Entity 4), not by silently keeping it.
- A `placement` whose `hostKey` has no touch key falls back to a longpress/secondary
  affordance so the char stays reachable (spec edge case; coverage guard confirms).

## Entity 3 — Simplification pass *(spec Key Entity)*

The programmatic reduction applied to a desktop projection. Per **R1**, the compact phone
template `buildCanonicalPhoneLayers` **already embodies** spec simplification rules 1–5
(≤10 keys/row, no PC function row, default+shift+numeric layers, touch widths, numeric layer).
This feature's simplification work is therefore limited to:
- ensuring `applyDesktopModifications` output stays within the compact shape, and
- the **hard constraint** (FR-008): the pass may not orphan an inventory char.

No new "simplifier" module beyond `applyDesktopModifications` — the template is the simplifier.

## Entity 4 — Coverage result (FR-008 guard)

Engine output of `touchCoverage(layout, inventory)`:

```ts
interface TouchCoverageResult {
  /** Inventory chars with zero reachable touch mechanism. Empty ⇒ SC-003 satisfied. */
  uncovered: readonly string[];
}
```

Surfaced as **Layer C touch check 18.6**; non-empty `uncovered` ⇒ error findings in the
gallery lint summary.

## Entity 5 — Seed-source choice (session state)

The author's fork selection, held in the survey session (studio store), read by
`buildTouchLayoutJson` to pick the path:

```ts
type TouchSeedSource = "import-adapt" | "reseed-from-desktop";
```

Default: `"import-adapt"` when `resolveBaseTouchJson(baseVfs) !== undefined`, else
`"reseed-from-desktop"`.

---

## Derivation flow (state → output)

```text
locked desktop (baseIr, post-lockDesktop)  +  baseVfs
        │
        ▼
  touch_seed_source fork  ──► TouchSeedSource choice (Entity 5)
        │
   ┌────┴─────────────────────────────┐
   │ import-adapt (US1)                │ reseed-from-desktop (US2)
   ▼                                   ▼
 resolveBaseTouchJson(baseVfs)      scaffoldTouchLayout(baseIr)      ← Entity 1 (seed)
   │  (Case B raw JSON)                │  (Case A compact phone)
   ▼                                   ▼
 applyDesktopModifications(seed, {removals, placements})            ← Entity 2 replay (R3)
   │                                   │      (tags provenance: physical-suggested — R6)
   └───────────────┬───────────────────┘
                   ▼
        applyTouchAssignments / applyTouchAssignmentsToRawJson       ← Phase E author edits (hand-set)
                   ▼
        touchCoverage(layout, inventory)  ──► 18.6 lint (FR-008)     ← Entity 4 guard (R5)
                   ▼
        emitTouchLayout / raw-JSON string ──► VFS source/<id>.keyman-touch-layout  (output only)
```

All boxes above the VFS write are **pure** and run inside the single 300 ms debounce cycle.
