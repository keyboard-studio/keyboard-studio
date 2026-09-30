# Spec 043 Base-selection and strategy facet classifiers: as built

**Status:** Retired 2026-09-29. Shipped in PR #1201 (squash `26cd607`, 2026-07-20). Tasks: 67/67 complete.
**Full docs:** [specs/_archive/043-base-selection-facets/](../_archive/043-base-selection-facets/) (spec, plan, tasks, research, data-model, contracts/facets.md, checklists). Not read by default.
**Pinned here:** none

## What shipped
Thirteen per-base keyboard-facet classifiers in `utilities/facet-index/`, each registered in `DEFAULT_CLASSIFIERS` (`build-index.ts`) with a `content/keyboard-facets/<id>.yaml`:
- US1 base selection: `primary-strategy`, `added-char-count`, `platform-coverage`, `font-dependency`.
- US2 writing-system match: `diacritic-mechanism`, `combining-mark-repertoire`, `spare-key-budget`, `orthography-coverage-ratio`.
- US3 eligibility/enrichers: `license-fork-eligibility`, `directionality`, `script-family`, `declared-bcp47-tags`, `package-completeness`.
- Session-facet mirrors (9) under `content/facets/{lineage,source,env}/` for the family-named facets. The four index-only facets (`directionality`, `script-family`, `combining-mark-repertoire`, `orthography-coverage-ratio`) have no mirror.
- Pinned in-repo reference data in `utilities/facet-index/data/`: `cldr-exemplars.json`, `known-licenses.json`, `iso15924-script-family.json`.

## Public contracts (as the code has them)
- Each classifier exports `classifyX(ir, def, kb)` and `xFallback(kb, def)` (the spec-037 `ClassifierPair`); file names `utilities/facet-index/<id>-classifier.ts`.
- Value sets (definitions in the YAML): `primary-strategy` closed `StrategyId` union S-01..S-13; `added-char-count` axis-A1 band (tiny/small/medium/large/massive, contiguous at 300) with the count in `evidenceSize`; `platform-coverage` subset of {desktop, web, touch}; `font-dependency` {self-contained, system-font-reliant}; `diacritic-mechanism` {stacking-combining, replacing-cycling, multi-family, none}; `spare-key-budget` {many, ralt-only, fully-booked}; `license-fork-eligibility` {permissive, copyleft, proprietary-restricted, unspecified}; `directionality` {ltr, rtl, bidi-aware}; `script-family` {alphabet, abugida, abjad, syllabary, logographic}.
- `spare-key-budget-classifier.ts` is a thin delegate to `packages/contracts/src/keyBudget.ts` (spec 052) and still owns confidence, tier and coverage.
- Extra facet `has-icon` (icon presence) is registered beside `package-completeness`; it is not part of this spec.

## Key decisions
- `primary-strategy` is the mode of the recognizer's per-keyboard strategy vector, distinct from `strategy-fingerprint` (research D3).
- `platform-coverage` infers modality from bundled `.kps` file types, never `<Targets>` (D4).
- `orthography-coverage-ratio` uses a pinned CLDR exemplar snapshot and records `not-derivable` when none exists (D5).
- Guards and honest sentinels reuse the `normalization-posture` pattern: `combining-mark-repertoire` is not-applicable for abugida/abjad, guarded by `script-family` (D7).
- Character-derived facets reuse `buildProducedSet` plus the spec-040 base-layout fold (D2).
- Determinism: only in-repo file contents; no git history, network or GitHub API (FR-004). Rejected signals (recency, transforms, A3/A5/A6) stay rejected (D9).
- No transition logic here; that is spec 039 (FR-042).

## Gotchas and limits
- `added-char-count` diffs against stock `kbdus` including the spec-040 fold.
- `spare-key-budget` saturation boundary is half of ~47 `kbdus` keys per SHIFT/AltGr plane.
- The recognizer covers only some S-xx strategies, so a base whose dominant strategy is unrecognized reads `undetermined` (see the YAML header note).

## Divergences from the spec
- Spec/contract name session mirrors `construction.diacritic-mechanism` and `construction.spare-key-budget`; the code ids are `source.diacritic-mechanism` and `source.spare-key-budget` (`content/facets/source/`). There is no `construction` family in facet-lint; the mirror lives under `source/`. The keyboard-facet ids are unchanged.

## Follow-ups and open issues
- Stale links to `specs/043-base-selection-facets/spec.md` in [docs/lens-model.md](../../docs/lens-model.md) line 50 now hit the stub; retarget to AS-BUILT (km-doc).
- Session consumption of these index facets is still "planned" per the facet YAML headers.
