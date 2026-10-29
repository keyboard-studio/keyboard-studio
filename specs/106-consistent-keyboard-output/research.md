# Research: spec 106 consistent keyboard output

Date 2026-10-29. Sources: five research passes over the code (projection + marks, output-form seam,
carve + caps, fixture/compile/simulate infra) and one km-keyman ruling. Line numbers are as of
`km/s02-deadkey-purpose` @ `5d3a3e44`.

## R1. Fixture harness: reuse the download path, do not rebuild options by hand

- **Decision**: Decision-point fixtures seed the studio stores and call the real download path
  (`buildOutputBundle()` in `packages/studio/src/lib/buildOutputBundle.ts:80`), which goes through
  `projectWorkingCopyForOutput()` (`lib/serializeWorkingCopy.ts:243`) to `projectWorkingCopyVfs`, then
  `compile()`. Simulation uses `simulate(compiled, keys, seed)` from `@keyboard-studio/engine/simulator`.
- **Rationale**: FR-001 forbids a second projection. A hand-assembled `projectWorkingCopyVfs` call
  would drift from what authors download.
- **Finding that becomes a task (F-DIVERGE)**: the preview path (`hooks/useWorkingCopyTransform.ts:494`)
  passes `fallbackPolicy`, `suppressionExemptIds`, `disabledFamilyIds` (merged into `deletedItemIds`),
  `carveTouchKeepInert` and `keyEditOps`; the download path (`serializeWorkingCopy.ts:505`) passes
  none of them. Preview and download can differ today. Fix: one pure
  `projectionInputFromState(state, extras)` used by both callers; parity test.
- **Loading bases**: reuse `src/test/sc004Harness.ts` (`loadVfs` at :58 — export it) against
  `../keyboards/release`, gated by `sc004GatesEnabled` / `announceSc004Skip` (skip locally when absent,
  fail in CI). The instantiate chain is `walkEmit.compile.test.ts` `instantiateLikeStudio` (~:133).
  Name corpus-reading fixture files `*.corpus.test.ts` (they run under `vitest.corpus.config.ts`).
  Vendor a small subset into `tests/fixtures/walkBases` only if CI corpus checkout proves flaky.
- **Decisions in**: no `DecisionRecord -> DecisionSet` converter exists. Build fixtures as a
  **`DecisionSet` JSON per decision point** (hand-curated from the p1/p4 Bafut records under
  `tools/testing-profiles-2302/zips/*/.studio/decision-record.json`, and the 32 sibling zips in
  `../ks-2302-main/tools/testing-profiles-2302/zips/`). Replay via `replayKeyboard` /
  `rebuildWorkingCopy` (`decisions/rebuildWorkingCopy.ts:123`), then install the slices replay does
  not reconstruct (assignments `phaseResults`, `deadkeyOverlay.ops`, carve sets, `touchLayoutJson`,
  `fallbackPolicy`, `contextToleranceOverlay`) from the decision values. A small
  `recordToDecisionSet(record, uptoDecisionId)` converter is in scope (test-only first; it is also
  what the walk gates use).
- **Environment**: `// @vitest-environment node` for anything that packages `.kmp`; compile + simulate
  run in jsdom (`lib/deadkeyLifecycleSimulate.test.ts` is the template, 60 s timeout). The engine must
  be built (studio imports `dist`).
- **Alternatives rejected**: driving the UI (slow, flaky; kept only as the end-to-end gate);
  calling `projectWorkingCopyVfs` directly (drifts — see F-DIVERGE).

## R2. Gate measurement

- G1 unreachable: `compile()` diagnostics, code `KM_HINT_KMCMP_3154094` (= 0x3020AE
  `HINT_UnreachableRule`; `compiler/index.ts:206`, curated name in `validator/codeMap.ts:45`).
- G2 tolerance: not a compiler code. `computeContextTolerance(ir)`
  (`engine/src/validator/context-tolerance.ts:589`) then `lintContextTolerance(ir, report)`
  (`packages/keyboard-lint/src/lintContext.ts:247`); count `KM_WARN_CONTEXT_NOT_TOLERANT`.
- G3 guard: parsed projected IR has group `generated_marks_guard` iff `worklist.blockedCombinations`
  is non-empty or any mark row excludes a context.
- G4 form: walk every rule output/store item of the projected IR, check
  `s === s.normalize(form)` where form = `normalizationFormForOutputForm(outputForm)`
  (`engine/src/marks/output-form-policy.ts:53`). Starting-keyboard rules are exempt only when the
  carve kept them on purpose (listed in the gate report).
- G5 caps: `store(&CasedKeys)` present iff `caseCounterpart` finds a pair in the confirmed alphabet.
- G6 touch: every confirmed-alphabet letter appears on every platform's `default` layer of the
  projected `.keyman-touch-layout`.
- G7 determinism: two projections byte-equal.

## R3. Mark guards in the projection (US2)

- **Decision**: new step **2.6** in `projectWorkingCopyVfs.ts`, inserted at line ~890 (after 2.5 ends
  at 889, before the 2.7 comment at 891): read `source/<id>.kmn`, `parseKmn`, `applyMarkGuards`, emit
  only when the IR reference changed; try/catch with a `[project-working-copy]` warning; surface
  `guardHopSkipped` as a warning.
- **Before 2.7** because the 2.7 normalization replay repoints `entryPoints.main` at
  `generated_context_normalize` (`context-tolerance-overlay.ts:49-50`), and `applyMarkGuards` uses
  `entryGroupOf` (`pattern-apply/ir-insert.ts:24`). **After 2** so guards see assignment rules.
- New input `marksGuards?: { worklist; outputForm; backspace?; stacks? } | null`. This is the shape of
  `MarksCompletion` minus `migrationNeeded`/`guardReevaluation` (`survey/marks/marksValue.ts:64-91`).
  The preview reads it through `useDecisionStore` (as in `useContextToleranceApply.ts:76-79`); the
  download reads it through `getMarksTreatmentValue()` (`marksValue.ts:136`). Both go through
  `projectionInputFromState` (R1).
- `applyMarkGuards` (`engine/src/pattern-apply/mark-guards.ts:236`) is already idempotent
  (strips `generated_marks_*` artifacts, :247-297). Re-applying to a parsed already-guarded `.kmn`
  is safe.
- `marksTreatment.apply` (`survey/questions/gallery/marksTreatment.ts:51-79`) stops calling
  `applyMarkGuards`; it returns `{}`, and `writes` becomes `[]`. The header comments at
  `projectWorkingCopyVfs.ts:39, 670-674` are updated.
- **Blocking beyond letters**: today there is one rule per blocked base x mark pair (:106-124),
  `'base' 'mark' > 'base'`. Replace that with one rule per mark,
  `notany(generated_marks_allowed_<n>) '<mark>' > context(1)`, plus a buffer-start rule. The allowed
  store is the checked row (case-expanded), plus U+0020 when the space column is ticked.
  - Order: `nul '<mark>' >` handles buffer start, and the `notany` rule follows.
  - Keep `blockingRuleCount`.
  - km-keyman confirmed (ruling below) that rules the deadkey emits always pass the guard, because
    both come from the same matrix row.
- **No beep option in the marks decision.** `beep` and `nul` are modelled throughout the IR, codec
  and simulator (`contracts/src/keyboard-ir.ts`, `engine/src/simulator`, recognizer `s02-families.ts`),
  but the marks treatment has no beep answer. The only behaviour answer is `GuardSpecification.behaviour: "swallow" | "emit"`
  (`contracts/src/decisionRecord.ts:525-538`), and it governs a mark key tapped with no letter
  before it. The decision is:
  - attachment blocking always swallows;
  - the buffer-start rule honours `GuardSpecification.behaviour` (emit = let the bare mark through
    at buffer start).
  - The beep variant is deferred: it would need a new answer value. If it is added, it is a rule
    output (`notany(...) '<mark>' > context(1) beep`) and is legal; it must never be a store item (R11).
- **Space column**: `AttachmentStation.tsx` (rows at :74-110). Storage is the existing answer key
  `marks_attachment.<mark>|<base>` with base = `" "` (U+0020), default unchecked.
  `buildPlacementWorklist` (`engine/src/marks/worklist.ts:52-97`) must not treat space as an alphabet
  base: carry it as `allowedContexts[mark]`, not as a blocked combination. `reconciledAttachmentChecked`
  (`marksViews.ts:90`) needs to pass the space column through untouched by the case expansion.

## R4. Output form seam (US3)

- `applyAssignments(assignments, getPattern, kmnSource)` (`engine/src/pattern-apply/applyAssignments.ts:480`)
  takes no `outputForm`. Add an options bag `{ outputForm?: OutputForm }`. Thread it through
  `applyAssignmentsToVfs` (`applyAssignmentsToVfs.ts:31`), `projectWorkingCopyVfs` (:797),
  and every other `applyAssignmentsToVfs` caller (only `applyAssignmentsToVfs.ts:62` calls `applyAssignments` itself).
- **Seam location**: slot level, before `substituteSlots` (:675-676), applied to the **merged** refs
  (after the S-02/S-08 merges at :505-651). The output-bearing slots are:
  - `accentedForms`
  - `accentChar`
  - `altgrOutputList`
  - `collapsedChar`
  - `contextOutputs` / `defaultOutput`
  - the U+ RHS of `kmnRules` (S-01)
  Rewrite each with `toOutputForm(s, form)`: NFD under base-plus-mark, NFC under ready-made.
  `outputStringForStack` (`output-form-policy.ts:87`) does not decompose a precomposed base, so add
  an `outputFormString(s, form)` helper next to it and use that.
- **Multi-codepoint store items** break the parallel-store index alignment (S-02 `accentedForms`,
  S-08 `altgrOutputList` are joined with `join("")`). km-keyman ruling below for S-02. For S-08 and
  S-01 under base-plus-mark, emit per-key rules (`+ [RALT K_x] > 'a' U+030C`) instead of the
  store pair when any item is multi-codepoint.
- **Pattern variant without a schema change**: Constitution Art. I forbids editing `Pattern`
  (`kmnFragment: string` is required; there is no variant field), so do **not** add a keyed-variant
  field. Add a **new pattern** `deadkey_single_tap_nfd` (content YAML, same questions minus
  `accentedForms`, `strategyId: S-02`) and have the studio pick the pattern id from the output form
  when building the S-02 assignment. The engine merge keys on `DEADKEY_PATTERN`; extend that to a set
  `{deadkey_single_tap, deadkey_single_tap_nfd}`. The recognizer and touch scaffold read only
  `deadkey_single_tap`; the new pattern gets a recognizer test so imports recognise NFD deadkeys.
- **Postfix compose** (ready-made + postfix mark key): new pattern `postfix_compose`, fragment
  `any(pc_{{name}}_bases) + [{{markKey}}] > index(pc_{{name}}_composed, 1)` plus an optional bare
  line driven by an `escapes`-style slot (`bare`). Its stores are derived from the attachment matrix
  (allowed pairs only, composed with NFC). Corpus precedent: `dega.kmn:150-155`.
- **Studio**: `currentChar` is effectively always NFC (`MechanismGallery.tsx:1795-1796, 1859`). S-01's
  suggestion path writes only the first code point (:2829-2845). Under base-plus-mark, a composed
  `currentChar` placed via S-01 must emit all its NFD code points. The engine seam fixes the emitted
  form; also fix the studio builders `buildStartRuleLines` / `buildShiftRuleLines` /
  `buildCasePairRuleLines` (:3323, :3408, :3709, :3736) to write all code points.

## R5. km-keyman ruling (FR-021) — binding, recorded 2026-10-29

**Status: approved with conditions.**

S-02 under base-plus-mark uses a self-indexing store, with the mark as a literal and no output store:
```
store(dk_caron_bases) 'aAeE'
dk(caron) + any(dk_caron_bases) > index(dk_caron_bases, 2) U+030C
```
- The escapes stay unchanged: `dk(caron) + [trigger] > U+030C`, `dk(caron) + [K_SPACE] > U+030C`,
  and `+ [trigger] > dk(caron)`.
- Ready-made keeps the parallel-store shape.
- `index(..., 2)` is correct because the deadkey counts as context position 1. Offset 1 gives
  `ERROR_IndexDoesNotPointToAny`.
- Cased bases share one store.
- Stacked marks are legal as `index(b,2) U+0301 U+0331`.
- Corpus precedent: `cabecar.kmn:283-294` and `winchus.kmn:507`. (`sil_cameroon_qwerty` is not an
  NFD-deadkey exemplar; its marks are postfix S-01.)

Postfix compose is approved:
```
any(grave_bases) + [K_5] > index(grave_composed, 1)
+ [K_5] > U+0300          c only when the bare-mark escape is kept
```
The `any()` rule comes first in source.

The guard interaction is safe by construction. The guard group sees `a U+030C`; because both come
from the same matrix row, the pair is allowed. Do not add `nul`/`beep` to deadkey rules.

The builder must NOT:
- fake output stores with 2-codepoint items;
- use offset 1;
- reorder the bare rule above the `any()` rule;
- split cased stores;
- put the mark in `any()` or `context()`;
- cite cabecar/winchus/dega without adding their rows to `docs/keyboard-index.md`.

Required test vectors:
- `[K_QUOTE,K_A] -> a U+030C`
- `[K_QUOTE,SHIFT K_A] -> A U+030C`
- `[K_QUOTE,K_E] -> e U+030C`
- the double-tap and space escapes `-> U+030C`
- a blocked base (`K_X`) falls through to plain `x`

## R6. Carve (US4)

- **Claimed-inputs filter**: carve step 1 works by node ids (`projectWorkingCopyVfs.ts:427-591`;
  `applyCarveMutate` at :535). Add a pure `claimedInputRuleIds(startIr, assignments)` that returns
  the nodeIds of starting rules whose context is exactly one vkey + modifier set claimed by an
  assignment, with no preceding context, deadkey or `if()`. Union them into `effectiveItemIds` for
  this projection only; they are never stored, so undo is automatic.
  - Claimed sets come from `mechanismSlotEntries` (`survey/slotOccupancy.ts:202`), extended for S-02.
    `mechanismSlotEntries` returns `[]` for S-02 today; add the bare trigger plus `RALT trigger`
    when `escapes` includes `altgr`.
  - Postfix compose claims its mark key.
  - `slotKeyFor` (:65) is the key format.
  - This lives in studio (the projection is studio-side). The engine stays parser-owned through
    `parseKeySpec`.
- **Approvable default**: suggested rows (`recommendedRemovalChars`, `lib/irToCarveNodes.ts:2418`;
  UI `CarveGalleryV2.tsx:771, 1342-1361`) are discarded on the **first** carve visit by calling the
  same `toggleRecommendedRows(primaryRows, true)` (:846-863). They are marked with provenance
  `"derived"` in `CarveRemovalItem` (`survey/carve/carveValue.ts:21`; the comment at :60-67 says
  `derived` "can't be produced honestly yet", and this feature makes it honest).
  - The rows render as "discarded, suggested — click to keep".
  - Continue (`carveAdapter.tsx:31-37`) records the `carved-layout` decision. Its decision-set
    provenance is `"default"` while any derived items remain, and `"asked"` once the author has
    toggled anything.
  - Art. III mapping: decision-set `default` is decision-record agency `tool-proposed`, and `asked`
    is `hand-set`.
  - A first-visit marker is needed so a returning author's Keep is not re-overridden. Store it as
    "suggestion fingerprint applied" in the carve value, not as a flag in a component.
- **Needed punctuation**: `isAlwaysKeepCategory` (`irToCarveNodes.ts:1918`, not exported) covers
  `\p{N}\p{P}\p{S}`. `maybeRaiseDisplacement` (`MechanismGallery.tsx:2224-2304`) decides "needed"
  via `isStillNeeded` (inventory or base-produced). A `'` from the base is base-produced, so it
  should already qualify; the walk showed that it did not. **First task: reproduce with a fixture**
  (Bafut kbdus, `'` -> `’`) and find which gate skipped it, likely `isProducedOnOtherSlot` or the
  quote not being in `baseProducedSet`. The decline path must record a decision (today dismissals
  live only in component state, `useDisplacementProposal.ts:86`). Use the existing
  `retained-convenience-chars` value's `rejected` list or a new `displaced-chars` entry inside the
  `carved-layout` value; prefer the carve value so no new decision id is needed.

## R7. Caps (US5)

- **Module**: new gallery module `survey/questions/gallery/capsHandling.ts`. It has the
  `windowsLayout.ts` shape: `provides: ["caps-handling"]`, `screen: "layout"`,
  `requires: ["character-inventory", "windows-layout"]`, `apply: () => ({})`. The store is projected,
  not applied. Register it in `survey/questions/registry.ts:101-116` and add `"caps-handling"` to
  `DecisionId` (`decisions/decisionTypes.ts`). Auto-complete follows the `ConvenienceCharsStep`
  precedent (:250-267): `setStatus(..., {kind:"not-asked"})` when the alphabet is caseless.
- **Casing gate**: `caseCounterpart(char, bcp47)` (`engine/src/character-discovery/casePair.ts:99`)
  over the confirmed alphabet.
- **Copy track**: `scaffoldIR` (`engine/src/scaffolder/scaffold-ir.ts:274`) calls
  `ensureCasedKeysStore` (:255). Remove that call. Keep `stripCapsRules` and
  `removeCapsContextElements`. Projection step **2.8 "caps"** (after 2.7, before 3) writes or removes
  `store(&CasedKeys)` from the decision plus the assignments.
  - The family floor is `[K_A]..[K_Z]`, or the AZERTY string at `scaffold-ir.ts:248`; move it to an
    exported constant.
  - Add the union over every assignment slot (`mechanismSlotEntries`) whose base/shift or
    RAlt/Shift+RAlt pair satisfies `caseCounterpart`.
  - The default is seeded through `lookupDefault` with provenance `default`.
- **Adapt track**: `instantiateFromExistingWithIdentitySeed` (`lib/confirmRebase.ts:214`) has no caps
  logic. Use `extract(ctx)` on the module to read the start IR:
  - `&CasedKeys` present: extracted, confirmed.
  - Explicit CAPS/NCAPS rules: offer `cased-keys` with the simplification, gated by compile plus a
    simulator diff over {none, SHIFT, CAPS, SHIFT+CAPS} for every key (`SimKeyInput.caps`). The diff
    runs in the existing D3 cycle's compile, not a new timer. If too heavy, run it at proposal time
    on demand.
  - No caps handling plus a cased alphabet: offer to add it.
  - The strip-and-replace for adapt is a projection step too (strip CAPS/NCAPS rules only when the
    decision is `cased-keys` and the provenance shows the author accepted the simplification).
- **Companion pre-accept**: `useCasePairCompanion` (`casePairCompanion.ts:206`). When the key is in
  the derived `&CasedKeys` set, render the proposal pre-accepted. Accept-on-render is still a visible,
  dismissible banner (Art. X), so implement it as "Apply includes the companion unless dismissed",
  not as a silent write.
- **Touch**: `mutateCleanTouchLayout` (`engine/src/scaffolder/cleanTouchLayout.ts:178-225`) already
  clones `shift` to `caps`. Add the FR-055 parity test. `*ShiftedLock*` is not emitted anywhere
  (fixtures only), so the plan's claim was wrong; no action beyond the parity test.

## R8. Tolerance default (US6)

- `buildNormalizationStepProposal` (`survey/marks/contextToleranceProposal.ts:93-123`) is already
  `userDisposition: "accepted"`. Nothing applies until a decision exists
  (`useContextToleranceApply.ts:86-91`).
- **Decision**: when the station has gap findings and no decision, record the accept decision with
  decision-set provenance `"default"` on station render. The station shows it as accepted with a
  "change" link, through the same `decisionFromProposal` (:71). The fixture path records it the
  same way.
- The `MarksContextToleranceDecision` lives inside the `marks-treatment` value, which has no
  per-field provenance. Add an optional `origin: "default" | "asked"` to
  `MarksContextToleranceDecision` (`contracts/src/surveyPhaseResult.ts:202-212`). This is not the
  `Pattern` schema, so it is allowed: additive and optional, with a zod mirror in the same commit.

## R9. Clean rules (US7)

- Repeated comments: `isDuplicateLine` (`applyAssignments.ts:164-169`) never dedups `c ` lines.
  Emit the pattern's comment header once per pattern id per group. Trim the S-03 header in
  `multi-char-sequence.yaml` to one line.
- Ordering: `mergeGroupBlock` (:346) prepends. Replace it with a stable mechanism-ordered block:
  stores (hoisted already), AltGr, deadkey clusters (trigger + fan-out + escapes together), swaps,
  sequences, then the starting rules.
- Named deadkeys: the codec round-trips `dk(name)` (`codec/parse.ts:171`, `emit.ts:88-119`). Change
  `resolveS02DeadkeyIdentity` (`MechanismGallery.tsx:527`) to use the purpose name from
  `deadkeyPurposeOf` (`deadkeyPurpose.ts`), sanitised to `[A-Za-z0-9_]`. Fall back to `hex4(id)` on a
  collision with a starting-keyboard deadkey name or id. Existing sessions with numeric names keep
  them, because the name is stored on the assignment.
- Rules pane: `components/rules/DemoPane.tsx:435-441` should use `plainDiagnosticMessage`
  (`lib/plainDiagnosticMessage.ts:392`) and hide hint severity.

## R10. Pre-selected proposals (US8)

- Nothing is pre-selected today (`MechanismGallery.tsx:2532-2557` only sorts the chips). Decision:
  the top chip of `orderedVisibleSuggestions` is pre-selected when the card opens, and Accept applies
  it. The S-02 trigger is already proposed (`proposeS02TriggerKey`). Art. X is satisfied because the
  pre-selected chip is visibly selected and changeable. Nothing is applied without the author's
  Accept.
- Harness (`../ks-2302-main/tools/testing-profiles-2302/scripts/phase2.template.js`): drop the `zzq`
  path, accept the pre-selected proposal, record it. The G6 touch diff goes into `run-zip.mjs`.

## R11. `nul` / `beep` in stores (keymanapp/keyboards#4181)

- **Source**: keymanapp/keyman#16723 makes the 19.0 compiler reject `nul`/`beep` inside stores.
  Before that, they half-worked through compiler unfolding of `any`/`index`. Issue
  keymanapp/keyboards#4181 lists the affected corpus keyboards: clavbur9, hausa_ajami_qwerty,
  sil_cameroon_qwerty, sil_cameroon_azerty, sil_dzongkha, sil_yoruba8, sil_yoruba_bar and sil_yoruba_dot.
  The method agreed there (comment 6501435991) is to strip the `nul`/`beep` items and their
  corresponding base keys out of the stores and put them in separate rules, because it has virtually
  zero side effects. The `dk(none)` substitute was rejected as riskier, since it blocks preceding-context
  matches.
- **Exposure in this feature**:
  - `sil_cameroon_qwerty.kmn:352` `store(dkt003b)` holds 11 `nul` items. The file has 12 `nul` and 21
    `BEEP` tokens in total.
  - `sil_cameroon_azerty.kmn:399` `store(dkt0021)` is the same family.
  - Both are #2302 walk bases, and `sil_yoruba8` is used by the tolerance tests. The keyboard-studio
    fork's master may predate the upstream fix, and the pinned oracle is kmc-kmn 19.0.240-alpha, so
    these may already fail or warn at compile.
- **Decision**:
  1. **Generator rule**: no generated store ever contains `nul`/`beep`. This covers mark-guard allowed
     stores, S-02 base stores, postfix-composed stores, S-08 output stores, unwrap stores and
     `&CasedKeys`. Rule outputs may use them; R5 still forbids `nul`/`beep` in deadkey rules.
  2. **Normaliser**: new pure engine function `splitIllegalStoreItems(ir)` in
     `packages/engine/src/pattern-apply/store-legality.ts`.
     - For every rule `ctx any(K) > index(V, n)` (and `dk(x) + any(K) > index(V, n)`) whose output
       store `V` has `nul`/`beep` at positions i, it removes item i from both `K` and `V`.
     - It emits one rule per removed item, `ctx <K[i]> > nul|beep`, placed immediately before the
       original rule.
     - It keeps the other items aligned, and it is idempotent.
     - If a store is shared by several rules in ways that prevent a safe split, the store is left
       alone and a warning is raised (it becomes a G8 failure with detail).
  3. **Placement**: projection step **1.9**, after carve (1) and the deadkey overlay (1.8), and
     before assignments (2). It runs on both tracks, so all later steps see legal stores.
     - It is a behaviour-preserving legality fix, which counts as precertification under Art. X, not
       an author decision.
     - It is reported in the projection warnings and in the PR or change summary, so it is not silent.
  4. **Gate G8**: every `store()` item in the projected IR is neither `nul` nor `beep`.
     - Proof of equivalence: a simulator diff over every affected key x deadkey on the starting
       keyboard, before and after the split, compared by final output and beep flag.
- **Alternatives rejected**:
  - `dk(none)` substitution: it changes context matching.
  - Leaving starting stores untouched: the 19.0 compile fails and keyboards-repo PRs get rejected.
