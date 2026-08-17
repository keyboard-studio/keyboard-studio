# Implementation plan: key-level touch layout editing

**Feature**: [specs/063-touch-key-editor](spec.md) · **Branch**: `063-touch-key-editor` · **Planned**: 2026-08-04

**Inputs**: [spec.md](spec.md) · [research.md](research.md) (R1–R9 from specify, **R10 from this plan**) · [.specify/memory/constitution.md](../../.specify/memory/constitution.md)

**Design artifacts**: [data-model.md](data-model.md) · [contracts/touch-key-rule-join.md](contracts/touch-key-rule-join.md) · [contracts/key-id-policy.md](contracts/key-id-policy.md) · [contracts/layer-families.md](contracts/layer-families.md) · [contracts/key-edit-overlay.md](contracts/key-edit-overlay.md) *(new in this plan)*

---

## Summary

The studio must become sufficient for touch fine-tuning on its own, which means owning three capabilities Keyman Developer provides today: redefining `T_*` key ids, adding and removing keys, and assigning letters to existing `T_*` keys — with the producibility arithmetic accounting for all of it. The enabling primitive is a **touch key ↔ rule join** in `packages/contracts` (Layer C lint cannot import engine), which is the same join Keyman's compiler performs and which neither of our two existing producibility calculations can do: one walks rules and over-credits an orphan, the other walks the layout and under-credits a `T_` key whose output lives in a rule. That join lands first and delivers US1 with **zero UI change**, then the editing surface rides on it: a new key grid as a second **mode** of the existing touch step (no manifest churn), an ordered key-edit operation log applied as a projection pass, and eight edit-time diagnostics that are pure synchronous joins Developer defers to compile.

No new dependency, language, or storage. `TouchKeyIR` gains two additive optional fields (`layer`, subkey `default`) under the §18 sign-off already recorded on 2026-08-03, bumping `@keyboard-studio/contracts` **0.17.0 → 0.18.0** on the established 0ver-minor convention for locked-surface changes.

**Three findings from the codebase reshape the plan** — each corrects something the spec or a contract document assumes, and each is recorded with its rationale in research.md R10:

1. **The touch step's OSK preview bypasses the projection chain entirely** (R10.1). `TouchGallery` builds its own transform that injects only the touch layout. Naively routing it at `useWorkingCopyTransform` would *regress* the preview, because that hook reads the store's `touchLayoutJson` — written only at step commit — while the gallery's is a live memo. The fix is an optional live-layout override on the hook, giving one projection implementation without losing freshness.
2. **The working IR never reaches the artifact** (R10.2), so the spec's claim that synthesized rules already travel the `.kmn` emit path is half false — `applyMarkGuards` writes only to `store.ir`, which the projection does not read. Rule synthesis therefore needs its **own projection pass**, or US2's rule-bearing assignment is a silent no-op in both preview and zip.
3. **There is no ARIA grid in this codebase**, and `docs/accessibility.md` claims there is (R10.4). The grid is net-new work; the idioms to copy are `CharScrollStrip`'s roving-tabindex fallback and its selection-centred windowing. The false conformance claim in our own a11y rules gets corrected in this feature.

Two smaller corrections change what gets written: `DRAFT_VERSION` must **not** be bumped (R10.3 — a bump discards every in-progress draft, and the ratified precedent for additive fields is a tolerant optional read), and six helpers the contracts assume are reachable are private or absent, making their lifting prerequisite work rather than tidy-up (R10.5).

**Phasing.** Five user stories makes this a multi-phase feature, so per the constitution's one-conversation-per-phase policy the implement step stops at each user-story boundary. US1 is independently shippable and is the prerequisite for everything else.

---

## Project Structure

```
packages/contracts/src/
  keyboard-ir.ts                    ~ TouchKeyIR: + layer?, + default?; fix the sp doc comment
  schemas.ts                        ~ zod mirror + drift guard beside _TouchKeyIRGuard
  parseTouchLayout.ts               ~ RawKey + convertKey: map layer / default
  touch-coverage.ts                 ~ SPACER_SP_VALUES {8,10}->{9,10}; + deadkey predicate;
                                      + optional 3rd arg TouchCoverageOptions; U+25CC strip
  touch-key-rule-join.ts            + the join: buildTouchKeyRuleIndex, roles, normalization
  ir/producedSet.ts                 ~ (frozen semantics) — reuse collectFromElements only
  ir/reachableProducedSet.ts        + buildReachableProducedSet (sibling, not an option)
  rule-shape.ts                     + isPlusSeparator moved here (structurally typed)
  index.ts                          ~ barrel entries for the new modules

packages/engine/src/
  shared/rule-shape.ts              ~ re-export isPlusSeparator from contracts (call sites unchanged)
  codec/parse-touch.ts              ~ emit layer / default
  pattern-apply/
    touchCoverage.ts                ~ thread the index in BEFORE augmentWithComposable
    touchKeyAddress.ts              ~ + parseTouchKeyAddress (the missing inverse)
    keyEditOps.ts                   + operation union, shared resolver, field semantics
    applyKeyEditsToLayout.ts        + IR applier (Case A)
    applyKeyEditsToRawJson.ts       + raw-JSON applier (Case B, R9 byte-preservation)
    applyKeyEditsToVfs.ts           + the projection pass (step 1.7)
    touchRuleSynthesis.ts           + ensure / remove / rename + guard-store proposal
    ir-insert.ts                    + entryGroupOf + insertBeforeTerminalRules, lifted
    mark-guards.ts                  ~ consume the lifted helpers (no behaviour change)
    modifierCombos.ts               ~ export TOUCH_LAYER_PRECEDENCE_ORDER
    layerFamilies.ts                + decomposition, family grouping, freeform fallback
  validator/
    layer-a-prime.ts                ~ + imported-id validity check (0x05A analogue)
    index-import-fidelity.ts        ~ spread it into runImportFidelityParseChecks

packages/keyboard-lint/src/
  checks/check-18-3-keys-per-row.ts ~ keys-per-row recount under the corrected predicate
  checks/check-18-4-...ts           ~ + duplicate id, + missing required key
  checks/check-18-5-...ts           ~ + missing layer
  checks/check-18-6-...ts           ~ + dead T_ key, + id case hint, + orphan rule
  lintContext.ts                    ~ the registry: import, invoke, LintContext field

packages/studio/src/
  editors/assignLoop/
    TouchGallery.tsx                ~ mode tabs in headerExtras; drop the local vfsTransform
    useCharCycleKeys.ts             ~ SKIP_SELECTOR += [role="grid"], [role="tablist"]
    touchBehavior.ts                ~ + address-matched promotion beside the id-matched one
    keyGrid/                        + KeyGrid, KeyGridCell, useGridNav, KeyInspector,
                                      AssignPanel, RenameDialog, FindPanel, view model
  hooks/
    useWorkingCopyTransform.ts      ~ optional live-layout override (+ memo key)
    useInventoryDiff.ts             ~ + third array producedButUnreachable
  lib/
    projectWorkingCopyVfs.ts        ~ step 1.7 (layout) + the rule pass
    persistWorkingCopy.ts           ~ WorkingCopySnapshot fields, tolerant reads, NO version bump
  stores/workingCopyStore.ts        ~ overlay + mode state, actions, UndoEntry kind, 4 reset paths
  locales/en/messages.json          ~ new strings (extracted, not hand-added)

docs/accessibility.md               ~ correct the character-map-grid conformance claim
docs/keyboard-facet-index.json      ~ regenerated, asserted BYTE-IDENTICAL
docs/keyboard-index.md              ~ phonebook rows for any newly cited keyboard
```

**Structure Decision.** Nothing moves and no package is added: the join goes to `contracts` because Layer C cannot import engine (the `computeTouchCoverage` precedent), mutation and synthesis go to `engine/src/pattern-apply` beside the existing appliers, the grid is a new directory under the touch step's existing editor rather than a new step, and diagnostics ride the existing aggregated findings surface. The one deliberate duplication — two appliers over one resolver — is required by spec 035's R9 and is defended by a twin-equivalence test, not by discipline.

---

## Constitution Check

Assessed against Articles I–VIII, re-checked after the Phase 1 design.

| Article | Assessment |
|---|---|
| **I. Pattern schema is a locked contract** | **PASS.** No `Pattern` field is touched. The locked-type change is to `TouchKeyIR` (a `KeyboardIR` type), it is purely additive, and §18 sign-off is **already recorded** in [docs/spec-signoff.md](../../docs/spec-signoff.md) (2026-08-03, ratified by the contract authority), so Article I's stop-and-escalate does not fire. The zod mirror and drift guard change in the same commit, as Article I requires. Contracts bumps 0.17.0 → 0.18.0. |
| **II. KeyboardIR is the engine spine** | **PASS with a declared exception, already sanctioned.** The touch-layout half of the overlay is a raw-JSON pass, not an IR round-trip — required by spec 035's R9 byte-preservation and the same shape as the existing steps 1.5/1.6. The `.kmn` half goes through parse → mutate → emit, never text munging. Opaque fragments are never bypassed: FR-027a downgrades synthesis to warn-and-confirm when `opaqueFragmentCount > 0` rather than writing blind. See Complexity Tracking. |
| **III. Single persistent working copy** | **PASS — and the plan *restores* the invariant.** One overlay in the existing store, projected by the one chain. R10.1 found that the touch preview is a second partial writer **today**; routing it through the shared projection with a live override removes it. R10.2's rule pass exists so the `.kmn` half is not written by a second mechanism either. |
| **IV. Validator layering is fixed; one 300 ms cycle** | **PASS.** Diagnostics are synchronous pure joins computed from the already-parsed working IR and layout, composed into the **single** aggregated findings surface — no second store field, no second timer, per that hook's own documented rule. No Layer C error is introduced: 0x05A routes to edit-time rejection for authored ids and to Layer A′ import-fidelity for imported ones, keeping every shipped Layer C check warning-or-hint. Enforced by SC-010's fake-timer spec. |
| **V. VirtualFS only during authoring** | **PASS.** All editing is in-memory; the overlay is applied at projection time; nothing writes host disk. |
| **VI. Team boundaries** | **PASS — Engine owns this change.** Engine surfaces only: SPA, appliers, validator, output projection. The Content surface is deliberately untouched — **no rows are added to `criteria.json`** (FR-043); new diagnostic codes land at check-module level, documented in the check file's own header, because `CriteriaBands.lintRuleId` is singular and 1:1. New user-facing strings are English-catalog entries under the existing i18n convention, not content records. |
| **VII. Out of scope for v1** | **PASS.** Desktop-first is preserved: the feature is entered only from the touch stage, after the physical lock, and deepens editing of a layout still derived from the locked desktop. No touch-first authoring and no reverse touch→physical derivation (FR-052); Decision 6 is not engaged. Rows, layers, platforms, flicks, and multitap authoring stay deferred to Increments 2/3. |
| **VIII. House conventions** | **PASS.** No emoji in console output; markdown links rather than backticks in user-facing text; no issue numbers in shipped code; `<prefix>(<area>): <description>` commit titles. One convention obligation to honour actively: any keyboard this feature cites that is not already in [docs/keyboard-index.md](../../docs/keyboard-index.md) gets its phonebook row in the same change. |

### Complexity Tracking

| Violation / added complexity | Why it is needed | Simpler alternative rejected |
|---|---|---|
| **Two appliers** (IR + raw-JSON) for one operation set — Article II tension | Spec 035 R9 forbids the import-adapt path from round-tripping through the IR, because that path must leave untouched keys and IR-unmodelled fields (e.g. `font`) intact. Case A needs the IR applier for structural sharing and node-id minting. | A single IR applier with a re-emit for Case B — loses R9 byte-preservation, which is a shipped guarantee. Mitigated by sharing the parser, resolver, and field semantics, and by the twin-equivalence test that fails the moment the two diverge. |
| **A second projection pass** for synthesized `.kmn` rules | R10.2: the working IR never reaches the artifact, so there is no existing path for a synthesized rule to travel. Without it, US2's rule-bearing option is a silent no-op — the FR-038 failure one layer deeper. | Writing rules to `store.ir` via `setWorkingIR` (what mark-guards does) — verified not to reach the artifact at all. |
| **Net-new ARIA grid** with no in-repo template | R10.4: no `role="grid"` exists anywhere in `packages/`; the "audited character-map grid" our a11y doc names is a flex-wrap of buttons. FR-020's composite widget is required by [docs/accessibility.md](../../docs/accessibility.md) rule 3 for a 2-D navigable surface. | Reusing `CharacterMapPane` as the pattern — it is not the pattern. Cost is bounded by copying two proven idioms (roving-tabindex fallback, selection-centred windowing) rather than inventing them. |

**No unjustified gate failure.** Every Article assesses PASS; the three rows above are added complexity with a stated cause, not constitutional violations.

---

## Phase 0 — Research

Complete. [research.md](research.md) carries R1–R9 from the specify pass (Developer's editor field-by-field, the `sp` enum defect, corpus calibration, the increment staging, and the step-flow placement) and **R10 from this plan**, which records the seven plan-phase decisions taken against the real code — each as finding / decision / rejected-alternative. R10.1, R10.2, R10.3, and R10.4 each *correct* a spec or contract assumption and are the reason the plan differs from a literal reading of the FRs.

No `NEEDS CLARIFICATION` remains. The one locked-type question was resolved in the specify pass and ratified in the sign-off ledger.

---

## Phase 1 — Design & contracts

Complete. [data-model.md](data-model.md) covers the ten entities: the reshaped `TouchKeyIR`, the join and its index, the reachability view, `TouchCoverageOptions`, the key edit overlay and its operations with their state transitions, the address parts, layer-family decomposition, the grid view model, the studio store/persistence reshape, and the diagnostics shape.

The three contract documents from the specify pass remain normative. This plan adds a fourth, [contracts/key-edit-overlay.md](contracts/key-edit-overlay.md), covering the surface the spec named but never specified: the overlay's ordered-log shape, the operation union and its three deliberate boundaries, the missing address parser, the one-resolver/two-appliers split and its equivalence test, both projection passes plus preview identity, persistence without a version bump, re-derivation resilience as a first-class replay outcome, and the mode selector's must-not-happen list.

**Identifier discipline.** Every identifier the spec or a contract pins — `T_*` / `U_` / `K_` id classes, the `sp` values `{0,1,2,8,9,10}`, the eight diagnostic codes, the `gen-touch-*` / `generated_touch_*` naming split, the reserved prefixes, the `touchKeyAddress` format — is copied exactly. Those strings *are* the contract; none is renamed, recased, or invented.

---

## Implementation sequencing

Dependency order, which is also the phase order. `/speckit.tasks` owns the task breakdown.

1. **Prerequisites** (no behaviour change): move `isPlusSeparator` into contracts and re-export it; lift `entryGroupOf` / `insertBeforeTerminalRules`; export `TOUCH_LAYER_PRECEDENCE_ORDER`; add `parseTouchKeyAddress`.
2. **The §18 contract change**, in one commit across all five sites, with the codec round-trip test.
3. **The join** — additive, zero behaviour change.
4. **The `isSpacerKeyClass` correction**, isolated, with the keys-per-row recount and the placeholder-promotion canary.
5. **US1** — coverage threaded through all four callers plus the U+25CC strip; the reachability view adopted only where §4.4 says; `useInventoryDiff`'s third array; the facet index regenerated and asserted byte-identical. **Ships independently, zero UI change.**
6. **The Layer C checks** with their exemption sets, calibrated *before* the tool can create new instances of what they detect.
7. **The overlay machinery** — operations, resolver, both appliers, the twin test, both projection passes, preview identity, store and persistence.
8. **Rule synthesis**, including the guard-store proposal and contiguous guard-then-producing emission.
9. **US2 → US3 → US4** on the grid, then **US5** as the consolidated diagnostics surface.
10. **Polish** — the a11y scan inside the grid, the no-new-timer spec, the mode-toggle suite, catalog extraction, and the `docs/accessibility.md` correction.

**Ordering constraint worth naming:** step 6 before step 7. The checks must be corpus-calibrated against layouts we did not create *before* the editor can mint new instances of the same defects, or the calibration is measuring our own output.
