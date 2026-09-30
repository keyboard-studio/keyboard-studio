# Spec 062 Canonical context tolerance: as built

**Status:** Retired 2026-09-29. Shipped in PR #1650 (squash `2b02574b`, 2026-08-27; spec docs in #1622). Tasks: 25/25 complete. Studio wiring was deliberately deferred and later landed under spec 078.
**Full docs:** [specs/_archive/062-canonical-context-tolerance/](../_archive/062-canonical-context-tolerance/) (spec, plan, tasks, research, data-model, contracts). Not read by default.
**Pinned here:** none. `utilities/nfd-tolerance-corpus/README.md:4` links the folder (which stays); `docs/design-notes/keyman-normalization-campaign.md` and `mark-composition-model.md` link the archived `spec.md` and `research.md` as rationale, not as a format reference.

## What shipped

- A keyboard's rules are analysed for whether they behave the same when the preceding text is NFC (precomposed) versus NFD (decomposed), by simulating both.
- A Layer C lint check reports rules that are not tolerant and rules that could not be analysed.
- A generator proposes context variants (extra rules or store members) that make gap rules tolerant, as a preview the author accepts per rule.
- A write-back policy axis (`echo` or `own-form`) chooses what the keyboard emits after a tolerant match.
- The simulator can start from a seeded text and caret.

## Public contracts

- `packages/contracts/src/simulation.ts`: `SimulatorContextSeed { text?, caretPos?, pendingDeadkeys? }`; `simulate(compiled, keys, initialContext?)` in `packages/engine/src/simulator/index.ts`. Omitting the third argument keeps the old empty-buffer behaviour.
- `packages/contracts/src/toleranceReport.ts`: `ToleranceStatus` (`tolerant | made-tolerant | not-analysed`), `RuleToleranceFinding { ruleId, location, status, failingKeystrokes?, precomposedOutput?, decomposedOutput?, notAnalysedReason? }`, `ToleranceReport { findings, notAnalysedCount }`, and `ContextVariant` (also defined here).
- Producer: `packages/engine/src/validator/context-tolerance.ts` `async computeContextTolerance(ir): Promise<ToleranceReport>`; also `classifyToleranceFinding`. Engine-only.
- Layer C: `packages/keyboard-lint/src/checks/check-19-x-context-tolerance.ts` `checkContextTolerance(ir, toleranceReport | undefined)`; codes `KM_WARN_CONTEXT_NOT_TOLERANT` (warning) and `KM_HINT_CONTEXT_NOT_ANALYSED` (hint). No-ops when the report is absent, per the `lintWithContext()` gating pattern.
- Generator: `packages/engine/src/pattern-apply/context-variants.ts` `async proposeContextVariants(ir, report): Promise<ContextVariantsResult>` (`ir`, `variants`, `disclosures`, `notes?`).
- Commit path: `packages/engine/src/facet-transform/migrations/context-tolerance.ts` `createContextToleranceMigrationRule`, reusing the existing `applyFacetTransform` gate.
- Policy: `DiscoveryAxisVector.contextToleranceWriteBack?: "echo" | "own-form"` (`packages/contracts/src/axes.ts:154`), default `echo`; persisted by the generic working-copy snapshot.
- Studio consumer now exists: `packages/studio/src/lib/contextToleranceAnalysis.ts`.

## Key decisions

- Canonical ordering and decomposability use `String.prototype.normalize`, no combining-class table.
- Simulator seeding is an additive third parameter, not a new entry point.
- The report is computed in-engine and passed to Layer C as precomputed data; Layer C never simulates.
- Store-pairing safety reuses `analyzeStores`; generation follows the idempotent `mark-guards.ts` pattern (strip prior generated output, then regenerate).
- Propose, preview, confirm rides the facet-transform seam; partial acceptance is per rule (`siteId` = rule id).
- `nfcPostureOfInventory` reused as is; its siblings were not consolidated.

## Gotchas and limits

- Rules with opaque constructs or unresolved store pairing are `not-analysed`, never reported tolerant.
- Mnemonic-layout backspace-unwrap does not fire through the KeymanWeb-model simulator (`setMnemonicCode` root cause).
- Backspace-unwrap drops the canonically-last mark, not the most recently typed one; wrong for a base carrying marks of two combining classes.
- Codec gap: a multi-codepoint `char` store item loses its boundary on emit (`codec/emit.ts` `emitStoreItems`).
- FR-012's Unicode-name half is unmet: findings name characters by codepoint only (`check-19-x-context-tolerance.ts`, "KNOWN GAP" comment).

## Divergences from the spec

- Contract said `proposeContextVariants(...): TransformProposal<ContextVariant>` (sync). Code is `async` and returns `ContextVariantsResult` (`context-variants.ts:288`); `ContextVariant` lives in `toleranceReport.ts`, not the generator. The contract doc itself anticipated the `TransformProposal` mismatch (not generic).
- `computeContextTolerance` is async.

## Follow-ups and open issues

- Follow-ups listed above (mnemonic unwrap, mark order, codec store-item gap, Unicode names) are unfiled in code; spec 078 owns the studio wiring.
- Stale links to fix (km-doc): `docs/design-notes/keyman-normalization-campaign.md:10,16,254`, `docs/design-notes/mark-composition-model.md:118`. Code comments `packages/contracts/src/toleranceReport.ts:1` and `engine/src/pattern-apply/mark-decomposition.ts:7` cite the archived spec.md and research.md.
