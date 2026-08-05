# Contract: Strategy-fingerprint classifier (US2, FR-012/FR-013)

Archetype **rule-structure**. Implements the [Classifier contract](classifier.contract.md). Grounding:
[research](../research.md) D7.

## Algorithm (deterministic)

```
classify(inputs, refs):
  if inputs.ir == null:                         # parseKmn threw
    return fallback-only record(notes="parse-failure", distribution omitted, residue omitted)  # US2 sc.2
  recognizePatterns(inputs.ir)                  # populates ir.recognizedPatterns[], sets recognizedRatio
  totalRules := sum(g.rules.length for g in ir.groups)
  counts := empty map<StrategyId, number>
  for p in ir.recognizedPatterns where p.strategyId present:
    counts[p.strategyId] += p.ownedNodes.filter(kind == 'rule').length
  dist := { S: counts[S]/totalRules for S in counts if counts[S] > 0 }, keys sorted   # omit zero-share
  residue := 1 - recognizedRatio               # distinct field, NOT a distribution key (recognizer-gap)
  opaqueShare := ir.raw.length / (totalRules + ir.raw.length)      # research D6 — same measure as script
  coverage := 1 - opaqueShare                   # parse-opacity, NOT recognizedRatio
  value := argmax(dist) or undefined
  class := (single S with dist[S] >= 0.80 and residue low) ? confident
           : (dist nonempty) ? mixed : undetermined
  return content-derived record(value, dist, residue, class,
             evidenceSize=totalRules, analyzedCoverage=coverage, analysisOutcome)
```

**Sum invariant**: `Σ dist[S] = recognizedRatio` by construction (same `totalRules` denominator as the
recognizer), so `Σ dist + residue = 1` with no second division (research D7). `0/0 → 0` explicit.
`analyzedCoverage` and `residue` are computed independently — the former from `ir.raw.length` (parse-
opacity, research D6), the latter from `recognizedRatio` (recognizer-gap) — and must not be conflated.

## Obligations specific to this classifier

| # | Obligation | Source |
|---|---|---|
| S1 | `residue` is a top-level field, never a synthetic `distribution` key — keeps the keyspace closed to the real `StrategyId` union so no fake `"unrecognized"` key validates against `limits`. | FR-012 / 036 D7 |
| S2 | Never present partial recognition as full coverage — `analyzedCoverage` measures parse-opacity (`1 − opaqueShare`, research D6), `residue` measures recognizer-gap (`1 − recognizedRatio`) and is always emitted alongside the distribution as a separate field; the two are never conflated. | FR-012 (US2 sc.1) |
| S3 | Stability under comment/whitespace: fingerprint is a function of the parsed IR (recognizer never reads raw text); inherited from `parseKmn` normalization. | FR-013 |
| S4 | On unanalyzable input, state the outcome explicitly (`fallback-only` + reason), not an empty distribution that reads as "no strategies." | US2 sc.2 |
| S5 | The record documents recognizer coverage ("S-01/S-02 as of classifier vN") so residue is read as recognizer-gap, not opacity. | research D7 |

## Known-limits note (recorded, not a defect)

The `StrategyId` catalog is **S-01..S-13**, but only **S-01** (simple swap) and **S-02** (deadkey single
tap) have recognizers today. Most real keyboards therefore fingerprint as residue-dominated. This is the
spec's explicit v1 Assumption; SC-004 fixture expectations are set accordingly (research D7, D10).

## Fixtures (SC-004)

`akan` (confident S-01), `sil_euro_latin`/`basic_kbdfr` (S-02 deadkey), `sil_yoruba8` (high residue — S-11
toggle unrecognized, proves S2). All in the phonebook (research D10).
