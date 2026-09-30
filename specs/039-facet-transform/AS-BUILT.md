# Spec 039 Facet transform engine: as built

**Status:** Retired 2026-09-29. Shipped in PR #1183 (squash `f4f2f84`, 2026-07-17). Tasks: 39/39 complete.
**Full docs:** [specs/_archive/039-facet-transform/](../_archive/039-facet-transform/) (spec, plan, tasks, research, data-model, contracts, checklists, quickstart). Not read by default.
**Pinned here:** none

## What shipped
- An engine-owned propose-then-confirm transform engine, `packages/engine/src/facet-transform/`, that switches a base's source-construction facet value on the working-copy `KeyboardIR` (never raw `.kmn`).
- A value-transition matrix with 4 supported pairs and a declined-with-reason registry (permanent and deferred rows).
- Shared commit gate: opaque-fragment integrity, compile/oracle verification, produced-set delta, invertibility for behavior-preserving transforms.
- Studio: `FacetTransformPanel` (`packages/studio/src/components/facet-transform/`), `useFacetTransform` hook, and `commitFacetTransform` on `workingCopyStore`.

## Public contracts (as the code has them)
- `proposeFacetTransform(ir, measurement, request, options?) -> TransformProposal | TransformRefusal`. Pure; never mutates `ir` (`propose.ts:119`).
- `applyFacetTransform(workingCopyIr, proposal, options?) -> Promise<CommitResult>` (`verify.ts:317`). Options: `simulate` (node-only injected simulator), `ruleOverride` (spec 062 context tolerance, built async).
- Helpers: `producedSetDelta`, `opaqueInventory`, `MIGRATION_RULES`, `TRANSITION_MATRIX`, `findTransition`, `isGateFacet`, `GATE_FACETS`, `FACET_IMPACT_CLASS`, `DEFAULT_HOUSE_TARGET_POLICY`, `resolveHouseTarget`. All re-exported from `packages/engine/src/index.ts` (~line 894) via `facet-transform/index.ts`.
- Types in `types.ts`: `TransformImpactClass`, `LossProfile` (lossless | lossy-with-named-loss | one-way), `CauseTag` (principled-split | capacity-forced | gap-omission), `SourceFacetMeasurement`, `ExceptionSite`, `FacetTransition`, `MigrationRule`, `TransformProposal`, `TransformPreview`, `TransformRefusal`, `CommitResult`, `ProposalStatus` (proposed | partially-accepted | accepted | declined | commit-failed).
- Migration rules under `migrations/`: `encoding-spelling`, `longpress-to-flick`, `nfd-to-nfc`, plus `context-tolerance` (added later by spec 062).
- Supported v1 pairs: `source.encoding` output-spelling and input-within-kind (behavior-preserving, lossless); `source.touch-combo-mechanism` longpress -> flick (ux-changing, lossy); `source.normalization-posture` nfd -> nfc (output-changing, lossy). `mixed -> pole` is a first-class `from`.

## Key decisions
- Migrations are pure `KeyboardIR -> KeyboardIR` returning a new object; the studio writes via `setWorkingIR` (research D2).
- Measurement is injected, produced by specs 037/041, not computed here (D4).
- The matrix does not reuse the locked spec section 7.2 strategy types (D5).
- Parity oracle for behavior-preserving transforms: compile + simulate over the bounded corpus, invertibility via `assertSemanticEquivalence` (D6, D7). The compile gate is a one-shot undebounced call, so the single 300 ms debounce is untouched (D8, D9).
- FR-013 cache invalidation is satisfied by construction: a new IR reference plus re-running axis derivation; no cache-busting mechanism (D11).
- Gate facets (`source.mnemonic-vs-positional`, `source.casing`) are refused upstream, never a matrix lookup.

## Gotchas and limits
- Declined permanently: `input-match-kind` key-ref <-> char-ref, any `os-compose` pair, both gate facets. Deferred (v2): `nfc -> nfd`, `source.fallback-posture` switches, desktop deadkey/context-match, touch `layer` conversions, `source.reordering-rules`.
- The `simulate` step is skipped in the browser (not bundleable); produced-set equality, compile-both and invertibility still gate the commit.
- FR-011's `fallThroughImpact.producedCharacterSetDelta` is tested only with a synthetic fixture: no v1 transition (un)blocks fall-through.
- Modifier folds are lossless only when the per-site precondition holds; failing sites are refused per site.

## Divergences from the spec
- None found on the public surface. The migration set grew beyond spec (context-tolerance, spec 062).

## Follow-ups and open issues
- v2 deferred transitions above; `fallback-posture` transform needs a full `&baselayout` key map (spec 040 supplies the resolution used by the classifier).
- Code comments in `__fixtures__/measurements.ts` and `house-target-policy.ts` still call `orth.display-difficulty` "spec-037 output NOT yet landed"; it landed in spec 041 P3 (km-programmer).
