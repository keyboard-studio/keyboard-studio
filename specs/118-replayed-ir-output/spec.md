# Feature Specification: Output from the replayed keyboard

**Feature Branch**: `118-replayed-ir-output`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "118 on a new worktree." Built from the draft sketch in
[evidence/draft-sketch.md](evidence/draft-sketch.md), which records Matthew's 2026-11-10 goal: "We
start with the template keyboard and record decisions, and then those decision transformations
produce the final keyboard end-to-end every time."

**Governing authority** (Constitution precedence by topic): Art III, the state model, already says
that what renders and emits is the working copy, and that replay installs the result. Art II says
every change works on the parsed keyboard model, not on source text. This spec brings the studio
into line with both. It is the output side of spec 105 (derived working copy), depends on spec 116
(typed keyboard model), and is sequenced with spec 117 (keyboard model restructure).

**Rulings revised** (explicit revision request, ruled by Matthew 2026-11-10; see Clarifications):

- **D-090-24**, with D-090-30/31 and D-090-39/40 (spec 090): carve and the editor surfaces were kept
  out of the replayed keyboard, and "carve's apply returns the carved keyboard" was rejected.
  **Revised:** every surface's apply returns the transformed keyboard. Their "one producer only"
  reason now argues for this: today the replayed working copy and the file output are two producers,
  and they disagree (defect list, FR-020).
- **Spec 105 FR-007**: allowed a surface to fold into "overlay channels". **Amended:** anything that
  ends up in an output file folds into the keyboard model.

## Clarifications

### Session 2026-11-10

- Q: Revise D-090-24 (and D-090-30/31/39/40), so that every surface's apply returns the
  transformed keyboard? → A (Matthew): **Revise.** Every surface's `apply` returns the transformed
  keyboard (spec 090 option c). The recorded values stay; `apply` stops being a no-op, and replay
  becomes the only producer of output.
- Q: Amend spec 105 FR-007's fold target? → A (Matthew): **Amend.** Anything an output file carries
  (rules, stores, touch layout, visual keyboard, identity) folds into the keyboard model. Overlay
  channels remain only for state that no output file carries (attribution, help-doc answers).
  Recorded in spec 105 as a dated amendment.
- Q: Scope split with spec 105? → A (Matthew): **Split as drafted.** Spec 105 keeps its per-surface
  phases (moving editor state into decisions), under the amended FR-007. This spec owns the defect
  fixes, pattern application, the touch and visual-keyboard models, the single output stage and
  validation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - What the author sees is what ships (Priority: P1)

An author copies a keyboard, removes characters, applies patterns, edits dead keys and renames a
touch key. The live preview, the downloaded package, the source archive, the community pull request
and the LDML export all contain exactly those changes, because all of them are produced from the
same replayed keyboard.

**Why this priority**: Authors trust the preview. Today a change can appear in the preview and be
missing from the download (a renamed touch key's rules are the known case), which ships a broken
keyboard without warning.

**Independent Test**: Run a fixture walk that makes each kind of change, then compare the preview,
download, archive, pull request and LDML outputs. They agree with each other and with the previous
release's golden output, except where a recorded defect fix changes it on purpose.

**Acceptance Scenarios**:

1. **Given** an author renamed a touch key, **When** they download the package, **Then** the
   keyboard's rules use the new key name, as in the preview.
2. **Given** any completed walk, **When** the same keyboard is produced for preview and for
   download, **Then** the two are identical.
3. **Given** an author made no changes, **When** they download, **Then** the copied keyboard's
   source files are byte-for-byte the originals.

---

### User Story 2 - Changing an earlier choice rebuilds the keyboard correctly (Priority: P1)

An author goes back and changes which characters to remove after applying patterns and editing dead
keys. The keyboard is rebuilt from the starting point and all recorded choices. Every later edit
still applies to the rule it was made against.

**Why this priority**: Navigation must never undo or corrupt decisions. Today later steps re-read the
keyboard from generated text, which renumbers rules, so an edit recorded against one rule can land
on another.

**Independent Test**: Apply random sequences of choice changes. Building one change at a time and
rebuilding from scratch give the same keyboard and the same files every time.

**Acceptance Scenarios**:

1. **Given** a dead-key edit recorded against a rule, **When** the author changes an earlier removal
   choice, **Then** the edit still applies to that rule, or the author is told it no longer can.
2. **Given** the same starting point and choices, **When** the keyboard is rebuilt twice, **Then**
   the outputs are byte-identical.

---

### User Story 3 - The author is warned about errors in the keyboard they are building (Priority: P2)

The studio's continuous validation checks the keyboard the author is building, not the unedited
keyboard they started from.

**Why this priority**: Today a validity error introduced by an author's change is caught only when
the preview compiles, not by the validation findings the author reads and acts on.

**Independent Test**: Make a change that introduces a known validity error. The validation findings
show it within the normal validation cycle.

**Acceptance Scenarios**:

1. **Given** an author applies a pattern that creates an invalid rule, **When** the validation cycle
   runs, **Then** a finding names the problem.
2. **Given** the author undoes that change, **When** the cycle runs again, **Then** the finding is
   gone.

---

### User Story 4 - A contributor adds a step with one write path (Priority: P3)

A contributor adds a new authoring step. They declare its decision and a pure transformation of the
keyboard. They do not add an output stage, re-read generated text, or add state that only the output
stage reads.

**Why this priority**: Every surface added the current way adds another place where the preview and
the output can drift apart.

**Independent Test**: A write path that is not declared as a decision fails the equivalence check
that spec 105 introduced.

**Acceptance Scenarios**:

1. **Given** a new step that writes keyboard state outside a decision, **When** the checks run,
   **Then** they fail and name the write path.

---

### Edge Cases

- A keyboard opened for update (spec 111): changed rules are written into the author's own text, and
  a full reformat still needs the author's agreement. Today two output stages reformat without
  asking; that must stop.
- An author's direct code edit becomes a new starting point, and recorded choices replay on top of
  it. Every code editor must take this route; some skip it today.
- A recorded choice can no longer apply after an earlier choice changed (its rule was removed): the
  author is told, never silently ignored (Constitution Art X).
- A pattern whose rules target the keyboard's main group when that group has another name: the rules
  go to the keyboard's actual entry group.
- Touch-layout members and visual-keyboard content the model does not describe survive unchanged.
- Re-applying the same patterns does not duplicate rules.

## Requirements *(mandatory)*

### Functional Requirements

**Governance**

- **FR-001**: Work under this spec follows the 2026-11-10 rulings (Clarifications): every surface's
  `apply` returns the transformed keyboard (D-090-24 revised), and anything an output file carries
  folds into the keyboard model (spec 105 FR-007 amended).
- **FR-002**: Responsibility is split as follows (ruled 2026-11-10):
  - spec 105 keeps its per-surface phases (moving each editor's state into decisions), under the
    amended FR-007;
  - this spec owns the defect fixes, pattern application, the touch and visual-keyboard models, the
    single output stage and validation.

**One producer**

- **FR-010**: The keyboard MUST be a function of the starting point and the recorded decisions only.
  Rebuilding from the same inputs MUST give the same keyboard.
- **FR-011**: Every recorded decision that changes an output file MUST do so by transforming the
  keyboard model (including its touch layout and visual keyboard) during replay. No later stage may
  apply it a second time from separately stored state.
- **FR-012**: Pattern application MUST add the pattern's stores and rules to the keyboard model, with
  today's merge behaviour preserved and tested:
  - pattern rules take precedence over the starting keyboard's rules;
  - end-of-group directives stay last;
  - stores replace same-named stores;
  - system stores in a pattern are refused with a warning;
  - rules without a group go to the entry group;
  - re-applying is idempotent.

  The published pattern format MUST NOT change.
- **FR-013**: Ordering between decisions MUST be declared as dependencies, not implied by the
  position of an output stage. The checks MUST fail if the declared order would produce different
  output from the current stage order.
- **FR-014**: Output MUST be produced once, from the replayed keyboard, by one output stage used by
  preview, download, source archive, pull request and LDML export. No stage may re-read text another
  stage generated.
- **FR-015**: Original text MUST be preserved only in three cases:
  - an unedited starting point is copied byte-for-byte;
  - a keyboard opened for update gets changes written into the author's text, and a full reformat
    needs the author's agreement;
  - a direct code edit becomes a new starting point.

  Every source write MUST go through these rules.
- **FR-016**: Writing the touch layout MUST NOT mark keys as hand-set unless a decision changed them,
  and MUST keep layout members the model does not describe.

**Validation**

- **FR-017**: Continuous validation MUST check the keyboard being built, within the existing single
  validation cycle (no second timer, decision D3).

**Defects first**

- **FR-020**: These defects, found while mapping the current pipeline, MUST each be confirmed by a
  failing test and fixed as a separate change before the migration. That way the migration is checked
  against correct output.
  - (a) A renamed touch key's rules probably do not reach the download.
  - (b) Rebuilding drops the help-document fix proposals that the live path keeps.
  - (c) Continuous validation checks the unedited starting keyboard. Verified.
  - (d) Two output stages reformat a keyboard opened for update without the author's agreement.
  - (e) The preview of an opened keyboard is reformatted while its download is not.
  - (f) Some code editors replace the starting point without replaying decisions.
  - (g) Dead-key edits can land on the wrong rule after rules are renumbered.
  - (h) Edits to an opened keyboard can be placed by out-of-date line positions after a style line
    was added.
  - (i) Patterns target a group literally named "main". Rule additions to a group the starting
    keyboard lacks are lost.

**Gates**

- **FR-030**: Each phase MUST be landable alone and keep output byte-identical to the previous phase
  on the golden fixtures, except where an FR-020 fix changed it. A red gate counts against the phase
  only if it does not reproduce on an unchanged tree (spec 105 A/B rule).
- **FR-031**: For every surface, building one change at a time and rebuilding from scratch MUST
  produce the same keyboard model.
- **FR-032**: Each phase that changes replay MUST re-measure rebuild time and report it against the
  baselines (spec 105 FR-012).

### Key Entities

- **Starting point**: the keyboard the author began from (copied, or the current release when
  updating), with its original files.
- **Decision**: one recorded author choice, with its provenance; the only stored truth about the
  author's intent.
- **Replayed keyboard**: the result of applying every decision, in dependency order, to the starting
  point. It covers rules and stores, touch layout, visual keyboard, identity and package metadata.
- **Output mode**: how source text is written: copy unchanged, write into the author's text, or
  generate.
- **Output set**: the files produced from the replayed keyboard (source, package, archive, pull
  request, LDML).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of fixture walks, preview, download, archive, pull request and LDML output are
  produced from one replayed keyboard and agree with each other.
- **SC-002**: Across at least 1,000 random sequences of choice changes, building one change at a
  time and rebuilding from scratch agree in every case.
- **SC-003**: All nine FR-020 defects have a regression test, and none recur.
- **SC-004**: An error introduced by an author's change appears in the validation findings within
  one validation cycle, in 100% of the fixture cases.
- **SC-005**: An unedited copied keyboard downloads with its source files byte-identical to the
  originals.
- **SC-006**: After an edit, the rebuilt keyboard is ready in under 300 ms; restoring a saved draft
  takes under 2 seconds (spec 093's proposed budgets). Measured on the reference keyboard after
  editor surfaces join replay.
- **SC-007**: Adding a new authoring step needs one decision and one transformation. No change to the
  output stage is needed, as shown by the first step added after this spec lands.

## Assumptions

- **Drafts:** they keep today's saved envelope, which includes a working-copy snapshot. This spec
  does not depend on spec 105's decisions-only drafts. Those conflict with Constitution Art III, and
  that conflict belongs to spec 105.
- **Pattern de-duplication:** keeps today's scope, where a rule identical to one anywhere in the
  keyboard is not added again.
- **Context tolerance:** its result needs a compile and a simulation to compute. Its decision records
  that computed result, so replay stays synchronous and repeatable.
- **Visual keyboard:** `.kvks` edits may stay a documented text pass after output until a
  fidelity-preserving model exists. Every other output goes through the replayed keyboard.
- **Ordering against spec 117:** pattern application (FR-012) waits for spec 117's
  explicit-keystroke change, so the merge is written once. The defect fixes and the other workstreams
  do not wait.
- **Out of scope:** decisions-only drafts, the keyboard model restructure itself (spec 117),
  byte-identical round trip of arbitrary source (Constitution, v1 scope), and new authoring
  features.
- **Evidence:** file-level evidence for every statement here is in
  [evidence/draft-sketch.md](evidence/draft-sketch.md).
