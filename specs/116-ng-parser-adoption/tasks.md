# Tasks: Adopt the Keyman next-generation KMN parser, and type the IR as a multi-format hub

**Input**: Design documents from `specs/116-ng-parser-adoption/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required. The spec mandates:
- an equivalence test for the accessors (FR-038);
- a side-by-side comparison of the old and new readers (FR-030);
- round-trip fixtures for the new IR members (FR-022);
- a completeness check for the capability table (FR-028);
- a reader timing budget (plan).

**Organization**: one phase per user story. **Execution order follows the plan's dependencies, not
story priority.** US5, the accessors, is P2 but runs first, because it is independent and shrinks every
later phase. After that come US1, then US2 (P1), then US3 and US4 (P2). Each phase ends with a commit
and push to `116-ng-parser-adoption` once its gate is green (the CLAUDE.md cadence).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task).
- **[Story]**: US1–US5, from spec.md.
- Paths are repo-relative. `contracts/X.md` means `specs/116-ng-parser-adoption/contracts/X.md`.

## Standing rules for every task

- Never run bare `vitest` at the repo root. Use `pnpm --filter <pkg> exec vitest run …`. Corpus suites
  use `--config vitest.corpus.config.ts` and need `../keyboards`.
- No issue numbers in shipped code or comments (Art VIII). Console output uses `[OK]`/`[WARN]`/`[ERROR]`.
- Run `pnpm build` before judging studio typecheck. Stale engine `dist/` produces phantom errors.
- A phase whose gate is not green is not committed as done. Commit what is done, leave the failing
  task unchecked, and put the diagnosis in the commit message.

---

## Phase 1: Setup

**Purpose**: baseline numbers every later gate compares against.

- [x] T001 Run `pnpm install && pnpm build`, then `pnpm -r test` and the engine corpus suite (`pnpm --filter @keyboard-studio/engine exec vitest run --config vitest.corpus.config.ts`). Record the pass counts and the `../keyboards` commit (`git -C ../keyboards rev-parse HEAD`) in `specs/116-ng-parser-adoption/evidence/baseline.md`. Create the `evidence/` directory.
- [x] T002 Write a corpus timing helper in `packages/engine/src/codec/reader-timing.ts`. It reads every `.kmn` under `../keyboards` (`release/` and `experimental/`, skipping `node_modules`/`build`), times a given `(text, id) => unknown` function per file, and returns `{ totalMs, slowest: {file, ms}, perFile }`. Add a corpus test `packages/engine/src/codec/reader-timing.corpus.test.ts` that records the **current** `parse()` baseline into `evidence/baseline.md`. It makes no assertion yet; T031 and T040 add the budget assertions.

---

## Phase 2: Foundational

There is no cross-story blocking work beyond Setup. Each story phase is self-contained, in the order
given above.

---

## Phase 3: User Story 5 - Rule-shape accessors (Priority: P2, executed first)

**Goal**: every consumer reads and builds a rule's parts through one shared API, with one keystroke
splitter, an offset accessor that matches kmcmplib, and a lint guard (FR-032 to FR-038).

**Independent Test**: the equivalence corpus test passes. `pnpm lint` passes with the guard on.
`pnpm -r test` passes. Expectations change only for disagreements recorded in
`evidence/splitter-disagreements.md`.

### Tests for User Story 5

- [x] T003 [P] [US5] Write unit tests in `packages/contracts/src/rule-shape.test.ts` for every reader in [contracts/rule-shape.md](contracts/rule-shape.md). Cover:
  - a rule with an inline `+`; one without; one with two `+`; a vkey before the `+`;
  - `any()` as the keystroke; a group that is not `using keys`; `match`/`nomatch`;
  - a leading `nul`; head `if()` guards; a non-head `if()` (stays in pre-context);
  - `elementAtOffset` on `if(...) any(s) + "k" > index(t,2)`, which must resolve 2 to the `any(s)` element.
- [x] T004 [P] [US5] Write unit tests in `packages/contracts/src/rule-shape.test.ts` for `makeRule` and `withRuleParts`. For each reader shape in T003, `makeRule(parts)` produces the exact rule object the current codec `parse()` produces for the same source. Use small `.kmn` snippets parsed through the engine codec in an engine-side test `packages/engine/src/shared/rule-shape-builders.test.ts`, because contracts cannot import the engine.

### Implementation for User Story 5

- [x] T005 [US5] Implement the readers in `packages/contracts/src/rule-shape.ts`: `ruleLhsKind`, `ruleHasNulContext`, `ruleConditions`, `rulePreContext`, `ruleKeystroke`, `ruleKeystrokeLoose`, `ruleExtraKeystrokeElements`, `elementAtOffset`. Build them by extracting the struck-key logic from `packages/contracts/src/touch-key-rule-join.ts` (lines ~311–420, 548–640), then apply the kmcmplib rule from research R5a:
  - the keystroke is the one element after the separator, or the last element when there is no separator;
  - there is no keystroke outside `using keys` groups;
  - offsets are 1-based over `[nul?, ...conditions, ...preContext, keystroke?]`.

  The readers use structural types only, as the file header requires. Make T003 pass.
- [x] T006 [US5] Implement `makeRule` and `withRuleParts` in `packages/contracts/src/rule-shape.ts`, per [contracts/rule-shape.md](contracts/rule-shape.md) §Writers. The separator is written only when there is a pre-context or conditions **and** a keystroke in a `using keys` group. Make T004 pass.
- [x] T007 [US5] Re-export the new functions from `packages/engine/src/shared/rule-shape.ts`, as `isPlusSeparator` is re-exported today.
- [x] T008 [US5] Write the equivalence corpus test `packages/engine/src/shared/rule-shape-equivalence.corpus.test.ts`. Copy the **current inline logic** of each of the five splitters into the test, as reference functions that never ship:
  - `touch-key-rule-join.ts` struck key;
  - `ldml-export/classify/keystrokes.ts` `splitRule`;
  - `kmAssist/group.ts` `splitGuards`;
  - `contracts/src/ir/outputRepertoire.ts` `splitContext`;
  - `base-fallback/unhandledPositions.ts`.

  Parse every corpus `.kmn`. For each rule, compare each reference with `ruleKeystroke`/`rulePreContext`, and write every disagreement (file, line, rule text, splitter, old answer, new answer) to `specs/116-ng-parser-adoption/evidence/splitter-disagreements.md`. The test fails only on a disagreement that research R5a's kmcmplib rule does not explain. Commit the evidence file.
- [x] T009 [US5] Replace the 6 inline copies of the `+` predicate with `isPlusSeparator` or the accessors, in:
  - `packages/studio/src/lib/docContent.ts:200`
  - `packages/studio/src/components/ruleBuilder/RuleBuilderPanel.tsx:175`
  - `packages/engine/src/pattern-apply/carveSuppression.ts:236,355`
  - `packages/engine/src/placement/deadkey.ts:107`
  - `packages/engine/src/strategy-selector/derive-remap-posture.ts:128`
  - `packages/engine/src/validator/layer-a-prime.ts:784`

  Run each file's tests.
- [x] T010 [US5] Migrate `packages/contracts/src/touch-key-rule-join.ts` onto the accessors. Its struck-key and offset code becomes calls to `ruleKeystroke` and `elementAtOffset`. Keep its exported behaviour except for disagreements recorded in T008. Update `packages/contracts/src/touch-key-rule-join.test.ts` expectations only for those recorded rules.
- [x] T011 [P] [US5] Migrate the LDML classifier readers onto the accessors. Delete `splitRule`'s private splitting (FR-034 single splitter) in `packages/engine/src/ldml-export/classify/keystrokes.ts`. Also migrate `packages/engine/src/ldml-export/classify/ruleElements.ts` (the offset sites at 149–169, 246–247, 342, 490 use `elementAtOffset`), `packages/engine/src/ldml-export/classify/layerRules.ts:100` and `packages/engine/src/ldml-export/lower/transforms.ts:126–212`. LDML classifier fixtures must produce identical output, except for recorded disagreements.
- [x] T012 [P] [US5] Migrate kmAssist onto the accessors, deleting the duplicated splitters, in `packages/engine/src/kmAssist/group.ts` (~233, 411), `packages/engine/src/kmAssist/explain.ts` (173–187) and `packages/engine/src/kmAssist/classify.ts` (85–96).
- [x] T013 [P] [US5] Migrate the contracts IR utilities: `packages/contracts/src/ir/outputRepertoire.ts` (135–241; replace `splitContext`), `packages/contracts/src/ir/deadkeys.ts:170`, `packages/contracts/src/ir/casedKeys.ts:224` and `packages/contracts/src/keyBudget.ts:94`.
- [x] T014 [P] [US5] Migrate the engine readers:
  - `packages/engine/src/deadkey-lifecycle/cluster.ts` (44–101)
  - `packages/engine/src/base-fallback/unhandledPositions.ts` (48–53)
  - `packages/engine/src/osk/generate-kvks.ts:104`
  - `packages/engine/src/placement/index.ts:182`
  - `packages/engine/src/placement/filters.ts:183`
  - `packages/engine/src/caps/compareCaps.ts:91`
  - `packages/engine/src/scaffolder/scaffoldTouchLayout.ts` (248–490)
- [x] T015 [P] [US5] Migrate the engine offset readers onto `elementAtOffset`:
  - `packages/engine/src/pattern-apply/collectCharContributors.ts` (595–598)
  - `packages/engine/src/pattern-apply/applyStoreSlotRemovals.ts` (378, 494–510)
  - `packages/engine/src/pattern-apply/applyCarveKeycapRemovalsToVfs.ts` (169–176)
  - `packages/engine/src/pattern-apply/oe2SoleSource.ts` (80, 109–110)
  - `packages/engine/src/recognizer/interpreter.ts` (176, 266, 299–312, 481)
  - `packages/engine/src/recognizer/s02-families.ts` (67, 169)
  - `packages/engine/src/recognizer/s06-families.ts` (75, 100)
  - `packages/engine/src/strategy-selector/import-mark-order.ts` (94, 117)
- [x] T016 [US5] **Own commit.** Migrate the two recognizer rules that read raw, unfiltered offsets, `packages/engine/src/recognizer/rules/parallel-index-fanout.ts:41` and `packages/engine/src/recognizer/rules/s02-deadkey-single-tap.ts:31`, onto `elementAtOffset`/`rulePreContext`. These rules will now match rules containing a `+` (research R5b). List the newly recognised corpus rules in the commit message, and update recognizer test expectations only for those.
- [x] T017 [P] [US5] Migrate the studio readers:
  - `packages/studio/src/lib/irToCarveNodes.ts` (887, 1152, 1237, 1322, 1345, 1540, 1571, 1644, 1667–1677, 1765–1768)
  - `packages/studio/src/lib/irToCharacterView.ts` (404–407)
  - `packages/studio/src/lib/claimedInputs.ts:123`
  - `packages/studio/src/lib/occupiedBaseKeys.ts` (46–72)
  - `packages/studio/src/survey/slotOccupancy.ts:148`
  - `packages/studio/src/lib/carvedCombo.ts:45`
  - `packages/studio/src/editors/deadkey/deadkeyWrite.ts` (131, 628)
- [x] T018 [P] [US5] Migrate the keyboard-lint readers onto the contracts accessors: `packages/keyboard-lint/src/checks/criteria/check-raw-ctrl.ts:43`, `packages/keyboard-lint/src/checks/criteria/check-sided-ctrl-advisory.ts:25`, and any other check that reads `.context` (grep `packages/keyboard-lint/src` for `.context`).
- [x] T019 [US5] Migrate the engine rule writers onto `makeRule`/`withRuleParts`:
  - `packages/engine/src/deadkey-lifecycle/mutations.ts` (223–246)
  - `packages/engine/src/pattern-apply/mark-guards.ts` (203, 296–446, 595)
  - `packages/engine/src/pattern-apply/context-variants.ts` (390, 697, 705)
  - `packages/engine/src/pattern-apply/touchRuleSynthesis.ts` (190–201)
  - `packages/engine/src/pattern-apply/severTouchKey.ts:373`
  - `packages/engine/src/pattern-apply/carveSuppression.ts` (258–278)
  - `packages/engine/src/pattern-apply/normalization-step/index.ts:93`
  - `packages/engine/src/rulePacks/install.ts:226`
  - `packages/engine/src/facet-transform/migrations/encoding-spelling.ts:147`
  - `packages/engine/src/inventory/producedGlyphs.ts:107`
  - `packages/engine/src/caps/replaceCapsRules.ts:25`: replace its in-place mutation with a rule replacement.
- [x] T020 [P] [US5] Migrate the studio rule writers onto `makeRule`/`withRuleParts`: `packages/studio/src/components/rules/guardRuleSynthesis.ts` (46, 83), `packages/studio/src/components/rules/narrowGuard.ts:43`, `packages/studio/src/editors/deadkey/deadkeyWrite.ts:688`, `packages/studio/src/lib/projectWorkingCopyVfs.ts:1563` and `packages/studio/src/components/ruleBuilder/RuleBuilderPanel.tsx`.
- [x] T021 [P] [US5] Migrate the test builders `packages/contracts/src/fixtures/ir-builders.ts` and `packages/engine/src/test-support/applyStoreSlotRemovals.testkit.ts` onto `makeRule`. These are test support, so the guard allow-lists them only if migration is impractical. Record why.
- [x] T022 [US5] Add the FR-037 guard to `eslint.config.mjs`. It is a `no-restricted-syntax` rule: the repo's ESLint is not type-aware, so it matches syntax. It applies to `packages/{contracts,engine,studio,keyboard-lint}/src/**/*.{ts,tsx}`, excluding `packages/engine/src/codec/**`, `packages/contracts/src/rule-shape.ts` and test files, and it bans:
  - `MemberExpression[property.name="matchKind"]`;
  - `MemberExpression[property.name="context"]` where the object is a rule-typed identifier. Use the selector list fixed while implementing; follow the `galleryWriteBanRule` pattern already in the file, with a message pointing to `rule-shape.ts`;
  - object literals with both `context` and `output` properties.

  A justified exception uses `// eslint-disable-next-line no-restricted-syntax -- <why>`, as the file's own convention requires.
- [x] T023 [US5] Gate:
  1. `pnpm lint`, `pnpm typecheck` and `pnpm -r test`, plus the engine and studio corpus suites.
  2. Confirm with `git diff origin/main -- '*.test.*' '*.snap'` that every changed expectation is listed in `evidence/splitter-disagreements.md` or in T016's commit.
  3. Tick T003–T023 and commit as `refactor(contracts): one rule-shape API for every rule reader and writer (spec 116 T003-T023)`, listing the disagreement count.
  4. Push with `git push -u origin 116-ng-parser-adoption`, after checking the upstream with `git rev-parse --abbrev-ref --symbolic-full-name '@{u}'`.

  T016 keeps its own earlier commit.

**Checkpoint**: one splitter, one offset accessor, no raw rule-shape access outside the codec.

---

## Phase 4: User Story 1 - Import keeps working, now on Keyman's grammar (Priority: P1)

**Goal**: `parse()` reads `.kmn` with the vendored Keyman front end and lowers it to the unchanged
`KeyboardIR`, within the reader budget, proven equivalent by side-by-side comparison
(FR-001 to FR-008, FR-030/031).

**Independent Test**:
- `reader-differential.corpus.test.ts` shows no unlisted differences in IR, emitted text, node ids or
  import status. Comments are compared as a known gap until US2.
- `reader-timing.corpus.test.ts` meets the budget.
- All existing codec tests pass unchanged.

### 4a. Vendor, profile, patch (the speed gate comes first)

- [x] T024 [US1] Write `scripts/vendor-ng-parser.mjs`. Given a Keyman checkout path and a commit, it `git show`s the files listed in [contracts/vendoring.md](contracts/vendoring.md) into `packages/engine/src/codec/ng/`, adds one provenance line under each file's MIT header (upstream path + commit, no issue numbers), and rewrites import specifiers to our `.js` ESM convention. Run it with `c:/Github/keyman` and `fb7afff889c26161c8233edb46192dfdb0dec8e6`.
- [x] T025 [US1] Write `packages/engine/src/codec/ng/PROVENANCE.md` with the commit, file list, excluded files, a "Local patches" table (empty for now) and the re-sync steps from [contracts/vendoring.md](contracts/vendoring.md).
- [x] T026 [US1] Make `packages/engine/src/codec/ng/` compile under the engine `tsconfig`. Permitted edits are import specifiers and type-only fixes; list each in `PROVENANCE.md`. Run `grep -rnE "from ['\"](node:|fs|path|os)" packages/engine/src/codec/ng`, which must print nothing.
- [x] T027 [P] [US1] Add a depcruise rule to `.dependency-cruiser.cjs` named `codec-ng-internal`. It forbids importing `^packages/engine/src/codec/ng/` from any path except `^packages/engine/src/codec/[^/]+\.ts$`, with a comment citing Art II. Exclude `packages/engine/src/codec/ng/**` from style-only ESLint rules in `eslint.config.mjs`, keeping it type-checked.
- [x] T028 [US1] Profile the unpatched lexer. Run `node --cpu-prof` on a small script that lexes `../keyboards/release/v/vietnamese_telex/source/vietnamese_telex.kmn` and the whole corpus with `Lexer` from `packages/engine/src/codec/ng/lexer.ts`. Record the top self-time functions and the hypothesis for each in `research.md` §R1, as a "Profile" sub-entry.
- [x] T029 [US1] Apply the performance patch to `packages/engine/src/codec/ng/lexer.ts` and/or `scan-recognizer.ts`, as the profile directs. For example: first-character recogniser dispatch; one identifier match feeding keyword lookup; removing per-token line-buffer concatenation. Don't touch `kmn-file.bnf`, `recursive-descent.ts` or `kmn-analyzer.ts`. The token stream must be identical to the unpatched lexer for every corpus file: add `packages/engine/src/codec/ng/lexer-equivalence.corpus.test.ts`, which compares against the unpatched lexer kept as test-only reference code. Record the patch in `PROVENANCE.md` as local patch 1.
- [x] T030 [US1] Add the `onTrivia` callback patch to `packages/engine/src/codec/ng/lexer.ts`, per [contracts/comment-channel.md](contracts/comment-channel.md). It is optional, fires for `emit:false` tokens in source order with line and column, and the emitted tokens are unchanged. Extend `lexer-equivalence.corpus.test.ts` to assert identical tokens with and without a callback. Record it as local patch 2.
- [x] T031 [US1] **Speed gate, with an escalation stop.** Add a budget assertion to `reader-timing.corpus.test.ts` for lexing plus per-line parsing of every corpus file. The budget: **total ≤ 2 × baseline (T002) and slowest file ≤ 300 ms**. If it can't be met after T029, **stop the implement run**:
  1. leave T031 unchecked;
  2. commit what exists with the measurements and the profile in the message;
  3. report to the owner with the options from research R1, finding 5 (a larger lexer rewrite offered upstream, or keeping the current tokenizer in front of Keyman's parser rules).

  Do not start T032 until this passes.

### 4b. Lowering and comparison

- [x] T032 [US1] `git mv packages/engine/src/codec/parse.ts packages/engine/src/codec/parse-legacy.ts` and rename its export to `parseLegacy`. Create a new `packages/engine/src/codec/parse.ts` that, for now, re-exports `parseLegacy` as `parse`, so every existing caller and test is untouched. Move helpers the new reader will share (`parseStoreItems`, `sketchStoreItems`, `extractProducedOutput`, the range decoders, the `nodeId` minter) from `parse-legacy.ts` into `packages/engine/src/codec/parse-shared.ts`, with no behaviour change. Run `pnpm --filter @keyboard-studio/engine exec vitest run src/codec`, which must pass unchanged.
- [x] T033 [US1] Add the new reasons to `packages/engine/src/codec/opaque-reasons.ts`: `FOREIGN_COMPILE_TARGET: "foreign-compile-target"`, `REMOVED_STATEMENT: "removed-statement"` and `MULTI_ELEMENT_KEYSTROKE: "multi-element-keystroke"`, each with a comment. Keep `SMP_LITERAL` and note it is retained for persisted drafts. Add no catch-all.
- [x] T034 [US1] Implement the line loop in `packages/engine/src/codec/lower.ts`, per [contracts/lowering.md](contracts/lowering.md) §1:
  1. Lex once, with `onTrivia` collecting records for US2 (stored, unused for now).
  2. Split at `NEWLINE`.
  3. Parse each slice with the exported `LineRule`. A line counts as accepted only if the parse returns true **and** every token is consumed.
  4. A rejected line becomes a `RawKmnFragment` with a classified reason: `removed-statement` for `fix`/`clearcontext`/`switch`/`key`, `foreign-compile-target` for `$kmfl`/`$weaver`. Any unclassified rejection throws an internal error naming the line, so the comparison suite surfaces it; it is never a catch-all.
  5. Never call upstream `Parser.parse()`.
- [x] T035 [US1] Implement header, store and group lowering in `packages/engine/src/codec/lower.ts`, per [contracts/lowering.md](contracts/lowering.md) §2 rows `compileTarget`, `systemStoreAssign`, `normalStoreAssign`, `headerAssign`/`capsLockHeader`, `beginStatement` and `groupStatement`. Reuse the `parse-shared.ts` helpers so store items, sketches, ranges and menu literals behave exactly as today (research R6). Set `sourceLine`, `groupNodeId`, `targetSelector` and the `IRHeader` fields as `parse-legacy.ts` does.
- [x] T036 [US1] Implement rule lowering in `packages/engine/src/codec/lower.ts`, per [contracts/lowering.md](contracts/lowering.md) §2 rows `productionBlock`, `ifLikeStatement`, `keystroke`, `rhsBlock`/`outputStatement` and `text`/`simpleText`:
  - Build `context` through `makeRule` (T006), so the separator placement matches the old reader.
  - Keep every semantic check that produces today's reasons (`indexed-context`, `if-option-store` for `<>` or non-head `if`, `option-store-directive`, `call-return`, `outs-expansion`, ranges, menu stores).
  - Lower SMP `U_CHAR` and `NAMED_CONSTANT` to characters.
  - Set `producedOutput` on rule fragments, using the shared helper.
- [x] T037 [US1] Make the minting order in `lower.ts` match `parse-legacy.ts` for every node kind, with the same prefixes and sequence, so `nodeId`s are equal for the same source.
- [x] T038 [US1] Write the comparison suite `packages/engine/src/codec/reader-differential.corpus.test.ts`. For every corpus `.kmn` plus every `.kmn` fixture under `packages/engine/src/codec/**/__fixtures__` and the inline sources in existing codec tests, run `parseLegacy` and the new `lower()`, then compare:
  1. `normaliseForComparison` deep equality with **comments excluded** (the known gap until US2);
  2. `emit()` text equality;
  3. the raw `nodeId` sequence;
  4. `ImportStatus` (never worse).

  Read differences against `specs/116-ng-parser-adoption/evidence/allow-list.json` (`{file, line, old, new, reason}` entries). Write `specs/116-ng-parser-adoption/evidence/reader-differential.md` with per-file results, per-reason counts old against new, and timing. Seed the allow-list with the 2 `fix` lines in `experimental/gff/gff_geez_emufi/extras/gff_geez_emufi-pua.kmn:1342,1346`; the reason is "Keyman-19 removed statement; old reader dropped the `''`" (research R1, finding 4).
- [x] T039 [US1] Iterate on `lower.ts` until T038 shows no unlisted difference. Each remaining difference must be fixed or added to `allow-list.json` with a reason. Expect `smp-literal` fragments to become typed characters: add **one** allow-list rule for that class, with per-file counts in the report, rather than 2,308 entries.
- [x] T040 [US1] Switch `packages/engine/src/codec/parse.ts` to call `lower()`, keeping `parseLegacy` importable only by the comparison suite. Add the reader's full path (lex + parse + lower) to the budget assertion in `reader-timing.corpus.test.ts` (≤ 2× baseline total, ≤ 300 ms slowest). Then run:
  - `pnpm --filter @keyboard-studio/engine exec vitest run src/codec`, where every existing test passes unchanged except where an allow-listed class applies;
  - the engine corpus suite;
  - `pnpm --filter @keyboard-studio/studio build`, which proves the parser runs in the browser bundle.
- [x] T041 [US1] Gate:
  1. `pnpm lint` (including depcruise `codec-ng-internal`), `pnpm typecheck` and `pnpm -r test`, plus the corpus suites.
  2. Tick T024–T041 and commit as `feat(engine): read .kmn with the vendored Keyman parser front end (spec 116 T024-T041)`, with allow-list counts and timing in the message.
  3. Push explicitly, after checking the upstream.

**Checkpoint**: the new reader is live for every `parse()` caller. Comments still come through the
legacy anchoring gap, which US2 closes.

---

## Phase 5: User Story 2 - Comments survive the new parser as text (Priority: P1)

**Goal**: comment text and anchors identical to the old reader, through the `onTrivia` side-channel
(FR-010 to FR-014). Then the old reader is deleted.

**Independent Test**: the comparison suite with comments **included** shows zero differences in
`ir.comments` and in every `trailingComment`. `parse-legacy.ts` is gone.

- [x] T042 [US2] Implement `packages/engine/src/codec/comment-channel.ts`. It turns `onTrivia` tokens plus line structure into `CommentRecord`, `ContinuationRecord` and `BlankLineRecord`, per [contracts/comment-channel.md](contracts/comment-channel.md). `text` is the body after `c` and its single separating space, and a bare `c` gives `""`. Unit-test it in `packages/engine/src/codec/comment-channel.test.ts`, including `[K_C]`, a quoted `"c "`, and a comment on a `\`-continued line.
- [x] T043 [US2] Implement anchoring in `packages/engine/src/codec/lower.ts`, using the rules of [contracts/comment-channel.md](contracts/comment-channel.md) §Anchoring:
  - a trailing comment becomes `trailingComment` on the rule or store;
  - leading runs become `IRComment{anchor:"leading", anchorRef}`;
  - blank lines flush pending comments as freestanding;
  - otherwise the comment is freestanding with `sourceLine`.

  For comments on continued lines, reproduce whatever `parse-legacy.ts` does; the comparison suite is the specification.
- [x] T044 [US2] Remove the comments exclusion from `reader-differential.corpus.test.ts` and iterate on T043 until comments show zero differences across corpus and fixtures. A comment difference may **not** be allow-listed (SC-003).
- [x] T045 [US2] Regenerate and commit `specs/116-ng-parser-adoption/evidence/reader-differential.md`, the final comparison report (FR-030). Then **delete** `packages/engine/src/codec/parse-legacy.ts` (FR-008). Convert `reader-differential.corpus.test.ts` into `packages/engine/src/codec/reader-regression.corpus.test.ts`: it asserts per-reason fragment counts and comment counts against the committed report's numbers, so later drift fails. Delete the test-only legacy references. `grep -rn "parseLegacy\|parse-legacy" packages` must print nothing.
- [x] T046 [US2] Write the upstream-offer texts (they are **not** filed; filing is outward-facing and needs owner approval) in `specs/116-ng-parser-adoption/evidence/upstream-offers.md`:
  1. the lexer performance patch;
  2. the opt-in `onTrivia` hook;
  3. the bug report that `Parser.parse()` silently truncates at the first failing line, with the `gff_geez_emufi-pua.kmn:1342` repro.

  Link it from `PROVENANCE.md`.
- [x] T047 [US2] Gate:
  1. `pnpm lint`, `pnpm typecheck` and `pnpm -r test`, plus the corpus suites.
  2. Tick T042–T047 and commit as `feat(engine): keep .kmn comments through the new reader; retire the legacy reader (spec 116 T042-T047)`.
  3. Push explicitly.

**Checkpoint**: Stories 1 and 2 are done. The new reader is the only reader.

---

## Phase 6: User Story 3 - Exporters read typed constructs, not text (Priority: P2)

**Goal**: `layer`, `set`/`save`/`reset`, `call`/`return`, `platform` and store `outs` become typed IR
members, after hardening every consumer, and the LDML classifier reads them (FR-020 to FR-026).

**Independent Test**:
- Typed-member fixtures round-trip.
- LDML classifier output is identical on its fixtures.
- A scratch unhandled member fails `pnpm typecheck`.
- The corpus count of `option-store-directive`, `call-return` and `outs-expansion` fragments drops as
  SC-005 says.

### 6a. Hardening (before any new member exists; research R5c)

- [ ] T048 [P] [US3] Make every non-exhaustive kind switch exhaustive, with explicit cases for every **current** kind and `assertNever` in the default:
  - `packages/engine/src/kmAssist/group.ts:168`
  - `packages/contracts/src/ir/outputRepertoire.ts:216`
  - `packages/engine/src/ldml-export/classify/keystrokes.ts:105`
  - `packages/engine/src/ldml-export/classify/ruleElements.ts:361,445`
  - `packages/engine/src/placement/index.ts:52`
  - `packages/engine/src/strategy-selector/derive-remap-posture.ts:60`
  - `packages/studio/src/lib/irToCarveNodes.ts:269,840,1460`

  No behaviour change; tests unchanged.
- [ ] T049 [P] [US3] Add an exhaustive `storeItemText(item: StoreItem): string` to `packages/contracts/src/ir/` (new file `storeItemText.ts`, exported from the contracts index). Replace every `char ? value : raw ? text : ""` ternary with it:
  - `packages/engine/src/caps/casedKeysStore.ts:16`
  - `packages/keyboard-lint/src/checks/criteria/check-cased-keys.ts:35`, `check-produced-set.ts:138`, `check-bitmap.ts:31`
  - `packages/engine/src/pattern-apply/context-variants.ts:151`
  - `packages/engine/src/pattern-apply/shiftRules.ts:43`
  - `packages/engine/src/pattern-apply/modifierCombos.ts:613`
  - `packages/engine/src/scaffolder/scaffold-ir.ts:86`
  - `packages/contracts/src/ir/casedKeys.ts:250,269`
  - `packages/engine/src/base-fallback/unhandledPositions.ts:94`
  - `packages/contracts/src/ir/outputRepertoire.ts:124`

  No behaviour change.
- [ ] T050 [US3] Add `classifyRawElement(text: string)` to `packages/contracts/src/rule-shape.ts`. It returns `{kind:"layer", value} | {kind:"platform", value} | {kind:"setLayer", value} | {kind:"other"}`, unifying the regexes in `engine/src/kmAssist/classify.ts:72–96`, `engine/src/ldml-export/classify/rawText.ts:26–38`, `ldml-export/classify/layerRules.ts:139,186`, `ldml-export/classify/ruleElements.ts` (5 sites) and `studio/src/lib/irToCarveNodes.ts:860–870` (`PLATFORM_GUARD_RE`). Route all those sites through it. Tests unchanged.
- [ ] T051 [US3] Commit 6a as `refactor: harden IR kind consumers before new members (spec 116 T048-T050)` after `pnpm lint && pnpm typecheck && pnpm -r test`. Push.

### 6b. New members

- [ ] T052 [US3] Add the members to `packages/contracts/src/keyboard-ir.ts`, per [data-model.md](data-model.md) §3: `OutputElement` gets `layer`, `set`, `save`, `reset`, `call` and `return`; `ContextElement` gets `platform`; `StoreItem` gets `outs`. Each gets a doc comment. Add zod mirrors in `packages/contracts/src/schemas.ts` under the existing compile-time drift guards. `pnpm typecheck` now fails at every exhaustive consumer, and that failure list is the work list for T054–T058.
- [ ] T053 [US3] Add `resolveStoreItems(ir, storeName)` to `packages/contracts/src/ir/` (new `resolveStoreItems.ts`). It expands `StoreItem.outs` recursively, with a cycle guard that returns a `raw` marker. Unit-test it.
- [ ] T054 [US3] Lower the members in `packages/engine/src/codec/lower.ts`: `layer()` → `{kind:"layer"}`; head `platform()` → `{kind:"platform"}`, while a non-head one stays `raw`; `set`/`save`/`reset`/`call`/`return` → typed outputs, so the rule is no longer a fragment; store `outs()` → `StoreItem.outs`. Emit them in `packages/engine/src/codec/emit.ts` (`fmtOutput`, `fmtContext`, `fmtStoreItem`). Handle them in `packages/engine/src/codec/normalise-ir.ts` if needed. Add round-trip fixtures in `packages/engine/src/codec/roundtrip-typed-members.test.ts`, one per member, where `emit(parse(src))` is equivalent to `src`.
- [ ] T055 [US3] Update the exhaustive consumers flagged by T052 so they handle each member: `contracts/src/keyboardIRRoundTrip.ts`, `contracts/src/ir/producedSet.ts`, `engine/src/pattern-apply/collectCharContributors.ts`, `engine/src/kmAssist/{group,explain}.ts`, `studio/src/components/ruleBuilder/RuleBuilderPanel.tsx`, `studio/src/components/rules/ruleNaming.ts`, plus every T048 site. Where a consumer previously saw the construct as `raw` or a fragment, the typed case must give the **same** result as before. `storeItemText` and `producedSet` use `resolveStoreItems` for `outs`.
- [ ] T056 [US3] Switch each text recogniser to the typed member, keeping the classification identical, and add tests showing the same verdict before and after:
  - `engine/src/kmAssist/classify.ts` and `explain.ts:573–581`;
  - `contracts/src/touch-key-rule-join.ts:200–221`: a typed `layer` must still classify as it did when it was `raw`;
  - `engine/src/recognizer/s02-families.ts:68`;
  - `engine/src/validator/context-tolerance.ts:188,220`: read `StoreItem.outs` instead of re-parsing `outs-expansion` fragments, but keep the fragment path for persisted drafts;
  - `keyboard-lint/src/checks/criteria/check-deprecated-headers.ts:90`: count `set`/`save`/`reset` store references.
- [ ] T057 [US3] Switch the LDML classifier to the typed members (FR-026) in `packages/engine/src/ldml-export/classify/{rawText,ruleElements,layerRules}.ts`. Keep `routeFragmentReason` for fragments that remain (`option-store-directive` → 3.18, `call-return` → 1.12) for persisted drafts. LDML classifier and lowering fixtures must give identical output. Update the rows citing raw or opaque forms in `specs/108-ldml-export/contracts/ldml-mapping.md` (6.1, 6.2, 3.18, 1.12, and the layer/platform rows) to cite the typed members, and add a dated note.
- [ ] T058 [US3] Update `reader-regression.corpus.test.ts`'s expected per-reason counts: `option-store-directive`, `call-return` and `outs-expansion` drop. Record the before and after counts in `specs/116-ng-parser-adoption/evidence/reader-differential.md` under "Phase 6 (US3)" (SC-005).
- [ ] T059 [US3] Gate:
  1. `pnpm lint`, `pnpm typecheck` and `pnpm -r test`, plus the corpus suites, plus the spec 108 LDML fixtures.
  2. Tick T048–T059 and commit as `feat(contracts): type layer, set/save/reset, call/return, platform and outs in the IR (spec 116 T052-T059)`.
  3. Push.

**Checkpoint**: exporters read typed constructs.

---

## Phase 7: User Story 4 - Every format knows what carries over (Priority: P2)

**Goal**: a format-capability table with import and export status per format, a completeness check,
and the importer policy (FR-027 to FR-029b, SC-007, SC-010).

**Independent Test**:
- `format-capability.test.ts` passes.
- Adding a scratch union member with no row fails it.
- Every KMN export cell is `mapped`.

- [ ] T060 [US4] Create `packages/contracts/src/capability/format-capability.ts` with the types from [contracts/capability-table.md](contracts/capability-table.md). It needs an `IR_KIND_PATHS` list bound to the contract by compile-time exhaustiveness: a `Record<StoreItem["kind"] | …, true>`-style guard per union, plus the typed node fields of `IRRule`, `IRStore`, `IRGroup`, `IRHeader` and `RawKmnFragment`.
- [ ] T061 [US4] Fill the rows for every `IR_KIND_PATHS` entry in `format-capability.ts`:
  - **KMN**: export `mapped`, with `ref` = the `emit.ts` function; import `produced`.
  - **LDML**: export `ref` = the row number in `specs/108-ldml-export/contracts/ldml-mapping.md`; import per the #2624 scope (planning).
  - **cldr-legacy**: import per the open PR #2625 importer, read from its branch `origin/km/2599-cldr-import`; export `n/a`.
  - **klc / xkb / keylayout**: import and export cells from each format's documentation (research R7), each with a `ref` URL or document section.
- [ ] T062 [US4] Fill `UNHOMED_CONSTRUCTS` in `format-capability.ts` (FR-029a). Include LDML `<reorder>` and markers, `<transform>` groups beyond what KMN maps, `.keylayout` `<actions>` states and terminators, XKB levels beyond 4 and groups, and MSKLC `SGCAPS` and ligatures. Give each a disposition and a note.
- [ ] T063 [US4] Write `packages/contracts/src/capability/format-capability.test.ts`, which checks:
  - completeness (rows equal `IR_KIND_PATHS`);
  - KMN export always `mapped`;
  - an import and an export cell for every format, with `n/a` requiring a note;
  - the FR-029b rule: the `RawKmnFragment` row has `n/a` import cells for every non-KMN format, with the policy note.

  Export the module from `packages/contracts/src/index.ts`.
- [ ] T064 [US4] Gate:
  1. `pnpm lint`, `pnpm typecheck` and `pnpm -r test`.
  2. Tick T060–T064 and commit as `feat(contracts): format-capability table for the IR hub (spec 116 T060-T064)`.
  3. Push.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T065 [P] Update the docs:
  - `docs/architecture.md`, codec section: the reader is the vendored Keyman front end plus lowering; comments go through `onTrivia`; per-line recovery; the reason catalogue.
  - `docs/packages.md`: `engine/src/codec/ng/` is vendored, see `PROVENANCE.md`.
  - `docs/tooling.md`: the new corpus suites, and `scripts/vendor-ng-parser.mjs`.

  Keep `README.md` untouched unless it names the reader.
- [ ] T066 [P] Add a CHANGELOG entry in `CHANGELOG.md` under Unreleased: new reader, comment fidelity, typed IR members, capability table, rule-shape API.
- [ ] T067 Ask km-testing for its pre-PR test-delta audit over `git diff origin/main -- '*.test.*'`. Prune scratch or task-scoped tests, keeping the equivalence, comparison and regression, timing, lexer-equivalence and capability suites.
- [ ] T068 Run `node utilities/spec-trace check`, and acknowledge the spec 116 and spec 108 mapping-contract units changed by this work (`node utilities/spec-trace acknowledge …`).
- [ ] T069 Run the whole-feature gate from [quickstart.md](quickstart.md): `pnpm lint && pnpm typecheck && pnpm -r test`, plus the engine and studio corpus suites. Record the results in `specs/116-ng-parser-adoption/evidence/final-gate.md`.
- [ ] T070 Prepare the follow-on spec handoff, but don't create it. Check `gh pr list --state open --json number,title,headRefName` and `ls specs` for the next free number. Write `specs/116-ng-parser-adoption/evidence/follow-on-handoff.md`, which:
  - names that number;
  - copies FR-040, FR-041 and FR-042 (the B3 → B1 → B2 order, the shapes, the gates: joint session, contracts major version bump, the draft-envelope v3 re-parse of `startIr`, rule-level zod schemas, offsets as written, the spec 103 revision request);
  - links research R5.

  Creating the spec and its issue is left to the owner.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: first. T002's baseline feeds the T031 and T040 budgets.
- **US5 (Phase 3)**: after Setup. Independent of the reader. T005/T006 are needed by T036 (lowering builds rules with `makeRule`).
- **US1 (Phase 4)**: after US5, because lowering uses `makeRule`. **T031 is a hard stop**: no lowering work before the speed gate passes.
- **US2 (Phase 5)**: after US1. It needs the `onTrivia` records collected by T034 and the comparison suite from T038.
- **US3 (Phase 6)**: after US2. It needs the new reader to type the constructs. 6a (T048–T051) must finish before 6b (T052).
- **US4 (Phase 7)**: after US3, so the rows include the new members. T060 can start earlier, but T061 needs T052.
- **Polish (Phase 8)**: last.

### Within stories

- US5: T003/T004 (tests), then T005/T006, then T007, then T008 (disagreements recorded), then the migrations T009–T021, then T022 (guard, once the tree is clean), then T023.
- US1: T024 → T025 → T026 → T027, then T028 → T029 → T030 → **T031 gate** → T032 → T033 → T034 → T035/T036 → T037 → T038 → T039 → T040 → T041.
- US3: T048–T050, then T051, then T052, then T053/T054, then T055 → T056 → T057, then T058 → T059.

## Parallel Opportunities

- **US5**: after T008, these touch disjoint files and can run in parallel: T011 (ldml-export), T012 (kmAssist), T013 (contracts/ir), T014 (engine readers), T015 (engine offset readers), T017 (studio readers), T018 (keyboard-lint), T020 (studio writers), T021 (test builders). T016 stays serial, in its own commit.
- **US1**: T027 (depcruise/eslint) can run alongside T028 (profiling).
- **US3**: T048 and T049 touch disjoint files.
- **Polish**: T065 and T066.

```text
# US5 migrations once T008 has recorded disagreements:
Task: "T011 Migrate LDML classifier readers"      (packages/engine/src/ldml-export/**)
Task: "T012 Migrate kmAssist"                     (packages/engine/src/kmAssist/**)
Task: "T017 Migrate studio readers"               (packages/studio/src/lib/**, survey/, editors/)
Task: "T018 Migrate keyboard-lint readers"        (packages/keyboard-lint/src/**)
```

## Implementation Strategy

- **MVP**: US5 plus US1. That gives one rule-shape API and the reader swap behind the comparison
  gate, without comments. It is shippable only together with US2, because without US2 comments would
  regress. So the **first releasable increment is US5 + US1 + US2**: Keyman's grammar is the only
  reader, with full comment fidelity.
- **Second increment**: US3, the typed members and the LDML classifier.
- **Third increment**: US4, the capability table. Then Polish.
- **Escalation point**: T031. If the reader can't meet the budget, the run stops there with the
  evidence, before any lowering code exists.

## Notes

- Total tasks: 70.
- Per story: Setup 2 · US5 21 (T003–T023) · US1 18 (T024–T041) · US2 6 (T042–T047) · US3 12
  (T048–T059) · US4 5 (T060–T064) · Polish 6 (T065–T070).
- Each phase is one commit, apart from T016 and T051, which commit separately by design. Each is
  pushed explicitly after checking the upstream.
