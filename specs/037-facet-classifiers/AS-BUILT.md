# Spec 037 Deterministic facet classifiers: as built

**Status:** Retired 2026-09-29. Shipped in PR #1178 (squash `4f107b0`, 2026-07-17). Tasks: 28/28 complete (T012 excised to spec 040, checked with a pointer).
**Full docs:** [specs/_archive/037-facet-classifiers/](../_archive/037-facet-classifiers/) (spec, plan, tasks, research, data-model, contracts, checklists, quickstart). Not read by default.
**Pinned here:** none

## What shipped
- Three offline classifiers in `utilities/facet-index/` (standalone tool, not a workspace package): `script`, `strategy-fingerprint`, `target-mix`. Facet definitions are `content/keyboard-facets/{script,strategy-fingerprint,target-mix}.yaml`.
- `script`: per-script likelihood distribution from the produced-character set, dominant script, confidence, evidence size, analyzed coverage, plus a Latin `subProfile` (plain / extended / ipa).
- `strategy-fingerprint`: prevalence distribution over recognized strategy ids plus a distinct unrecognized `residue` share.
- `target-mix`: device-class set (desktop / touch / web) = declared (.kps `<Targets>`, .kmn `&TARGETS`) unioned with touch-layout artifact presence; mismatches flagged in `notes`.
- Script fallback chain: content-derived -> declared script subtags -> language-default script (`getLanguageDefaults`) -> undetermined; the firing tier is recorded as `provenanceTier`.

## Public contracts (as the code has them)
- `classifyScript(ir, def)` [script-classifier.ts](../../utilities/facet-index/script-classifier.ts), `classifyStrategyFingerprint(ir, def)`, `classifyTargetMix(ir, def)`, each returning `Categorization | null`; each has a `...Fallback(kb, def)` companion for the non-content tiers.
- Registry: `DEFAULT_CLASSIFIERS: Record<facetId, ClassifierPair>` in [build-index.ts](../../utilities/facet-index/build-index.ts). `ClassifierPair = { classify(ir, def, kb) -> Categorization | null; fallback(kb, def) -> Categorization }`. The registry key is the facet id (`def.id`), not `derivation.classifierId`.
- Record shape (`value`, `distribution`, `confidence`, `confidenceClass` confident|mixed|undetermined, `provenanceTier`, `evidenceSize`, `analyzedCoverage`, `analysisOutcome`, `residue?`, `subProfile?`) is owned by spec 070; see `utilities/facet-index/types.ts`.
- Pinned UCD data via `utilities/facet-index/ucd/codegen-ucd.mjs` and `data/SOURCES.json` (Unicode 17.0.0).

## Key decisions
- Script_Extensions: weight 1.0 to every script in a character's set, normalize by the weighted total. Monotonic, so a shared char never counts against a sharing script (research D3).
- Common/Inherited/Unknown chars are excluded from the denominator (FR-008).
- `residue` is a first-class field, never a distribution key; with `residue`, distribution + residue sums to 1 (D7).
- `analysisOutcome` is a 3-state subset {fully, partially, fallback-only}; the classifiers never run the WASM oracle (D9).
- Classifiers are pure and deterministic: no clock, no randomness, sorted keys, byte-identical reruns (FR-001).
- Latin sub-profile thresholds are constants in script-classifier.ts (`LATIN_MIN_EVIDENCE=4`, extended floor 0.15, ipa floor 0.3).

## Gotchas and limits
- The contract's `Classifier { id, version, archetype, fallbackChain, classify(inputs, refs) }` interface was never built; archetype and fallbackChain live in the facet YAML `derivation` block instead.
- Later specs extended `classify` to a 3-arg form `(ir, def, kb)` (touch facets read `kb.sources`).
- A keyboard whose `.kmn` fails `parseKmn` gets a `fallback-only` record with an explicit `notes` reason, never a fabricated distribution.
- Named orthographies ("Ajami") are not emitted: consumer-side join of script + language identity.

## Divergences from the spec
- Interface: spec contract (`ClassifierInputs`/`Classifier` objects) vs. code (`ClassifierPair` of two functions), as above. Not a bug; the registry is what the build loop uses.
- FR-007 amendment (base-layout fall-through folded into produced evidence) was excised to spec 040 and lives in `script-classifier.ts` under the spec-040 fold; `script.yaml` is `schemaVersion: 2`.

## Follow-ups and open issues
- Stale links to `specs/037-facet-classifiers/spec.md` in [content/keyboard-facets/README.md](../../content/keyboard-facets/README.md) (lines 19, 67, 80), [docs/source-facets-design.md](../../docs/source-facets-design.md) (3, 35, 200) will resolve to this stub; retarget to this AS-BUILT (km-doc).
- Stale comment: `docs/design-notes/survey-flow-rework.md:180` says the folder does not exist on disk.
