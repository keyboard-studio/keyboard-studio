# Feature Specification: Carve gallery trim proposals compare produced characters to the orthography (with cased-letter pairing)

**Feature Branch**: `051-carve-orthography-trim`

**Created**: 2026-07-28

**Status**: Implemented (US1–US4, all FRs/SCs) — shipped via PR #1412 (commits 77c50c55/cd725493). Retroactively verified 2026-08-19.

**Input**: User description (issue #1357 and follow-up): "The goal in the carve gallery is to take
the alphabet from previous questions and compare it to the base keyboard. Any rule producing a
letter/diacritic not included in the orthography should be proposed to be trimmed. This could mean
removing whole rules, or an input/output pair from a store. It wrongly says I can't remove ɨ on
Cameroon QWERTY because it will remove the i — but the i is only the *input* to a deadkey/RALT rule
and has its own separate rule; and when I remove suggested characters nothing changes colour. Also:
handle cased letters together as a pair in the carve gallery — mirror the caps-simplification we
already have in the mechanism galleries — keeping a shared uppercase until all of its lowercase
counterparts are gone."

## Why this exists

The carve gallery's one job is to answer a single question for every character the base keyboard
can produce: **"is this in the author's orthography?"** If yes, keep it. If no, propose trimming it.
The trim can be a whole rule (a plain `+ [K_X] > 'y'` swap) or one **input/output pair** spliced out
of a paired store mechanism (a deadkey/AltGr fan-out).

The current implementation almost does this, but its **dependency calculation compares the wrong
side of a paired store**. It treats the characters on the *input* side of a transform (the base
letters you press to trigger it) as characters that would be *lost* if the transform is trimmed.
They are not lost — they are produced by their own base-layer rules. The result is that legitimate
surplus output characters are declared un-removable, and the author is told a trim "will also remove
a character you need" when it will not.

### The concrete failure (Cameroon QWERTY, ɨ)

The SIL Cameroon deadkey mechanism is a **paired-store fan-out** (recognizer strategy S-02). For a
grave-accent deadkey it looks like:

```
group(deadkeys)
  dk(0060) any(dkf0060) > index(dkt0060, 2)

store(dkf0060)  " aAeEiIoOuU"      ← INPUT / source store (any-consumed): the base letters you TYPE
store(dkt0060)  "`àÀèÈìÌòÒùÙ"      ← OUTPUT store (index target): the accented letters PRODUCED
```

`dkf` and `dkt` are **cross-paired**: position *i* of the input store lines up with position *i* of
the output store, so a coordinated drop at position *i* splices **both** stores (see
`applyStoreSlotRemovals`). The Cameroon `ɨ` case is the same shape — an input store carrying `i`
paired with an output store carrying `ɨ`, plus a separate base-layer rule `+ [K_I] > 'i'` that is
the *real* producer of `i`.

When the author asks to trim `ɨ` (not in their orthography):

1. `collectCharContributors(ir, 'ɨ')` correctly finds the output-store slot `dkt#i`.
2. `classifyStoreSlotEdit(dkt)` returns `mode: 'drop', coordinatedWith: ['dkf']` — trimming `ɨ`
   also splices the paired input slot `dkf#i`, which holds `i`.
3. `coordinatedDropHitsNeededChar` then asks *"is the partner slot's character (`i`) in the needed
   set?"* — `i` is in the orthography, so it answers **yes**.
4. Both the character-level banner (`recommendedRemovalChars`, via `dependsOnNeeded`) and the
   node-level annotation (`annotateRemovalRecommendations`) therefore **shield `ɨ` from being
   proposed**, and a manual trim pops a warning "⚠ This will also remove a character you need: i".

Step 3 is the defect. Dropping `i` from `dkf0060` does **not** remove `i` from the keyboard — it only
removes the "type `i` under this deadkey → get `ɨ`" mapping. `i` is still produced by its base rule.
The guard conflates **"this character appears on the input side of a paired store"** with **"this
character will no longer be producible."** Those are different questions, and only the second one
should ever block or hide a trim proposal.

### The second symptom (removed characters don't change colour)

Because `ɨ` is shielded, it never appears as a proposal, and its tile is a fan-out glyph whose `gid`
is `dkt#i`. A manual "remove everywhere" only marks the directly-targeted slot(s) as deleted; if the
producer set `collectCharContributors` returns does not match the tile the author is looking at (e.g.
the author is looking at the *input* `i` chip, or a second producer was missed), the visible tile
never flips to its removed state. The author removes something and sees no change — the tool looks
broken. Any trim proposal that the author acts on MUST produce a visible state change on every tile
that represents the trimmed character, or an explicit message saying why nothing was trimmed.

## Definitions

- **Orthography / needed set.** The characters the author confirmed they want, derived upstream from
  the survey answers: the three-store `ConfirmedAlphabet` (bases, marks, attested stacks) refined by
  the marks series into `deriveCarveNeededSet` (`requiredPrimary` ∪ `optionalSecondary`), unioned
  with any non-alphabet confirmed inventory and the CLDR exemplar set for the target language. This
  is the existing `neededSet`; this feature does not change how it is built.
- **Produced character.** A character the compiled keyboard can *emit* as output: the RHS of a plain
  rule, or a slot in an **output** store (an `index()`/`outs()` target). Produced characters are the
  only characters the carve comparison ranges over.
- **Input / trigger character.** A character on the *matching* side of a rule: a literal context
  element, or a slot in a **source** store (an `any()`-consumed store). Pressing/typing it is how a
  transform is triggered. Removing it from a store narrows what triggers the transform; it never, by
  itself, removes a produced character from the keyboard.
- **Trim unit.** The smallest coherent thing a proposal removes: a whole rule, or one aligned
  **input/output pair** across a paired store set (all members spliced at the same index by
  `applyStoreSlotRemovals`).
- **Case pair.** A lowercase produced character and its uppercase counterpart (and vice versa), as
  computed by the engine's `caseCounterpart` (bidirectional, locale-aware via the identity `bcp47`,
  and null for marks, caseless scripts, and multi-character case expansions like `ß→SS`). The same
  helper already drives the mechanism galleries' propose-then-confirm case-pair companion ("map adds
  both cases"); carve reuses it so the two surfaces never disagree about what a case pair is.
- **Shared uppercase (many-to-one).** One uppercase produced character that is the counterpart of
  more than one distinct lowercase produced character (e.g. Latin `a` U+0061 and Greek `α` U+03B1
  both uppercasing to `A` U+0041 under a locale-insensitive fold). Uppercase→lowercase is therefore a
  **reference set**, not a 1:1 link.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Surplus produced character is proposed for trimming (Priority: P1)

The author's orthography does not contain `ɨ`. The Cameroon base produces `ɨ` through a paired-store
deadkey mechanism. The carve gallery proposes trimming `ɨ`, and accepting the proposal splices the
`i`/`ɨ` input/output pair out of the deadkey stores, leaving `i` fully typeable via its own base rule.

**Why this priority**: This is the core request and the direct fix for the reported ɨ defect —
without it the tool hides exactly the removals the author came to make.

**Independent Test**: Load Cameroon QWERTY, confirm an orthography without `ɨ`, open the carve
gallery. `ɨ` appears as a trim proposal (banner and/or its tile is flagged surplus). Accept it;
`ɨ` is gone from the produced set and `i` still round-trips.

**Acceptance Scenarios**:

1. **Given** a paired deadkey/AltGr store mechanism whose output slot at index *i* is `ɨ` (surplus)
   and whose input slot at index *i* is `i` (in the orthography), **When** carve computes proposals,
   **Then** `ɨ` is proposed for trimming — the presence of the needed character `i` on the paired
   **input** side does NOT shield it.
2. **Given** that proposal is accepted, **When** the trim applies, **Then** the aligned pair
   (`dkf#i` **and** `dkt#i`) is spliced together, and the base rule `+ [K_I] > 'i'` is untouched, so
   `i` remains producible.
3. **Given** the same mechanism, **When** the author inspects `ɨ`'s trim, **Then** any message about
   the paired input character is **informational** ("the deadkey combination `i → ɨ` will no longer
   fire"), never a "you need this character" warning, because `i` is not lost.

---

### User Story 2 - A genuinely load-bearing needed character is still protected (Priority: P1)

Trimming a surplus character must never silently remove a needed character that has **no other
producer**. The guard is retained for that real case and only that case.

**Why this priority**: The dependency guard exists for a reason; narrowing it must not open the door
to deleting a character the author actually needs and cannot type any other way.

**Independent Test**: Construct a keyboard where a needed character is produced *only* as the paired
**output** partner of a surplus character's trim. Trimming the surplus character must warn (or refuse)
because accepting it would leave the needed character unproducible.

**Acceptance Scenarios**:

1. **Given** trimming surplus character X would splice a paired **output** slot holding needed
   character Y, **And** Y is produced nowhere else in the keyboard, **When** carve evaluates the
   trim, **Then** the trim is flagged as removing a needed character (warn-and-confirm, not silent).
2. **Given** the paired partner holding needed character Y is an **input/source** store (any-consumed),
   **When** carve evaluates the trim, **Then** it is NOT flagged as removing a needed character —
   an input slot is a trigger, not a producer (this is the ɨ/`i` case).
3. **Given** needed character Y is produced both as a trim's collateral output partner **and** by a
   separate rule, **When** carve evaluates the trim, **Then** it is NOT flagged as removing a needed
   character — Y survives via its other producer.

---

### User Story 3 - Every acted-on trim is visibly reflected (Priority: P1)

When the author accepts a proposal or manually trims a character, every tile representing that
character changes to its removed state immediately, and the kept/total counts update. If a requested
trim cannot be applied (blocked store class, no resolvable producer), the gallery says so instead of
appearing to do nothing.

**Why this priority**: The reported "nothing changes colour" makes the tool feel broken and
untrustworthy; a removal with no feedback is indistinguishable from a bug.

**Independent Test**: Trim a proposed character; observe every tile for that character (in the
pattern/group node, in the store chips, and in the status bar's removed list) flip to removed within
the same render. Attempt a trim that is genuinely blocked; observe an explicit reason, not silence.

**Acceptance Scenarios**:

1. **Given** a character is trimmed (via the banner or a chip cascade), **When** the trim applies,
   **Then** every tile/chip whose id is in the trimmed contributor set shows the removed state, and
   `kept`/`total` update.
2. **Given** a character has multiple producers, **When** it is trimmed, **Then** all of its producer
   tiles reflect the removal (no producer is left lit), OR the ones that cannot be trimmed are shown
   as explicitly retained with a reason.
3. **Given** a requested trim resolves to a blocked store class or no removable producer, **When** the
   author confirms, **Then** the gallery surfaces the reason (existing "marked not-removable" surface)
   rather than closing the dialog with no visible effect.

---

### User Story 4 - Cased letters are trimmed together as a pair (Priority: P2)

Selecting a cased produced letter for removal treats its uppercase and lowercase as one unit —
mapping adds both cases, removal removes both — mirroring the "Your alphabet" and mechanism-gallery
caps behavior. When multiple distinct lowercase letters share one uppercase, the shared uppercase is
kept until the last of its lowercase counterparts is trimmed.

**Why this priority**: This is the issue #1357 request. It makes carve consistent with the rest of
the tool's cased-letter handling and prevents an author from having to trim `é` and `É` as two
separate, easy-to-forget steps. It sits on top of the produced-vs-orthography model (US1–US3) and is
only meaningful once that model is correct, hence P2.

**Independent Test**: On a cased base, propose trimming a surplus lowercase letter with a counterpart
(e.g. `ǝ`/`Ǝ`); confirm both cases are trimmed together. Construct a base where two lowercase letters
share one uppercase; trim one lowercase and confirm the uppercase stays; trim the second and confirm
the uppercase is now trimmed too.

**Acceptance Scenarios**:

1. **Given** a surplus produced lowercase letter with a case counterpart both in the produced set,
   **When** it is trimmed, **Then** both cases are trimmed together as one action (one undo entry).
2. **Given** an uppercase produced letter that is the counterpart of exactly one lowercase produced
   letter, **When** either case is trimmed, **Then** the other is trimmed with it.
3. **Given** an uppercase produced letter shared by two or more distinct lowercase produced letters,
   **When** one of those lowercase letters is trimmed, **Then** the shared uppercase is **kept**
   (another lowercase still references it).
4. **Given** the same shared uppercase, **When** the **last** referencing lowercase letter is
   trimmed, **Then** the uppercase is trimmed too (its lowercase reference set is now empty).
5. **Given** a caseless-script letter, a mark, or a letter whose only case mapping is a multi-character
   expansion (`ß`), **When** it is trimmed, **Then** no phantom counterpart is trimmed — `caseCounterpart`
   returns null and the trim acts on the single character only.
6. **Given** a proposal signal (US1), **When** a case pair is both surplus, **Then** it is surfaced
   as one paired proposal, not two independent rows the author must reconcile.

---

### Edge Cases

- **Self-paired stores** (Cameroon's `word`/`final`, each `index(word,2)` over its own `any(word)`):
  `coordinatedWith` is empty, so a slot drop touches no partner store and can never trip the collateral
  guard. Unchanged by this feature; must stay unchanged.
- **Uppercase sharing (issue #1357 core).** When a surplus lowercase and a still-needed lowercase
  share the same uppercase producer, trimming the surplus lowercase must not drop the shared uppercase
  while the needed lowercase still maps to it (US4 §3–4). The uppercase is retired only when its
  lowercase **reference set** — the set of produced lowercase letters that uppercase to it — is empty.
- **Case pairing vs. store pairing are different axes.** A case pair (`é`/`É`) is about Unicode case
  mapping between two *produced* characters; a store pair (`dkf`/`dkt`) is about positional alignment
  inside a mechanism. A single trim can involve both (trimming `É` may be a case-partner of `é` *and*
  an output slot of a deadkey store). The two must compose: case pairing decides *which characters* to
  trim together; store pairing decides *which slots/rules* each of those characters lives in.
- **Punctuation / numbers / symbols** remain shielded from proposals by `isAlwaysKeepCategory`
  regardless of the orthography's CLDR exemplar gaps. Unchanged.
- **Opaque `RawKmnFragment` producers** remain un-trimmable and are reported as blocked. Unchanged.
- **Whole-store emptying**: a trim that would empty an `any()`-consumed store is refused by
  `applyStoreSlotRemovals` (it compiles to a silently-failing build); the proposal layer must not
  present such a trim as a clean one-click action without that refusal surfacing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** The carve gallery MUST derive trim proposals by comparing **produced characters** (rule
  outputs and output-store slots) against the orthography/needed set. A produced character absent from
  the needed set (and not in an always-keep category) is a trim candidate.
- **FR-002** Input/trigger characters (literal context elements and `any()`-consumed source-store
  slots) MUST NOT be independently compared against the orthography — they are not produced characters
  and their surplus/needed status is not a proposal signal.
- **FR-003** The coordinated-drop collateral guard (`coordinatedDropHitsNeededChar` and its callers
  in `recommendedRemovalChars` / `annotateRemovalRecommendations`) MUST evaluate a paired partner slot
  as "removing a needed character" ONLY when **both** hold: (a) the partner slot is an **output** store
  slot (the partner store is an `index()`/`outs()` target), and (b) the needed character it holds has
  **no other producer** in the keyboard. A partner that is an `any()`-consumed input/source store MUST
  NOT trip the guard.
- **FR-004** Accepting a trim of a paired-store output character MUST splice the aligned input/output
  **pair** together (existing `applyStoreSlotRemovals` coordinated drop), and MUST leave untouched any
  separate rule that independently produces the input character.
- **FR-005** Any message shown to the author about the paired **input** character dropped by a trim
  MUST be informational (naming the transform that will stop firing), NOT a "character you need" warning.
- **FR-006** A trim that WOULD leave a needed character unproducible (FR-003 satisfied) MUST warn the
  author before applying and MUST NOT apply silently.
- **FR-007** Acting on a trim proposal MUST produce a visible state change on every tile/chip whose id
  is in the trimmed contributor set (fan-out glyphs, store chips, status-bar removed list), within the
  same render, and MUST update the kept/total counts.
- **FR-008** A requested trim that resolves to no removable producer, or to a blocked store class, MUST
  surface an explicit reason to the author rather than closing with no visible effect.
- **FR-009** The trim-proposal signal MUST remain conservative when there is no orthography signal yet
  (needed set empty / CLDR unresolved): no proposals, matching today's "no default is a defect" stance.
- **FR-010** Structural producers that are not simple character emitters — recognized patterns as a
  whole, opaque fragments, and deadkey *registration*/trigger rules — MUST NOT themselves be proposed
  for whole-node removal by the character signal; only their individual surplus **output** characters
  are trim candidates (via the paired-store pair splice of FR-004).

### Cased-letter Requirements (issue #1357)

- **FR-011** Trimming a produced letter MUST also trim its case counterpart when that counterpart is
  itself a produced character, computed via the engine's `caseCounterpart` (locale-aware on the
  identity `bcp47`) — the same helper the mechanism galleries' case-pair companion uses. The pair is
  trimmed as one action / one undo entry.
- **FR-012** `caseCounterpart` returning null (marks, caseless scripts, multi-character case
  expansions, self-mapping letters) MUST leave the trim acting on the single character only — never a
  phantom or wrong counterpart.
- **FR-013** Uppercase→lowercase MUST be modeled as a **reference set** (the produced lowercase letters
  that case-map to a given uppercase), NOT a 1:1 inverse of `toUpperCase`. A shared uppercase produced
  character MUST be retained while its reference set is non-empty and trimmed only when the last
  referencing lowercase is trimmed.
- **FR-014** When both members of a case pair are surplus (US1), the trim signal MUST surface them as
  a single paired proposal, consistent with how the mechanism galleries add both cases together.
- **FR-015** Cased-pair trimming MUST compose with store-pair trimming (FR-004): each character in a
  trimmed case pair is resolved to its own contributor set (whole rules and/or store input/output
  pairs), and all resolved trim units apply together.

### Non-Functional / Consistency Requirements

- **NFR-001** The character-level signal (`recommendedRemovalChars`, banner) and the node-level signal
  (`annotateRemovalRecommendations`, rail/inspector highlighting) MUST agree on whether a given
  produced character is surplus — they must not disagree about the same character.
- **NFR-002** No new debounce/validation timer (decision D3). The proposal recomputation stays a pure
  pass over the working-copy IR.
- **NFR-003** The engine↔studio slot-id contract (`<storeNodeId>#<itemsIndex>`) and the
  `applyStoreSlotRemovals` coordinated-drop algorithm are unchanged; this feature changes only the
  **proposal/guard** layer that decides *which* slots to propose, not *how* a confirmed drop is applied.
- **NFR-004** Team boundary (spec §12): the produced-vs-input distinction and the "no other producer"
  test are engine-side facts about the IR; the studio consumes them and owns carve policy/presentation
  on top. The engine must never import the studio.

## Key Entities *(the data this reasons over)*

- **Produced-character set** — every rule output + output-store slot the keyboard can emit; the domain
  of the carve comparison. (Today: `buildProducedSet` / per-node `producedCharsOf`.)
- **Orthography / needed set** — `deriveCarveNeededSet` (required ∪ optional) ∪ non-alphabet confirmed
  ∪ CLDR exemplars. Unchanged by this feature.
- **Contributor set** for a character — `CharContributors` from `collectCharContributors`: the rules
  and store slots that produce it; the unit a trim acts on.
- **Store role** — per store: `source` (any-consumed input) vs `output` (index/outs target). The
  distinction FR-003 turns on; already computed by `analyzeStores` / `storeRefRole`.
- **Producer count** for a needed character — how many distinct rules/output-slots emit it; FR-003's
  "no other producer" test. Derivable from `collectCharContributors` over the needed character.
- **Case pair** — a produced letter and its `caseCounterpart`; the unit US4/FR-011 trims together.
- **Uppercase reference set** — for a produced uppercase letter, the set of produced lowercase letters
  that case-map to it; FR-013's retain/retire condition. Non-empty ⇒ keep; empty ⇒ trim.

## Out of scope

- Changing how the orthography/needed set is derived from the survey (specs 046/047/049).
- Changing the `applyStoreSlotRemovals` coordinated-drop mechanism or the slot-id contract.
- Any new Unicode-block or Phase-C mechanism-not-enabled proposal signal (the deferred TODO(#525)
  signals); this feature is only about correcting the produced-vs-input comparison and its feedback.

## Review notes / open questions

- **OQ-1 (FR-003b, "no other producer").** Confirm the producer-count test should range over the whole
  keyboard's producers (including other paired mechanisms), not just plain rules — i.e. a needed output
  produced by two different deadkeys still counts as "has another producer."
- **OQ-2 (FR-005 copy).** Wording for the informational input-drop note ("the `i → ɨ` combination will
  no longer fire") — content-team owned; km-domain to sanity-check that it reads correctly for
  deadkey/AltGr mechanisms alike.
- **OQ-3.** Whether trimming a paired output character whose input partner then becomes an unused
  trigger should also prune the now-dead input slot for tidiness, or leave it (harmless, still splices
  as the pair). Current pairing splice already removes it; call out in the plan so it is intentional.
- **OQ-4 (many-to-one reality check).** The issue's example — Latin `a` and Greek `α` both uppercasing
  to `A` U+0041 — does not hold under standard Unicode case mapping (`α.toUpperCase()` is `Α` U+0391,
  Greek capital alpha, not Latin `A`). Genuine many-to-one sharing is uncommon; it mainly arises under
  locale-sensitive folds (Turkic dotted/dotless `i`) or PUA `declaredRoles`. FR-013's reference-set
  model is still the correct defensive design, but the plan should confirm which real corpus cases
  actually exercise it so the tests are grounded rather than synthetic.
- **OQ-5 (proposal granularity vs. undo).** FR-014 surfaces a surplus case pair as one proposal row;
  confirm the author can still opt to keep one case (e.g. keep `É` for proper nouns while dropping `é`)
  or whether the pair is strictly all-or-nothing, matching the mechanism galleries' companion (which
  is confirm/decline on the whole pair).
