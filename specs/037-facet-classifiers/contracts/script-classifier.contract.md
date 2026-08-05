# Contract: Script classifier (US1, FR-007..FR-011)

Archetype **character-content**. The hardest classifier; sets the evidentiary standard. Implements the
[Classifier contract](classifier.contract.md). Grounding: [research](../research.md) D2–D6.

## Algorithm (deterministic)

```
classify(inputs, refs):
  # Tier 1 — content-derived
  if inputs.producedSet != null:
    scored := empty map<ISO15924, number>
    concrete := 0
    unknown  := 0
    for scalar in inputs.producedSet:                  # each entry = one NFC Unicode scalar
      cp := codePointAt(scalar)
      base := refs.scriptOf(cp)                         # long-name normalized to 4-letter via PropertyValueAliases
      if base in {Zyyy, Zinh}: continue                 # Common/Inherited excluded from denominator (FR-008)
      if base == Zzzz: unknown += 1; continue           # report distinctly, exclude (spec Edge Cases)
      exts := refs.scriptExtOf(cp)                       # canonically sorted set; falls back to {base}
      for s in exts: scored[s] += 1                      # FULL weight 1.0 to each (FR-008, research D3)
      concrete += 1
    coverage := 1 - (ir.raw.length / (ruleCount + ir.raw.length))   # research D6
    if concrete >= floors.minConcreteChars and coverage >= floors.minCoverage:
      total := sum(scored.values())
      dist  := { s: scored[s]/total for s in scored }, keys sorted
      value := argmax(dist) (ties -> lexicographic)
      class := dist[value] >= 0.80 ? confident : mixed
      latin := (value == Latn) ? latinSubProfile(inputs.producedSet, refs) : undefined   # FR-010
      return content-derived record(value, dist, class, concrete, coverage, unknownNotes(unknown), latin)
  # Tier 2 — declared script subtags (all language tags, not first-wins — FR-011, spec Edge Cases)
  subtags := scriptSubtagsOf(inputs.kps.languages ∪ inputs.ir.header.languages)
  if subtags nonempty: return declared-metadata record(setOrDominant(subtags))
  # Tier 3 — language-default script
  defaults := [ getLanguageDefaults(t).defaultScript for t in declaredLanguageTags ].filter(present)
  if defaults nonempty: return default-fallback record(setOrDominant(defaults))
  # Tier 4
  return undetermined record()
```

`latinSubProfile` buckets produced Latin-script scalars — **scalars whose `Scripts.txt` value is `Latin`
only**, never the raw block membership alone (research D4) — by `Blocks.txt` membership into
`{plain, extended, ipa}`, against a **Latin-specific** evidence floor; the label is a hint. This matters
because Phonetic Extensions (`1D00..1D7F`, one of the IPA-orientation blocks) is mixed-script: it also
contains Greek and Cyrillic codepoints, which are excluded by the Script=Latin filter and instead tally to
their true script in the main distribution (research D4 known limitation).

## Emits (FR-009)

per-script `distribution`, dominant `value`, `confidence` (dominant share), `evidenceSize` (=`concrete`),
`analyzedCoverage`, `analysisOutcome`, `provenanceTier`, and — for Latin — `subProfile.latin`. Unknown-
script scalar count surfaced in `notes`.

## Acceptance mapping (spec §User Story 1)

| AC | Satisfied by |
|---|---|
| 1 — Arabic dominant; Common/Inherited neutral | Common/Inherited excluded from denominator; presentation forms map to `Arab` (research D2) |
| 2 — shared chars strengthen, not dilute | full-weight `scriptExtOf` fold (research D3) |
| 3 — unanalyzable ⇒ declared subtag → language default, tier recorded | tiers 2–3 + `provenanceTier` (research D5) |
| 4 — Latin sub-profile plain/extended/IPA | `latinSubProfile` block heuristic (research D4) |
| 5 — same source ⇒ identical output | C1 determinism; canonical-sorted ext sets |

## Edge cases (spec)

zero concrete chars ⇒ skip tier 1, `evidenceSize:0`, fall through (never divide by zero); presentation
forms count toward their script; unassigned codepoints ⇒ `Zzzz` bucket reported distinctly; mostly-opaque
(coverage < floor) ⇒ fall back; multi-script declared languages ⇒ set, not first-wins.
