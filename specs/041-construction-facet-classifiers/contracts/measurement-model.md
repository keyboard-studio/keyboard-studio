# Contract: Measurement model (dominant + consistency + cause-tag summary)

The shape every construction classifier's `Categorization` conforms to, and the shared assembly that produces it. Governs [measurement.ts](../../../utilities/facet-index/measurement.ts) and [cause-predicates.ts](../../../utilities/facet-index/cause-predicates.ts). Source: design brief §4, FR-001..FR-005.

## Produced shape

For a classified (applicable) keyboard/facet:

```
{
  value,                        // dominant value ∈ def.limits.values (or per-role for encoding)
  distribution?,                // per-role / per-axis shares (encoding); else omitted
  consistency,                  // [0,1] — share of analyzed sites at the dominant value
  causeTagCounts?,              // { principled-split, capacity-forced, gap-omission } counts; omitted when consistency == 1
  confidenceClass,              // confident | mixed | undetermined
  provenanceTier: "content-derived",
  evidenceSize,                 // count of sites considered
  analyzedCoverage,             // 1 - opaque share (computeAnalyzedCoverage) — opaque regions excluded from sites
  analysisOutcome,              // fully | partially | fallback-only (mapImportStatus)
  notes?
}
```

For a **not-applicable** keyboard/facet: `{ value: undefined, notApplicable: true, provenanceTier: "content-derived", confidenceClass, notes }` — no `consistency`/`causeTagCounts`. (R3)

## Assembly rules

1. **Dominant value** = the value held by the plurality of analyzed sites; lexicographic tie-break for determinism (FR-006). When the value set has no majority, `value` may be `mixed` where the facet defines it, or omitted with `confidenceClass: "mixed"`.
2. **Consistency** = `matchingSites / analyzedSites`, `analyzedSites` excluding opaque regions (Edge Case: opaque ≠ conforming ≠ deviating). `consistency == 1` ⟹ no exception sites, no cause predicates run (Edge Case: empty exception set).
3. **Exception sites** = analyzed sites whose value ≠ dominant. Recomputed at build; not serialized (FR-005).
4. **Cause tagging** = run the ordered cause-predicate library over the exception set:
   - first predicate with `guard(ctx) && fits(exceptions, ctx)` tags the set with its `CauseTag`;
   - none fit ⇒ `gap-omission` (residue, FR-002);
   - `character-class` `guard` restricts it to alphabetic-with-diacritics families (Latin/Cyrillic/Greek); on abugida/abjad it is **not applied** and exceptions fall through to other predicates or `gap-omission` (FR-004, Edge Case).
5. **`causeTagCounts`** aggregates the per-site tags into counts (the stored summary).

## Per-facet notes carried by the model

- **encoding** — classify per role (`input`/`base`/`combining`) via `distribution`; the input **match-kind axis** (`key-ref`/`char-ref`/`mixed`) is recorded distinctly from within-kind spelling axes and is **never** auto-normalized (semantic, not behavior-preserving — FR-012).
- **normalization-posture** — value ∈ `{nfc, nfd, mixed}`; the **backspace-match** signal is layered as consistency/exception data, not a value (FR-014).
- **fallback-posture** — reads the keyboard's own `&baselayout` store; unset ⇒ packaging default recorded as **defaulted**, not declared; leaked keys are the exception sites (FR-015).
- **mnemonic-vs-positional** — a **gate**: measured and surfaced, tagged so downstream never offers it for transform (FR-016).

## Acceptance

- No value emitted without provenance + consistency; consistency < 1 ⇒ `causeTagCounts` present (SC-002).
- Not-applicable rules hold corpus-wide: no caseless keyboard gets a `caps-handling` value; no abugida/abjad gets `nfc`/`nfd`; no touch-less keyboard gets a touch value (SC-004).
- Byte-identical rebuild on the same corpus commit; `facet-index-lint` + the facet-index test suite pass (SC-003).
