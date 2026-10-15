# Feature Specification: First-class `if()` guards in KeyboardIR

**Feature Branch**: `103-first-class-if-guards`

**Created**: 2026-10-15

**Status**: Draft — for review. Produced by the ruled scoping session for
first-class `if()` guards; **not ratified**, and no implementation is
authorised by this draft. Implementation is sequenced after spec 082 lands
and is gated on the corpus round-trip vectors in FR-009.

**Input**: Scoping session deliverables in this directory
(`scoping-report.md`): corpus report on `if()` usage in the keymanapp
keyboards corpus, a compiler-verified inventory of every consumer that
switches on context-element `kind`, and the shape decision with its
evidence.

**Governing context**: Constitution Art I (the Pattern contract is locked;
this change is to the KeyboardIR contract, additive, and does not touch the
Pattern schema), Art X (no new silent defaults — a guard must never take
effect, or be dropped, silently), Art XI (done means integrated — the
typed guard must reach the live surfaces that today render guarded rules
as opaque). The KeyboardIR is the spine (root spec §5a): every mutation
operates on the IR, never on `.kmn` text — which is precisely what guarded
rules escape today, because the codec preserves them as raw fragments.
Precedent for the change shape: the additive `useGroup` member of
`OutputElement` (typed so downstream consumers can see the transition
explicitly instead of as a `raw` blob).

## Why this exists

A KMN rule guarded by `if(store = 'value')` is conditional: it fires only
when the named option or system store currently holds the value. The
corpus uses the construct heavily — 40,950 guards in 73 of 933 keyboards —
for layer switching (`&layer`, `&newlayer`), platform splits (`&platform`),
and author-facing keyboard options (`option_*` stores). In the studio's IR
none of that is visible: the codec classifies any rule whose context
contains `if(...)` as an opaque raw fragment
(`OPAQUE_REASONS.IF_OPTION_STORE`), so the rule has no typed context, no
typed output, and no presence in `group.rules` for any engine consumer.

The costs are already visible. Guarded rules render non-toggleable in the
Carve gallery (they are fragments, not rules). The rules step cannot
represent a guarded rule it displays. Strategy detection reaches guarded
rules only through a raw-text pattern-match (Approach A, the interim),
which re-derives guard position from token order in the fragment string
instead of reading typed IR — a second, text-level understanding of the
same construct that can drift from the codec's.

Modelling the guard as a first-class context element makes the condition
part of the rule every consumer already walks: recognizer, validator,
pattern-apply, carve, and kmAssist all see the same typed fact, and the
consumers that switch exhaustively on element kind are forced by the
compiler to decide what a guard means in their surface.

## The shape (decided in the scoping session; evidence in `scoping-report.md` §3)

`ContextElement` gains one additive variant:

```ts
| { kind: "if"; store: string; value: string }
```

- `store` is the store name verbatim, including the `&` prefix for system
  stores (`&layer`, `&platform`). Store-name case is preserved as written;
  comparisons elsewhere in the codebase are case-insensitive and this
  variant does not change that.
- `value` is the compared literal, unquoted (the codec owns quoting on
  emit, as it does for `char` values).
- A guard is an ordinary element of the rule's `context` array, in source
  order. It may repeat (corpus maximum: 2 per rule) and may follow a
  leading `baselayout`-class head element; in the corpus it never appears
  after the keystroke separator or after a content-matching element.
- The rejected alternative, an `IRRule.guard` field, is recorded with its
  risks in the scoping report (§3.2): it cannot represent two-guard rules
  or guard position without becoming a parallel sequence, and no consumer
  is compile-forced to look at it, so a forgotten field reads as an
  unconditional rule.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Import a guarded keyboard and see real rules (Priority: P1)

An author imports a keyboard whose rules are guarded by an option store
(the Vietnamese tone-placement shape) or by layer stores (the layer-switch
idiom). The import produces typed rules whose contexts include the guard;
the rules appear in the rules step and the Carve gallery as rules — with
their condition visible — not as non-toggleable opaque fragments.

**Why this priority**: This is the defect the feature exists to remove;
every other story is a consequence.

**Independent Test**: Import a fixture keyboard with a single-guard rule,
a two-guard layer rule, and a platform-preceded guard rule; confirm all
three appear as typed rules with the guards shown in their contexts, and
that exporting reproduces the source KMN for those rules exactly.

**Acceptance Scenarios**:

1. **Given** a `.kmn` rule `if(option_key = 'RALT') + [K_A] > 'x'`,
   **When** it is imported, **Then** the IR rule's context is
   `[{kind:"if",store:"option_key",value:"RALT"}, …keystroke…]` and the
   rule is present in its group's typed rules, not in `ir.raw`.
2. **Given** the two-guard rule `if(&newLayer = "") if(&layer = 'numeric')
   any(digit) > context`, **When** it is imported and re-emitted, **Then**
   both guards survive in order and the emitted line matches the source.
3. **Given** a guarded rule, **When** the author views it in the Carve
   gallery or the rules step, **Then** the guard is displayed as part of
   the rule's condition (store and value), never silently omitted.

---

### User Story 2 — No consumer silently treats a guarded rule as unconditional (Priority: P1)

Every engine and studio consumer that switches exhaustively on context
element kind makes an explicit decision for the guard kind: render it,
account for it, or treat the rule as not-handled. A consumer that has not
decided does not compile (for the compile-forced switches) or is named in
the implementation's per-consumer review (for predicate walkers).

**Why this priority**: The failure mode this feature must not reproduce is
the one the rejected shape invited — a conditional rule read as
unconditional. The compile forcing is the mechanism; this story is its
acceptance test.

**Independent Test**: Add the variant to the contracts package and build:
the nine compile-forced switch functions listed in the scoping report
(§2.1) fail compilation until each handles `kind: "if"`.

**Acceptance Scenarios**:

1. **Given** the new variant on main, **When** the workspace builds,
   **Then** every switch in the scoping report's §2.1 has a `case "if"`
   (or an explicitly reviewed `never`-reachable default) — no switch
   compiles by accident.
2. **Given** a pattern-apply mutation that would rewrite a rule,
   **When** the rule's context contains a guard the mutation does not
   model, **Then** the mutation leaves the rule untouched or refuses —
   it never emits the rule with the guard dropped.
3. **Given** the validator's context-tolerance analysis, **When** it
   meets a guard element, **Then** it accounts for it explicitly (the
   guard constrains the rule's applicability) rather than reporting the
   kind as not analysed.

---

### User Story 3 — Strategy detection reads typed guards (Priority: P2)

The interim raw-fragment scan that makes strategy rule 3a reachable for
guarded rules is retired in favour of reading the guard from typed IR, so
one component (the codec) owns the meaning of `if(...)`.

**Why this priority**: Two text-level understandings of the same
construct drift; the interim was explicitly landed as an interim.

**Independent Test**: The guarded-postfix detection suite passes against
typed IR with the raw-fragment scan removed, including the real sil_ipa
integration case.

**Acceptance Scenarios**:

1. **Given** an imported keyboard with a guarded postfix rule, **When**
   strategy detection runs, **Then** the guard position and the guarded
   store are read from the rule's typed context elements.
2. **Given** the interim scan is removed, **When** the engine suite runs,
   **Then** no test regresses and no `if-option-store` fragment is
   produced for a parseable guarded rule.

---

### Edge Cases

- **Not-equal guards**: the corpus contains no `if(store <> 'value')`
  guard, and KMN grammar admits one. Until an operator is modelled, a
  `<>` guard MUST stay opaque (fail-closed) rather than be typed as an
  equality guard.
- **Comma form**: `if(store, 'value')` is a documented KMN spelling; no
  corpus instance was found. The parser MAY accept it as the same variant;
  if it does not, it MUST stay opaque, not mistype.
- **Guard in a store body**: 0 corpus occurrences; stores containing
  `if(...)` stay opaque (unchanged behaviour).
- **Guard in output position**: 0 corpus occurrences; unchanged behaviour
  (no typed representation is specified by this draft).
- **Offset accounting**: `index()` / `context(N)` pairing counts context
  elements positionally in existing consumers. Whether a guard element
  occupies an offset position MUST be pinned by the FR-009 round-trip
  vectors before implementation: KMN semantics say a guard produces no
  context character, and any consumer whose offset math counts elements
  must be shown to agree on the vectors.
- **Unknown store in a guard**: a guard naming an undeclared store is a
  validator finding (the existing if-store resolution check), not a parse
  failure — the rule still types, with its guard, and the finding names
  the store.
- **Case**: store names in guards are compared case-insensitively by
  Keyman; the variant preserves source case, and emit reproduces it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The contracts package MUST add `{ kind: "if"; store: string;
  value: string }` as an additive member of the `ContextElement` union.
  No existing member changes shape; the Pattern schema MUST NOT be
  touched.
- **FR-002**: The codec parser MUST type an equality `if(store = 'value')`
  in context position as the new variant, in source order, instead of
  classifying the whole rule opaque — for one guard, for two guards, for
  a guard following a leading `platform(...)`/`baselayout` head element,
  and for a guarded rule with no keystroke separator.
- **FR-003**: The codec parser MUST keep a guard it cannot type faithfully
  (not-equal operator, unparseable head) opaque with the existing
  `if-option-store` reason — never mistyped, never dropped.
- **FR-004**: The codec emitter MUST emit the variant as
  `if(store = 'value')` at its recorded context position, so parse → IR →
  emit round-trips guarded rules exactly.
- **FR-005**: Every compile-forced switch over `ContextElement.kind`
  (scoping report §2.1: 9 switch functions in 7 files — codec emit,
  contracts round-trip keys, kmAssist group/explain, pattern-apply
  contributor display, studio rule naming and rule builder) MUST gain an
  explicit guard decision, and the two unguarded exhaustive switches and
  two partial switches in §2.2 MUST be reviewed and their guard behaviour
  chosen deliberately (a `never` guard added where the switch is meant to
  be total).
- **FR-006**: The implementation MUST include a per-consumer review of the
  predicate walkers in scoping report §2.3 (recognizer, validator,
  pattern-apply mutations, contracts helpers, studio surfaces,
  scaffolder/transforms), recording for each whether a guard element is
  correctly invisible to it or must be accounted for. A mutation that
  cannot account for a guard MUST NOT rewrite the rule.
- **FR-007**: The recognizer MUST NOT claim a guarded rule for a pattern
  whose semantics assume an unconditional rule, unless that pattern's
  recognition is explicitly extended to guards in the same change.
  Unrecognised stays the default for guarded rules until a pattern opts
  in.
- **FR-008**: Strategy detection for guarded postfix rules MUST read the
  guard from typed IR; the interim raw-fragment scan MUST be removed in
  the same change or a named immediate follow-up, with its test coverage
  carried over.
- **FR-009**: Implementation MUST be gated on corpus round-trip vectors —
  parse → IR → emit identity — covering at minimum: single initial guard
  on an option store; the two-guard `&newlayer`/`&layer` cluster; a
  `platform(...)`-preceded guard; a guarded rule with no keystroke
  separator; a system-store (`&platform`) guard; and a scale case drawn
  from the Vietnamese tone-placement keyboards. The vectors also pin the
  offset accounting in the Edge Cases section. No vector, no merge.
- **FR-010**: The Carve gallery and the rules step MUST render a typed
  guarded rule as a rule with its condition visible, closing the
  non-toggleable-fragment cost recorded for the status quo. (Wording and
  placement of the condition display follow the surfaces' existing
  condition rendering, e.g. the preceding-context label path.)

### Non-goals

- Authoring guards: no survey question, editor surface, or default
  proposes or creates a guard. Guards arrive by import only, until a
  separate feature says otherwise (Art X: nothing here is a new silent
  default).
- Guard editing: changing a guard's store or value in the studio is out
  of scope; display and preservation are in scope.
- Output-position and store-body guards: no corpus instances; not
  modelled.
- The validator's `&newlayer` recognition gap (scoping report §1.3) is a
  separate small fix, not part of this feature.

## Success Criteria *(mandatory)*

- **SC-001**: The FR-009 vector set passes: every vector keyboard's
  guarded rules round-trip byte-identically through parse → IR → emit.
- **SC-002**: The workspace builds with an explicit `case "if"` (or
  reviewed equivalent) at all 9 compile-forced switch functions, and the
  §2.2 switches' guard behaviour is the one their review recorded.
- **SC-003**: The per-consumer review (FR-006) exists in the
  implementation PR, covers every file the scoping report lists in §2.3,
  and names at least the recognizer, validator, and pattern-apply
  mutation verdicts individually.
- **SC-004**: Importing the vector keyboards produces zero
  `if-option-store` raw fragments for parseable guarded rules (the
  not-equal/comma long tail may remain opaque per FR-003, and is counted
  separately).
- **SC-005**: Strategy rule 3a detection passes its existing suite
  (including the sil_ipa integration case) reading typed guards, with the
  raw-fragment scan removed.

## Sequencing and open questions

**Sequencing** (per the scoping ruling): implementation follows spec 082
landing, and is gated on FR-009's vectors. This draft and its scoping
report are the session's output; ratification is a separate act.

**Open questions for ratification**:

1. Operator field: this draft models equality only (the sole
   corpus-attested operator) and keeps `<>` opaque. Ratification should
   confirm that posture, or direct an `op` field in the variant from the
   start.
2. Offset accounting (Edge Cases): the vectors must demonstrate the
   agreed answer; if they show a consumer whose positional math cannot
   accommodate a non-character context element without a wider change,
   that change is named and scoped before implementation, not absorbed
   silently.
3. `match`/`nomatch` and group-level guards: no corpus instance of a
   guard outside a rule context was found; if ratification knows of one,
   it belongs in the vector set.
