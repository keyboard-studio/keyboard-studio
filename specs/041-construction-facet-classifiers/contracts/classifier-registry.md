# Contract: Classifier registry & registration

The interface every construction classifier implements, and how it registers into the facet-index build shell. Consumers: [build-index.ts](../../../utilities/facet-index/build-index.ts), each `*-classifier.ts`, and `facet-index-lint`.

## ClassifierPair (extended)

```
export interface ClassifierPair {
  /**
   * Content-derived tier. Reads the parsed IR (and, for touch facets, kb.sources).
   * Returns null when there is no evidence to classify → caller invokes fallback().
   */
  classify: (ir: KeyboardIR, def: FacetDefinition, kb: ScannedKeyboard) => Categorization | null;

  /**
   * Declared-metadata / default-fallback / undetermined tier. Unchanged signature.
   * Also the entry point when parse() threw (ir unavailable).
   */
  fallback: (kb: ScannedKeyboard, def: FacetDefinition) => Categorization;
}
```

**Contract rules**

1. **Additive `kb` arg** — existing classifiers (`script`, `strategy-fingerprint`, `target-mix`) compile unchanged; they simply ignore `kb`. (R1)
2. **`classify` returns `null`, never throws** — no evidence (e.g. zero rules, no touch layout) ⇒ `null`; the shell then calls `fallback` or, for a determinate not-applicable, `classify` returns a `notApplicable` `Categorization` (not `null`, not `fallback`). (R3)
3. **One central recognition pass** — the shell runs `recognizePatterns(ir)` once per keyboard before the classifier loop; classifiers must not re-run it or re-parse. (matches strategy-fingerprint contract)
4. **Registration** — each facet id maps to exactly one `ClassifierPair` in `DEFAULT_CLASSIFIERS`, keyed by `def.id`. A `planned` def with no entry MUST still fail the default (non-`--classified-only`) build loud (FR / Edge Case); `--classified-only` scopes the build to facets that have an entry.
5. **Determinism** — no wall-clock, no `Math.random`, stable key ordering (sort before emit). Same corpus commit ⇒ byte-identical output. (FR-006)
6. **Provenance** — `classify` success ⇒ `provenanceTier: "content-derived"`; `fallback` ⇒ the definition's `fallbackChain` tier. `notApplicable` results stay `content-derived` (the n/a was read from source). (FR-007, R3)

## Registration set added by this feature

| Facet id | Phase | Classifier module | Evidence |
|---|---|---|---|
| `caps-handling` | P1 | caps-handling-classifier | IR rule structure (n/a if caseless) |
| `casing` | P1 | casing-classifier | script identity |
| `desktop-combo-mechanism` | P1 | desktop-combo-mechanism-classifier | IR rule structure |
| `encoding` | P1 | encoding-classifier | IR, per-role + match-kind axis |
| `fallback-posture` | P1 | fallback-posture-classifier | IR + `&baselayout` store |
| `mnemonic-vs-positional` | P1 | mnemonic-vs-positional-classifier | `&MNEMONICLAYOUT` (gate) |
| `normalization-posture` | P1 | normalization-posture-classifier | IR (n/a if abugida/abjad) |
| `reordering-rules` | P1 | reordering-rules-classifier | `group(reorder)` convention |
| `rule-store-compaction` | P1 | rule-store-compaction-classifier | IR inline-vs-store shape |
| `touch-combo-mechanism` | P2 | touch-combo-mechanism-classifier | `.keyman-touch-layout` |
| `touch-number-row` | P2 | touch-number-row-classifier | `.keyman-touch-layout` |
| `touch-symbol-layer` | P2 | touch-symbol-layer-classifier | `.keyman-touch-layout` |
| `touch-modifier-layers` | P2 | touch-modifier-layers-classifier | `.keyman-touch-layout` |

## Acceptance

- `pnpm run facet-index-lint` passes after each facet lands (FR-041).
- The facet's def has a real `classifierId` (not `planned`) and appears per base in the `--classified-only` build (FR-040).
- Every classified value carries provenance + consistency + (where consistency < 1) `causeTagCounts` (SC-002).
