# Feature Specification: Consistent keyboard output from base + decisions + carve

**Feature Branch**: `106-consistent-keyboard-output` (stacked on `km/s02-deadkey-purpose`, PR #2358)

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Consistent keyboard output from base + decisions + carve, per source-plan.md (phases 1-7). Verification: confirm consistent results by constructing clean IR starting points (starting IR + decision record) up to each decision point and projecting, rather than only driving the UI; the 32-case #2302 walk is the end-to-end gate."

## Context

The #2302 zip walk (Bafut on `basic_kbdus`) produced a keyboard that disagrees with the decisions the
author made. Seven gaps (E1-E7, evidence in [source-plan.md](source-plan.md)):

- **E1**: the marks-guard decision never reaches the download.
- **E2**: the output form is not followed (deadkey stores precomposed under base-plus-mark).
- **E3**: starting rules shadowed by assignments survive carve (14 unreachable-rule hints).
- **E4**: placements are left as placeholders because no proposal is pre-selected.
- **E5**: contexts are not NFC/NFD tolerant.
- **E6**: emitted rules are noisy and interleaved.
- **E7**: caps handling is a silent scaffold side-effect.

Constitution v2 Art. X (base-derived values are proposals) and spec 105 (the working copy is derived;
new behaviour lives in the projection / replay, never a second author-truth store) bind every
requirement below.

## Clarifications

### Session 2026-10-29 (rulings carried from the plan, closed)

- Q: How does the author allow a mark after a space? → A: The attachment station gets a **space** column on every mark row, unchecked by default. Ticking it allows the mark after U+0020. Digits, punctuation and buffer start are never offered and are always blocked. **Re-ruled 2026-10-30 via #2374 (see Session 2026-10-30 below): buffer start IS offered, as a per-mark "start of line" column.**
- Q: What rule shape does an S-02 deadkey use under base-plus-mark? → A: km-keyman rules on it at the start of that story. The builder follows the ruling, and the ruling is recorded in the PR body and in `research.md`.
- Q: Are carve's suggested discards opt-in? → A: No. They are an **approvable default**: Continue on the carve step approves them.
- Q: Which keys does `&CasedKeys` cover? → A: Every key, on every modifier plane the assignments use, that carries a cased pair. The layout-family list is the floor, not the ceiling.
- Q: How is the touch "lost keys" report handled? → A: Every walk run diffs the touch `default` layers against the alphabet, and the bug is filed when the loss reproduces. There is no separate story.
- Q: May `nul` / `beep` appear inside stores? -> A: No. Keyman 19's compiler rejects them (keymanapp/keyboards#4181, from keymanapp/keyman#16723). Generated stores never contain them. How starting keyboards that still do (e.g. `sil_cameroon_qwerty` `store(dkt003b)`, `sil_cameroon_azerty`) are normalised is **deferred to the outcome of that issue** (split into separate rules vs `dk(none)`), tracked in #2361. As rule outputs (`> nul`, `> beep`, `> context(1) beep`), they remain legal.
- Q: Should blocked marks offer a beep variant? -> A: No. In current Keyman, `beep` and `nul` have the same effect (neither audibly beeps), so swallow already covers beep. There is no beep answer and no beep variant. Direction: prefer `nul` over `beep`. Generated rules always use `nul`, and items split out of illegal stores are emitted as `nul`.
- Q: How are consistent results confirmed? → A: Primarily by **decision-point fixtures**: a clean starting IR plus a decision record built up to each decision point, then projected and asserted. The UI walk is the end-to-end gate, not the primary check.

### Session 2026-10-30 (re-ruling via #2374, km-lead ruling; supersedes "buffer start never offered" above)

- Q: Is buffer start ever offered? → A: Yes, as a per-mark **"start of line"** column on the attachment station, mirroring the space column: unchecked by default, excluded from the FR-008 summary. Unticked (default) = the `nul '<mark>' > nul` buffer-start swallow rule applies; ticked = the `nul` rule is omitted and `"\n"` is added to the mark's generated allowed store, so the mark may start a line and follow line breaks. This replaces the retired per-keyboard guard question (spec 104 FR-013): confirmed `emit` answers migrate to ticked boxes with `origin: "migrated-from-guard"`; `swallow` needs no migration (the unchecked default reproduces it exactly); seeded-but-unconfirmed answers are dropped.
- Q: Does anything else change? → A: No. Digits and punctuation are still never offered and always blocked; the space column is unchanged. The only new allowance is after line breaks for ticked marks (the defined meaning of "start of line").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Decision-point fixtures prove the output (Priority: P1)

A maintainer can state "base keyboard X + decisions D1..Dn" as a fixture and get the exact downloadable
keyboard the studio would produce. Each fixture stops at a named decision point: after marks
treatment, after assignments, after carve, after caps, after tolerance. Every later story is verified
first against these fixtures, and only then by the UI walk.

**Why this priority**: The user asked for it explicitly. Without it, every other story can only be
checked by a slow, flaky 32-case browser walk.

**Independent Test**: Build the Bafut/`basic_kbdus` fixture at each decision point, project it, and
compare the result to the harness zip from the same decisions. Today's known gaps are recorded as
expected-failure assertions, which flip to passing as each story lands.

**Acceptance Scenarios**:

1. **Given** a starting keyboard id and a decision record (JSON), **When** the fixture is projected, **Then** the result is byte-identical to what the studio download path serializes for the same working copy.
2. **Given** the four #2302 base keyboards x the profile decision records, **When** fixtures are projected at each decision point, **Then** the consistency gates (FR-030) are evaluated and reported per fixture and per gate.
3. **Given** a fixture, **When** it is projected twice, **Then** the output is identical (determinism).

---

### User Story 2 - Blocked marks never reach the text (Priority: P1)

The author decides which letters each mark may attach to; a blocked mark is swallowed. The downloaded keyboard enforces that decision. A blocked mark typed after a non-letter, a
digit, punctuation, a space (unless the space column is ticked) or at buffer start (unless the mark's start-of-line box is ticked) is blocked. Backspace follows the
backspace decision.

**Why this priority**: E1. The decision exists but has no effect on the artifact, which is the most
visible inconsistency, and story 6 (tolerance) depends on it.

**Independent Test**: Run the fixture "Bafut kbdus after marks treatment" and simulate the
compiled keyboard: `5` after `a` is blocked when `à` is unchecked; it is also blocked after `1`,
after space (unticked space column), and at buffer start (unticked start-of-line box); touch `T_0300` takes the same route.

**Acceptance Scenarios**:

1. **Given** marks treatment = swallow with an attachment matrix, **When** the keyboard is downloaded, **Then** it contains the generated guard group and the whole-stack backspace rules.
2. **Given** the space column is ticked for one mark, **When** that mark is typed after a space, **Then** it is emitted; for any other mark it is blocked.
3. **Given** the mark's start-of-line box is ticked, **When** the mark is typed at buffer start, **Then** it is emitted; unticked, it is swallowed. Attachment blocking swallows. No beep variant: `beep` and `nul` have the same effect in current Keyman (research R3).
4. **Given** the marks decision is changed or removed, **When** projected again, **Then** the guard output updates and no stale guard rule remains.

---

### User Story 3 - Output follows the output-form decision (Priority: P1)

Every character the keyboard emits follows the single keyboard-wide output-form choice: ready-made
(precomposed) or base-plus-mark. This applies to every mechanism: simple swap, deadkey, sequence,
AltGr, the mark key, and case counterparts.

**Why this priority**: E2. A keyboard that mixes forms breaks search, spell-check and sorting for
the community.

**Independent Test**: Run the fixtures for the four #2302 output/backspace profiles x {deadkey, mark
key}. No precomposed character appears in any output under base-plus-mark, and no decomposable
sequence appears under ready-made.

**Acceptance Scenarios**:

1. **Given** output form = base-plus-mark and a caron deadkey, **When** downloaded, **Then** deadkey + `a` emits `a` U+030C and the rule shape is the one km-keyman ruled on.
2. **Given** output form = ready-made and a postfix mark key, **When** the author types `a` then the mark key, **Then** `ǎ` is emitted, built only from the allowed attachment pairs; the bare mark appears only if the author kept the bare-mark escape.
3. **Given** a case counterpart is placed, **When** downloaded, **Then** the counterpart uses the same form.

---

### User Story 4 - Carve removes what the decisions made unreachable (Priority: P2)

The author's assignments replace the starting keyboard's rules for those keys. Characters carve
suggests discarding are shown as discarded by default and approved on Continue. Needed punctuation
that an assignment overwrites is offered a new home, never silently lost.

**Why this priority**: E3/E4. 368 unreachable-rule hints in the author's own session, and a lost
`'`.

**Independent Test**: In the "after assignments" fixtures, a plain override drops the base rule; a
Shift-only difference is kept; contextual rules survive; removing the assignment restores the rule.
The Bafut fixture compiles with zero unreachable-rule hints.

**Acceptance Scenarios**:

1. **Given** `;` is reassigned to a deadkey trigger, **When** projected, **Then** the starting `+ [K_COLON] > ';'` rule is absent, and it returns when the assignment is removed.
2. **Given** a first visit to carve, **When** the step renders, **Then** the suggested characters show as "discarded, suggested — click to keep"; Continue records the approval in the decision record; Keep and Discard-all still override.
3. **Given** an assignment overwrites `'` on its key, **When** placed, **Then** a demotion proposal for `'` is raised; if declined, the loss is recorded as a decision.

---

### User Story 5 - Caps Lock does the right thing (Priority: P2)

Caps handling is a visible decision. For a script with casing, Copy-track keyboards default to
`&CasedKeys` covering every key that carries a cased pair. Adapt-track keyboards get a strong
suggestion that is applied only when it provably changes no output. Caseless scripts get nothing.

**Why this priority**: E7. A Caps Lock that produces half-cased output is a top user complaint, and
today the setting is a silent scaffold side-effect.

**Independent Test**: In the "after caps" fixtures:

- QWERTY and AZERTY stores have the expected text, including a non-letter key carrying `ŋ`/`Ŋ`.
- A caseless base produces no store.
- `sil_cameroon_qwerty` adapt is offered the simplification, and it compiles with zero warnings.
- The NCAPS consistency check is green on all four #2302 bases.

**Acceptance Scenarios**:

1. **Given** a cased alphabet on the Copy track, **When** caps is reached, **Then** `cased-keys` is pre-set (provenance default) with the union of the family list and every key whose planes form a case pair.
2. **Given** an Adapt start with explicit CAPS/NCAPS rules, **When** caps is reached, **Then** the simplification is offered only if outputs under {none, SHIFT, CAPS, SHIFT+CAPS} are identical before and after; otherwise it is withheld with the reason.
3. **Given** a caseless alphabet, **When** caps is reached, **Then** mode = none and the step auto-completes.
4. **Given** the target key is in `&CasedKeys` and the counterpart is in the alphabet, **When** a letter is placed, **Then** the case-pair companion is pre-accepted (visible, dismissible).

---

### User Story 6 - Contexts accept NFC and NFD text (Priority: P3)

Text-context rules (guards, backspace, deadkey-free sequences) behave the same whether the existing
text is composed or decomposed.

**Why this priority**: E5. It depends on stories 2 and 3.

**Independent Test**: Seeded-context simulator tests: NFC `ǎ` and NFD `a`+U+030C contexts both
block, peel and whole-stack identically. Across the 32 profile fixtures the not-tolerant warning
count is zero.

**Acceptance Scenarios**:

1. **Given** the tolerance report has gap findings, **When** the station renders, **Then** normalization is shown as accepted by default ("change" to revisit).
2. **Given** pasted NFD text, **When** a guarded mark is typed, **Then** the outcome equals the NFC case.

---

### User Story 7 - Clean, readable rules (Priority: P3)

The downloaded `.kmn` reads like a hand-written keyboard:

- one comment per pattern block;
- generated rules grouped by mechanism in a stable order;
- deadkeys named by purpose (`dk(caron)`);
- the Rules pane shows plain-language messages instead of raw codes.

**Why this priority**: E6. Reviewers in keymanapp/keyboards read this file.

**Independent Test**: Snapshot of the Bafut fixture `.kmn` shows the grouping order and named
deadkeys, and stays deterministic across runs. A numeric id appears only when a name collides with a
starting-keyboard deadkey.

**Acceptance Scenarios**:

1. **Given** several S-03 rules, **When** emitted, **Then** one comment line heads the block.
2. **Given** a starting keyboard that already uses `dk(caron)`, **When** a caron deadkey is generated, **Then** it takes a non-colliding id.

---

### User Story 8 - Accept-all yields a real keyboard (Priority: P3)

In the mechanism gallery the top-ranked placement proposal, the purpose trigger and the spare-key
rule are pre-selected. An author who accepts every proposal gets a complete keyboard with no
placeholders.

**Why this priority**: E4 verification. It is also what lets the 32-case walk run without
placeholder keys.

**Independent Test**: The walk harness drops its `zzq` placeholder path, records which proposals it
accepted, and all 32 cases pass the consistency gates.

**Acceptance Scenarios**:

1. **Given** a letter with ranked candidates, **When** the card opens, **Then** the top candidate is selected.
2. **Given** a walk run, **When** a touch `default` layer is missing an alphabet letter, **Then** the run reports it with the zip attached.

### Edge Cases

- Starting keyboard already has its own guard or normalization group: generated groups are named `generated_*`, so they are stripped and regenerated (idempotent), and the author's groups are untouched.
- A mark is allowed on no letters at all: every occurrence is blocked, and the station warns.
- Output form changes after deadkeys are placed: the projection rewrites every output and stores nothing stale.
- A postfix compose rule conflicts with a starting rule on the same key: the claimed-inputs filter (story 4) drops the starting rule.
- A starting rule has `if()`, a deadkey or a preceding context: carve never drops it on claimed-input grounds.
- An Adapt keyboard mixes `&CasedKeys` and explicit CAPS rules: extract as cased-keys plus a withheld-simplification note.
- A purpose name is not a valid identifier, or collides: fall back to a numeric id.
- A fixture references a keyboard missing from `../keyboards`: skip with a reason; never pass silently.
- A starting store mixes `nul`/`beep` items with ordinary ones in an `any`/`index` pair: only the illegal items are split out, and the remaining pair keeps its alignment.
- The upstream fork later ships the #4181 fix: the normaliser finds nothing to do (idempotent), and G8 still passes.

## Requirements *(mandatory)*

### Functional Requirements

**Verification foundation (US1)**
- **FR-005**: Preview and download MUST build their projection input through one shared function, so the OSK preview and the download cannot diverge (research F-DIVERGE).
- **FR-001**: The project MUST provide a fixture builder that takes a starting keyboard (corpus id or IR) and a decision record up to a named decision point. It MUST return the projected output files using the same projection the download path uses. No second projection implementation.
- **FR-002**: Fixtures MUST cover the four #2302 base keyboards x profile decision records at each decision point: marks treatment, assignments, carve, caps, tolerance.
- **FR-003**: Each fixture MUST evaluate the consistency gates (FR-030) and report them per gate. A gap not yet fixed is an expected failure that flips when its story lands.
- **FR-004**: Fixture projection MUST be deterministic, and it MUST compile with the same compiler path as the studio's download.

**Mark guards (US2)**
- **FR-010**: The projection MUST emit the mark guard group and the backspace rules from the recorded marks-treatment decision, after assignments and before context tolerance, idempotently.
- **FR-011**: Guard generation MUST live only in the projection. The marks-treatment apply no longer writes guards into the working copy; the decision value is unchanged.
- **FR-012**: Blocking MUST cover every context outside the mark's allowed set (non-letters, digits, punctuation, and buffer start unless the mark's start-of-line box is ticked — FR-015) using one rule per mark; blocked marks are swallowed. At buffer start the per-mark start-of-line box decides.
- **FR-013**: The attachment station MUST offer a space column, unchecked by default, on every mark row. Ticking it adds U+0020 to that mark's allowed set.
- **FR-015**: The attachment station MUST offer a start-of-line column, unchecked by default, on every mark row. Unticked = the `nul '<mark>' > nul` buffer-start swallow rule applies; ticked = the `nul` rule is omitted and `"\n"` is added to the mark's generated allowed set, so the mark may start a line and follow line breaks. The column's sentinel never enters `allowedContexts` and is excluded from the FR-008 summary (same posture as the space column).

- **FR-014**: No store in the downloaded keyboard may contain `nul` or `beep`, whether generated or carried over from the starting keyboard. A starting store that contains them MUST be normalised in the projection by the method keymanapp/keyboards#4181 adopts (tracking issue #2361); typed behaviour MUST be identical before and after (simulator-checked). Until then, G8 is enforced for generated stores and reported (expected failure) for starting stores.

**Output form (US3)**
- **FR-020**: Every output string the assignments emit MUST be rewritten to the keyboard-wide output form through one seam.
- **FR-021**: The S-02 base-plus-mark rule shape MUST follow the km-keyman ruling recorded before the build starts.
- **FR-022**: A postfix-compose mechanism MUST produce composed output under ready-made output, derived from the attachment matrix. The bare-mark fallback is emitted only when the author keeps that escape.
- **FR-023**: Case counterparts MUST follow the same output form.

**Carve (US4)**
- **FR-040**: The projection MUST drop any starting rule whose whole context is exactly one vkey + modifier set claimed by an assignment: S-01, S-08, S-02 trigger, AltGr escape, or postfix compose. It MUST be computed fresh every projection.
- **FR-041**: Rules with a preceding context, a deadkey, or `if()` MUST be kept.
- **FR-042**: Suggested discards MUST be recorded as default-provenance removals on the first carve visit and approved by Continue. Keep and Discard-all remain overrides.
- **FR-043**: Overwriting an always-keep punctuation character MUST raise the demotion proposal. A decline MUST be recorded as a decision.

**Caps (US5)**
- **FR-050**: A `caps-handling` decision (mode: cased-keys | explicit-rules | none; keys) MUST exist on the layout screen. It requires the character inventory and the Windows layout.
- **FR-051**: The decision MUST be proposed only when the confirmed alphabet has at least one case pair. Otherwise mode = none and the step auto-completes.
- **FR-052**: On the Copy track the decision MUST default to cased-keys. The key set is the union of the layout-family list and every key, on every assigned modifier plane, whose outputs form a case pair. The store MUST be derived in the projection, and the scaffold MUST NOT insert it silently.
- **FR-053**: On the Adapt track, the simplification to cased-keys MUST be offered only when it compiles and the simulator outputs for every key under {none, SHIFT, CAPS, SHIFT+CAPS} are identical before and after. Otherwise the offer MUST be withheld with the reason. Declining keeps the author's rules.
- **FR-054**: The case-pair companion MUST be pre-accepted when the key is in the derived set and the counterpart is in the alphabet.
- **FR-055**: Touch `caps` layers MUST carry every cased letter that is on `default`, and they MUST have no `nextlayer`.

**Tolerance (US6)**
- **FR-060**: The normalization step MUST be default-accepted (provenance default) when the tolerance report has gap findings.
- **FR-061**: Guard and whole-stack rules MUST behave identically for NFC and NFD seeded contexts.

**Clean rules (US7)**
- **FR-070**: Emit one comment per pattern block.
- **FR-071**: Generated rules MUST be grouped in a stable mechanism order: stores, AltGr, deadkey clusters, swaps, sequences, then starting rules.
- **FR-072**: Deadkeys MUST be named by purpose, unless the name collides.
- **FR-073**: The Rules pane MUST render plain-language diagnostics.

**Proposals (US8)**
- **FR-080**: The top-ranked placement candidate, the purpose trigger and the spare-key rule MUST be pre-selected.
- **FR-081**: The walk harness MUST record the accepted proposals and diff the touch `default` layers against the alphabet.

**Consistency gates**
- **FR-030**: Gates checked on every fixture, and on every walk zip:
  - G1: the compile has zero unreachable-rule hints;
  - G2: zero context-not-tolerant warnings;
  - G3: the guard group is present iff the marks decision blocks anything;
  - G4: every emitted output is in the chosen form;
  - G5: `&CasedKeys` is present iff the alphabet is cased;
  - G6: no alphabet letter is missing from any touch `default` layer;
  - G7: the projection is deterministic;
  - G8: no store contains `nul` or `beep` (generated stores: enforced; starting stores: expected failure until #2361).

### Key Entities

- **Decision-point fixture**: a starting keyboard, a decision record truncated at a decision point, and expected gate outcomes.
- **Consistency gate**: a named, machine-checked property of a projected keyboard (G1-G7).
- **Caps-handling decision**: mode, key set and provenance.
- **Claimed input**: a vkey + modifier set an assignment owns. It is derived, never stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of decision-point fixtures (4 base keyboards x 1 profile record each x 5 points = 20) pass every applicable gate among G1-G5 and G7. G6 is walk-only.
- **SC-002**: The 32-case walk passes all of G1-G7. Unreachable-rule hints go from 14 (harness) and 368 (author session) to 0.
- **SC-003**: Typing a blocked mark in any non-allowed context changes the text in 0 of the tested cases.
- **SC-004**: An author who accepts every proposal finishes with 0 placeholder keys.
- **SC-005**: A reviewer can locate every deadkey cluster in the `.kmn` by its purpose name.
- **SC-006**: Every story is verified by fixtures before its UI walk. No story is closed on walk evidence alone.

## Assumptions

- PR #2358 (S-02, Phase 0) merges first. This branch stacks on it and is rebased if it changes.
- `../keyboards` points at the keyboard-studio fork's master; fixtures skip with a reason when a keyboard is missing.
- Behaviour that changes the emitted `.kmn` lives in the projection (spec 105). No new author-truth store.
- No `Pattern` schema change at all (Constitution Art. I). The output-form and postfix variants are **new pattern ids** (`deadkey_single_tap_nfd`, `postfix_compose`), not a fragment variant field (research R4).
- Touch deadkeys stay out of scope (handoff ruling 6).
