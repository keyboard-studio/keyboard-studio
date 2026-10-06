# Spec 063 Key-level touch layout editing: as built

**Status:** Retired 2026-09-29. Shipped in PR #1503 (squash `2cc88627`, 2026-08-05); close-out verification #1659. Tasks: 130/130 complete. Originally authored as spec 058, renumbered 063 in #1643.
**Full docs:** [specs/_archive/063-touch-key-editor/](../_archive/063-touch-key-editor/) (spec, plan, tasks, research R1-R10, data-model, contracts x4, reviews, checklists). Not read by default.
**Pinned here:** none
**Successor:** spec 065 (touch-editor-parity) remodelled the grid UI and withdrew FR-039 (row-slack hatch); see [../065-touch-editor-parity/AS-BUILT.md](../065-touch-editor-parity/AS-BUILT.md).

## What shipped
- A key-to-rule join: the studio now knows which `T_*`/`U_*`/`K_*` touch key ids have a `.kmn` rule, so producibility and touch coverage stop over- and under-crediting (Cameroon `T_0300`-style combining-mark keys count as covered; orphan `T_03B1` rules are reported once).
- Key editing on the touch stage: assign a character to an existing `T_*` key, rename a key id (rule + all layers + nextlayer refs move together), add/remove/move keys, suppress keys, edit sub-keys.
- Live touch diagnostics inside the single 300 ms cycle (no new timer, decision D3).
- Grid/key-mode UI under `TouchGallery` with a mode selector; edits persist as an overlay and are replayed on re-derivation.
- Byte-preserving raw-JSON apply for imported `.keyman-touch-layout` files (untouched keys structurally identical).
- Two upstream-defect fixes: `sp` enum (`{9,10}` non-interactive; 8 is deadkey-styled and interactive) and the per-key `layer` modifier override now carried in `TouchKeyIR`.

## Public contracts (as the code has them)
- Join: `packages/contracts/src/touch-key-rule-join.ts` (`buildTouchKeyRuleIndex`, `classifyTouchRuleRole`, `normalizeTouchKeyId` case-insensitive, `bindingsForKeyId`, `producedByKeyId`, `hasAnyBinding`).
- Reachability view, a sibling of the frozen plain `buildProducedSet`: `contracts/src/ir/reachableProducedSet.ts` (`buildReachableProducedSet`, `collectTouchRuleOrphans`, `isStruckKeyReachable`).
- Addresses: `contracts/src/touch-key-address.ts` (`touchKeyAddress`, `parseTouchKeyAddress`, `createKeyOccurrenceCounter`).
- Diagnostics: `contracts/src/touch-key-diagnostics.ts` (`computeTouchKeyDiagnostics`, `find*` per check, `TouchKeyFindingCode`, typed `TouchKeyFix` union, `REQUIRED_TOUCH_KEY_IDS = K_LOPT,K_BKSP,K_ENTER`, `TOUCH_SENTINEL_KEY_IDS = T_BLANK,T_SPACER,T_NUL`).
- Coverage: `contracts/src/touch-coverage.ts` (`isSpacerKeyClass`, additive `TouchCoverageOptions`).
- Edit ops: `engine/src/pattern-apply/keyEditOps.ts` (`KeyEditOperation` union: set/rename/add/remove/move/suppress/setSub/removeSub; `resolveKeyAddress`; `checkKeyEditRejections`; `KeyEditOverlay`).
- Appliers (one resolver, two thin appliers): `applyKeyEditsToLayout.ts` (+`replayKeyEditOverlay`), `applyKeyEditsToRawJson.ts`.
- Id policy: `keyIdMinting.ts` (`proposeKeyId`, `validateCandidateKeyId`, reserved prefixes/sentinels; rejects, never merely reports).
- Rule synthesis: `touchRuleSynthesis.ts` (`ensureTouchKeyRule`, `removeTouchKeyRule`, `renameTouchKey`, guard and case-triple planners; synth node ids `gen-touch-*`).
- Layer families: `layerFamilies.ts` (`decomposeLayerId`, `groupLayerFamilies`, `findFamilyParallelismBreaks`).
- UI: `studio/src/editors/assignLoop/keyGrid/*` (KeyGrid, KeyInspector, RenameDialog, RemoveKeyDialog, FamilyApplyDialog, viewmodel).

## Key decisions
- `T_<HEX>` does not self-output; only a `.kmn` rule gives it output, so the `.kmn` stays the sole home of touch output rules (research R5, contracts/key-id-policy).
- Plain producibility view frozen; reachability is a new sibling function, not an option flag (R5, join contract 4.2).
- Rule synthesis is its own projection pass beside the layout overlay; overlay fields are optional with tolerant reads, `DRAFT_VERSION` stays 1 (R10).
- Grid built directly from the ARIA APG grid pattern; family decomposition is canonical-not-round-trip (R10).
- Editing flicks/multitaps/rows/layers/platforms deferred to later increments, not to Keyman Developer.

## Gotchas and limits
- Byte-preservation applies to `.keyman-touch-layout` only; `.kmn` goes through the normal emit path.
- Corpus figures in the spec (1,524 dead keys, etc.) are narrative calibration and drift with the corpus pin.
- Adding rows/layers/platforms and flick/multitap authoring in the grid are not part of this spec.

## Divergences from the spec
- Spec FR-040/SC-007 say eight diagnostics; 063 shipped eleven and spec 065 added `TOUCH_KEY_ROW_CROWDED` and `TOUCH_KEY_KEYCAP_MISMATCH`; `TouchKeyFindingCode` now has 13 codes.
- FR-039 (hatch for row slack) was withdrawn by spec 065 (ADR 0002); the last key stretches instead.

## Follow-ups and open issues
- Stale relative links for km-doc: `docs/adr/0002-touch-grid-renders-the-last-key-stretched.md:8`, `docs/design-notes/touch-editor-glossary.md:8,111` link `../../specs/063-touch-key-editor/spec.md`, which moves to the archive.
- Code comments citing `specs/063-.../contracts/*.md` and `data-model.md` (contracts/src/touch-key-rule-join.ts, touch-key-diagnostics.ts; engine keyEditOps/keyIdMinting/layerFamilies/touchRuleSynthesis.test; studio keyGridViewModel, useModeContextCarry) now resolve into `../_archive/`.
