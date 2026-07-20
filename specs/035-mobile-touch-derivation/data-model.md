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
  unmodified field verbatim — replay is a raw-JSON splice, R9; wire JSON carries no
  provenance tags, R6).
- **Reseeded (US2, fallback)** — `scaffoldTouchLayout({ ...baseIr, touchLayout: undefined })`
  compact phone projection (Case A). The `touchLayout` strip is mandatory (R10):
  `scaffoldTouchLayout` preserves-and-augments an existing `ir.touchLayout` rather than
  discarding it, which would violate US2-AS4. Keys tagged
  `provenance: "physical-suggested"`.

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

- `removals`: derived from the working-copy carve overlay (`deletedNodeIds`/
  `deletedItemIds`) as a **produced-set diff**: `buildProducedSet(baseIr)` minus
  `buildProducedSet(projectedWorkingIR)`, where `projectedWorkingIR` is the overlay-applied
  projection (`projectWorkingCopyForOutput` path). **Not** a "post-lockDesktop `baseIr` vs
  original rules" diff — `baseIr` is set once at instantiation and `lockDesktop()` only
  sets a flag, so that diff is always empty (R3). The produced-*character* diff also
  handles carve's nul-fill: carved slots keep a `nul` rule, so the char disappears from
  the produced set even though the rule survives. NFC caveat: `buildProducedSet`
  run-merges consecutive char elements and NFC-normalizes on flush, so a carved
  base+combining (NFD-emitting) sequence surfaces as its precomposed codepoint in the
  diff — the derivation tests must pin that this is the removal the replay applies
  (tasks.md T010). The **matching side is canonical too**: the replay NFC-normalizes
  every layout candidate string before comparing against these NFC removals (see the
  seed-derivation contract, Removals clause) — an NFD-stored occurrence in the layout
  must still be matched and removed (tasks.md T005/T006).
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

Surfaced as check code **`KM_LINT_TOUCH_UNCOVERED`** under the **existing** criterion row
`18.6-inventory-fully-covered` — a sibling of the shipped desktop-side
`KM_LINT_INVENTORY_UNCOVERED` check, **not** a new criteria.json row (R5). Severity model:
**warning** findings in the gallery lint summary while editing; **blocking** at stage
completion (non-empty `uncovered` refuses to finalize the touch stage).

## Entity 5 — Seed-source choice (session state)

The author's fork selection, held in the survey session (studio store), read by
`buildTouchLayoutJson` to pick the path:

```ts
type TouchSeedSource = "import-adapt" | "reseed-from-desktop";
```

Default: `"import-adapt"` when `resolveBaseTouchJson(baseVfs) !== undefined`, else
`"reseed-from-desktop"`.

**Memory & staleness (R12)**: a recorded choice is remembered — `advance("mechanisms")`
skips the fork when the choice is already set and not stale (base re-instantiation clears
it). Changing the choice after touch edits exist clears `touchDraft` (its entries reference
host keys of the other seed), with a warning before discarding.

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
 resolveBaseTouchJson(baseVfs)      scaffoldTouchLayout(              ← Entity 1 (seed)
   │  (Case B raw JSON)                │   {...baseIr, touchLayout: undefined})
   │                                   │  (Case A compact phone — strip per R10)
   ▼                                   ▼
 applyDesktopModificationsToRawJson  applyDesktopModifications        ← Entity 2 replay (R3/R9)
   │  (raw splice, no tags — R6/R9)    │  (tags provenance: physical-suggested — R6)
   └───────────────┬───────────────────┘
                   ▼
        applyTouchAssignmentsToRawJson / applyTouchAssignments       ← Phase E author edits (applied LAST — R6 no-clobber by ordering)
                   ▼
        touchCoverage(layout, inventory) ──► KM_LINT_TOUCH_UNCOVERED (criterion 18.6, FR-008) ← Entity 4 guard (R5)
                   ▼
        emitTouchLayout / raw-JSON string ──► VFS source/<id>.keyman-touch-layout  (per the R11 emission matrix)
```

All boxes above the VFS write are **pure** and run inside the single 300 ms debounce cycle.

**Emission (R11)**: the derived layout is emitted even with **zero** Phase E edits —
reseed always emits; import-adapt emits when `mods` is non-empty or a real Phase E edit
exists; the truly-untouched import-adapt case keeps the shipped file verbatim (emit
nothing). `json: null` still means engine failure → omit the file. Preview
(`vfsTransform`), lint (`editedVfsForLint`), and output follow the same matrix.
