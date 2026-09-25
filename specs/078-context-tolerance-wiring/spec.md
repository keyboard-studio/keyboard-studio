# Feature Specification: Context tolerance reaches the author

**Feature Branch**: `078-context-tolerance-wiring`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Wire spec 062 canonical-equivalence context tolerance to a user-reachable path in the studio: compute the tolerance report at the compile gate, surface KM_WARN_CONTEXT_NOT_TOLERANT findings to the author, and offer a propose-then-confirm fix (decomposed and composed treated as equivalent input, no change to output) through a mounted facet-transform surface, gated on the #1753/#1754 correctness fixes."

**Governing context**: [spec.md](../../spec.md) §3c (defaults are the product — propose-then-confirm everywhere, "no default is a defect"), §10 (validator layering — Layer C findings are advisory and never block), and §9 (normalization posture). The capability this feature exposes is specified in [062-canonical-context-tolerance](../062-canonical-context-tolerance/spec.md) and is **not re-derived here**: this spec owns only the path from that capability to the author. The propose/preview/confirm surface it mounts is [039-facet-transform](../039-facet-transform/spec.md); the survey step contract is [012-step-model-manifest](../012-step-model-manifest/spec.md) and [014-mutate-seam-touch-propagation](../014-mutate-seam-touch-propagation/spec.md); the mark question series it joins is [071-marks-question-series](../071-marks-question-series/spec.md); the decision record it writes to is [053-decision-audit](../053-decision-audit/spec.md) / [055-legible-decision-trail](../055-legible-decision-trail/spec.md). Verified code-level findings, the audit of what spec 062 shipped, and the known defects are in [research.md](research.md).

## Why this exists

Spec 062 was built and merged in full, and no author can reach any of it.

The engine can now tell whether a keyboard's diacritic and backspace rules
fire identically over composed and decomposed text, generate the rules that
make them do so, and report which rules it could not fix and why. Every one of
those capabilities has tests. Every one of those capabilities has **only**
tests as callers. The lint check that would warn the author is wired but
depends on a report nothing produces; the propose-then-confirm panel it was
designed to reuse is not mounted anywhere in the running application. An
author importing `sil_yoruba8` today sees exactly what they saw before spec 062
existed: a keyboard that types a spacing accent when FieldWorks has decomposed
the buffer, and no hint that anything is wrong.

The engineering record calls this a deliberate follow-up rather than dropped
scope, and it was the right call at the time: two correctness defects were
found afterwards by running the transform across the real corpus, one of which
turns a visible failure into a silent wrong tone in a tone language. Exposing
authors to that would have been worse than exposing them to nothing. Both
defects now have a fix in review. This spec is the follow-up.

The principle is the one spec 062 stated and §3c makes general: **an author
should never have to know, and a user should never have to care, which
normalization form the buffer is in** — and a decision the studio can derive
must be proposed, not left blank. Context tolerance is exactly such a decision.
The studio knows the keyboard's output form, knows which rules break on the
other form, and knows how to fix them. Asking nothing and doing nothing is the
defect §3c names.

## Clarifications

### Session 2026-09-24

- Q: Should the own-form write-back choice (spec 062 US3) be surfaced in this feature? → A: No — echo-only. Story 4 is removed; the engine mechanism stays built but unexposed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The author is told their keyboard breaks on decomposed text (Priority: P1)

As a keyboard author, when the studio compiles my working copy I want to be
told, in the same place other problems are reported, that some of my rules
will not fire when the host application has decomposed the text, which rules,
and what a user would see happen.

**Why this priority**: Without this, nothing else in the feature is
discoverable. It is also independently valuable: an author who declines the
fix still knows to test in FieldWorks. It closes the half of spec 062 FR-012
that shipped without a renderer (characters by name, not only codepoint).

**Independent Test**: Import `sil_yoruba8`, wait for the preview to be ready,
and confirm a finding names the affected rules, one concrete keystroke case
per rule in plain words ("after o with dot below, the acute key types a
standalone accent instead of adding it to the letter"), with each character
shown by its Unicode name. Import a keyboard that already handles both forms
and confirm no finding.

**Acceptance Scenarios**:

1. **Given** a working copy whose rules break on decomposed text, **When** the
   preview finishes compiling, **Then** a single advisory finding appears in the
   existing diagnostics area, counting affected rules and expandable to a per-rule
   list with a reproducible case each.
2. **Given** the same keyboard, **When** the finding is expanded, **Then** every
   character in a case is shown by codepoint **and** Unicode name, and no message
   uses the words "NFC", "NFD", "normalization" or "canonical" without a plain-
   language gloss.
3. **Given** a keyboard the analysis could not fully cover (opaque rules, paired
   stores, or a compile the analysis could not run), **When** the preview finishes,
   **Then** the author sees a distinct "some rules could not be checked" notice
   naming how many and why — never a clean result.
4. **Given** any keyboard, **When** the finding appears, **Then** the preview and
   every other diagnostic appear in the same refresh; the author does not wait for
   a second pass and the finding never blocks download.

---

### User Story 2 - The author accepts the proposed fix (Priority: P2)

As a keyboard author, I want the studio to propose making my keyboard tolerant,
show me exactly what it will add before it does so, and let me confirm — or
confirm part of it — so my keyboard works over decomposed text without my
learning the mechanism.

**Why this priority**: This is the payoff of spec 062 and the reported defect's
actual fix. It is P2 only because it depends on the finding existing (P1) and
on the two correctness defects being closed (see Dependencies).

**Independent Test**: Import `sil_yoruba8`, accept the proposal, download, and
confirm through the simulator that decomposed *o* + dot-below followed by each of
the five accent keys produces the correct accent; confirm composed input is
byte-identical to before; confirm the diagnostic now reports clean.

**Acceptance Scenarios**:

1. **Given** a finding from Story 1, **When** the author reaches the mark
   decisions in the survey, **Then** a decision point is pre-filled to make the
   keyboard tolerant, with a preview of what will be added: how many rules, which
   existing rules each one shadows, and the resulting behaviour in words.
2. **Given** the preview, **When** the author confirms, **Then** the working
   copy gains the generated rules, the diagnostic reports the fixed rules as
   tolerant, the decision is recorded in the decision trail as proposed by the
   tool and confirmed by the author, and downloaded output carries the rules.
3. **Given** the preview, **When** the author unticks some sites and confirms,
   **Then** only the ticked sites change, the unticked rules remain in the
   finding as unfixed, and the trail records the partial acceptance.
4. **Given** a keyboard already made tolerant, **When** the author confirms the
   proposal again, **Then** the working copy is unchanged.
5. **Given** composed input, **When** the fixed keyboard runs, **Then** its
   output is byte-identical to the unfixed keyboard's.

---

### User Story 3 - The author declines, and nothing is hidden or changed (Priority: P3)

As a keyboard author who knows my users' host application never decomposes, I
want to decline the fix and have the studio respect that: no rules added, no
nagging, and a record that I chose this.

**Why this priority**: Propose-then-confirm is only honest if declining is a
first-class outcome. It matters for the honesty of the decision trail and for
authors of keyboards whose conventions the fix would clutter.

**Independent Test**: Decline the proposal, download, and confirm output is
byte-identical to the imported source's emitted form; reopen the survey and
confirm the decision reads as declined with the finding still visible.

**Acceptance Scenarios**:

1. **Given** the proposal, **When** the author declines, **Then** the working
   copy is unchanged, the finding stays visible as an advisory, and the trail
   records "declined" with the tool's proposal attached.
2. **Given** a declined proposal, **When** later survey steps run, **Then** the
   proposal is not re-raised unless the affected rules change.

---

### User Story 4 - The author chooses what the keyboard writes back — **removed (echo-only)**

**Resolved 2026-09-24 (owner):** this feature ships **echo-only**. The
generated tolerant path always echoes the form it found; no own-form
write-back choice is surfaced. Spec 062 US3's own-form mechanism
(`contextToleranceWriteBack: "own-form"`) stays built in the engine but is
unexposed; any future exposure is a separate spec. Rationale: the owner's
stated intent is "equivalent input, no change to output"; the only cited host
(FieldWorks) is one where own-form is actively harmful; and upstream has no
precedent for a keyboard deliberately rewriting text the user did not type
(crew review 2026-09-23, linguist and upstream-parity reviewers).

---

### Edge Cases

- **The analysis cannot compile the keyboard.** Some keyboards reference asset
  files the analysis does not carry. This must surface as "could not be
  checked", never as "no problems found". (Research: this silently disabled the
  feature on 965 of 1,044 corpus keyboards before the fix in review.)
- **A key store selects different physical keys per member.** The generated rule
  must preserve the per-key dependency; collapsing it produces a well-formed but
  wrong accent, which in a tone language is a different word. The proposal MUST
  be withheld for any rule the generator cannot prove it handles, and the rule
  reported as unfixable. (Research: the defect in review.)
- **Mnemonic-layout keyboards.** Backspace-unwrap rules are known not to fire in
  the studio's simulator on mnemonic layouts. The proposal must say so for those
  rules rather than claim them fixed, and the preview must not simulate a
  success it cannot observe.
- **Two-class mark stacks.** Backspace removes the canonically last mark, not the
  most recently typed. The preview must show the resulting order for any such
  stack in the inventory so the author can judge it.
- **Rules the codec could not model.** Reported as not checked; never modified.
- **The author edits rules after accepting.** The finding recomputes on the next
  compile; a generated rule made stale by an edit is reported, not silently kept.
- **Track 1 versus Track 2.** A scaffolded keyboard and an imported keyboard
  reach the same decision point; a scaffolded keyboard whose mark model already
  produced tolerant rules reports clean **or could-not-check** (a mnemonic
  scaffold still hits the backspace limitation) and the decision is pre-filled
  "nothing to do".
- **Large keyboards.** Analysis simulates rules behaviourally and runs its own
  compile. It must never delay the preview: it races the preview compile rather
  than joining it, and if it has not finished when the preview is ready, the
  preview shows and the finding arrives when done, in the same diagnostics area.
- **Shadowing by a non-fallback rule.** A generated decomposed-context rule may
  be preceded by an existing rule on the same key whose context overlaps the
  decomposed form. The preview must show every rule the addition shadows or is
  shadowed by, not only the bare fallback it preempts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The studio MUST compute the context-tolerance report for the
  working copy whenever it compiles the working copy for preview, riding the
  existing compile-gate cycle (not the keystroke validation debounce, which it
  must not touch); no separate trigger, timer, or author action. The report
  MUST NOT delay the preview.
- **FR-002**: The report's findings MUST appear in the same diagnostics surface
  as other compile diagnostics, at advisory severity, and MUST never block
  preview, download, or submission.
- **FR-003**: Each finding MUST name the affected rule, give one reproducible
  keystroke case in plain language, and show every character by codepoint and
  Unicode name.
- **FR-004**: Rules the analysis could not check, and the reason, MUST be shown
  as a distinct notice; a partially analysed keyboard MUST NOT read as clean.
- **FR-005**: When the report shows fixable rules, the studio MUST propose the
  fix as a pre-filled decision point in the survey's mark decisions, declared in
  the step manifest with its inputs and writes like every other step.
- **FR-005a**: The step's own write MUST be the **decision** (accept, partial
  with site ids, or decline), recorded through the survey's ordinary write seam
  with declared writes. Applying the accepted rules to the working copy is a
  **separate effect** keyed off that recorded decision, committed through the
  same seam every other confirmed facet transform uses, because generating the
  rules compiles and simulates and cannot be a synchronous step write. Both
  halves MUST be named in the plan; neither may be hidden inside the other.
- **FR-006**: The proposal MUST preview what will change — added-rule count, the
  rules each addition shadows or is shadowed by (fallback and non-fallback
  alike), and the behaviour in words — before the author can confirm.
- **FR-007**: The author MUST be able to confirm all, confirm a subset of sites,
  or decline. Each outcome MUST be recorded in the decision record with the tool
  as proposer and the author as decider.
- **FR-008**: Confirming MUST change the working copy through the same seam
  every other confirmed transform uses; the change MUST be idempotent and MUST
  preserve output byte-for-byte on input in the keyboard's own form.
- **FR-009**: Declining MUST leave the working copy unchanged, keep the finding
  visible, and suppress re-proposal until the affected rules change, as judged
  by the decision fingerprint (see Key Entities).
- **FR-010**: The proposal MUST be withheld — and the rule reported unfixable
  with its reason — for any rule the generator cannot prove it handles
  correctly. At minimum: key stores that select different physical keys per
  member; compound key parts; `notany()` in context or key; output positions
  indexed by a context-side match; stores mixing characters and deadkeys under
  one reference; rules guarded by `if()`, `platform()` or `baselayout()`; and
  any rule the codec holds opaque.
- **FR-011**: The feature MUST NOT be enabled for authors until the two
  correctness defects recorded in [research.md](research.md) §4 are merged and
  the corpus harness reports zero regressed keyboards.
- **FR-012**: The corpus harness's verdict per keyboard (no gap, fixed, remaining,
  regressed, could not check, refused) MUST be the regression gate for any change
  to this path, run in CI on the pinned corpus.
- **FR-013**: All author-facing text MUST be localized under the project's
  message-id rules and MUST be understandable without normalization vocabulary.
  Reference glosses the text must be at least as plain as: for decomposed text,
  "the letter and its accent are stored as two separate characters instead of
  one, the way some programs such as FieldWorks keep text internally"; for the
  finding, "this key only works when the accent is already joined to the
  letter; when it is not, pressing the key adds a floating accent next to the
  letter instead of on top of it".
- **FR-014**: The surface MUST meet the project's accessibility house rules: the
  finding is announced by the existing live region, the proposal is keyboard-
  operable, and each site's tick is a labelled control.
- **FR-015**: Generated rules and stores MUST be legible to a human maintainer
  of the emitted `.kmn`: names describe what the rule does, not which tool made
  it, and a source comment on the generated block names its origin and purpose.
  A keyboard headed for a community pull request must not read as
  machine-stamped.

### Key Entities

- **Tolerance report**: per rule, whether it is tolerant, has a gap, was made
  tolerant, or could not be analysed (and why). Produced once per compile;
  consumed by the diagnostics surface and the proposal.
- **Tolerance proposal**: the generated context variants, grouped by the source
  rule they protect, each a site the author can accept or refuse.
- **Tolerance decision**: the author's resolution — accepted, partially accepted
  (with sites), or declined — recorded in the decision record with the proposal
  attached. This is the step's only write.
- **Decision fingerprint**: the identity of the affected rules as they stood
  when the author decided (a stable digest of those rules' content). A later
  compile whose report names rules outside the fingerprint, or whose fingerprint
  differs, re-raises the proposal; an identical fingerprint does not. This is
  new state and is what FR-009 and the "author edits rules after accepting"
  edge case are judged against.
- **Write-back policy**: fixed at echo for this feature (Story 4 resolution); not author-selectable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Importing `sil_yoruba8` and waiting for the preview surfaces the
  finding with no further author action; the finding appears in the same refresh
  as the preview.
- **SC-002**: Accepting the proposal takes no more than two author interactions
  from the decision point (review, confirm).
- **SC-003**: After accepting, all five of `sil_yoruba8`'s accent keys produce
  the correct accent over decomposed input in the simulator, and composed input
  is byte-identical to before.
- **SC-004**: On the pinned corpus (1,044 keyboards), the harness reports zero
  `regressed`, and at least 40% of keyboards with a gap report `gap-fixed`
  (research §4 measured roughly 43% after the compile fix).
- **SC-005**: 100% of rules in every analysed keyboard are accounted for in the
  report as tolerant, gap, fixed, or not-analysed-with-reason.
- **SC-006**: Every accept, partial accept, and decline is present in the
  decision trail with the tool as proposer; a spot check of ten sessions finds
  no unrecorded outcome.
- **SC-007**: A user-test participant with no normalization vocabulary can state
  what the finding means and what confirming will do after reading it once.
- **SC-008**: Declining and downloading yields output identical to the same
  working copy's emitted output without this feature (the codec is not a
  byte-identical round-trip of the imported source, and this criterion does not
  claim it is).

## Assumptions

- The two correctness defects (research §4) land before or with Story 2; Story 1
  may ship first because a correct *diagnosis* does not depend on the generator,
  but its compile fix does, so Story 1 also waits on the compile-asset fix.
- The decision point lives in the mark decisions of the survey (spec 071's
  series) because context tolerance is the mark model's fifth consumer and the
  author is already thinking about marks there. A finding-driven "fix it" button
  elsewhere would be a survey surface outside the manifest, which the project
  constitution forbids.
- **Constitution Article IX reconciliation.** Article IX routes every step's IR
  write through the survey's synchronous write seam. Generating tolerant rules
  compiles and simulates, so it cannot be that write. FR-005a resolves this by
  splitting the step's write (the decision) from the effect that applies it
  (the facet-transform commit seam spec 039 already defines). The plan's
  Constitution Check should cite FR-005a; if reviewers judge the split
  insufficient, Article IX needs an amendment naming the async commit seam,
  which is a governance change and not this spec's to make.
- Whether spec 071's series runs on the import track was not verified during
  review. If some flow skips the series, the plan must name where the decision
  point goes for that flow.
- Spec 062's write-back default (echo) stands and is the only policy this
  feature exposes (Story 4 resolved echo-only, 2026-09-24).
- Both authoring tracks reach the decision point; a scaffolded keyboard whose
  mark model already produced tolerant rules simply reports clean.
- The analysis is behavioural and compiles the keyboard; it therefore runs where
  the studio already compiles and is expected to complete within the existing
  preview cycle for corpus-sized keyboards. If measurement shows otherwise, the
  finding arrives late rather than the preview arriving late.
- Layer C findings currently have no production path into the studio's
  diagnostics at all (research §3). This feature establishes that path for this
  check; it does not undertake to surface every Layer C check.
- The mnemonic-layout backspace limitation and canonical-order mark removal are
  disclosed, not fixed, here; they remain spec 062 follow-ups.

## Dependencies

- PR "fix(engine): two spec 062 context-tolerance correctness defects" (research §4).
- PR "feat(tools): NFD/NFC context-tolerance corpus harness" (research §5), which
  supplies the FR-012 gate.
- The engine's decision on exporting the tolerance functions to the studio's
  build graph without dragging the Node-only simulator chain in (research §3,
  item 5) — a plan-phase design decision, not a spec question.
- [077-base-decisions](../077-base-decisions/spec.md), in progress on its own
  branch, writes to the same decision record and may be the first to mount a
  propose-then-confirm surface of this shape. Coordinate at plan time so the two
  features share one pattern rather than establishing two.
