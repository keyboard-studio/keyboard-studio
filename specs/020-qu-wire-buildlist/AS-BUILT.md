# Spec 020 qu-wire-buildlist: as built

**Status:** Retired 2026-09-29. Shipped in PR #873 (squash `cb8a86d0`, 2026-06-29). Tasks: 23/23 complete.
**Full docs:** [specs/_archive/020-qu-wire-buildlist/](../_archive/020-qu-wire-buildlist/) (spec, plan, tasks). Not read by default.
**Pinned here:** none (code cites it only as the `specRef` string `specs/020-qu-wire-buildlist`, resolved via `docs/spec-trace.json`).

## What shipped
- Question Unification Phase 1, spec #6: the Phase B `BuildListView` appears as a read-only build-list branch drill-down under the opaque `characters` node, behind the mandatory IntroChooser gate.
- Oracle: an inline snapshot of the post-`mergePhaseResults` deduped, NFC-normalised `confirmedInventory` union for a fixed input; output is deep-equal before and after.
- Behaviour byte-identical; no contracts bump.

## Public contracts
- `pbBuildListDrillDown` in `packages/studio/src/survey/questions/drillDownDeclarations.ts`: `id:"pb_build_list"`, `underNodeId: CHARACTERS_NODE_ID`, `registryKey:"pb_discovery_intro"`, `inputs:[header.bcp47]`, `writes: []`, `output:{kind:"phase-result-field", field:"confirmedInventory"}`.
- Output rides on `SurveyPhaseResult.confirmedInventory`, unioned via `mergePhaseResults`; it is NOT a `KeyboardIR` write.
- `punctuation` step in `steps/manifest.ts` (cloned build-list) cites this spec in `specRef`.

## Key decisions
- `pb_build_list` is a DECLARED-ONLY descriptor, not a `questionRegistry` id. The reachable, rendered node is `pb_discovery_intro` (IntroChooser, `survey/PhaseB.tsx`). (I1 reconciliation.)
- Reuse `confirmedInventory` rather than adding a `KeyboardIR` inventory field (contracts choice deferred to Phase 2).
- The IntroChooser gate stays mandatory, with no auto-default.

## Gotchas and limits
- New tests were kept strictly additive to the spec-017 `tests/survey/questions/b/pb_build_list.test.ts` assertions.
- The manual step-by-step path and the IntroChooser keep the OSK preview; only the build-list screen swaps the right pane to the character map.

## Divergences from the spec
- `PhaseB.tsx:535/610` line citations have drifted; the build-list flow has since been reworked by specs 075 and 079 (per-question answer persistence, `discoveryMethod` in `surveySessionStore`).

## Follow-ups and open issues
- Phase 2 per-grapheme build-list loop (spec #12) parked pending a build-vs-defer decision.
- Contracts choice for a first-class inventory field still open.
