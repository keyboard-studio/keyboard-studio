# Spec 041 Construction facet classifiers: as built

**Status:** Retired 2026-09-29. Shipped in PR #1190 (squash `6c078e3`, 2026-07-19). Tasks: 35/35 complete.
**Full docs:** [specs/_archive/041-construction-facet-classifiers/](../_archive/041-construction-facet-classifiers/) (spec, plan, tasks, research, data-model, contracts, checklists, quickstart, undetermined-facets-handoff). Not read by default.
**Pinned here:** none

## What shipped
- Thirteen construction classifiers in `utilities/facet-index/`: nine desktop (`casing`, `caps-handling`, `desktop-combo-mechanism`, `encoding`, `fallback-posture`, `mnemonic-vs-positional`, `normalization-posture`, `reordering-rules`, `rule-store-compaction`) and four touch (`touch-combo-mechanism`, `touch-number-row`, `touch-symbol-layer`, `touch-modifier-layers`). All registered in `DEFAULT_CLASSIFIERS` (`build-index.ts`), and their `content/keyboard-facets/*.yaml` no longer say `classifierId: planned`.
- The measurement model: every value carries dominant value, `consistency`, `causeTagCounts` (principled-split | capacity-forced | gap-omission), provenance, `analyzedCoverage`.
- A `.keyman-touch-layout` reader (`touch-layout.ts`), the first non-KMN evidence source.
- The input facet `orth.display-difficulty` (`content/facets/orth/display-difficulty.yaml`) with derivation in `display-difficulty.ts`.
- Follow-up polish (handoff doc): `desktop-combo-mechanism` and `fallback-posture` now read `any(store)` overlays and char-literal keys, cutting `undetermined` from 108 to 12 each.

## Public contracts (as the code has them)
- `assembleMeasurement(input: MeasurementInput)`, `notApplicableMeasurement(notes)`, `undeterminedFallback(notes)`, `neutralContext`, `deriveScriptContext`, `CONFIDENT_CONSISTENCY = 0.8` in [measurement.ts](../../utilities/facet-index/measurement.ts).
- `CAUSE_PREDICATES`, `tagExceptionSet` in `cause-predicates.ts` (starters `character-class`, `layer-capacity`; extensible list).
- `Categorization` additions in `utilities/facet-index/types.ts`: `consistency?`, `causeTagCounts?`, `notApplicable?: true`.
- Touch: `readTouchLayout(kb)`, `findTouchLayoutSource`, `comboMechanismCounts`, `classifyNumberRow`, `touchCategorization` in `touch-layout.ts`.
- `displayDifficultyOfScript(script, { puaObserved })` and `DISPLAY_DIFFICULTY_ERA_BOUNDARIES` (`partiallyFromMajor: 6`, `poorlyFromMajor: 11`).
- Shared scan helpers: `ir-scan.ts` (`ruleKey`, `ruleContextPrefix`), `key-map.ts`.

## Key decisions
- Touch classifiers get evidence from `kb.sources` (the third `classify` arg), not the IR (research R1).
- Not-applicable is first-class: caseless script means no `caps-handling` value, abugida/abjad means no `nfc`/`nfd`, no touch layout means no touch value (R3, SC-004).
- `character-class` cause predicate is guarded to Latin/Cyrillic/Greek families (FR-004).
- Exception sites are recomputed at build and not serialized; only the summary is stored (FR-005).
- `display-difficulty` is a per-script session INPUT facet, not a per-keyboard index facet: it bypasses `DEFAULT_CLASSIFIERS` and `facet-index-lint` and is validated by `facet-lint` (R5). Block first-assigned Unicode version sets the tier; observed PUA use overrides to poorly-supported.
- `mnemonic-vs-positional` is a gate facet: measured, never offered for transform. No transition logic lives here (that is spec 039).

## Gotchas and limits
- Encoding is classified per role (`input`/`base`/`combining`); the input match-kind axis (key-ref vs char-ref) is distinct from spelling and never auto-normalized.
- A rule's LHS is flattened into `context[]` with no `+` marker: the struck key is the LAST element. Modified store items (`[SHIFT K_1]`) come back as `{kind:"raw"}` and need a regex to recover the vkey.
- Unknown-script `displayDifficultyOfScript` falls back to the middle tier.

## Divergences from the spec
- None found.

## Follow-ups and open issues
- Font-coverage databases for display-difficulty stay deferred.
- 12 keyboards remain `undetermined` for `desktop-combo-mechanism` and `fallback-posture` (per the handoff).
- `undetermined-facets-handoff.md` is archived and still says "PR open, unmerged"; it is stale.
