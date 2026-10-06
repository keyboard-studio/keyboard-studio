# Contract: Target/device-mix classifier (US3, FR-014)

Archetype **declared-metadata** — the cheapest tier, no rule analysis. Implements the
[Classifier contract](classifier.contract.md). Grounding: [research](../research.md) D8.

## Algorithm (deterministic)

```
classify(inputs, refs):
  declared := empty set<deviceClass>
  provenance := empty map<deviceClass, source>
  # 1. Package .kps <Targets> (enum-validated; defaults to [windows] when absent — FR-014 AC2)
  if inputs.kps != null:
    for t in inputs.kps.targets: declared += mapToDeviceClass(t); provenance[...] = "declared:kps"
    if <Targets> was absent: mark defaulted   # provenanceTier = default-fallback for those
  # 2. .kmn &TARGETS (raw, unvalidated; sentinel 'any' -> all classes)
  for t in inputs.ir?.header.targets:
    if t == 'any': declared += {desktop, touch, web}   # special-case sentinel (research D8)
    else: declared += mapToDeviceClass(t); provenance[...] = "declared:kmn"
  # 3. Artifact evidence — touch-layout sibling presence outranks declaration (FR-014 AC1)
  touchArtifact := inputs.siblingPresent[ storePath(inputs.siblingStores, 'LAYOUTFILE') ]
  final := declared
  mismatchNote := undefined
  if touchArtifact:
    final += {touch}
    if 'touch' not in declared: mismatchNote := "touch layout present but not declared"
  return record(value=sorted(final), distribution=perClassProvenance(final, provenance),
                provenanceTier, confidenceClass, notes=mismatchNote, analysisOutcome)
```

`mapToDeviceClass`: `windows|macosx|linux → desktop`; `mobile|tablet → touch`; `web → web`.

## Obligations specific to this classifier

| # | Obligation | Source |
|---|---|---|
| T1 | Artifact presence outranks declaration: a touch-layout sibling ⇒ `touch` reported regardless of `<Targets>`; a declaration/artifact mismatch is recorded in `notes`. | FR-014 AC1 |
| T2 | No explicit target declarations ⇒ packaging-format default applies (`.kps` absent ⇒ `windows`/desktop) and `provenanceTier` = `default-fallback`, not `declared-metadata`. | FR-014 AC2 |
| T3 | `.kps <Targets>` (enum-validated) and `.kmn &TARGETS` (raw, `'any'` sentinel common) are different-fidelity signals; the `'any'` sentinel expands to all device classes, never a literal platform. | research D8 |
| T4 | Report the union with per-source provenance (which class came from kps / kmn / artifact). | FR-014 |

## Fixtures (SC-004)

a desktop-only keyboard (`<Targets>` absent ⇒ defaulted `desktop`), a keyboard with a `.keyman-touch-layout`
sibling (touch via artifact), and a package declaring `web` (research D10). Concrete phonebook ids selected
in `/speckit-tasks`.
