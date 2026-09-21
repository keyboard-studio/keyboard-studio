# Tasks: Punctuation defaults and the invisible-character question

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md),
[contracts/punctuation-defaults-contract.md](contracts/punctuation-defaults-contract.md),
[research.md](research.md)
**Branch**: `075-punctuation-defaults` · **Size**: normal (full phased list)

Line format: `- [ ] **T###** [P?] [US#] Description · exact/file/path`. `[P]` marks a task
independent of the others in its wave (different file, no incomplete dependency). `[US#]`
maps a task to a user story. Identifiers (`data-testid`s, message ids, store fields,
function names) are exactly those adopted in the contract, so tests can be written against
them before the implementation lands. One commit per phase, pushed to the feature branch
as its gates go green; T004 is the one exception and gets its own commit.

Gates before each phase commit:

```
pnpm typecheck
pnpm --filter @keyboard-studio/engine test
pnpm --filter @keyboard-studio/studio test
pnpm --filter @keyboard-studio/studio messages:extract && pnpm run i18n-catalog-sort
npx tsx utilities/i18n-content-extract/cli.ts      # only when questions/b changes
pnpm lint
```

---

## Phase 1: Setup

Register the spec with the tooling that gates a new manifest step, and land the
pre-existing draft-restore defect as its own commit so every later story inherits a
working sticky snapshot.

**Wave 1 — independent (different files):**

- [x] **T001** [P] Seed `docs/spec-trace.json` with a `specs/075-punctuation-defaults` unit by running `node utilities/spec-trace seed`, then `node utilities/spec-trace check`; commit the regenerated file so `generateManifestSpecRef.test.ts` accepts the new `specRef` (plan concern: the manifest specRef test fails without this) · docs/spec-trace.json
- [x] **T002** [P] Write the failing round-trip test for the draft-restore gap: `saveDraft` with `rejected`, `provenance`, `proposalConfidence`, `exemplarMethodDeclined`, `declaredRoles` populated → clear stores → `loadDraft`/`applyEnvelopeToStores` → assert every sticky field equals what was saved (contract §3) · packages/studio/src/lib/draftPersistence.test.ts

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T003** [US4] Fix `applyEnvelopeToStores` to forward the full restored `phaseBDraft` snapshot (`rejected`, `provenance`, `proposalConfidence`, `exemplarMethodDeclined`, `declaredRoles`, plus the three fields already forwarded) instead of rebuilding it from `chars`/`exemplarDigraphs`/`selectedFont`; T002 goes green · packages/studio/src/lib/draftPersistence.ts
- [x] **T004** [US4] Commit T002+T003 on their own as `fix(studio): restore every sticky phase-B draft field on reload` — this is a pre-existing spec-044 defect, so it lands separately from the feature per the out-of-scope-unblocker rule; do not fold it into the Phase 2 or Phase 3 commit · (git, no file)

---

## Phase 2: Foundational

The pure engine helpers, the widened draft store, and the shared phase-C inventory
helper. Every story reads these; no story work starts before this phase is green.

### Tests (write first, must fail before implementation)

**Wave 1 — independent (different files):**

- [x] **T005** [P] Colocated unit tests for the engine proposal module, one `it` per contract §1 invariant: 32-member frozen `ASCII_PUNCTUATION_FLOOR` with the four FR-007 ranges; `cldrGroup ∩ baseGroup = ∅` by NFC; no member of either group in `rejected` or `authorChosen`; known-and-complete coverage ⇒ `baseGroup` is every produced punctuation char not in `cldrGroup`/`rejected`/`authorChosen` and `baseCoverageIncomplete === false`; `baseCoverage === null` or `!coverageComplete` ⇒ `baseGroup ⊆ ASCII_PUNCTUATION_FLOOR` and `baseCoverageIncomplete === true`; floor and known set never combined; `cldrAbsentReason` is `"no-exemplars"` for null exemplars, `"empty-tier"` for a non-null inventory with an empty `"punctuation"` tier, undefined otherwise · packages/engine/src/character-discovery/punctuationProposal.test.ts
- [x] **T006** [P] Store tests for the new sticky fields and actions (contract §2): `seedProposals` no-ops on a repeated `seedKey`, records the key in `seededProposals`, routes each char through `addWithProvenance` so a `rejected` char is vetoed and an `"author"` entry is never downgraded (FR-005, FR-022); `acceptInvisible`/`declineInvisible` write `invisibleDecisions["U+XXXX"]` and never touch `chars`; `adoptControlsAsInvisibles` moves every `\p{Cf}` char from `controls` into `invisibleDecisions` as `"accepted"`, removes it from `chars`, and is idempotent; both fields survive `reset()`, are cleared by `resetPhaseBDraftDecisions()`, and round-trip through `snapshotPhaseBDraft()`/`applyPhaseBDraftSnapshot()` · packages/studio/src/stores/phaseBDraftStore.test.ts
- [x] **T007** [P] Test for `phaseCConfirmedInventory()` (contract §4): returns the NFC-deduped union of the draft's `punctuation` slice and the chars of `"accepted"` `invisibleDecisions`; a `"declined"` decision contributes nothing; a char in both inputs appears once · packages/studio/src/survey/phaseCInventory.test.ts

### Implementation

**Wave 2 — independent (different files):**

- [x] **T008** [P] Export `hasUnaccountedOpaqueFragment(ir)` from the inventory-delta module (currently module-private) so the proposal builder derives `coverageComplete` the same way `computeInventoryDelta` does; no behaviour change · packages/engine/src/inventory/computeInventoryDelta.ts
- [x] **T009** [P] Widen `DraftProvenance` with `"base" | "ascii-floor"`; add sticky `seededProposals: string[]` and `invisibleDecisions: Record<string, "accepted" | "declined">`; implement `seedProposals(chars, source, seedKey)`, `acceptInvisible(notation)`, `declineInvisible(notation)`, `adoptControlsAsInvisibles()`; extend `PhaseBDraftSnapshot`, `snapshotPhaseBDraft`, `applyPhaseBDraftSnapshot`, `resetPhaseBDraftDecisions`, and the `reset()` "deliberately SURVIVE" comment; T006 goes green · packages/studio/src/stores/phaseBDraftStore.ts

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [x] **T010** [P] Create the pure, browser-safe proposal module: `ASCII_PUNCTUATION_FLOOR` (frozen, 32 chars), `BasePunctuationCoverage` + `basePunctuationCoverage(ir)` (= `producedGlyphs(ir)` filtered to `glyphCategory === "punctuation"`, NFC, `coverageComplete = !hasUnaccountedOpaqueFragment(ir)`), `CldrAbsentReason`, `PunctuationProposalInput`, `PunctuationProposal`, `buildPunctuationProposal(input)` with the one-way floor rule; T005 goes green · packages/engine/src/character-discovery/punctuationProposal.ts
- [x] **T011** [P] Create `phaseCConfirmedInventory()` reading `usePhaseBDraftStore.getState()` (punctuation slice + accepted invisibles, `nfcDedup`); T007 goes green · packages/studio/src/survey/phaseCInventory.ts
- [x] **T012** [P] Forward the two new sticky fields (`seededProposals`, `invisibleDecisions`) through `applyEnvelopeToStores` on top of the T003 fix, and extend the T002 round-trip test to assert them · packages/studio/src/lib/draftPersistence.ts

**⟶ Wait for Wave 3 to finish, then:**

- [x] **T013** Add the barrel exports for `punctuationProposal.ts` (`ASCII_PUNCTUATION_FLOOR`, `basePunctuationCoverage`, `buildPunctuationProposal`, the four types) and `hasUnaccountedOpaqueFragment`; retire the "computeInventoryDelta is intentionally unwired" note since Story 2 wires its first production caller · packages/engine/src/index.ts
- [x] **T014** Rebuild the engine (`pnpm --filter @keyboard-studio/engine build`) so the studio typechecks against the new dist `.d.ts`, then run the Phase 2 gates and commit `feat(engine): punctuation proposal builder, ASCII floor, draft-store seeding and invisible decisions` · (gate, no file)

**Checkpoint**: engine and store surface complete; every later phase only consumes it.

---

## Phase 3: User Story 1 — CLDR punctuation arrives already chosen (Priority: P1) 🎯 MVP

**Goal**: On first arrival at the punctuation step the resolved locale's CLDR/SLDR
punctuation tier is already in the chosen list with proposed attribution naming the
source; Done with zero clicks yields that set; author-typed chars are never touched.

**Independent Test**: render `PunctuationStep` with a mocked `useSourcedExemplars`
returning a non-empty punctuation tier; press Done without interaction; the phase-C
`confirmedInventory` equals the tier. Repeat with `inventory === null` and with an empty
tier and assert the two distinct absent messages.

### Tests (write first, must fail before implementation)

**Wave 1 — independent (different files):**

- [x] **T015** [P] [US1] Extend the step test: (a) FR-024 pin — the result reports `phase: "C"` and `recordPhase` of punctuation then characters leaves the alphabet inventory intact; (b) FR-001/FR-003/SC-002 — mocked tier seeds the chosen list on settle, every seeded chip renders as `proposed-punctuation-chip` inside `data-testid="cldr-punctuation-group"`, Done with no clicks confirms the whole tier; (c) FR-002 — the group caption names `inventory.source` and the resolved locale display name; (d) FR-005 — an `"author"` char present before seeding is unchanged after; (e) `inventory === null` renders `survey.punctuation.cldrAbsent.noExemplars`, non-null with empty tier renders `survey.punctuation.cldrAbsent.emptyTier`; (f) FR-023 — with a phase-C `confirmedInventory` already recorded, nothing is seeded and the seed key is still recorded · packages/studio/src/survey/punctuation/PunctuationStep.test.tsx
- [x] **T016** [P] [US1] SC-001 oracle in the engine test: for every locale in the committed offline exemplar index whose `p` tier is non-empty, `buildPunctuationProposal({ exemplars: sourceExemplars(tag), baseCoverage: null, rejected: ∅, authorChosen: ∅ }).cldrGroup` equals `charactersInTier(inv, "punctuation")` NFC-deduped — the whole set, not a sample · packages/engine/src/character-discovery/punctuationProposal.test.ts

### Implementation

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T017** [US1] Seed on arrival: in an effect that fires when `useSourcedExemplars` settles non-null, call `seedProposals(tier, inventory.source, "punctuation:" + inventory.resolvedTag)` unless a phase-C `confirmedInventory` already exists (FR-023 guard, still records the key); render the CLDR group container `data-testid="cldr-punctuation-group"` with a caption naming source and locale; render `survey.punctuation.cldrAbsent.noExemplars` / `.emptyTier` for the two absent states; emit `{ phase: "C", answers, confirmedInventory: phaseCConfirmedInventory() }`; keep existing chip test ids and the click-to-remove gesture (FR-004) unchanged; T015 goes green · packages/studio/src/survey/punctuation/PunctuationStep.tsx

**⟶ Wait for T017, then:**

- [x] **T018** [US1] Run `pnpm --filter @keyboard-studio/studio messages:extract && pnpm run i18n-catalog-sort` so the new `survey.punctuation.*` ids land in both catalogs; run the Phase 3 gates; commit `feat(studio): seed CLDR punctuation as proposed defaults (spec 075 T015-T018)` · packages/studio/src/locales/en/messages.json, packages/studio/src/locales/fr/messages.json

**Checkpoint**: Story 1 is independently demoable — a locale with exemplar data opens the
punctuation step already populated and Done confirms it with zero clicks.

---

## Phase 4: User Story 2 — Base-keyboard punctuation is declared, not assumed (Priority: P2)

**Goal**: Punctuation the base keyboard already produces is offered as a second proposed
group, distinct from the CLDR group, every produced char when coverage is known, the
32-char ASCII floor only when it is not; the missing-side delta count is visible before
Done; the family default is stated in the spec.

**Independent Test**: render the step with a working-copy IR whose produced punctuation is
known and complete; assert `base-punctuation-group` lists exactly `produced − cldrGroup`
with no overlap and the inventory count equals the union size. Swap in an IR with an
opaque fragment; assert the floor is shown under the incomplete caption.

### Tests (write first, must fail before implementation)

- [x] **T019** [US2] Extend the step test: (a) FR-006/FR-009 — with a complete base coverage the chips inside `data-testid="base-punctuation-group"` are every produced punctuation char not in the CLDR group, under `survey.punctuation.baseGroup.caption`; (b) FR-007/FR-008 — with `coverageComplete === false` the group is a subset of `ASCII_PUNCTUATION_FLOOR` under `survey.punctuation.baseGroup.incompleteCaption`, and the two are never combined; (c) SC-003/FR-010 — the two rendered groups are disjoint and the inventory count equals the size of their union, with a char in both sources rendered once under the CLDR group and annotated "also produced by the base"; (d) FR-011 — `data-testid="punctuation-missing-count"` shows `computeInventoryDelta(chosen, ir).missing.length` via the `survey.punctuation.missingCount` ICU plural; (e) the always-keep note `survey.punctuation.baseGroup.carveNote` is present in the base caption · packages/studio/src/survey/punctuation/PunctuationStep.test.tsx

### Implementation

**⟶ Wait for T019, then:**

- [x] **T020** [US2] Read `useWorkingCopyStore((s) => s.ir)` as `ConvenienceCharsStep` does; compute `basePunctuationCoverage(ir)` and `buildPunctuationProposal({ exemplars, baseCoverage, rejected, authorChosen })`; seed the base group with `seedProposals(baseGroup, coverageComplete ? "base" : "ascii-floor", "punctuation-base:" + baseKey)` under the same FR-023 guard; render `base-punctuation-group` with `caption` / `incompleteCaption` / `carveNote`; derive the "also produced by the base" annotation at render from the proposal groups (provenance stays single-valued); render `punctuation-missing-count` from `computeInventoryDelta(chosen, ir)` — the function's first production caller; T019 goes green · packages/studio/src/survey/punctuation/PunctuationStep.tsx

**⟶ Wait for T020, then:**

**Wave 3 — independent (different files):**

- [x] **T021** [P] [US2] Mirror the FR-012 family-default statement into the spec's Assumptions → Decisions taken as five numbered items (base punctuation proposed-for-acceptance; base letters/marks proposed-for-removal via convenience, unchanged; base ASCII letters on non-Latin target optional group, unchanged; ASCII punctuation by fall-through treated as item 1; digits/symbols shielded, out of scope) plus the always-keep disagreement edge case as surfaced-not-resolved · specs/075-punctuation-defaults/spec.md
- [x] **T022** [P] [US2] Retire the "punctuation needs no question" premise in the module header comment and cross-reference `punctuationProposal.ts` as the punctuation sibling · packages/engine/src/character-discovery/convenienceChars.ts
- [x] **T023** [P] [US2] Re-extract catalogs for the new base-group and missing-count ids (`messages:extract` + `i18n-catalog-sort`); run the Phase 4 gates; commit `feat(studio): propose base-produced punctuation with ASCII floor fallback (spec 075 T019-T023)` · packages/studio/src/locales/en/messages.json, packages/studio/src/locales/fr/messages.json

**Checkpoint**: Story 2 is independently demoable — a base with known coverage shows its
punctuation as a second removable group; a base with opaque fragments shows the floor and
says the base set is not fully known.

---

## Phase 5: User Story 3 — Invisible characters get a named question (Priority: P3)

**Goal**: A new always-rendering `invisibles` spine step between `punctuation` and
`convenience` offers ZWJ, ZWNJ, ZWSP, SOFT HYPHEN, WORD JOINER and the bidi allowlist by
name with a need statement each; accepted chars reach the phase-C inventory; the
punctuation page's two Cf entry routes hand off to it; existing code-point Cf entries are
carried over; the RTL direction-marks pair is retired.

**Independent Test**: walk copy-edit through punctuation → invisibles → convenience;
toggle U+200C on; assert the phase-C `confirmedInventory` contains ZWNJ and the recorded
answers carry `invisibles.u200c: true` alongside `false` for each unselected candidate.
Type ZWJ into the punctuation box and assert the hand-off note names the invisibles step
and `invisibleDecisions["U+200D"] === "accepted"`.

### Tests (write first, must fail before implementation)

**Wave 1 — independent (different files):**

- [x] **T024** [P] [US3] SC-005 completeness test: for `direction` in `rtl`/`ltr`/`unknown` and an empty `carriedOver`, every candidate has a non-empty `label` (from `invisibleCharLabel`), a `notation` matching `/^U\+[0-9A-F]{4,6}$/`, and a `needStatementId` of the form `survey.invisibles.need.uXXXX` that resolves to a non-empty catalog string; the fixed five are always present; `rtl` yields every `isBidiControlCodePoint` code point with `relevance: "rtl"`; a Cf char in `carriedOver` appears once with `relevance: "carried-over"` · packages/studio/src/survey/invisibles/invisibleCandidates.test.ts
- [x] **T025** [P] [US3] Step test: (a) FR-020 — renders `data-testid="invisibles-step"` with `invisibles-heading`, `invisibles-continue`, `invisibles-back` even when no candidate is relevant, showing `survey.invisibles.noneNeeded`; never returns null; (b) each `invisible-candidate-<hex>` has `role="checkbox"` and `aria-checked` bound to `invisibleDecisions`; toggling calls `acceptInvisible`/`declineInvisible`; (c) FR-014 — accepted chars reach `phaseCConfirmedInventory()` and are absent from `chars`/`controls`; (d) FR-018 — the result's `answers` carries one `boolean` per offered candidate with `questionId` `invisibles.uXXXX`, so a declined offer is `false`, distinguishable from unasked; (e) FR-017 — a `\p{Cf}` char pre-loaded into the draft's `controls` bucket is offered once, pre-selected, and removed from `chars` after first render; (f) `direction !== "rtl"` renders the bidi set collapsed under `survey.invisibles.bidiGroup.collapsedNote` · packages/studio/src/survey/invisibles/InvisiblesStep.test.tsx
- [x] **T026** [P] [US3] FR-024 union pin (contract §4): record punctuation, then invisibles, then punctuation again; after each, the phase-C `confirmedInventory` equals `punctuation ∪ acceptedInvisibles` and the phase-B result is unchanged · packages/studio/src/survey/phaseCInventory.test.ts
- [x] **T027** [P] [US3] Extend the step test for FR-016/FR-021 hand-off: typing a single `\p{Cf}` char into the punctuation type-in box records `invisibleDecisions[notation] === "accepted"`, does not add it to `chars`, and shows `data-testid="punctuation-handoff-note"` with `role="status"` (`survey.punctuation.handoffNote`); a multi-codepoint cluster containing a Cf char is neither split nor filed and is declined with `survey.punctuation.declinedCluster` · packages/studio/src/survey/punctuation/PunctuationStep.test.tsx
- [x] **T028** [P] [US3] Label helper test: `invisibleCharLabel("⁠") === "WORD JOINER"`; the existing labels are unchanged · packages/studio/src/lib/irToCarveNodes.test.ts (create beside the module if absent)

### Implementation

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T029** [P] [US3] Add `U+2060 WORD JOINER` to `INVISIBLE_CHAR_LABELS` and cross-reference `punctuationProposal.ts` from the `isAlwaysKeepCategory` docstring (FR-015); T028 goes green · packages/studio/src/lib/irToCarveNodes.ts
- [x] **T030** [P] [US3] Create the pure candidate builder `invisibleCandidatesFor({ direction, carriedOver })` returning `InvisibleCharacterCandidate[]` (`codePoint`, `notation`, `label` via `invisibleCharLabel`, `needStatementId`, `relevance`): fixed five always; every `isBidiControlCodePoint` code point; carried-over Cf chars once each; T024 goes green · packages/studio/src/survey/invisibles/invisibleCandidates.ts
- [x] **T031** [P] [US3] Add `"invisibles"` to the `ActiveStepId` union · packages/studio/src/stores/surveySessionStore.ts
- [x] **T032** [P] [US3] Add `"invisibles"` to the step-id union and `case "invisibles": return { next: nextSpineStepAfter("invisibles") }`; do not add it to `STEPS_WITH_APPLY_COMPLETION`; update `advance.test.ts` pins · packages/studio/src/steps/advance.ts, packages/studio/src/steps/advance.test.ts
- [x] **T033** [P] [US3] Make phase-C `stepIds` `["characters", "marks", "punctuation", "invisibles", "convenience"]`; update `phases.test.ts` · packages/studio/src/steps/phases.ts, packages/studio/src/steps/phases.test.ts
- [x] **T034** [P] [US3] Add `footer.stage.invisibles` and `trail.stage.name.invisibles` stage labels for the new step · packages/studio/src/decisions/progressDots.ts, packages/studio/src/decisions/DecisionTrailView.tsx

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T035** [US3] Create the step component: `InvisiblesStep` reads `direction` from the author's Phase B branch answer (`"unknown"` when unanswered), collects carried-over Cf chars from the draft's `controls` bucket, calls `adoptControlsAsInvisibles()` on first render (FR-017), renders heading/intro/none-needed (`survey.invisibles.heading`, `.intro`, `.noneNeeded`), one `invisible-candidate-<hex>` `role="checkbox"` per candidate with label, `U+XXXX`, and `<Trans id="survey.invisibles.need.uXXXX">` need statement, the bidi group collapsed under `survey.invisibles.bidiGroup.collapsedNote` when not RTL; `invisibles-continue` emits `{ phase: "C", answers, confirmedInventory: phaseCConfirmedInventory() }` with one boolean per candidate; always renders; follows the accessibility house rules in docs/accessibility.md; T025 and T026 go green · packages/studio/src/survey/invisibles/InvisiblesStep.tsx

**⟶ Wait for T035, then:**

**Wave 4 — independent (different files):**

- [x] **T036** [P] [US3] Insert the manifest entry `{ kind: "editor-step", id: "invisibles", title: "Invisible characters", spine: true, inputs: [], writes: [], component: InvisiblesStep, specRef: ["specs/075-punctuation-defaults"] }` between `punctuation` and `convenience`; add `"invisibles"` to `expectedSpine` after `"punctuation"`; update the header prose; regenerate `manifest.specref.json` via `pnpm --filter @keyboard-studio/studio test`; update `manifest.test.ts` spine pins · packages/studio/src/steps/manifest.ts, packages/studio/src/steps/manifest.specref.json, packages/studio/src/steps/manifest.test.ts
- [x] **T037** [P] [US3] Punctuation page hand-off (FR-016): test each harvested type-in char with `/^\p{Cf}$/u`; on match call `acceptInvisible(notation)` and show `punctuation-handoff-note` (`role="status"`, `survey.punctuation.handoffNote`) naming the invisibles step, with no navigation; decline a Cf-containing cluster with `survey.punctuation.declinedCluster`; T027 goes green · packages/studio/src/survey/punctuation/PunctuationStep.tsx
- [x] **T038** [P] [US3] Punctuation-scope code-point field hand-off (FR-021): apply the same `/^\p{Cf}$/u` rule in the pane's "Add any character by code point" path, calling `acceptInvisible` instead of filing into `controls`, and announce through the pane's existing live region; alphabet scope unchanged · packages/studio/src/survey/CharacterMapPane.tsx
- [x] **T039** [P] [US3] Add the `"invisibles"` replay case to the marks/punctuation/convenience case group · packages/studio/src/survey/journey-runner.ts
- [x] **T040** [P] [US3] Fix the stale spine-order comment to include `invisibles` · packages/studio/src/StudioShell.tsx

**⟶ Wait for Wave 4 to finish, then:**

**Wave 5 — independent (different files):**

- [x] **T041** [P] [US3] Add `InvisiblesStep` to the `renderSmoke` stub map, add the `StepAction` for `invisibles` to the golden-walk runner, and regenerate both golden-walk fixtures so the spine sequence includes the new step · packages/studio/tests/steps/stepHost.renderSmoke.test.tsx, packages/studio/tests/steps/stepHost.goldenWalk.test.tsx, packages/studio/tests/steps/__fixtures__/goldenWalk/copy.json, packages/studio/tests/steps/__fixtures__/goldenWalk/adapt.json
- [x] **T042** [P] [US3] Add `driveInvisiblesStep(page)` waiting on `invisibles-continue` (plain wait, no race) and call it from `buildOneCharacterList` between `drivePunctuationStep` and `driveConvenienceStep` · packages/studio/e2e/helpers/surveyFlow.ts
- [x] **T043** [P] [US3] Regenerate `docs/journey-coverage.json` through its report test (`totalSteps` 14 → 15) · docs/journey-coverage.json, packages/studio/src/dashboard/journeyCoverage.report.test.ts

**⟶ Wait for Wave 5 to finish, then:**

**Wave 6 — independent (different files):**

- [x] **T044** [P] [US3] Extend the back-walk heading chain with the invisibles heading between punctuation and convenience · packages/studio/e2e/copy-edit.spec.ts
- [x] **T045** [P] [US3] Drive the invisibles step and add its axe assertion · packages/studio/e2e/light-theme-a11y.spec.ts

**⟶ Wait for Wave 6 to finish, then — FR-019 RTL subsumption:**

**Wave 7 — independent (different files):**

- [x] **T046** [P] [US3] Delete the subsumed question module and its test · packages/studio/src/survey/questions/b/pb_rtl_direction_marks.ts, packages/studio/tests/survey/questions/b/pb_rtl_direction_marks.test.ts
- [x] **T047** [P] [US3] Delete the subsumed detail module and its test · packages/studio/src/survey/questions/b/pb_rtl_direction_marks_detail.ts, packages/studio/tests/survey/questions/b/pb_rtl_direction_marks_detail.test.ts
- [x] **T048** [P] [US3] Rewire `next` from `pb_rtl_direction_marks` to `pb_rtl_special_letters` · packages/studio/src/survey/questions/b/pb_rtl_short_vowels.ts
- [x] **T049** [P] [US3] Remove the two retired ids from the modular flow YAML and the direction facet's question references · content/flows/phase_b_characters.modular.yaml, content/facets/orth/direction.yaml

**⟶ Wait for Wave 7 to finish, then:**

- [x] **T050** [US3] Drop the two `registry.b.ts` entries; lower the registry count assertion 114 → 112; re-extract Tier B catalogs with `npx tsx utilities/i18n-content-extract/cli.ts`; regenerate the step-graph snapshot (`pnpm --filter @keyboard-studio/studio test -- -u` scoped to `buildStepGraph.test.ts`); confirm `pnpm run test:i18n-utilities` passes · packages/studio/src/survey/questions/registry.b.ts, packages/studio/src/survey/questions/registry.test.ts, content/i18n/en/flowQuestions.json, content/i18n/fr/flowQuestions.json, packages/studio/src/dashboard/__snapshots__/buildStepGraph.test.ts.snap

**⟶ Wait for T050, then:**

- [x] **T051** [US3] Run `messages:extract` + `i18n-catalog-sort` for every `survey.invisibles.*`, `footer.stage.invisibles`, `trail.stage.name.invisibles`, `survey.punctuation.handoffNote`, `survey.punctuation.declinedCluster` id; run the Phase 5 gates including the Playwright suite; commit `feat(studio): invisible-characters spine step, Cf hand-off, RTL direction-marks subsumed (spec 075 T024-T051)` · packages/studio/src/locales/en/messages.json, packages/studio/src/locales/fr/messages.json

**Checkpoint**: Story 3 is independently demoable — every author reaches a named
invisible-characters step after punctuation, format characters typed on the punctuation
page are handed off with a visible note, and an RTL author is asked about a direction mark
exactly once.

---

## Phase 6: User Story 4 — A rejection sticks (Priority: P4)

**Goal**: A proposed character the author removed is not re-proposed on step revisit, on
locale re-resolution, or after a page reload; typing it by hand overrides the rejection.

**Independent Test**: seed the tier, remove N chips, leave the step and return; the chosen
list is the tier minus N. Change the resolved tag and return; still minus N. Save, clear
stores, load; still minus N. Type one removed char by hand; it returns as `"author"`.

### Tests (write first, must fail before implementation)

**Wave 1 — independent (different files):**

- [x] **T052** [P] [US4] SC-006 in the step test: remove N seeded chips, unmount, remount → chosen list is `tier − N` with no re-proposal; change the mocked `resolvedTag` so a new seed key fires → the N remain absent; typing a removed char restores it with `"author"` provenance (FR-022) · packages/studio/src/survey/punctuation/PunctuationStep.test.tsx
- [x] **T053** [P] [US4] SC-006 reload leg in the persistence test: seed, remove N, `saveDraft`, clear stores, `loadDraft`, re-seed with the same key → chosen list is `tier − N` and `rejected` still lists the N · packages/studio/src/lib/draftPersistence.test.ts

### Implementation

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T054** [US4] Confirm both tests pass against the T003/T009/T017 work with no further code change (the ledger already exists in `rejected[]` and `seedProposals` routes through `addWithProvenance`); if either fails, fix in the store rather than in the step; add the unbounded-growth note to the `rejected` field comment (keyed NFC set, inert entries cost bytes only, no pruning); run the Phase 6 gates; commit `test(studio): pin rejection round trips across revisit, re-resolution and reload (spec 075 T052-T054)` · packages/studio/src/stores/phaseBDraftStore.ts

**Checkpoint**: Story 4 is independently verifiable — all three round trips hold.

---

## Phase 7: Polish and cross-cutting validation

**Wave 1 — independent (different files):**

- [x] **T055** [P] SC-004/SC-009 observability harness (contract §9): drive each of U+200D, U+200C, U+200B, U+00AD, U+2060 and every `isBidiControlCodePoint` code point through (a) the punctuation type-in box, (b) the punctuation-scope code-point field, (c) the invisibles toggle; assert for each that exactly one holds — in `phaseCConfirmedInventory()`, or `invisibleDecisions[notation] === "accepted"` with the hand-off note visible, or a `role="status"`/`role="alert"` element names it with a reason — and that a char satisfying none fails; include the carry-over leg for a saved answer holding a code-point Cf on either scope · packages/studio/src/survey/surveyWriteObservability.test.tsx
- [x] **T056** [P] SC-007 test: for the copy-edit fixture, difference the emitted `.kmn` punctuation set (via `producedGlyphs` on the output IR) against the phase-C confirmed punctuation inventory and assert the difference is empty; where carve's always-keep re-admits a declined char, the test names it so the deferred carve-side concern stays visible · packages/studio/src/survey/punctuation/PunctuationStep.test.tsx (or a new `punctuationOutputParity.test.ts` beside it if the fixture wiring is heavy)
- [x] **T057** [P] SC-008 measurement: a report-only vitest over `content/journeys/*.yaml` that replays each journey through `journey-runner.ts` and prints `[OK] empty-punctuation-inventory rate: N/M` without asserting a threshold; record the measured rate in the spec's SC-008 line as the baseline · packages/studio/src/survey/journeyPunctuationRate.report.test.ts, specs/075-punctuation-defaults/spec.md
- [x] **T058** [P] Mirror the plan's FR-020/spec-066 resolution into the spec: replace the "Whether this step starts declaring writes" open decision with the taken decision (both steps `inputs: []`, `writes: []`; confirming an inventory is a survey result, not an IR write) · specs/075-punctuation-defaults/spec.md
- [x] **T059** [P] Add the two new spine steps' ids and the retired RTL pair to `docs/architecture.md` where the phase-B spine is composed, and note the punctuation step now seeds proposals; acknowledge the resulting spec-trace drift with `node utilities/spec-trace acknowledge` · docs/architecture.md, docs/spec-trace.json

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T060** Full-gate run: `pnpm typecheck`, `pnpm -r test`, `pnpm lint`, `pnpm run test:i18n-utilities`, `pnpm crew-lint` (unchanged crew files, sanity only), Playwright `copy-edit.spec.ts` + `light-theme-a11y.spec.ts`; walk every SC-001–SC-009 line and every FR-001–FR-025 line against the shipped diff; commit `docs(spec): 075 polish — observability harness, SC-007/SC-008 measurements, decisions mirrored (spec 075 T055-T060)` and push the branch with `git push -u origin 075-punctuation-defaults` · (gate, no file)

---

## Dependencies & Execution Order

**Phase order**: Setup (T001–T004) → Foundational (T005–T014) → US1 (T015–T018) → US2
(T019–T023) → US3 (T024–T051) → US4 (T052–T054) → Polish (T055–T060). US2 depends on US1
only through the shared `PunctuationStep.tsx` file; US3 depends on US1/US2 for the
hand-off tests to target a seeded page; US4 verifies behaviour the earlier phases already
built.

**Per-phase waves**

- **Setup**: Wave 1 (T001 ‖ T002) → T003 → T004 (own commit).
- **Foundational**: Wave 1 tests (T005 ‖ T006 ‖ T007) → Wave 2 (T008 ‖ T009) → Wave 3
  (T010 ‖ T011 ‖ T012) → T013 → T014 (engine rebuild + commit).
- **US1**: Wave 1 tests (T015 ‖ T016) → T017 → T018 (catalogs + commit).
- **US2**: T019 → T020 → Wave 3 (T021 ‖ T022 ‖ T023, T023 commits).
- **US3**: Wave 1 tests (T024–T028) → Wave 2 (T029–T034) → T035 → Wave 4 (T036–T040) →
  Wave 5 (T041–T043) → Wave 6 (T044 ‖ T045) → Wave 7 (T046–T049) → T050 → T051 (catalogs
  + commit).
- **US4**: Wave 1 tests (T052 ‖ T053) → T054 (commit).
- **Polish**: Wave 1 (T055–T059) → T060 (full gates, commit, push).

**Same-file sequencing to respect**: `PunctuationStep.tsx` is edited by T017, T020, T037
in that order and never in the same wave; `PunctuationStep.test.tsx` by T015, T019, T027,
T052, T056 likewise; `draftPersistence.ts` by T003 then T012; `spec.md` by T021, T057,
T058 (T057/T058 touch different sections but land in one Polish wave only because they are
prose; serialise them if the same agent is not doing both).

**Parallel opportunities**: the largest fan-out is US3 Wave 2 (six files, six workers) and
Wave 4 (five files). Engine and studio test-first waves (T005–T007, T015–T016, T024–T028)
can each be written by separate workers before any implementation exists, since every
identifier is fixed in the contract.

**Generated artefacts that must be committed with the phase that changes them**:
`docs/spec-trace.json` (T001, T059), `manifest.specref.json` (T036),
`docs/journey-coverage.json` (T043), `locales/{en,fr}/messages.json` (T018, T023, T051),
`goldenWalk/{copy,adapt}.json` (T041), `content/i18n/{en,fr}/flowQuestions.json` and
`buildStepGraph.test.ts.snap` (T050).
