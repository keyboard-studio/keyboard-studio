# Contract: the single key-budget determination

**Owning package**: `@keyboard-studio/contracts` · **Module**: `packages/contracts/src/keyBudget.ts` · **Requirement**: FR-016, SC-008

One measurement, three consumers, no independent computation anywhere. This module is the authority; everything else projects from it.

## Types

```ts
/** The three availability bands. Programmatic form — safe as a map key. */
export type KeyBudgetBand = "many" | "ralt-only" | "fully-booked";

export interface KeyBudget {
  band: KeyBudgetBand;
  /** Unbound stock keys in the planes the band says are still available. */
  spareKeys: number;
  /** Measurement provenance: plane counts over the pinned stock layout. */
  notes: string;
}
```

## Functions

```ts
/**
 * Measure a base keyboard's spare-key budget from its IR. Returns null when the
 * base binds no stock physical key at all (empty / opaque-only), so a caller
 * falls through to its own honest "undetermined" — never silently to "many".
 */
export function measureKeyBudget(ir: KeyboardIR): KeyBudget | null;

/** Project the canonical band onto axis A7's display-string form. Total. */
export function keyBudgetToSpareKeyAvailability(
  band: KeyBudgetBand,
): SpareKeyAvailability;
```

## Measurement

Unchanged from the existing `utilities/facet-index/spare-key-budget-classifier.ts` algorithm — this is a relocation, not a redesign, so the facet index's shipped values do not move:

- The universe is the pinned stock `kbdus` physical char-key set (N ≈ 47) from `packages/contracts/data/base-layouts.json` (relocated from `utilities/facet-index/data/`).
- The **base (unshifted) plane is excluded** — it is always occupied on desktop, so it carries no spare budget.
- **Reserved system chords** (Ctrl/Alt combinations that are not AltGr) are excluded — they are not available placement slots.
- Distinct keys the base's rules **bind** are counted per plane. Saturation boundary is half-of-N, the same deterministic banding style `added-char-count` uses.

| Band | Condition |
|---|---|
| `many` | SHIFT plane less than half bound — ample primary room, regardless of AltGr |
| `ralt-only` | SHIFT at least half bound, AltGr not — the remaining budget is the AltGr plane |
| `fully-booked` | Both SHIFT and AltGr at least half bound |

`spareKeys` is the count of unbound stock keys in the still-available planes, and is never negative.

## The A7 projection

**Total and bijective on the three bands**, which is what preserves the FR-016 boundary exactly:

| `KeyBudgetBand` | `SpareKeyAvailability` (§7.1 prose verbatim) |
|---|---|
| `many` | `"many"` |
| `ralt-only` | `"RAlt only"` |
| `fully-booked` | `"fully booked"` |

Because the mapping is bijective, §7.2 decision **rule 10** (`A7 = "fully booked"` → append S-08) fires on exactly the set of inputs it fires on today. The three §7.5 rows at the intermediate band — `sil_euro_latin`, `armenian_mnemonic_r`, `russian_mnemonic_r` — stay at `"RAlt only"`, rule 10 stays dormant for all three, and their expected primaries and secondaries are unchanged.

The two naming systems are reconciled **at this boundary, not by renaming either side**: the programmatic form keeps hyphenated lowercase ids; A7 keeps its display strings, which `packages/contracts/src/axes.ts` documents as §7.1 prose verbatim and explicitly unsafe as map keys. Do not use `SpareKeyAvailability` values as object keys — project first.

## Scope: definition, not seeding

This contract **defines** A7 as a projection. It does **not** newly seed `spareKeyAvailability` into the live `session.axes` (research D2). A7 has no live producer today, so seeding it would be a first-time activation that switches on `MechanismGallery`'s `fullAxes` completeness check — turning on axis-based pattern ranking for the first time — and rule 10 for real selections. Both are out of scope; the projection landed here is exactly what that follow-up needs.

`packages/contracts/src/axes.ts` gains a doc amendment recording A7 as a projection of this module and pointing at the mapping table above.

## Consumers

| Consumer | Reads | Change |
|---|---|---|
| Marks-station promotion gate (FR-015) | `spareKeys` | New. Feeds `MarkTreatmentPrefill.signals.promotionAffordable`, replacing the never-supplied `spareKeys` parameter on the old prefill. |
| `utilities/facet-index/spare-key-budget-classifier.ts` | `band` | Becomes a thin delegate. Its `Categorization` wrapper (confidence, provenance tier, analysed coverage, `undetermined` fallback) is unchanged, so the shipped `docs/keyboard-facet-index.json` values do not move. |
| Axis A7 `spareKeyAvailability` | `keyBudgetToSpareKeyAvailability` | Definition only — see the scope note above. |

## Verification

| Check | Requirement |
|---|---|
| The band → A7 mapping is total and bijective | FR-016 |
| The relocated classifier emits byte-identical values for the whole corpus (re-run `facet-index`, diff `docs/keyboard-facet-index.json` — expect no change) | FR-016, SC-008 |
| A base with no stock physical-key rules yields `null`, and the facet classifier still reports `undetermined` | honesty over a false `many` |
| `spareKeys >= 0` for every corpus keyboard | — |
| A fully-booked base makes promotion unavailable with a reason; an ample base offers it | FR-015, SC-007, US3 AC1/AC2 |
| `composed` remains selectable at every band | FR-017, US3 AC3 |
| The §7.5 suite passes unchanged after the relocation | FR-026, SC-012 |
