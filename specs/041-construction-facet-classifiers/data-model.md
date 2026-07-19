# Phase 1 Data Model: Construction Facet Classifiers

All types are **tool-local** to [utilities/facet-index/](../../utilities/facet-index/) (content/engine co-owned data, not a `packages/contracts` type — see [types.ts](../../utilities/facet-index/types.ts) header and FR-043). Nothing here touches the locked `Pattern`/`Criterion` contract or the codec.

## Entity 1 — `Categorization` (extended, additive)

Extends the existing `Categorization` in [types.ts](../../utilities/facet-index/types.ts). New fields are optional so existing classifiers, the index shape, and `facet-index-lint` are unaffected.

| Field | Type | Meaning | Source |
|---|---|---|---|
| `consistency` | `number?` | Share of analyzed sites matching the dominant value ∈ [0,1]. 1 = fully consistent, no exceptions. | FR-001, brief §4 (R2) |
| `causeTagCounts` | `Record<CauseTag, number>?` | Summary of exception causes — count per tag. The per-site enumeration is recomputed at build, never stored. | FR-002, FR-005 (R2) |
| `notApplicable` | `true?` | Set when the facet does not apply to this keyboard (caseless→caps-handling, abugida/abjad→normalization, no touch layout→touch facets). Emitted with `value: undefined`, `provenanceTier: "content-derived"`, and an explanatory `notes`. Never `default-fallback`, never an out-of-limits value. | FR-013/014/022, SC-004 (R3) |

Reused unchanged: `value`, `distribution` (per-role/axis shares for `encoding`), `confidence`, `confidenceClass`, `provenanceTier`, `evidenceSize`, `analyzedCoverage`, `analysisOutcome`, `residue`, `notes`, `subProfile`.

**Validation rules**
- `consistency` ∈ [0,1]; `1` ⟺ `causeTagCounts` empty/absent and no exception sites.
- `causeTagCounts` keys ⊆ the `CauseTag` union; values are non-negative integers summing to the exception-site count.
- `notApplicable: true` ⟹ `value` undefined AND `provenanceTier === "content-derived"` AND `notes` set.
- `value` (and every `distribution` key) stays within the facet's `limits.values` (unchanged X1 rule).

## Entity 2 — `CauseTag` and the cause-predicate library

```
type CauseTag = "principled-split" | "capacity-forced" | "gap-omission";

interface CausePredicate {
  id: Exclude<CauseTag, "gap-omission">;   // gap-omission is the residue, not a predicate
  /** Applicability guard, e.g. script-family scope for character-class. */
  guard(ctx: ClassifierContext): boolean;
  /** Does this predicate explain the whole exception set? */
  fits(exceptions: ExceptionSite[], ctx: ClassifierContext): boolean;
}
```

- Ordered array in [cause-predicates.ts](../../utilities/facet-index/cause-predicates.ts); first predicate whose `guard` and `fits` both pass tags the set; none ⇒ `gap-omission` (FR-002).
- Starter members (FR-003): `character-class` (guard = script family ∈ {Latin, Cyrillic, Greek}, `fits` = all deviations are combining marks → `principled-split`); `layer-capacity` (no family guard, `fits` = deviations begin exactly after the primary layer filled → `capacity-forced`).
- Content-team-extensible: adding a predicate is appending to the array (FR-003).

## Entity 3 — `ExceptionSite` (build-time only, not serialized)

```
interface ExceptionSite {
  location: string;      // rule/store/layout locator (deterministic, human-auditable)
  observedValue: string; // the value at this site that deviates from dominant
  causeTag: CauseTag;    // assigned by predicate-fit
}
```

Recomputed deterministically at build time (FR-005); only the aggregated `causeTagCounts` reaches the committed index.

## Entity 4 — `ClassifierContext`

Threaded into the shared `measurement.ts` assembly and the predicate library so guards/fits and not-applicable rules read the same inputs:

| Field | Type | Purpose |
|---|---|---|
| `scriptFamily` | `string` | From the `script` facet / langtags (reused, not re-derived) — drives the `character-class` guard and the abugida/abjad and caseless not-applicable rules. |
| `casing` | `"cased" \| "caseless" \| "mixed"` | Gate input for `caps-handling` not-applicable (FR-013). |
| `analyzedCoverage` | `number` | Opaque-share-aware; exception enumeration must not treat opaque regions as conforming or deviating (Edge Case). |

## Entity 5 — `ClassifierPair` (signature extended)

In [build-index.ts](../../utilities/facet-index/build-index.ts):

```
interface ClassifierPair {
  classify: (ir: KeyboardIR, def: FacetDefinition, kb: ScannedKeyboard) => Categorization | null;  // +kb (R1)
  fallback: (kb: ScannedKeyboard, def: FacetDefinition) => Categorization;                          // unchanged
}
```

`kb` gives touch classifiers access to `kb.sources` (the `.keyman-touch-layout` bytes). Desktop/script classifiers ignore it. 13 new entries register in `DEFAULT_CLASSIFIERS` keyed by facet id (FR-010, FR-020).

## Entity 6 — Touch-layout evidence (P2)

Parsed from the keyboard's `.keyman-touch-layout` JSON by [touch-layout.ts](../../utilities/facet-index/touch-layout.ts):

| Concept | Feeds facet |
|---|---|
| per-key combine mechanism (key / layer / longpress / flick / multitap) | `touch-combo-mechanism` |
| presence + content of a 5th row | `touch-number-row` (`absent`/`digits`/`letters`/`mixed`) |
| presence of a dedicated symbol layer | `touch-symbol-layer` (`present`/`absent`) |
| ALT/RALT/CTRL layers reproduced on touch | `touch-modifier-layers` (`none`/`maps-desktop-modifiers`/`mixed`) |

Absent file ⇒ all four `notApplicable` (FR-022, R3). Modality is touch-only; no `KeyboardIR` dependency.

## Entity 7 — Display-difficulty derivation (P3)

Pure per-script function `displayDifficultyOfScript(script, { puaObserved }) → "well-supported" | "partially-supported" | "poorly-supported"` in [display-difficulty.ts](../../utilities/facet-index/display-difficulty.ts). Not a `Categorization`; feeds the `content/facets/orth/display-difficulty.yaml` input facet.

- Primary: UCD block first-assigned version, split at the two era boundaries recorded as the facet's derivation params (FR-031): well = ≤ 5.x, partially = 6.0–10.0, poorly = ≥ 11.0.
- Override: `puaObserved` (script-level, per clarification) ⇒ `poorly-supported` regardless of block age.

## Facet-definition edits (data files)

| Phase | File(s) | Edit |
|---|---|---|
| P1 | The nine desktop `content/keyboard-facets/*.yaml` | `derivation.classifierId: planned → <real id>` (FR-040) |
| P2 | The four touch `content/keyboard-facets/*.yaml` | `derivation.classifierId: planned → <real id>` (FR-040) |
| P3 | [content/facets/orth/display-difficulty.yaml](../../content/facets/orth/display-difficulty.yaml) | `sourceStatus: planned → available`; `source: planned:… → engine:displayDifficultyOfScript`; record the two era-boundary params (FR-030/031) |

After all phases: zero `classifierId: planned` in `content/keyboard-facets/`, and 16 keyboard facets appear per base in the `--classified-only` build (SC-001).
