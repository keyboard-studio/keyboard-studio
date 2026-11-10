# Feature Specification: Adopt the Keyman next-generation KMN parser, and type the IR as a multi-format hub

**Feature Branch**: `116-ng-parser-adoption`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Adopt Dr Mark C. Sinclair's Keyman ng-compiler BNF / recursive-descent
parser front end as the .kmn parser in engine/src/codec, adding comment preservation (comments kept
as strings), lowering its AST into KeyboardIR, and planning the IR structure changes this enables,
moving closer to the LDML export (spec 108) where constructs are supported. Eventually we want to
get from our IR to LDML, XKB, MSKLC, and .keylayout (knowing that some rules won't apply or transfer
to all platforms)."

**Governing authority** (Constitution v2 precedence table): Art II (KeyboardIR is the engine spine:
every consumer reads and mutates the IR, never `.kmn` text; unparsable constructs are preserved as
`RawKmnFragment`, never dropped); Art I (the `Pattern` schema is untouched by this spec); Art X
(nothing is decided or dropped silently); Art XI (done means integrated). The `KeyboardIR` contract
lives in [packages/contracts/src/keyboard-ir.ts](../../packages/contracts/src/keyboard-ir.ts), whose
header requires a joint session and a major version bump for renames, type changes and removals.
Additive optional members follow the precedent of `OutputElement.useGroup` and spec
[103](../103-first-class-if-guards/spec.md)'s `if` guard. Spec [108](../108-ldml-export/spec.md)
(LDML export) is the first downstream consumer; its research R10, R16 and R19 record the IR gaps this
spec closes.

## Why this exists

The codec's `.kmn` reader ([parse.ts](../../packages/engine/src/codec/parse.ts),
[tokenize.ts](../../packages/engine/src/codec/tokenize.ts),
[continuation.ts](../../packages/engine/src/codec/continuation.ts)) is a set of string-splitting
helpers. They were tuned case by case against the corpus. It works, but there is no grammar: what the
reader accepts is defined by whatever the helpers happen to do. When it can't type a construct, the
construct becomes a `raw` element or a whole-rule `RawKmnFragment`. Every downstream consumer,
the LDML exporter most of all, then has to re-recognise that text by hand (108 R19: "the classifier
sub-classifies fragments by `reason`, and `raw` elements by their `text`").

Keyman is building a next-generation KMN compiler (keymanapp/keyman #13349, milestone 20.0) around a
real grammar: an 81-line BNF (`kmn-file.bnf`), a table-driven lexer and a recursive-descent parser
that builds a typed syntax tree. Its front end is exactly what our reader lacks:

- One named production for every KMN construct.
- Clear accept/reject decisions, line by line.
- Alignment with the compiler Keyman itself will ship.

It does not keep comments, whitespace or continuation lines (its lexer discards them). It also builds
its own tree, not our IR.

There is a second goal. The IR is meant to become a **hub in both directions**: every keyboard
format the studio reads goes in, and every format it writes comes out.

- **Inputs**:
  - KMN (this spec);
  - legacy platform-based CLDR keyboard XML (CLDR 43.1: #2599, importer in open PR #2625);
  - LDML Keyboard 3.0 (#2624);
  - MSKLC `.klc` (#2585), XKB symbols (#2586) and Apple `.keylayout` (#2587), under epic #2584.
- **Outputs**:
  - KMN, which stays a target and the primary one: it is the only full-fidelity target, and every IR
    construct must emit back to it;
  - LDML (spec 108);
  - later XKB, MSKLC and `.keylayout`.

Each format other than KMN can express a different subset, and some keyboard rules won't carry over
to every platform. The IR can only serve as that hub if the constructs that matter are **typed and
format-neutral**. Today many of
them are opaque text that only a KMN reader understands. Keyman's own planned shared conversion model
for `kmc-convert` (keymanapp/keyman #13339, unbuilt) points the same way.

This spec therefore does three things:

1. Replaces the reader with Keyman's grammar, with no change to the IR.
2. Adds comment preservation on top of that grammar.
3. Uses the grammar's typed productions to plan and land the IR changes that let exporters read
   constructs instead of re-parsing text, in two tiers: additive now, breaking by decision.

Writing the other formats' importers and exporters is out of scope; each has its own issue or spec.
This spec only makes sure the IR can receive from and serve all of them, and records what carries
over in each direction.

## User Scenarios & Testing *(mandatory)*

The "users" here are the studio's keyboard authors, who import and adapt keyboards, and the engine
consumers that read the IR: the validator, carve and rules steps, the recognizer and the exporters.

### User Story 1 - Import keeps working, now on Keyman's grammar (Priority: P1)

An author opens or copies any keyboard from the corpus. The studio reads the `.kmn` with the parser
adopted from Keyman's next-generation compiler instead of the homegrown reader. The author sees no
difference. The same rules, stores, groups and comments appear, the same constructs are flagged
as not editable, and download produces a keyboard that behaves identically.

**Why this priority**: This proves the front end on its own. Until it holds, no IR change can be
trusted, and on its own it already aligns the studio with Keyman's grammar.

**Independent Test**: Run old and new readers side by side over every `.kmn` in the `../keyboards`
corpus and over the codec's fixtures, and compare the IR each one produces (a differential test). The
existing round-trip and corpus test suites pass unchanged.

**Acceptance Scenarios**:

1. **Given** any corpus keyboard the current reader imports as Clean, **When** it is imported with
   the new parser, **Then** the import status is Clean and the resulting IR is equivalent to the old
   one under the codec's semantic comparison.
2. **Given** a keyboard containing a construct neither parser can type, **When** it is imported,
   **Then** that line is preserved verbatim as an opaque fragment with a specific named reason, and
   the rest of the keyboard imports normally.
3. **Given** a keyboard with a hard syntax error the current reader rejects, **When** it is imported,
   **Then** the import fails with a parse-failure status and a message naming the line, exactly as
   today (no try/catch hides it).

---

### User Story 2 - Comments survive the new parser as text (Priority: P1)

An author imports a keyboard whose source is heavily commented, with comments above rules, at the end
of rule lines and standing alone between sections. After editing and downloading, every comment the
author didn't delete is still there, verbatim, attached to the same rule or store, or in the same
place.

**Why this priority**: Keyman's parser throws comments away. Without this addition, adopting it would
be a fidelity regression on keyboards authors care about. Comments are also how corpus authors
document intent.

**Independent Test**: Import commented fixtures and corpus keyboards. Assert that every comment
appears in the IR as a text string with the same anchor (leading, trailing or freestanding) as the
current reader gives it, and that the emitted `.kmn` contains every comment.

**Acceptance Scenarios**:

1. **Given** a rule preceded by a comment line, **When** imported, **Then** the IR holds that comment
   as a leading comment anchored to the rule, with its text verbatim.
2. **Given** a rule or store line ending in `c some note`, **When** imported, **Then** the text is kept
   as that node's trailing comment and is re-emitted on the same line.
3. **Given** a comment between two groups, attached to nothing, **When** imported and re-emitted,
   **Then** it appears as a freestanding comment in the same position relative to its neighbours.
4. **Given** a line joined to the next with a `\` continuation and carrying a comment, **When**
   imported, **Then** both the logical statement and the comment are preserved.
5. **Given** an author deletes a rule in the carve step, **When** the keyboard is emitted, **Then** the
   rule's leading and trailing comments go with it, as today.

---

### User Story 3 - Exporters read typed constructs, not text (Priority: P2)

The LDML exporter, and later the other exporters, meets constructs that today reach it only as raw
text or opaque fragments: layer switching, platform conditions, option-store `set`/`save`/`reset`,
`call`, `return` and store `outs()`. With this story they arrive as typed IR members that the
grammar has already identified. The exporter maps each one or reports it as unsupported for that
target, without hand-matching `.kmn` text.

**Why this priority**: This is the payoff for spec 108 and the precondition for every later target.
It depends on Story 1.

**Independent Test**: For each newly typed construct, a fixture imports to the new IR member (not
`raw`, not a fragment) and round-trips through emit unchanged. The spec-108 classifier's text-matching
branches for these constructs can be replaced by switches on the typed member, with identical
classifier output on its fixtures.

**Acceptance Scenarios**:

1. **Given** a rule whose output is `layer('shift')`, **When** imported, **Then** the output holds a
   typed layer-switch element carrying `shift`, and the LDML classifier handles it from that element.
2. **Given** a rule guarded by `platform('touch')`, **When** imported, **Then** the context holds a
   typed platform-condition element.
3. **Given** a rule using `set(&layer = 'x')`, `save(opt)`, `reset(opt)` or `call(store)`, **When**
   imported, **Then** the whole rule is a typed rule (no longer an opaque fragment), its output holds
   the typed statement, and emit reproduces it.
4. **Given** a store containing `outs(other)`, **When** imported, **Then** the store item is a typed
   reference to the other store, and analyses that need the expanded content resolve it from the IR.
5. **Given** any newly typed construct, **When** a consumer that has not yet learned it switches over
   element kinds, **Then** the build fails at compile time (exhaustiveness), never silently at run time.

---

### User Story 4 - Every format knows what carries over, in both directions (Priority: P2)

A maintainer writing an importer or exporter can look up every typed IR construct in a single
format-capability table. It covers KMN, legacy CLDR, LDML, MSKLC, XKB and `.keylayout`. For each
construct and format the table gives two things, each with a reason:

- **Import**: whether the format can produce the construct when read.
- **Export**: whether the construct is mapped, approximated or not carried when written to that
  format.

KMN must be "mapped" for export on every row: a construct the IR can hold but can't write back to KMN
is a defect.

Authors are told which rules won't carry over in either direction, instead of getting a silently
thinner keyboard. That means rules lost on export, as spec 108 already reports for LDML, and source
constructs that couldn't be represented on import, as epic #2584 requires.

**Why this priority**: The end state is many formats in and many out through one IR, where some rules
won't transfer to every platform. Writing that knowledge down against the typed IR now stops each
importer and exporter from re-deriving it and drifting. It doesn't block Stories 1–3.

**Independent Test**: Every typed construct in the IR (each element kind and node field) has a row in
the capability table, with an import and an export status per format. A test fails when a new IR kind
is added without a row.

**Acceptance Scenarios**:

1. **Given** the IR's set of typed element kinds, **When** the capability check runs, **Then** each
   kind has an import and an export status for every listed format, and an IR kind with no row fails
   the check.
2. **Given** any row, **When** its KMN export status is anything but "mapped", **Then** the check
   fails: KMN is the full-fidelity target.
3. **Given** a construct a format cannot express (for example context-sensitive rules for MSKLC),
   **When** the table is read, **Then** its row says "not carried" for that format. The LDML export
   cells cross-link spec 108's mapping contract instead of restating it.
4. **Given** a construct only one source format has (for example LDML reorders, or `.keylayout`
   action states), **When** the table is read, **Then** it says whether the IR has a home for it
   today. If not, it says how an importer reports it, never that it is silently dropped.

---

### User Story 5 - Breaking IR restructure, by decision (Priority: P3)

Some changes the grammar makes possible are breaking contract changes. The most valuable is giving
each rule an explicit keystroke instead of hiding it after a synthetic `+` separator in its context.
These are planned in this spec with a full inventory of the consumers they affect. They are carried
out only once the decision below is ruled on.

**Why this priority**: These changes have the highest long-term value for multi-target export, but
they break about 48 consumers and need a joint session and a major contract version bump.

**Independent Test**: The consumer inventory lists every file that reads each affected shape, with
the change it needs, in the style of spec 103's `consumer-review.md`.

**Acceptance Scenarios**:

1. **Given** the ruling on this story, **When** planning proceeds, **Then** either the breaking
   changes are tasked here behind the joint-session gate, or they are split into their own spec, and
   this spec ships Stories 1–4 alone.

---

### Edge Cases

- **Constructs Keyman 19 removed** (`clearcontext`, `fix`, `switch`, `key` statements) or grammar
  versions before Keyman 19: the next-generation grammar does not accept them. Any corpus keyboard
  that still uses one keeps importing, with the construct preserved as an opaque fragment under a
  specific reason. It never becomes a parse failure.
- **Compile-target prefixes the IR doesn't model**: the grammar accepts five line prefixes (`$keyman`,
  `$keymanonly`, `$keymanweb`, `$kmfl`, `$weaver`). The IR's target selector has three. Lines with
  `$kmfl:` or `$weaver:` stay opaque fragments with their own reason. They are not added to the
  contract.
- **Old-style headers** (`NAME "..."`, `VERSION 5.0`, `HOTKEY`) and caps-lock headers: these are typed
  by the grammar, and keep today's IR treatment (header fields or store directives), so emit doesn't
  change.
- **Keyword case and spelling**: KMN keywords are case-insensitive. The IR keeps the source spelling
  of every name (stores, groups, deadkeys, layers) exactly as today. The grammar's tokens carry the
  original text, so this is preserved.
- **A comment inside a statement spread over continuation lines**: the comment is kept and anchored to
  the logical statement. It is never lost because continuation lines were merged.
- **A `c` that is not a comment** (inside a quoted string, or a key name such as `[K_C]`): it is not
  taken as a comment, matching today's behaviour.
- **A grammar-rejected line inside a group**: the opaque fragment records which group contains it, so
  position-faithful emit puts it back in the same group.
- **Lines the old reader typed but the new grammar rejects**: this regression must be named. It is
  either fixed in the lowering step or allow-listed with a reason in the corpus gate. It never
  disappears silently into a generic reason.
- **Upstream parser changes after the pinned snapshot**: the vendored copy does not change until it is
  deliberately re-synced. A re-sync reruns the corpus gate.
- **A keyboard made entirely of opaque fragments**: it imports as clean-with-opaque, as today.

## Requirements *(mandatory)*

### Functional Requirements

**Front end (Story 1)**

- **FR-001**: The codec MUST read `.kmn` source with the lexer, grammar and recursive-descent parser
  from Keyman's next-generation compiler (keymanapp/keyman, branch
  `feat/developer/13349-kmc-kmn-next-generation-smbuilder`, folder
  `developer/src/kmc-kmn/src/ng-compiler`), then lower the resulting syntax tree into `KeyboardIR`.
  The codec's public entry point, `parse(text, keyboardId)`, and its result shape stay unchanged.
- **FR-002**: Only the parser front end is adopted: the lexer, scan recognisers, token types, token
  buffer, recursive-descent rules, tree construction, tree rebuilding, node types and the grammar
  file. Its KMX builder and analysers are not adopted.
- **FR-003**: The adopted code MUST be a vendored snapshot pinned to a recorded upstream commit
  (initially `fb7afff889c26161c8233edb46192dfdb0dec8e6`). It MUST carry Keyman's MIT attribution, a
  record of its source and commit, and a stated policy for re-syncing. It is replaced by the published
  package once Keyman ships the parser in a release, and that switch reruns the corpus gate (FR-030).
- **FR-004**: The parser's syntax tree and node types MUST stay internal to the codec. They are not
  exported from the engine, and no consumer outside the codec may read them (Art II: consumers read
  `KeyboardIR`). A dependency rule MUST enforce this boundary.
- **FR-005**: The emitter MUST NOT change for Story 1. Emitting the IR produced by the new parser MUST
  give the same `.kmn` as emitting the IR produced by the old parser for the same source.
- **FR-006**: A source line the grammar rejects, or that the lowering step can't map to a typed node,
  MUST become a `RawKmnFragment` holding the line verbatim. Parsing MUST then continue with the next
  line. Only a source the current reader also treats as a hard syntax error may produce a
  parse-failure status.
- **FR-007**: Every opaque fragment MUST carry a specific named reason from the codec's catalogue of
  opaque reasons. Reasons the old reader used keep their names where the construct is the same. New
  rejection classes (constructs Keyman 19 removed, unsupported compile targets, and other
  grammar-reject classes found in the corpus) each get their own reason. A single catch-all reason
  MUST NOT be used for grammar rejections.
- **FR-008**: The old reader MUST stay available as the reference for the side-by-side comparison
  until the corpus gate (FR-030) passes. It is removed in the same change that makes the new parser
  the only reader.

**Comments (Story 2)**

- **FR-010**: The front end MUST keep every comment in the source as a verbatim text string. Comments
  MUST NOT be discarded by the lexer.
- **FR-011**: Comment text MUST be captured together with its source position (line and column),
  alongside the token stream the grammar consumes. The grammar itself still sees no comments, so the
  grammar file stays identical to upstream.
- **FR-012**: The lowering step MUST attach each comment using the IR's existing anchoring model and
  the same rules the current reader uses:
  - **leading**: directly before a rule or store;
  - **trailing**: at the end of a rule or store line, kept on the node;
  - **freestanding**: everything else, kept in position.
  The existing comment fields (`IRComment` text, anchor, anchor reference and source line, and the
  trailing comment on rules and stores) MUST keep their shapes.
- **FR-013**: Line continuations MUST be handled so that a statement split over several lines lowers
  to one IR node, and any comment on those lines is still captured.
- **FR-014**: Whether comments are captured by changing the vendored lexer or by wrapping it is a
  plan-phase decision. Whichever is chosen MUST be recorded, and if it is a change to the vendored
  code, it MUST be listed in the re-sync policy and offered upstream.

**Additive IR typing (Story 3, Tier A: non-breaking)**

- **FR-020**: The following constructs, which today arrive as `raw` elements or whole-rule opaque
  fragments, MUST become typed IR members. Each is an additive optional union member, the same change
  shape as `useGroup` and spec 103's `if`:
  - Output: layer switch `layer('x')`.
  - Output: option and system store statements `set(store = value)`, `save(store)`, `reset(store)`.
  - Output: `call(store)` and `return`.
  - Context: platform condition `platform('x')`.
  - Store item: store reference `outs(store)`.
- **FR-021**: A rule containing only constructs typed by FR-020, together with ones that were already
  typed, MUST import as a typed rule, not an opaque fragment. The corresponding opaque reasons stop
  being produced for those rules.
- **FR-022**: Every new member MUST round-trip: parse, then emit, gives back the construct, and the
  codec's semantic round-trip comparison treats it as equal.
- **FR-023**: Every new member MUST be added to the contract's runtime schema in the same change,
  bound by the existing compile-time drift guards.
- **FR-024**: Every consumer that switches over element kinds MUST handle the new members, and
  exhaustiveness checks MUST fail the build for any consumer that doesn't. The plan MUST list these
  consumers, in the style of spec 103's consumer review.
- **FR-025**: This spec MUST NOT change spec 103's ruling. A `<>` comparison and an `if()` that is not
  at the head of the context stay opaque, as spec 103 FR-003 says. If the new grammar makes typing them
  cheap, that is proposed as an amendment to spec 103, not done here.
- **FR-026**: Spec 108's LDML classifier MUST switch from matching the text of `raw` elements and
  fragments to reading the new typed members for the FR-020 constructs, with identical classifier
  output on its fixtures. Its mapping contract rows that cite those constructs as raw or opaque MUST
  be updated.

**Multi-target capability (Story 4)**

- **FR-027**: The spec's planning artifacts MUST include a format-capability table listing every typed
  IR construct, each element kind and the relevant node fields. Each row gives an **import** status
  (can reading this format produce the construct?) and an **export** status (mapped, approximated or
  not carried, with a one-line reason) for each format:
  - **KMN** (input and output): export is always "mapped", with the emitter as evidence. KMN is the
    primary, full-fidelity target and stays one.
  - **Legacy CLDR keyboard XML** (CLDR 43.1; input only): import cells cite the #2599 importer's
    mapping.
  - **LDML Keyboard 3.0** (input and output): export cells cross-link spec 108's mapping contract;
    import cells cover #2624.
  - **MSKLC `.klc`**, **XKB symbols**, **Apple `.keylayout`** (input and output).
- **FR-028**: An automated check MUST fail in either of two cases:
  - an IR element kind or typed node field has no row in the capability table;
  - a row's KMN export status is not "mapped".
- **FR-029**: The capability table is planning data only. This spec MUST NOT add an importer or
  exporter for any format other than KMN, or any studio surface for them. The existing LDML exporter
  (spec 108) changes only as FR-026 says.
- **FR-029a**: The table MUST also list each source-format construct that has **no** IR home today
  (for example LDML reorders and markers, `.keylayout` action states, XKB levels beyond four). Each
  entry says whether it should get one (a Tier A or Tier B candidate) or stay reported at import.

**Gates**

- **FR-030 (corpus gate)**: Before the new parser becomes the only reader, a corpus comparison over
  every `.kmn` in the `../keyboards` fork (the project's canonical corpus) and the codec's fixtures
  MUST show all of the following:
  - no keyboard's import status gets worse;
  - no opaque-reason count rises, except rises named in an allow-list with a reason for each (for
    example, constructs Keyman 19 removed);
  - comment counts and anchors are unchanged;
  - all existing round-trip and corpus tests pass without changes to their expectations.

  The comparison's results MUST be committed as evidence.
- **FR-031**: A spike MUST run first, in the plan phase: Keyman's parser over the whole corpus,
  comparing which lines it rejects with which lines the current reader makes opaque. Its findings size
  FR-006, FR-007 and the allow-list.

**Breaking IR restructure (Story 5, Tier B)**

- **FR-040**: The plan MUST inventory the breaking IR changes the grammar enables, with every
  affected consumer and the change each one needs. At least these:
  - **B1**: an explicit keystroke on each rule (the grammar's `keystroke` production), replacing the
    synthetic `+` separator in the rule's context;
  - **B2**: the grammar's left-hand-side shape (`match`/`nomatch` or an input block with leading
    `nul` and condition statements) as one typed field, replacing today's split representation;
  - **B3**: any further reshaping the format-capability table (FR-027) shows is needed so a
    rule's physical key and modifier state can be read without KMN knowledge.
  - **B4**: a format-neutral opaque node. Today `RawKmnFragment` holds KMN source text and is stamped
    `origin: "imported"`. An importer reading LDML, `.klc`, XKB or `.keylayout` has no faithful way to
    preserve a construct it can't map. The candidate change is a fragment that records its source
    format and source text, so non-KMN importers can preserve and report instead of dropping. This
    change interacts with KMN emit, because a non-KMN fragment can't be emitted to KMN verbatim; the
    plan must say how emit and the capability table's KMN invariant treat it.
- **FR-041**: Tier B changes MUST NOT be implemented without the ruling recorded below and a joint
  engine and content session, with a major version bump of the contracts package.
  [NEEDS CLARIFICATION: Should Tier B (explicit rule keystroke, typed left-hand side) be scheduled
  inside this spec behind the joint-session gate, or split into its own follow-on spec once Stories 1–4
  have shipped?]

### Key Entities

- **Vendored ng parser**: Keyman's lexer, grammar and recursive-descent parser at a pinned commit.
  Produces a syntax tree that exists only inside the codec.
- **Comment side-channel**: the comment strings (with line and column) and continuation markers that
  the grammar doesn't see, kept by the front end for the lowering step.
- **Lowering step**: walks the syntax tree and the comment side-channel and produces `KeyboardIR`.
  It turns rejected or unmappable lines into opaque fragments with specific reasons.
- **KeyboardIR (extended)**: today's contract plus the Tier A additive members (layer switch, store
  statements, call/return, platform condition, store reference).
- **Opaque-reason catalogue**: the named reasons a fragment can carry. It gains specific reasons for
  grammar-rejection classes.
- **Format-capability table**: one row per typed IR construct, giving import and export status per
  format: KMN (export always mapped), legacy CLDR (import only), LDML, MSKLC, XKB and `.keylayout`.
  It also lists source-format constructs that have no IR home yet.
- **Corpus comparison evidence**: per-keyboard import status, per-reason opaque counts and comment
  counts under both readers, plus the allow-list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of corpus keyboards import with the same or better status under the new parser than
  under the current reader.
- **SC-002**: Zero unexplained opaque fragments. Every per-reason count is equal or lower, except
  allow-listed rises, and each allow-list entry names its construct and reason.
- **SC-003**: 100% of source comments in the corpus and fixtures survive import and emit, with the
  same text and anchor as today.
- **SC-004**: Every keyboard that downloads today downloads after the change with identical
  keystroke behaviour, as judged by the existing round-trip checks.
- **SC-005**: The rules made opaque today only by the FR-020 constructs (whole-rule fragments for
  `set`/`save`/`reset`/`call`) become typed rules. The corpus count of those fragments drops to zero,
  apart from rules that also hold a construct still out of scope.
- **SC-006**: The LDML exporter recognises layer switches, platform conditions and option-store
  statements with no text matching on `.kmn` syntax.
- **SC-007**: Every typed IR construct has a capability row with import and export status for all six
  formats (KMN, legacy CLDR, LDML, MSKLC, XKB, `.keylayout`), and every KMN export status is "mapped".
  The check that enforces this passes.
- **SC-008**: The reader's grammar is the same grammar Keyman's own next-generation compiler uses. Any
  local change to the vendored parser is listed and has been offered upstream.

## Assumptions

- Keyman's parser branch keeps an MIT licence and stays usable as a snapshot. Its later churn doesn't
  affect us until a deliberate re-sync.
- The `../keyboards` fork's `master` is the corpus for the gate, as for the other corpus-calibrated
  tests.
- Byte-identical round-trip stays out of scope (v1). "Unchanged emit" means what the existing
  round-trip tests and semantic comparison measure today.
- Touch layouts (`.keyman-touch-layout`) and visual keyboards (`.kvks`) keep their current readers;
  this spec covers `.kmn` only.
- Validation keeps using the WASM `kmcmplib` oracle. The adopted parser is a reader for the IR, not a
  compiler or validator, and adds no step to the D3 debounce cycle.
- Reading a keyboard that is mostly opaque today does not need to get faster. A performance target
  is "no slower than today's reader on the largest corpus keyboard", checked in the plan phase.
- Importers and exporters for formats other than KMN are owned by their own issues or specs:
  - legacy CLDR: #2599 (open PR #2625, which already builds IR and emits `.kmn`);
  - LDML: import #2624, export spec 108;
  - MSKLC, XKB, `.keylayout`: #2585, #2586, #2587 under epic #2584.

  This spec only makes sure the IR can receive from and serve them, and records what each can carry.
  Where an importer lands before this spec's Tier A members, it maps onto today's IR, and its
  capability cells are revisited when Tier A lands.
- Spec 113's Layout tab and spec 108's exporter are live consumers of the IR. Tier A changes reach them
  as additive members, and only spec 108's classifier is changed by this spec.
