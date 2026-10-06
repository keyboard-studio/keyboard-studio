# Spec 045 Lens-vocabulary single source of truth: as built

**Status:** Retired 2026-09-29. Shipped in PR #1672 (squash `fefb7ea6`, 2026-08-25). Tasks: 13/13 complete.
**Full docs:** [specs/_archive/045-lens-vocabulary-source-of-truth/](../_archive/045-lens-vocabulary-source-of-truth/) (spec, plan, tasks, research R1-R6, data-model). Not read by default.
**Pinned here:** none

## What shipped
- A refactor with no runtime change: the facet-index classifiers now derive their axis value types from the `packages/contracts` enumerations instead of redeclaring the literal sets.
- A1 (`added-char-count`) and A4 (`diacritic-mechanism`) were the only genuine stragglers. A7 (`spare-key-budget`) was already sourced (`SpareKeyBudget = KeyBudgetBand`, spec 052).
- A runtime lockstep test that fails if the facet YAML `limits.values` lists diverge from the contracts unions.
- The "source of truth" itself is not in this folder: it is `packages/contracts/src/axes.ts` and `strategy.ts`. This spec only wired stragglers to it.

## Public contracts
- Canonical vocabulary (unchanged): `DiscoveryAxisVector` and per-axis unions (`Scale` = A1, `DiacriticBehavior` = A4 `none | stacking-combining | replacing-cycling | multi-family`) in `packages/contracts/src/axes.ts`; `StrategyId` / `ALL_STRATEGY_IDS` in `packages/contracts/src/strategy.ts`. The engine tree `packages/engine/src/strategy-selector/rules.ts` already imports both.
- `utilities/facet-index/added-char-count-classifier.ts:36`: `export type A1Band = Scale;` with `type _A1BandGuard = Expect<AssignableTo<A1Band, Scale>>` at line 42.
- `utilities/facet-index/diacritic-mechanism-classifier.ts:49`: `type A4Value = DiacriticBehavior;` with `_A4ValueGuard` at line 55.
- Runtime lockstep: `utilities/facet-index/lens-vocabulary-lockstep.test.ts` asserts `content/keyboard-facets/{diacritic-mechanism,added-char-count}.yaml` `limits.values` equal the contracts member sets.
- The YAML files are unchanged; they stay hand-listed literals because YAML cannot import TypeScript.

## Key decisions
- Type-alias plus compile-time `Expect<AssignableTo<...>>` guard, mirroring the existing `_ScaleGuard` idiom in `packages/contracts/src/schemas.ts` (R2/R4).
- Lockstep test lives beside the classifiers, not in `scriptAxes.test.ts` / `driftGuardrail.test.ts`, which cover unrelated axes (R5).
- FR-010 gating question resolved: no locked `Pattern` field touched (`Pattern.strategyId` and `StrategyId` untouched), so no Article I escalation (R6).
- Facets may carry measurement-only values beyond the shared core (FR-009 core + extension).

## Gotchas and limits
- Editing a facet YAML `limits.values` without the matching contracts union change now fails the lockstep test; that is the intent.
- `.specify/memory/constitution.md` did not gain a dedicated single-source-of-truth invariant (SC-005 asked for one or an Article I extension; grep found none).

## Divergences from the spec
- SC-005 (constitution gains the invariant): not found in `.specify/memory/constitution.md`. Minor; may have been resolved at plan time instead.
- The spec's Acceptance checklist boxes in spec.md were left unchecked; tasks.md is 13/13.

## Follow-ups and open issues
- Citation to fix: [docs/lens-model.md](../../docs/lens-model.md) line 210 links `specs/045.../spec.md` as "Resolved by"; it is a history pointer and should be repointed at this AS-BUILT.
