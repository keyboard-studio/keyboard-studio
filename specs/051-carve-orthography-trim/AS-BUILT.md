# Spec 051 Carve orthography trim: as built

**Status:** Retired 2026-09-29. Shipped in PR #1412 (squash `cd725493`, 2026-07-28). Tasks: 34/34 complete.
**Full docs:** [specs/_archive/051-carve-orthography-trim/](../_archive/051-carve-orthography-trim/) (spec, plan, tasks, research R1-R8, data-model, quickstart, contracts/case-pairing.md, contracts/collateral-guard.md). Not read by default.
**Pinned here:** none

## What shipped
- Carve trim proposals compare **produced** characters (rule outputs, output-store slots) with the orthography/needed set. Input/trigger characters are never compared on their own (FR-001/FR-002 were already true in code and got tests only).
- The coordinated-drop collateral guard no longer shields a trim just because a paired partner slot holds a needed character. The original defect: a surplus `ɨ` was shielded by its `any()` input partner.
- Trim of a paired-store output splices the aligned input/output pair; messaging for the input partner is informational, not a loss warning (`role="status"`, versus `role="alert"` for real loss).
- Every acted-on trim gets a visible state change or an explained refusal (FR-007/FR-008).
- Cased letters trim together as a pair, surfaced as one proposal row / one undo entry.

## Public contracts
- `packages/studio/src/lib/irToCarveNodes.ts:2068` `coordinatedDropHitsNeededChar(mode, itemsIndex, needed, bcp47, analysis, producerIndex, form)` (module-private). A partner shields only when its char is needed AND the partner store is an output store (`isOutputStore` = `usageByName.get(name)?.asIndexOutputTarget === true`) AND `producerIndex.get(ch) <= 1`. Both banner and tile signals call this one predicate (NFR-001).
- Engine facts: `StoreUsageFlags.asIndexOutputTarget` in `packages/engine/src/pattern-apply/applyStoreSlotRemovals.ts`; `buildProducerIndex(ir): ProducerIndex` (`ReadonlyMap<string, number>`) in `packages/engine/src/pattern-apply/producerIndex.ts`, exported via `packages/engine/src/index.ts`.
- `packages/studio/src/lib/carveCasePairs.ts`: `caseGroupFor(ch, produced, bcp47): CaseGroup {upper: string|null; lowers: string[]}` (total, never throws) and `caseTrimSet(ch, produced, bcp47, alsoTrimming?)`. Built only on engine `caseCounterpart`; no second casing path.
- UI: `CarveGallery.tsx` cascade handlers (`buildPendingCascade`, `cascadeDelete` unions rule ids and slot ids into one channel).

## Key decisions
- "Another producer" counts across the whole keyboard, plain rules and output-store slots in any mechanism. Excluded: S-02 deadkey trigger rules and opaque `RawKmnFragment`s (blocked contributors already shield outright) (R4).
- Uppercase to lowercase is a reference set, not 1:1 (FR-013). Real many-to-one folds: `s`/`ſ` to `S`, `i`/`ı` to `I` (locale-insensitive), `μ`/`µ` to `Μ`. Under `tr`, `i`/`ı` split into two 1:1 pairs (R7). The issue's Greek-alpha/Latin-A example was wrong.
- Paired proposals are all-or-nothing per row; authors keep `É` while dropping `é` by declining the pair and trimming manually per chip (OQ-5).
- The paired input slot is spliced with the output; nothing to prune afterwards (OQ-3).
- US3 needed a reproduction before patching; the likely cause was the US1 shielding itself, plus the single-gid fast path when `removableCount <= 1` (R5).

## Gotchas and limits
- `caseCounterpart` returns null for marks, caseless scripts, multi-character maps and titlecase `\p{Lt}` (e.g. `ǲ`); those trim singly (FR-012).
- The guard changes only how many trims are shielded; splice behaviour in `applyStoreSlotRemovals` is unchanged.
- Signals stay conservative when there is no orthography signal yet (FR-009).

## Divergences from the spec
None found (predicate shape and helper exports match the contracts at origin/main).

## Follow-ups and open issues
- Final FR-005 copy is content-team owned; km-domain to confirm the wording for AltGr fan-outs.
- Stale-ish citations, all comments/refs, still resolve to this stub: `packages/studio/src/steps/manifest.ts:221`, `registerEditorSteps.ts:145`, `manifest.specref.json`, `e2e/copy-edit.spec.ts:110`, `carveCasePairs.test.ts:2` (cites `contracts/case-pairing.md`, now archived). Specs 075/076 link into the folder.
