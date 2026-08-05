# Implementation Plan: Base-Selection & Strategy Facet Classifiers

**Branch**: `043-base-selection-facets` | **Spec**: [spec.md](spec.md) | **Size**: normal (multi-phase — 3 user stories)

## Summary

Extend the offline `keyboard-facet-index` with **13 new keyboard-facets** (4 P1 + 4 P2 + 5 P3) that let the base-selection surface and the spec-§7.2 strategy selector rank a candidate base by what it *is* — its own dominant strategy, its distance from stock (axis A1), where it runs, its diacritic mechanism (A4), spare-key budget (A7), writing-system coverage, fork eligibility, and script family — rather than inferring those from the neighborhood aggregate. Each facet ships as a spec-037-archetype `{ classify, fallback }` classifier under `utilities/facet-index/`, a `content/keyboard-facets/*.yaml` definition with a **real** `derivation.classifierId`, and (for the nine family-named facets) a `content/facets/<family>/*.yaml` session mirror. It is **measurement only** (FR-042 / NG-002 — no value-transition logic; that is spec 039). Everything is deterministically derivable from each corpus keyboard's own in-repo source at build time (FR-004): no git history, no network.

One genuinely new dependency: a **pinned CLDR `exemplarCharacters` snapshot** in-repo (feeding `orthography-coverage-ratio`), pinned the way `langtags`/`glottolog`/`ucd/DerivedAge.txt` already are, versioned in `utilities/facet-index/data/SOURCES.json`. Everything else reuses machinery spec 037/040/041 already built — `buildProducedSet`, `base-layout.ts`, `cause-predicates.ts`, `measurement.ts`, `outcome.ts`, and the `DEFAULT_CLASSIFIERS` registry.

Per the constitution's **one-conversation-per-phase** policy, this plan covers all three stories, but implementation stops after each user-story phase; P1 is the shippable MVP for this conversation.

## Project Structure

```
utilities/facet-index/
  build-index.ts                          # register 13 new pairs in DEFAULT_CLASSIFIERS
  primary-strategy-classifier.ts          # + .test.ts   (P1)
  added-char-count-classifier.ts          # + .test.ts   (P1)
  platform-coverage-classifier.ts         # + .test.ts   (P1)
  font-dependency-classifier.ts           # + .test.ts   (P1)
  diacritic-mechanism-classifier.ts       # + .test.ts   (P2)
  combining-mark-repertoire-classifier.ts # + .test.ts   (P2)
  spare-key-budget-classifier.ts          # + .test.ts   (P2)
  orthography-coverage-ratio-classifier.ts# + .test.ts   (P2)
  license-fork-eligibility-classifier.ts  # + .test.ts   (P3)
  directionality-classifier.ts            # + .test.ts   (P3)
  script-family-classifier.ts             # + .test.ts   (P3)
  declared-bcp47-tags-classifier.ts       # + .test.ts   (P3)
  package-completeness-classifier.ts      # + .test.ts   (P3)
  kps-reader.ts                            # shared .kps <Files>/<Languages>/<Font>/<LicenseFile> read (if not already present)
  data/
    SOURCES.json                           # add CLDR snapshot pin + version
    cldr-exemplars.json                    # NEW pinned CLDR exemplarCharacters snapshot (P2)
    known-licenses.json                    # NEW license-header signature table (P3)
    iso15924-script-family.json            # NEW ISO 15924 -> family lookup (P3)

content/keyboard-facets/
  primary-strategy.yaml  added-char-count.yaml  platform-coverage.yaml  font-dependency.yaml
  diacritic-mechanism.yaml  combining-mark-repertoire.yaml  spare-key-budget.yaml  orthography-coverage-ratio.yaml
  license-fork-eligibility.yaml  directionality.yaml  script-family.yaml  declared-bcp47-tags.yaml  package-completeness.yaml

content/facets/
  lineage/primary-strategy.yaml   lineage/added-char-count.yaml
  source/platform-coverage.yaml   source/font-dependency.yaml   source/declared-bcp47-tags.yaml   source/package-completeness.yaml
  construction/diacritic-mechanism.yaml   construction/spare-key-budget.yaml     # construction family (new dir if absent; else source-family per 041 convention)
  env/license-fork-eligibility.yaml

docs/keyboard-facet-index.json (+ .md)     # regenerated (--classified-only) — build artifact, not hand-edited
```

**Structure Decision**: Ride the existing standalone `utilities/facet-index` tool — new classifiers are flat sibling modules registered in `DEFAULT_CLASSIFIERS`, exactly as spec 037/041 added theirs. No `packages/*` build target changes; the tool stays out of `pnpm -r`. Pinned reference data lands under `utilities/facet-index/data/` (following `base-layouts.json`) with a `SOURCES.json` version pin. Facet definitions and session mirrors are content-team YAML records.

## Constitution Check

| Article | Assessment |
|---|---|
| I. Pattern schema locked | **PASS** — no `Pattern`/`Criterion` field touched (FR-043). Facet YAML is content data, not the locked contract. |
| II. KeyboardIR is the spine | **PASS** — classifiers read the parsed `KeyboardIR` via existing helpers; the build shell already routes `parse()` failures to `fallback` with no try/catch inside classifiers (codec-unparseable Edge Case). No codec parse-semantics change (FR-043). |
| III. Single working copy | **PASS** — not applicable; this is a build-time corpus scanner, not the studio authoring spine. No serialization introduced. |
| IV. Validator layering / one debounce | **PASS** — not applicable; no validator or studio-debounce code touched. |
| V. VirtualFS only during authoring | **PASS** — the facet-index tool reads the sibling corpus at build time and writes a committed artifact; it is not studio authoring and writes no host disk during authoring. |
| VI. Team boundaries | **PASS** — content owns the pattern/facet library and criteria; engine owns the tooling. This feature is content/engine facet-index work (spec 036 extensibility), squarely within FR-043's stated ownership. |
| VII. Out of scope for v1 | **PASS** — no CJK/Ethiopic reorder, LDML, mobile-app, hosting, touch-first authoring. Measurement only; NG-001…NG-006 keep the rejected signals out. |
| VIII. House conventions | **PASS** — no emoji in console output; markdown links in docs; no GitHub issue numbers in shipped code; `feat(tools):`-style commit titles. |

No violations → **no Complexity Tracking table required.** Gate passes; re-checked against the final design (data-model + contracts) — still clean.

## Phase notes

- **Phase 0 — Research**: [research.md](research.md) — 9 decisions (archetype reuse, produced-set reuse, primary-strategy mode, platform modality, pinned CLDR, mirror scope, guards/sentinels, `.kps` reads, rejected signals).
- **Phase 1 — Design**: [data-model.md](data-model.md) (13 keyboard-facet records + 9 mirrors + 3 pinned datasets, all emitting the existing `Categorization` shape — no new TS types) and [contracts/facets.md](contracts/facets.md) (the verbatim facet ids + value sets consumers/tests code against).
- **Sequencing constraint**: `script-family` (P3, FR-032) is the guard for `combining-mark-repertoire` (P2, FR-021). The P2 classifier derives script-family inline from ISO 15924 so it does not block on the P3 facet being *registered*, but the registered `script-family` facet is the durable guard — noted for `/speckit-tasks`.
