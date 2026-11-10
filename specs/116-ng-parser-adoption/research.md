# Research: spec 116

Phase 0 of [plan.md](plan.md). Each entry gives the decision, its rationale and the alternatives
considered. Evidence paths are repo-relative, or into the local Keyman checkout at the pinned branch.

## R1 — Corpus trial run of Keyman's parser (FR-031)

*Status: running. Results are added here before `/speckit-tasks`.* This entry sizes the reason
catalogue (contracts/lowering.md §3), the allow-list and the performance assumption.

## R2 — How comments are captured: wrap the lexer, don't patch it (FR-011, FR-014)

- **Facts:**
  - Upstream `scan-recognizer.ts` marks `COMMENT`, `WHITESPACE` and `CONTINUATION` as `emit:false`.
  - `Lexer.parse({emitAll, handleContinuation})` documents that `emitAll` forces
    `handleContinuation:false`.
  - The current reader anchors comments in `parse.ts:1085–1120` (`pendingComments`,
    `flushCommentsFreestanding`) and strips trailing comments with `stripTrailingComment`
    (`parse.ts:937`).
- **Decision:** two lexer passes over unmodified vendored code.
  - One `emitAll` pass collects trivia records only.
  - One default pass produces the grammar's tokens.
  - Anchoring re-implements the current reader's rules over those records (contracts/comment-channel.md).
- **Rationale:** the vendored lexer stays byte-identical to upstream, so re-syncs are mechanical.
  Lexing is linear and small next to parsing (R1 measures it).
- **Alternatives:**
  - A local lexer patch adding a callback for non-emitted tokens. This is the fallback if R1 shows the
    second pass costs more than 10% of reader time on the largest keyboard. It would be offered
    upstream.
  - Pushing comments into the grammar as tokens. Rejected: it changes the grammar file.
  - Asking upstream for a lossless mode first. Rejected as a prerequisite, because km-author judged
    upstream would at most accept an opt-in mode. An upstream issue is still filed (FR-014).

## R3 — Vendoring and runtime targets (FR-002, FR-003)

- **Decision:** vendor at `fb7afff889` into `packages/engine/src/codec/ng/`, with `PROVENANCE.md`, a
  re-sync script and a depcruise boundary (contracts/vendoring.md).
- **Check before Phase 2 starts:** the vendored files import only each other and plain TypeScript. A
  grep for `node:`, `fs` and `path` in the extracted files must be empty. The studio bundle build is
  the gate (quickstart).
- **Alternatives:**
  - A git submodule or subtree of keymanapp/keyman. Rejected: the repository is huge, and the branch is
    unmerged and force-pushed.
  - An npm dependency. Not available yet; the switch is planned in contracts/vendoring.md.

## R4 — Per-line recovery without changing the grammar (FR-006)

- **Decision:**
  - Split the token stream at `NEWLINE` tokens and run the grammar's `line` production on each slice.
  - A rejected line becomes a fragment with its rejection class's reason.
  - A lexer failure still throws.
- **Rationale:** the grammar is line-oriented (`kmnTree: line*`). A top-level `ManyRule` stops at the
  first failure, which would lose everything after it.
- **Alternatives:**
  - Adding error productions to the grammar. Rejected: it changes the grammar file.
  - Parsing the whole file and recovering from the tree. Rejected: the combinators carry no recovery
    information.

## R5 — Consumer inventory: rule shape (Phase 1) and kind switches (Phase 4)

Read-only inventory, 2026-11-10, file-by-file (Explore agent). Paths are under `packages/`.

### R5a. The splitters disagree, so a single splitter is a behaviour change at the edges

Today there are five independent "which element is the keystroke" rules:

| Splitter | Keystroke rule | Without a `+` | Non-keys groups |
|---|---|---|---|
| `contracts/src/touch-key-rule-join.ts:311–420, 548–640` | the **first vkey anywhere** after dropping `+`; otherwise the first `any()` after the first `+` | expands only a single `any` element | runs anyway |
| `engine/src/ldml-export/classify/keystrokes.ts:116–140` | the element after the **last** `+` | the **last** element | no keystroke |
| `engine/src/kmAssist/group.ts:233` (copied in `explain.ts:173–187`) | the last element, **only if a vkey** | same | ignores `usingKeys` |
| `contracts/src/ir/outputRepertoire.ts:135` | everything after the **first** `+` | all elements, only when `usingKeys` | none |
| `engine/src/base-fallback/unhandledPositions.ts:48` | the element after the last `+` | the last element | n/a |

They differ on four inputs:
1. more than one inline `+`;
2. a vkey written before the `+`;
3. `any()` as the keystroke;
4. groups that are not `using keys`.

- **Decision:** the single `ruleKeystroke` follows kmcmplib.
  - The keystroke is the element at position `preContext.length + 1`, meaning the one element after
    the separator, or the last element when there is no separator.
  - In a group that is not `using keys`, there is no keystroke.
  - More than one element: the first is the keystroke and the rest go to
    `ruleExtraKeystrokeElements`.
  - Before switching each consumer, the Phase 1 equivalence test runs its old logic and the accessor
    over the whole corpus and lists every rule where they differ.
- **Spec impact:** FR-038's "no test expectation changed" can't hold for those edge rules. FR-038 is
  amended: a test expectation may change **only** where a consumer's old splitter disagreed with
  kmcmplib. Each such change is listed in the Phase 1 commit with the rule, the old answer, the new
  answer and the kmcmplib reference.
- **Alternative:** keep each consumer's quirks behind per-consumer accessor options. Rejected: that
  keeps five splitters behind one name, which is what FR-034 forbids.

### R5b. Phase 1 migration surface

| Category | Files | Notes |
|---|---|---|
| R (readers) | about 40 | 14 main readers; **6 inline copies** of the `+` predicate that a change to `isPlusSeparator` would not reach (`studio/src/lib/docContent.ts:200`, `studio/src/components/ruleBuilder/RuleBuilderPanel.tsx:175`, `engine/src/pattern-apply/carveSuppression.ts:236/355`, `engine/src/placement/deadkey.ts:107`, `engine/src/strategy-selector/derive-remap-posture.ts:128`, `engine/src/validator/layer-a-prime.ts:784`); about 20 light readers (first or last vkey, `length === 1`), including keyboard-lint `check-raw-ctrl.ts:43` and `check-sided-ctrl-advisory.ts:25` |
| O (offset arithmetic) | about 17 | e.g. `collectCharContributors.ts:595`, `ldml-export/classify/ruleElements.ts:149–169`, `studio/src/lib/irToCarveNodes.ts` (10 sites), `recognizer/interpreter.ts`. **Two read raw, unfiltered offsets**: `recognizer/rules/parallel-index-fanout.ts:41` and `recognizer/rules/s02-deadkey-single-tap.ts:31` reject any rule containing a `+`. Moving them to `elementAtOffset` **recognises more rules**. That is a behaviour change, and it gets its own commit inside Phase 1 so it can be reverted alone |
| W (writers) | 15 | 4 emit a `+` themselves: `deadkey-lifecycle/mutations.ts:223–246`, `pattern-apply/mark-guards.ts:391/446`, `pattern-apply/context-variants.ts:390/697/705`, `pattern-apply/touchRuleSynthesis.ts:190–201`. One mutates in place: `caps/replaceCapsRules.ts:25` |
| C (codec) | 4 | excluded: `emit.ts`, `parse.ts`, `normalise-ir.ts`, `opaque-reasons.ts` |

`matchKind` has about 20 sites, all "skip match/nomatch" guards or writers. No offset arithmetic uses
it, so `ruleLhsKind` is a mechanical replacement.

- **Decision:** Phase 1 goes in this order, one commit each:
  1. the accessors and helpers, plus the equivalence test;
  2. the inline predicate copies;
  3. the readers;
  4. the offset readers, with the two recognizer rules in their own commit;
  5. the writers;
  6. the lint guard last, once the tree is clean.

### R5c. Phase 4: the compile-time net has holes

FR-024 assumed exhaustiveness would catch every consumer. The inventory says otherwise:

- **Exhaustive** (these compile-fail on a new member, which is good):
  - explicit `never`: `contracts/src/keyboardIRRoundTrip.ts:191/273/293`,
    `contracts/src/ir/producedSet.ts:180`, `engine/src/pattern-apply/collectCharContributors.ts:521`;
  - implicitly exhaustive through `noImplicitReturns`: `kmAssist/group.ts` (3 sites),
    `kmAssist/explain.ts:93/121`, `RuleBuilderPanel.tsx:110/139`, `ruleNaming.ts:66/93`, codec `emit.ts`.
- **Not exhaustive** (these skip a new member silently):
  - `kmAssist/group.ts:168`, `contracts/src/ir/outputRepertoire.ts:216`,
    `ldml-export/classify/keystrokes.ts:105`;
  - `ldml-export/classify/ruleElements.ts:361/445`. A typed `layer`/`platform` would bypass the row
    3.19/3.21 handling the raw path gets today;
  - `placement/index.ts:52`, `strategy-selector/derive-remap-posture.ts:60`,
    `studio/src/lib/irToCarveNodes.ts:269/840/1460`.
- **Recognise these constructs from text today** (their behaviour changes once the construct is
  typed): `kmAssist/classify.ts:72–137`, `kmAssist/explain.ts:573–581`,
  `ldml-export/classify/rawText.ts`, `ruleElements.ts` (5 sites), `layerRules.ts:139/186`,
  `studio/src/lib/irToCarveNodes.ts:860–870`, `validator/context-tolerance.ts:188/220`,
  `contracts/src/touch-key-rule-join.ts:200–221` (a typed `layer` would flip "opaque" to "produces"),
  `recognizer/s02-families.ts:68`.
- **A typed `StoreItem.outs` would be silently dropped** by about 12 `char ? value : raw ? text : ""`
  ternaries, e.g. `caps/casedKeysStore.ts:16`, keyboard-lint `check-cased-keys.ts:35`,
  `check-produced-set.ts:138`, `check-bitmap.ts:31`, `contracts/src/ir/casedKeys.ts:250/269`,
  `outputRepertoire.ts:124`, `scaffolder/scaffold-ir.ts:86`. In addition,
  `check-deprecated-headers.ts:90` counts store references and would miss `set`/`save`/`reset`.

- **Decision:** Phase 4 starts with a hardening step **before** any new member exists:
  1. Make every listed non-exhaustive switch exhaustive (`assertNever`), with an explicit case per
     current kind.
  2. Replace the store-item ternaries with one contracts helper (`storeItemText`), which is exhaustive.
  3. Route every text recogniser above through a single `classifyRawElement(text)` in contracts.

  Then each member lands, and its recogniser path is switched to the typed member in the same commit,
  so nothing changes classification without a test showing it. Spec FR-024 is tightened to say this.
- **Alternative:** rely on exhaustiveness alone. Rejected; the evidence is above.

### R5d. Pattern data

- **Pattern data holds no IR context arrays.** `content/recognizer-rules/*.yaml` carry kind-tagged
  `context_pattern` lists that already exclude the `+`. `packages/contracts/data/patterns/*.yaml` are
  KMN text templates. Art I is unaffected.
- The only literal `+` elements are in the fixture `contracts/src/fixtures/touchKeyRuleJoin.ts:200/265`.

## R6 — Header and store mapping parity (FR-001, FR-005)

- **Decision:** lowering reproduces `parse.ts`'s mapping exactly:
  - system stores to `IRHeader` fields and `storeDirectives`;
  - old-style `NAME`/`VERSION`/`HOTKEY` headers and caps-lock headers;
  - `begin` entry points;
  - `NewContext`/`PostKeystroke` flags.

  The comparison suite is the specification. Any difference is either fixed in lowering or
  allow-listed with a reason. Nothing is re-derived from prose.
- **Rationale:** emit must be unchanged (FR-005), and emit reads exactly these fields.

## R7 — Capability cells for formats with no implementation (FR-027)

- **Decision:** fill the `klc`, `xkb` and `keylayout` cells from each format's documentation, and the
  `cldr-legacy` cells from the importer in open PR #2625. Each cell carries a reference.
- **Sources, recorded per cell:**
  - MSKLC `.klc`: Microsoft's keyboard layout file format; dead keys; `SGCAPS`; shift states 0–7.
  - XKB symbols: the `xkeyboard-config` and libxkbcommon documentation; levels, groups, `compose`.
  - Apple `.keylayout`: Apple's TN2056 (keyboard layout XML); `<actions>`, `<terminators>`, states.
  - Legacy CLDR: TR35 revision 69, plus #2599's mapping notes.
- **Rationale:** FR-029 makes the table planning data. Each cell must still be traceable, so later
  importer and exporter specs start from checked claims.
- **Alternative:** leave the non-LDML cells empty until each format's spec exists. Rejected: the
  completeness check (FR-028) needs every cell, and the point is to decide the IR's shape now.

## R8 — Interactions with in-flight work

| Work | Interaction | Handling |
|---|---|---|
| Spec 115 (branch `115-dialect-language-tags`, uncommitted language-tag changes) | Touches `langtags` and the LDML `document.ts`, not the codec reader | None. Rebase Phase 4's LDML classifier edits after 115 lands |
| Open PR #2625 (legacy CLDR import) | Builds IR, emits `.kmn`, then the loader parses it | Its emitted `.kmn` becomes a comparison fixture in Phase 2. Rows of its writer code move onto `makeRule` in Phase 1 if it merges first; otherwise its author is pointed at FR-035 in review |
| Open PR (spec 113, Layout tab) | Reads the IR; may write rules | If it merges before Phase 1, its writers join the Phase 1 list |
| Spec 103 | `if` guard shape | Unchanged (FR-025). The follow-on spec carries the revision request |
| Spec 108 | LDML classifier | Phase 4 switches its text recognisers to typed members (FR-026), with row 3.18/1.12 routing kept for fragments that remain |
