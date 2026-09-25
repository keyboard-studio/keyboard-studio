# Feature Specification: Rule behaviours — managing reorder, blocking, and context rules as intents

**Feature Branch**: `076-rule-behaviours`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "One of the more powerful tools of Keyman is the ability to do text reordering. This is the main thing that sets Keyman apart from Google, Microsoft and Mac keyboards. At this point we have no method for managing rules that reorder text, or any other sort of rule like rules that block outputs on diacritics. This is a major gap that will be a concern for the Keyman team. I want a way to more simply manage these other types of rules that go beyond inputs. One convenience feature I want is outputting nulls for invalid inputs: a key not defined in the keyboard that would otherwise fall through to the underlying keyboard, or a combination that is just not allowed, like a diacritic on a number or a consonant that is not allowed one in the writing system."

**Governing context**: [spec.md](../../spec.md) §3c (defaults are the product — propose-then-confirm; a derivable-but-blank decision point is a defect), §5a (the KeyboardIR is the spine; every mutation operates on the IR, never on `.kmn` text), §9 (three-group routing and the reorder-priority order: adopt the base's scheme, else auto-emit NFD for Latin, else a curated gallery for non-Roman; CJK and Ethiopic render a "not yet supported" stub), §10 (validator layering), §16 (out of scope: CJK/Ethiopic reorder, Hangul cluster assembly, survey-editing opaque `RawKmnFragment`s; a raw-KMN editor is a v1.1 candidate). Strategy linkage is governed by [007-strategy-selection](../007-strategy-selection/spec.md) (axes A1–A7, catalog S-01..S-12, §7.5 self-check table); the Pattern contract by [005-pattern-schema](../005-pattern-schema/spec.md). This feature is the mechanism behind [002-defaults-engine](../002-defaults-engine/spec.md) User Story 4 (Phase C' pre-selects a script family's reorder pattern with provenance): 002 US4 states the *what*, this spec the *how*; where the two differ, this spec governs the mechanism and 002 the ranking rule, and 002 US4 should gain a pointer here when this lands. Precedents this feature generalises: the mark-guard rule synthesis that implements [071-marks-question-series](../071-marks-question-series/spec.md) (the swallow/unwrap vocabulary is in [docs/design-notes/mark-composition-model.md](../../docs/design-notes/mark-composition-model.md)), the context-variant generation of [062-canonical-context-tolerance](../062-canonical-context-tolerance/spec.md), and the key↔rule role classification of [063-touch-key-editor](../063-touch-key-editor/contracts/touch-key-rule-join.md).

## Why this exists

The studio can make a keyboard that types. It cannot yet make a keyboard that *behaves*.

Every step in the current flow produces rules of one shape: a key produces a string. That is the part of a Keyman keyboard an operating-system layout could also do. What an OS layout cannot do, and what every non-trivial keyboard in the corpus does by hand, is react to context: store marks in canonical order however they were typed, put a Myanmar vowel after the consonant the typist pressed it before, refuse a second tone mark on a vowel that already has one, swallow a diacritic pressed after a digit, and produce nothing at all for a key the keyboard never defined instead of leaking the host layout's character into the text. The corpus check that grounds this spec found 82 released keyboards that enumerate undefined keys to `nul`, and a whole family (FirstVoices, Pasifika) that guard marks with `any(NonLetters) + any(AccentKeys) > context beep`. Myanmar, Khmer, Thai/Lao, Hebrew and Indic keyboards all carry reorder or blocking groups. None of that is reachable from the studio.

Three facts shape the answer.

**The author must not be handed a rule editor.** §3c is explicit: the studio's value sits in the defaults, not the override controls, and a blank decision point where a default was derivable is a defect. A form where a non-programmer composes `any()`/`index()` rules is that blank decision point wearing a nicer shirt, and §16 already defers the raw-KMN editor to v1.1. What the author knows is the *intent*: "a tone mark replaces the previous one", "marks only go on letters", "this keyboard is closed". The studio knows how to spell that in `.kmn`.

**Most of the machinery exists.** The codec already types `any`, `notany`, `index`, numeric deadkeys, `beep`, `use()`, and group flags. Three narrow generators already turn an intent into owned rules: the mark guards of spec 071 emit swallow and unwrap rules, the touch rule synthesis of spec 063 emits guard and case-triple rules, and spec 062 emits context variants. The simulator runs the real KeymanWeb processor, so a proposed behaviour can be *proven* on a test string, not just emitted. The Pattern contract already carries `category: "reorder"` and an unused `reorderRules` slot, and four reorder patterns exist with their real rules hidden in opaque slots.

**The codec cannot yet see the vocabulary this feature needs.** `nul`, `context` and `context(N)` in output position fall to an untyped fallback; `context(N)` with N greater than one in context position is opaque; the `begin` entry group is dropped on parse and rebuilt on emit, and the `NewContext`/`PostKeystroke` entry points are not modelled, so a keyboard's group topology does not round-trip faithfully; named deadkeys are opaque. Until those close, a reorder rule survives round-trip but cannot be inspected, and a behaviour cannot be recognised on import.

This feature therefore introduces **behaviours**: a small, closed set of typed, intent-level records that compile to rules the IR owns, that the studio proposes per script with provenance, that the author confirms or narrows, and that the simulator demonstrates before and after. Rules the set cannot express stay exactly where they are today, as opaque fragments the author can see and remove but not edit.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invalid input produces nothing (Priority: P1)

An author building a Yoruba keyboard on a US base wants two guarantees: a key the keyboard does not define produces nothing, rather than the host layout's character, and a tone mark pressed after a digit, a space, or punctuation is swallowed rather than stacked on it. Arriving at the Behaviours step they find both already proposed as cards: "Closed keyboard: undefined keys produce nothing" and "Marks attach only to letters". The second card lists the carriers it derived (letters of the Latin script the keyboard emits) and lets the author narrow tone marks to vowels. A test pane below shows `5` followed by the acute key staying `5`, and an unbound key producing nothing while Backspace still deletes.

**Why this priority**: It is the feature the user named first, the highest-frequency idiom in the corpus, and the simplest to compile and verify. It delivers value alone.

**Independent Test**: Instantiate a Latin base, accept both proposed cards, download the `.kmp`, and confirm in the simulator that an unbound key emits nothing, Backspace still deletes, `5`+acute stays `5`, and `a`+acute yields `á`.

**Acceptance Scenarios**:

1. **Given** a working copy with keys bound on default and shift layers only, **When** the Behaviours step opens, **Then** a "closed keyboard" card is proposed whose undefined-key set is the printable virtual-key set on those two layers minus every key the IR already matches, and frame keys (Backspace, Enter, Tab, Escape, arrows, Delete) are never in it.
2. **Given** the closed-keyboard card is accepted, **When** the author later binds a previously undefined key in the key editor, **Then** the behaviour recompiles and that key leaves the swallow set without author action.
3. **Given** the keyboard emits digits, space, and ASCII punctuation, **When** the "marks attach only to letters" card is proposed, **Then** its non-base set is exactly the non-letter characters the keyboard emits, its carrier set is the letters of the keyboard's script(s), and the provenance line says the carrier set was derived from Unicode General Category, not validated linguistically.
4. **Given** the author narrows tone marks to vowels, **When** `b` then a tone key is typed in the test pane, **Then** the output is `b` and the trace names the behaviour that blocked it.
5. **Given** the A6 answer is "loud", **When** either card compiles, **Then** the rules end in `context beep`; with "soft" or unanswered, the closed-keyboard rules end in `nul` (nothing but the key was matched) and the marks-on-letters rules end in `context` (the matched base character is re-emitted, so `5` stays `5`).
6. **Given** a Latin base where the working copy rebinds only a few keys (a sparse overlay), **When** the step opens, **Then** the closed-keyboard card is proposed in the declined state with a note that undefined keys currently fall through to the host layout and closing the keyboard removes that access; on a non-Latin base it is proposed in the accepted state.

---

### User Story 2 - A mark replaces rather than stacks (Priority: P1)

A Vietnamese or African-tone author answered A4 "replacing / cycling" in the survey. The Behaviours step proposes "Pressing a tone key on a vowel that already has a tone replaces it". Accepting it means `é` followed by the grave key becomes `è`, not `é̀`. The test pane demonstrates the minimal pair.

**Why this priority**: It closes the most common Latin-script complaint the studio cannot answer today and follows directly from a survey axis the studio already asks.

**Independent Test**: Instantiate a base, answer A4 as cycling, accept the card, and confirm `e` acute grave yields `è` in the simulator.

**Acceptance Scenarios**:

1. **Given** A4 = replacing/cycling and a confirmed mark inventory, **When** the step opens, **Then** a `replace` card is proposed listing the mark family and its carriers.
2. **Given** the card is accepted, **When** a vowel carrying mark A is followed by the key for mark B of the same family, **Then** the stored result is the vowel with B only.
3. **Given** A4 = stacking, **When** the step opens, **Then** no `replace` card is proposed and the "none needed" entry states why.

---

### User Story 3 - Marks are stored in canonical order (Priority: P2)

A Greek polytonic or Hebrew author types breathing then accent on one attempt and accent then breathing on the next. The studio proposes "Store marks in Unicode canonical order however they are typed", derived from combining classes, and labels it as mechanically derived. Accepting it adds a post-processing group that reorders marks on output.

**Why this priority**: It is the one reorder need Unicode data can derive without judgment, and it fulfils §9's "auto-emit NFD for Latin" priority for the first time.

**Independent Test**: Accept the card on a Greek base; in the simulator type a vowel, acute, then diaeresis in both orders and confirm identical code-point output.

**Acceptance Scenarios**:

1. **Given** a keyboard emitting two or more combining marks with distinct **non-zero** canonical combining classes, **When** the step opens, **Then** a `canonicalOrder` card is proposed showing the derived order, the Unicode version it was computed against, and the statement that marks sharing a class keep their typed order.
4. **Given** a Thai, Lao, or Khmer keyboard (whose vowel and tone signs carry combining class zero), **When** the step opens, **Then** no `canonicalOrder` card is proposed; the none-needed entry points to the visual-to-logical table of User Story 4 instead.
5. **Given** a Vietnamese inventory where the vowel modifiers and tone marks share combining class 230, **When** the step opens, **Then** any `canonicalOrder` card states that modifier-before-tone order is not enforced by it and is handled by the `replace` behaviour.
2. **Given** the card is accepted, **When** marks are typed in any order on one base, **Then** the stored sequence is in canonical order.
3. **Given** the base keyboard already contains a reorder group the recogniser lifts, **When** the step opens, **Then** the base's scheme is proposed first and the Unicode-derived one is not offered as a competing default (§9 priority 1 over priority 2).

---

### User Story 4 - Visual typing order becomes logical storage order (Priority: P2)

A Myanmar or Khmer author types in the order the eye sees. The Behaviours step offers a curated `reorderTable` from the gallery for that script ("Myanmar visual-order typing", "Khmer coeng ordering") with rows the author can read as "typed X then Y stores as Y X". The studio never invents these rows; it offers the gallery entry and, on Track 2, whatever the imported keyboard already did.

**Why this priority**: It is the core of the "Keyman differentiator" argument and the hardest to get right; §9 already prescribes the curated-gallery route, so the risk is bounded.

**Independent Test**: Instantiate a Myanmar base without a reorder group, accept the gallery table, and confirm in the simulator that a pre-base vowel typed before its consonant is stored after it.

**Acceptance Scenarios**:

1. **Given** a script with a gallery `reorderTable`, **When** the step opens, **Then** the table is proposed with its provenance (which released keyboards use it) and rows are shown longest-first.
2. **Given** the script is CJK, Ethiopic, or Hangul, **When** routing runs, **Then** the Behaviours step is never reached and the existing "not yet supported" stub is shown (§16 unchanged).
3. **Given** a Track 2 import whose base contains reorder rules the recogniser cannot lift, **When** the step opens, **Then** those rules remain as opaque Advanced fragments, are counted, and no gallery table is proposed over them without an explicit warning that it would coexist with unrecognised reordering.

---

### User Story 5 - Context-conditioned output (Priority: P3)

An author wants "after `n`, the `g` key produces `ŋ`". The step offers a `contextOutput` card the author fills from the confirmed inventory: a context character or class, a key, and an output. One hop only. Unlike the other kinds this is an **opt-in authoring affordance**, not a propose-then-confirm default: the studio has no data from which to derive it, so it sits under an explicit "add a context rule" entry after the proposed cards, never as a blank first screen.

**Why this priority**: Frequent in practice but already partially served by the context-sensitive-substitution pattern; the behaviour form mainly gives it verification and IR ownership.

**Independent Test**: Add the card, type `n` then `g`, confirm `ŋ`; type `a` then `g`, confirm `ag`.

**Acceptance Scenarios**:

1. **Given** a context class and a key, **When** the card is accepted, **Then** a single rule is compiled, owned by the behaviour, placed before the key's plain binding so it is not shadowed.
2. **Given** the plain binding for that key is later removed, **When** recompilation runs, **Then** the behaviour is flagged as orphaned rather than silently kept.

---

### Edge Cases

- A behaviour's compiled rule would shadow, or be shadowed by, an existing author-modified rule. The compiler places behaviour rules deterministically (guards and blocks after real bindings, reorder groups after `main`) and Layer B reports any remaining shadowing.
- The author edits a compiled rule directly in the Advanced view. The rule's owning behaviour is marked author-modified and the card shows "edited by hand; recompile will overwrite" before any recompile, matching the `authorModified` precedent on patterns.
- The base keyboard already defines the RALT layer. `swallowUndefined` includes RALT combinations only when the IR already binds at least one key on that layer, so a keyboard that never uses RALT does not start swallowing AltGr characters. Enumeration grows multiplicatively with each modifier layer included; the compiler reports the store size on the card.
- A mark's carrier set is empty after narrowing. The card refuses to compile and says so.
- Unicode data version differs from the one a saved behaviour records. The card shows a drift notice; nothing recompiles silently.
- The imported keyboard uses `nomatch > nul` in `main`. The recogniser does not lift it to `swallowUndefined`; it stays as an opaque fragment with a lint note explaining that the idiom also swallows Backspace, Enter, and navigation keys (three released keyboards use it). `nomatch > use(...)` chaining a guard group into `main` is a different idiom and is left alone.
- The keyboard has no marks at all. The marks-related cards are not proposed; the step still shows the explicit "no mark behaviours needed for this inventory" entry so the decision is visible (§3c).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The contracts package MUST define a closed set of behaviour kinds — `swallowUndefined`, `markOnNonBase`, `block`, `replace`, `canonicalOrder`, `reorderTable`, `contextOutput` — as canonical TypeScript types mirrored by zod schemas under the existing compile-time drift guards.
- **FR-002**: Every rule compiled from a behaviour MUST carry an additive optional ownership marker on the `IRRule` (`ownedByBehaviour`, a sibling of the existing `ownedByPattern` string, not a replacement of it, since a discriminated union would be a breaking IR change) so it can be recompiled, removed, and displayed by owner. The two markers MUST be mutually exclusive on one rule.
- **FR-003**: Behaviours MUST compile to and from the KeyboardIR only. No behaviour operation may read or write `.kmn` text.
- **FR-004**: The codec MUST type `nul`, `context`, and `context(N)` in output position and `context(N)` for N greater than one in context position, and MUST model the set of `begin` entry points (`Unicode`/`ANSI`, `NewContext`, `PostKeystroke`) on the IR header so a keyboard with more than one entry group round-trips without the emitter rebuilding a single entry. `NewContext` and `PostKeystroke` groups are `readonly` and MUST NOT be used as reorder hooks; they are modelled for fidelity only.
- **FR-005**: `swallowUndefined` MUST enumerate the printable virtual-key set across the modifier layers the IR already uses, minus every key-and-modifier the IR matches, into one store, and MUST never include frame keys (Backspace, Enter, Tab, Escape, Delete, navigation). It MUST NOT compile to `nomatch > nul`, which also swallows frame keys. It MUST recompile whenever a key binding is added or removed. Because Keyman deliberately passes undefined keys to the host layout on desktop, the card MUST state that cost, and MUST be proposed declined for sparse Latin overlays and accepted for non-Latin scripts (User Story 1, scenario 6).
- **FR-006**: `markOnNonBase` MUST derive its default carrier set from the letters of the keyboard's script(s) (General Category L*, which correctly keeps Arabic tatweel U+0640 as a carrier and excludes Hebrew maqaf U+05BE until the author adds it) and its non-base set from the characters the keyboard actually emits, MUST allow per-mark-family narrowing, and MUST label the derived default as mechanically derived. Generated stores MUST follow the corpus naming idiom (lowercase, descriptive, e.g. `carriers`, `accents`), and the compiler MAY use `notany(carriers)` in place of an enumerated non-base store.
- **FR-007**: `canonicalOrder` MUST derive mark order from Unicode canonical combining classes, record the Unicode version used, and land in a plain post-processing group (no `using keys`, not `readonly`) reached by chaining from the end of `main` via `use()`, the idiom that works on desktop and KeymanWeb alike. It MUST be proposed only when the inventory has two or more marks with distinct non-zero combining classes, MUST NOT be proposed for scripts whose marks carry class zero (Thai, Lao, Khmer), and MUST disclose that marks sharing a class keep their typed order.
- **FR-008**: `reorderTable` MUST be populated only from the curated gallery or from rules recognised in the base; the studio MUST NOT synthesise visual-to-logical tables from Unicode data.
- **FR-009**: The loud/soft choice for every blocking behaviour MUST follow the A6 survey answer, defaulting to soft. Soft compiles to `nul` only when the rule matches nothing but the key (`swallowUndefined`); for any rule whose left-hand side consumes context (`markOnNonBase`, `block`) soft compiles to `context`, so the matched characters are re-emitted, and loud compiles to `context beep`. `nul` on a context-bearing rule deletes the context and is a compiler error for these kinds.
- **FR-009a**: `replace` MUST build its detection and output stores as same-length, position-aligned arrays and MUST fail closed (no rule emitted, card shows why) when the confirmed inventory cannot be zipped one to one, since `index()` is positional.
- **FR-010**: The studio MUST present behaviours as proposed cards in a dedicated Behaviours step, each with provenance (base-derived, Unicode-derived, or gallery), and MUST include explicit "none needed" entries so no decision is silent.
- **FR-011**: Each card MUST offer a test pane that runs the working copy through the simulator, showing typed keys, stored code points, rendered glyphs, and the name of any behaviour that blocked or reordered input. The pane MUST reuse the compiled artifact already produced by the working copy's single 300 ms cycle and MUST NOT trigger its own compile or debounce (decision D3). Simulation runs only after that cycle's compile succeeds; on a compile error the pane shows the blocking diagnostic instead of stale output, consistent with the suppression rule in §10.
- **FR-012**: On Track 2 import, the engine MUST attempt to recognise existing rule sets as behaviours; rules it cannot lift MUST remain as opaque fragments, counted and visible, never dropped. Lifted rules MUST stay in place unchanged until the author confirms the behaviour, so parse-completeness and ownership traceability (Layer A' checks I1 and I6) hold throughout. This recogniser is new scope beside the existing pattern-shape recogniser, not an extension of it.
- **FR-013**: Routing MUST keep CJK, Ethiopic, and Hangul out of the Behaviours step, reusing the existing unsupported-script stub.
- **FR-014**: Validation MUST extend existing layers rather than add a Layer B check: Layer A check #11 (unreachable rules, WASM oracle) MUST name the owning behaviour when a shadowed rule is behaviour-owned; Layer A' ownership consistency (I6) MUST cover `ownedByBehaviour`; and Layer A check #8's context-ordering scan MUST flag `nul` emitted on a context-bearing rule (FR-009).
- **FR-015**: `if()`/`set()`/`platform()` chains, `outs()`, multi-hop conditioned rules, touch-layer state machines, and multitap MUST remain opaque; this feature does not add a raw-KMN editor.
- **FR-016**: The strategy framework MUST be extended additively and minimally. One new derived axis, **A8 output-order constraint** (`none` / `canonical-order` / `visual-to-logical`), elicited from combining-class detection or base/gallery recognition rather than asked of every author, and one new secondary-only strategy (S-14, canonical-order or visual-to-logical fix-up group) added by a new secondary-adding rule after rules 9 and 10. The §7.5 table gains an A8 column (value `none` on every existing row) and one or two new fixture rows; no existing §7.2 primary rule or existing §7.5 row value changes. Soft suppression is A6 plus the existing §7.4.B `nul` building block and needs no new strategy; `contextOutput` is S-09 territory and needs no new axis. Only `canonicalOrder` and `reorderTable` behaviours carry a `strategyId`.
- **FR-017**: The Pattern contract MUST gain only additive optional fields (a `ruleKind` discriminator). The existing `reorderRules` field, which three of the four reorder patterns already populate but nothing reads, MUST be consumed: the `canonicalOrder` and `reorderTable` compilers are its reader. Additive under §17; no major version bump.
- **FR-018**: Any keyboard cited as a fixture or exemplar by this feature MUST have a row in [docs/keyboard-index.md](../../docs/keyboard-index.md) in the same change.

### Key Entities

- **Behaviour**: An intent-level record with a kind, an id, its parameters (character classes drawn from the confirmed inventory, carrier sets, position-aligned store pairs, table rows, loud/soft per FR-009), a provenance (base / unicode / gallery / author), a Unicode version where derived, and a confirmation state (proposed / accepted / narrowed / declined).
- **Owned rule**: An `IRRule` whose ownership marker names the behaviour that compiled it. Recompiling a behaviour replaces exactly its owned rules.
- **Behaviour compiler**: One per kind; takes a behaviour plus the working copy IR and returns the owned rules and their placement (group, position). Generalises the existing mark-guard and touch-rule generators.
- **Behaviour proposer**: Produces the per-script default set from the base IR, Unicode data, gallery priors, and survey answers, with provenance, including explicit none-needed entries.
- **Behaviour recogniser**: Lifts rule sets in an imported IR into behaviours when they match a kind exactly.
- **Gallery reorder table**: A curated, script-keyed set of `reorderTable` rows with the released keyboards that evidence them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An author can accept a closed-keyboard and a marks-on-letters behaviour on a Latin base and download a working `.kmp` in under two minutes, without seeing a line of `.kmn`.
- **SC-002**: For each behaviour kind, at least one minimal-pair test runs green through the simulator in CI (undefined key emits nothing while Backspace deletes; `5`+acute stays `5`; `é`+grave yields `è`; two-mark input in either order stores canonically (Greek or Hebrew, not Thai, whose marks carry class zero); a gallery pre-base vowel stores after its consonant; `n`+`g` yields `ŋ`).
- **SC-003**: Round-trip fixtures for `khmer_angkor`, `sil_myanmar_my3`, `sil_hebrew`, `lao_2008_basic`, `el_pasifika`, and `vietnamese_telex` show no increase in opaque fragment count after the codec changes, and a strict decrease for output-position `nul`/`context(N)`.
- **SC-004**: Importing `lao_2008_basic` and `el_pasifika` lifts their tone-blocking and mark-guard groups into `block` or `markOnNonBase` behaviours with zero rules dropped.
- **SC-005**: The Behaviours step never shows an empty list: every script class yields at least one proposed card or one explicit none-needed entry.
- **SC-006**: The §7.5 self-check table remains fully consistent after the additive strategy changes (no existing row amended), and `spec-trace check` reports only acknowledged drift.
- **SC-007**: No new debounce timer exists in the studio after the step lands (D3 audit).

## Assumptions

- The KM crew (`/km-lead`) coordinates this work; the user's reference to the "lex-lead" team meant this project's equivalent.
- §16 exclusions stand. This feature gates CJK, Ethiopic, and Hangul rather than reopening Decision 5.
- The raw-KMN rule editor remains a separate, later proposal. The Advanced view stays view-and-remove.
- Unicode General Category and canonical-combining-class data are available to the engine through the existing prebuild data fetch, or will be added to it; they are not hand-maintained.
- Behaviours are authored on the desktop `.kmn`; touch-layout consequences follow through the existing touch key↔rule join and are not separately specified here.
- Loud/soft defaults to soft because the user asked for nulls; A6 can override. Soft means `nul` or `context` per FR-009.
- Behaviour cards are proposed, never silently applied; the accepted/declined initial state is itself a proposal the author confirms.
- Spelling: this spec uses "behaviour" in prose, matching CLAUDE.md's house spelling. The plan decides the code identifier spelling once and records it; the corpus is mixed.

## Out of scope

- Editing opaque fragments or free-form `.kmn` (v1.1 candidate per §16).
- Multi-hop context chains, `if()`/`set()`/`platform()` guards, `outs()`, mnemonic `&CasedKeys`, multitap and longpress.
- Synthesising visual-to-logical reorder tables from Unicode data.
- CJK, Ethiopic, and Hangul.
- Cluster-aware Backspace beyond the unwrap rules the mark-guard synthesis already emits, and deadkey timeout or cancel. Deferred, not forgotten; both are candidates for a later behaviour kind.

## Proposed phasing (for the plan)

1. **Spec and framework** — this document; additive amendments to specs 005 and 007; the `reorderRules` decision.
2. **Codec closure** — FR-004 and its round-trip fixtures.
3. **Contracts and compilers** — behaviour types, ownership marker, one compiler per kind, simulator-backed unit tests.
4. **Proposer and recogniser** — per-script defaults, gallery tables, import lifting; absorbs the pending context-variant wiring from spec 062.
5. **Studio step** — Behaviours step in the reserved phase slot, cards, test pane, i18n under `behaviours.*`, accessibility per house rules, Playwright on one Latin and one Thai flow.
6. **Validator** — the Layer B checks of FR-014.
