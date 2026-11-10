# Feature Specification: Typed rule shape

**Feature Branch**: `117-typed-rule-shape`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "spec out 117 on a new worktree." Built from spec 116's follow-on
handoff (`specs/116-ng-parser-adoption/evidence/follow-on-handoff.md` and spec 116 FR-040 to FR-042,
on the `116-ng-parser-adoption` branch; PR #2637).

**Governing authority** (Constitution precedence by topic):

- **The pattern contract** (the contracts types and spec 005) is locked. A field rename, type change
  or removal needs a major version bump of the contracts package and a joint engine and content
  session (CLAUDE.md, spec §17). This spec is such a change.
- **Art II, the keyboard model is the spine.** Every change works on the parsed model, and constructs
  the model cannot type are kept as opaque fragments, never dropped.
- **Spec 116's Tier B ruling** (2026-11-10: KM crew design review, owner accepted) moved these
  breaking changes out of 116 into this spec. It fixed their order (B3, then B1, then B2), the gates,
  and the rejected alternatives. This spec carries that ruling and does not reopen it.
- **Spec 103** (first-class `if()` guards, ratified 2026-10-15) keeps guards as ordinary elements of
  a rule's context and rejected a separate guard field. B2 conflicts with that (FR-030).

**Depends on** spec 116 (PR #2637). It routes every rule-shape read and write through shared
accessors, so this spec changes the accessors' insides, not their callers. **Unblocks** spec 118's
pattern application (FR-012), which merges rules and should be written once against the new shape.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Exporters and importers read keys and modifiers directly (Priority: P1)

An author exports a keyboard to LDML, and later to other formats. Each exporter reads a rule's key
and its exact set of modifiers from the rule, and maps them to the target format. It does not parse
text or guess at modifier spellings. Importers for Windows, Linux and macOS layouts produce the same
typed key-and-modifier form.

**Why this priority**: Multi-format export and import (the format-import epic) depends on a key map
that every format can read. Today the key and modifiers are recovered from the rule's context with
text-level conventions. Modifier spellings vary (`CTRL` vs `LCTRL`, case), which invites mapping
errors.

**Independent Test**: For every keyboard in the corpus, each rule's key and modifier set read from
the model match what Keyman's compiler accepts for that rule. LDML export output is unchanged.

**Acceptance Scenarios**:

1. **Given** a rule `+ [CTRL K_A]`, **When** an exporter reads it, **Then** it gets key `K_A` with
   modifier set {CTRL}, distinct from {LCTRL}.
2. **Given** a rule mixing left and right modifiers, **When** it is read, **Then** the mix is kept
   (Keyman only warns about it), not rejected or normalised.
3. **Given** a modifier spelling Keyman's compiler does not accept (such as `ALTGR`), **When** the
   keyboard is read, **Then** the rule is kept as an opaque fragment and reported, never silently
   re-spelled.

---

### User Story 2 - Every rule has an explicit keystroke (Priority: P1)

A rule's keystroke is its own part of the rule, separate from the text before the cursor that the
rule matches. The rule builder, the keyboard assistant, the recognizers and the touch-key join read
it directly.

**Why this priority**: Today the keystroke hides inside the rule's context behind a separator.
Every tool that needs it has to split the context. Spec 116 found the splitters disagree at the
edges.

**Independent Test**: For every corpus rule, the keystroke and pre-context read from the model equal
what spec 116's shared accessors return today. Emitting the keyboard gives the same text as before.

**Acceptance Scenarios**:

1. **Given** a rule with a virtual key and modifiers, a quoted character with modifiers
   (`[SHIFT 'a']`), a bare character, or `any(store)` as its keystroke, **When** it is read, **Then**
   the keystroke field holds exactly that one element.
2. **Given** a rule with more than one keystroke element (which Keyman's compiler only warns about
   and ignores after the first), **When** it is read, **Then** it is kept as an opaque fragment.
3. **Given** a bare character outside the Basic Multilingual Plane as a keystroke, **When** it is
   read, **Then** it is kept as an opaque fragment, as the compiler rejects it.

---

### User Story 3 - A rule says what kind of rule it is (Priority: P2)

Each rule has one typed left-hand side: a `match` rule, a `nomatch` rule, or an input rule. An input
rule carries an optional leading `nul`, the run of conditions at its head (`if`, `platform`,
`baselayout`), its pre-context and its keystroke. Tools ask which kind of rule they hold instead of
inspecting markers.

**Why this priority**: It completes the typed shape. It is P2 because it conflicts with spec 103's
ratified guard placement and cannot start until that is ruled on (FR-030).

**Independent Test**: For every corpus rule, the left-hand-side kind and head conditions read from
the model equal spec 116's accessor results, and emitting gives the same text.

**Acceptance Scenarios**:

1. **Given** a rule whose `if()` and `platform()` conditions come first, **When** it is read,
   **Then** they appear as its head conditions, in source order. Two guards on one rule are both
   kept.
2. **Given** a condition or `nul` that is not at the head (legal Keyman, which only warns), **When**
   it is read, **Then** it stays an element of the pre-context where it was written.

---

### User Story 4 - Saved drafts keep working (Priority: P1)

An author who saved a draft before this change reopens it afterwards. The draft loads with every
decision intact, and the keyboard is rebuilt in the new shape.

**Why this priority**: Drafts store the starting point's parsed keyboard. A shape change that
discarded drafts would lose authors' work.

**Independent Test**: Every captured draft fixture saved under the old shape loads under the new one,
and produces byte-identical output.

**Acceptance Scenarios**:

1. **Given** a draft saved before this change, **When** it is opened, **Then** the starting point is
   re-read from its saved files, the decisions replay on top, and the output equals what the draft
   produced before.
2. **Given** a draft whose saved files can no longer be read, **When** it is opened, **Then** the
   author is told which part could not be restored. The draft is never silently dropped.

---

### User Story 5 - Nothing changes in the keyboard that ships (Priority: P1)

Authors see no difference in output. The restructure is internal.

**Why this priority**: The value is in what exporters and tools can do next, not in changed output.
Any output difference is a regression.

**Independent Test**: The corpus round trip and the golden fixtures produce byte-identical output
before and after each phase.

**Acceptance Scenarios**:

1. **Given** a guarded rule of the shape `if(...) any(s) + "k" > index(t,2)`, **When** it is emitted,
   **Then** the `index()` offset is written exactly as before and counts the same positions Keyman's
   compiler counts.

---

### Edge Cases

- A rule whose modifiers include `CAPS` or `NCAPS`: kept in the set as written.
- A `match` or `nomatch` rule has no keystroke and no pre-context.
- A rule with conditions but no pre-context (`if(&layer='shift') + [K_A]`).
- A condition after a pre-context element: stays in the pre-context (US3 scenario 2).
- An `outs()` reference: never a keystroke form.
- Rules synthesized by the studio (touch rules, mark guards, pattern rules) are built through the
  shared helpers, so they take the new shape without per-site changes.

## Requirements *(mandatory)*

### Functional Requirements

**Order and scope** (spec 116 FR-040)

- **FR-001**: The changes land in this order, each landable and green on its own: B3 (modifier set),
  then B1 (explicit keystroke), then B2 (typed left-hand side).
- **FR-002**: The changes are made inside spec 116's shared rule-shape accessors and helpers, the
  codec, the runtime schemas and the draft migration. Callers of the accessors do not change.

**B3, modifier set**

- **FR-010**: A rule keystroke's modifiers MUST be an unordered set over exactly the nine names
  Keyman's compiler accepts: NCAPS, LALT, LCTRL, RALT, RCTRL, ALT, CTRL, CAPS, SHIFT, read
  case-insensitively.
  - CTRL and LCTRL stay distinct.
  - A mix of left and right modifiers stays representable.
  - Any other spelling (NUMLOCK, SCROLL, ALTGR) leaves the rule opaque, with a report.
- **FR-011**: A key map that any format can read MUST be a derived reading of the model, never stored
  in it.

**B1, explicit keystroke**

- **FR-020**: Each input rule MUST hold its keystroke as its own single element, and its context MUST
  hold only the pre-context. The keystroke forms are:
  - a virtual key with modifiers;
  - a quoted character with modifiers;
  - a bare character in the Basic Multilingual Plane;
  - `any(store)`.
- **FR-021**: A rule with more than one keystroke element, or any other keystroke form, MUST stay an
  opaque fragment.

**B2, typed left-hand side**

- **FR-030**: Each rule MUST have one typed left-hand side, `match`, `nomatch` or input. An input
  side holds an optional leading `nul`, the head run of conditions, the pre-context and the
  keystroke. A condition or `nul` not at the head stays a pre-context element.
  [NEEDS CLARIFICATION: B2 moves head guards out of the rule context, against spec 103's ratified
  placement. Revise spec 103 so head conditions become a typed list on the rule, or keep guards in
  the context and limit B2 to the left-hand-side kind?]

**Gates** (spec 116 FR-041)

- **FR-040**: A joint engine and content session MUST approve the contract change, and the contracts
  package MUST take a major version bump.
- **FR-041**: Saved drafts MUST migrate:
  - the draft envelope version is bumped;
  - the starting point is re-derived by re-reading its saved files;
  - the working copy is rebuilt from it.

  A draft is never discarded on a version mismatch.
- **FR-042**: The rule-level runtime schemas MUST check the new shape. Today they pass rule shapes
  through unchecked, so the compile-time drift guards would not catch a shape change.
- **FR-043**: `index()` offsets MUST be kept exactly as written (spec 116 FR-033), with tests on
  guarded rules of the shape `if(...) any(s) + "k" > index(t,2)`.
- **FR-044**: Output MUST stay byte-identical on the corpus round trip and the golden fixtures
  through every phase.

**Rejected alternatives** (spec 116 FR-042, kept on record)

- **FR-050**: The record keeps these alternatives rejected:
  - a format field on opaque fragments (replaced by spec 116's importer policy, FR-029b);
  - doing B1 to B3 inside spec 116;
  - re-basing `index()` offsets.

### Key Entities

- **Rule**: one Keyman rule. It has a left-hand side and an output.
- **Left-hand side**: `match`, `nomatch`, or input.
- **Input side**: an optional leading `nul`, head conditions, pre-context and keystroke.
- **Keystroke**: one element. A virtual key, quoted character or bare character, each with a modifier
  set, or `any(store)`.
- **Modifier set**: an unordered set over the nine compiler-accepted modifier names.
- **Opaque fragment**: a construct the model cannot type, kept verbatim and reported.
- **Draft**: the saved project. It holds the starting point's files, its parsed keyboard, a
  working-copy cache and the decisions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of corpus rules that compile today read back the same key, modifiers, pre-context
  and rule kind through the new shape as through spec 116's accessors.
- **SC-002**: Output is byte-identical on the full corpus round trip and all golden fixtures after
  each of the three phases.
- **SC-003**: 100% of captured old-shape draft fixtures load and produce identical output; none is
  discarded.
- **SC-004**: No rule with an unaccepted modifier spelling or a multi-element keystroke is silently
  changed. Each is kept opaque and counted in the corpus report.
- **SC-005**: Callers outside the shared accessors, the codec, the schemas and the migration need no
  changes. This is measured as zero touched caller files beyond those.

## Assumptions

- Spec 116 is merged before planning starts. Its accessors, lint guard and consumer inventory
  (research R5) are the starting point.
- Pattern data holds no rule context arrays (spec 116 research R5d). Pattern text templates are
  unaffected.
- The order against spec 118: 118's defect fixes and output work proceed in parallel. 118's pattern
  application waits for B1 here.
- Drafts keep the working-copy cache (spec 105 FR-002 as amended 2026-11-10). The migration rebuilds
  that cache rather than converting it.
- Out of scope: new rule semantics, changes to `.kmn` syntax, LDML-specific mapping (spec 108), and
  importers themselves (the format-import epic).
