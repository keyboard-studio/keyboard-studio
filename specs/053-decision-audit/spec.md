# Feature Specification: Per-keyboard decision audit (CYOA Phase 1 — record and review)

**Feature Branch**: `053-decision-audit`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "CYOA decision audit — a per-keyboard decision log with impact evidence. Phase 1 only (log + read-only audit): an append-only, supersede-never-overwrite decision log persisted per keyboard; two event tiers (survey answers logged individually, editor activity aggregated per step); a user-facing decision trail with a plain-language headline per decision, expandable to the exact source diff computed counterfactually; a dev-gated path overlay on the dashboard flow map; on-demand one-branch-deep counterfactual at an inspected node; evidence shipping via the GitHub PR body plus a machine-readable record in the zip, with nothing new added to the keymanapp/keyboards source tree."

## Governing documents

This spec **implements**, and does not restate, the following. On conflict, they win.

- [docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) §3.5 — the CYOA model (spine, side trails, lock gates, staleness closure). Phase 1 consumes the *lock-gate* concept only; staleness-driven re-derivation is Phase 2.
- [docs/adr/0001-flow-map-derived-from-one-source.md](../../docs/adr/0001-flow-map-derived-from-one-source.md) — **not reversed by this feature.** The flow map remains a structural projection of one source. This feature adds a *separate* per-keyboard record; the map merely gains an optional overlay showing which path a given keyboard took.
- [specs/032-journey-corpus/spec.md](../032-journey-corpus/spec.md) — the two-event-type vocabulary (survey answer, editor-action summary). This feature **aligns with** that vocabulary and MUST NOT fork it.
- [content/flows/README.md](../../content/flows/README.md) — the "completed instance" format is the serialization target for the machine-readable record.
- Spec v1.3.1 §3c "Defaults are the product" — the motivating principle: when the tool proposes a default, the author must be able to see that it did so and what it caused.

## Clarifications

### Session 2026-07-31

- Q: Does a decision entry record whether the value was a tool-proposed default the author accepted versus a value the author actively chose/changed? → A: Yes — each entry records its provenance, and the trail headline reflects it (e.g. "Accepted suggested …" vs. "Chose …").
- Q: Where does the machine-readable record live so that FR-020 (record in the package) and FR-019/SC-008 (no file added to the committed source tree) both hold? → A: Zip-root sidecar — the record sits beside, not inside, the keyboard's directory in the zip, clearly named as studio metadata. The record also serves session resumption (picking work up later); its exact naming/placement must be acceptable to the Keyman team. Provenance additionally distinguishes decisions **implied by the base keyboard** (carried from the base, confirmed or not) — these are implied decisions that affect the output.
- Q: For an aggregated editor-activity entry, where does its attributed source change come from? → A: Direct capture — the entry's impact is the recorded net source difference of the step (source before the step vs. after); counterfactual derivation applies only to survey/derived decisions. Future direction (not Phase 1): "unwrap" today's monolithic gallery decisions into finer-grained ones, partly via character classes (Phase 3).
- Q: When an author returns to an already-completed editor step and makes further edits, what happens in the record? → A: Supersede — the return visit produces a new aggregated entry marked as replacing the step's earlier entry, the same rule as a revisited survey answer.
- Q: When the record would breach the saved-state size threshold, what does truncation shed? → A: Shed detail, never entries — stored diff/detail payloads are dropped (largest or oldest first) until under threshold; every entry's headline, provenance, and supersede links always survive, so SC-002 holds unconditionally.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author reviews what their decisions did (Priority: P1)

A keyboard author has walked the survey and made edits. They open the decision trail for their keyboard and see, in order, every decision they made — each as one plain-language line. Expanding a line shows the exact change that decision made to the keyboard's source. Where a decision was later revisited, both the original and the replacement are visible, so the trail reads as a history rather than a snapshot.

**Why this priority**: This is the feature's core value and the foundation every other story builds on — no evidence can be shipped and no path can be overlaid until decisions are durably recorded. It also directly discharges the "defaults are the product" obligation: the tool fills many choices on the author's behalf, and today the author has no way to see which.

**Independent Test**: Complete an authoring session, open the trail, and confirm every decision made appears with a readable headline and an accurate expandable change. Delivers value alone — the author understands their keyboard's construction even if nothing ships to a reviewer.

**Acceptance Scenarios**:

1. **Given** an author has answered a survey question, **When** they open the decision trail, **Then** that answer appears as a single entry with a plain-language headline naming what was decided.
2. **Given** an author has performed several edits within one editor step, **When** they open the trail, **Then** those edits appear as **one** aggregated entry for that step summarising the net effect, not one entry per edit.
3. **Given** an author navigates back and answers a question differently, **When** they open the trail, **Then** both answers are present, the later one marked as replacing the earlier — no entry is overwritten or lost.
4. **Given** a decision that changed the keyboard's source, **When** the author expands its entry, **Then** they see the exact source change attributable to that decision.
5. **Given** a decision that cannot be independently undone because a later irreversible step depends on it (a lock gate), **When** the author expands its entry, **Then** they see a summary and an explanation of why no isolated change can be shown, rather than an error or an empty diff.
6. **Given** an author closes the studio and returns later, **When** they reopen the keyboard, **Then** the full trail is intact.

---

### User Story 2 - Reviewer sees decision-to-source evidence at review time (Priority: P2)

A reviewer on the official Keyman team receives a pull request produced by the studio. Without installing or opening the studio, they can read — in the pull request description — the ordered list of decisions that produced the keyboard, each with its concrete consequence. The downloadable package additionally contains a structured record of the same information.

**Why this priority**: This is the credibility case for the whole project with a skeptical upstream audience, and it is what turns the trail from a personal convenience into external evidence. It is P2 rather than P1 only because it requires the record from Story 1 to exist first.

**Independent Test**: Open a pull request from a completed session and confirm the description contains the decision summary; download the package and confirm it contains the structured record. Testable without any studio UI.

**Acceptance Scenarios**:

1. **Given** a completed keyboard submitted as a pull request, **When** a reviewer reads the pull request description, **Then** it contains an ordered, human-readable summary of the decisions that produced the keyboard and their consequences.
2. **Given** the same submission, **When** the reviewer inspects the committed file tree, **Then** it contains **no** file that would not be present in a hand-authored keyboard of the same layout.
3. **Given** a downloaded package, **When** it is opened, **Then** it contains a machine-readable decision record whose content matches the trail shown in the studio.
4. **Given** a keyboard whose decision record is unusually long, **When** the pull request is created, **Then** the description remains readable — the summary is bounded and points to the packaged record for the full detail.

---

### User Story 3 - Developer traces the path a keyboard took through the flow (Priority: P3)

A member of the project team opens the existing developer flow map and selects a keyboard. The map highlights the path that keyboard actually took through the question graph. At any decision on that path, they can ask what a different answer would have produced and see the resulting difference.

**Why this priority**: This serves the internal team's design and debugging work rather than an end user, and both prior stories deliver value without it. It is also the most speculative surface, so it should absorb scope cuts first.

**Independent Test**: Open the flow map with a recorded keyboard selected and confirm the walked path is distinguishable from unwalked branches, and that a single alternative-answer comparison can be requested and returned.

**Acceptance Scenarios**:

1. **Given** a keyboard with a recorded decision trail, **When** a developer views the flow map for it, **Then** the steps and branches it traversed are visually distinguished from those it did not.
2. **Given** the map is open with no keyboard selected, **When** it renders, **Then** it behaves exactly as it does today — structural, with no per-keyboard content.
3. **Given** a developer inspects one decision on the walked path, **When** they request the alternative outcome, **Then** they see the difference that answering differently would have produced at that point.
4. **Given** a decision whose alternative outcome cannot be derived, **When** the alternative is requested, **Then** the structural information for that branch is shown with an explanation, rather than a failure.
5. **Given** a production build, **When** a user loads the studio, **Then** the flow map and its overlay are absent, as today.

---

### Edge Cases

- **Session with no decisions yet** (base chosen, nothing answered): the trail renders an empty state explaining that decisions will appear as they are made — it does not error or hide itself.
- **Pre-instantiation progress**: decisions recorded before a keyboard identity exists must survive the transition to a named keyboard, not be discarded with the temporary slot.
- **A decision with no source consequence** (e.g. an answer that only routes to a later question): the entry appears with its headline and states plainly that it changed nothing in the source, rather than showing an empty diff as if something failed.
- **Very large aggregated edits** (a carve removing hundreds of keys): the aggregated entry summarises by count and category; the full detail is available on request but is not rendered eagerly.
- **A record from an older studio version**: an unrecognised or absent decision record must not prevent the keyboard from loading; the trail degrades to whatever it can read and says so.
- **Record size versus sync limits**: a decision record must not by itself push a keyboard's saved state past the existing size threshold beyond which cloud sync is skipped.
- **Submitted (frozen) keyboards**: after submission, the record is read-only and continues to be viewable.

## Requirements *(mandatory)*

### Functional Requirements

**Recording**

- **FR-001**: The system MUST record every survey answer as an individual decision entry, associated with the step and question it answers, together with its provenance — whether the value was a tool-proposed default the author accepted or a value the author actively set.
- **FR-002**: The system MUST record editor activity aggregated **per step**, as a single entry summarising the net effect of that step's edits. A return visit to an already-completed step produces a new aggregated entry that supersedes the step's earlier entry, under the same replace semantics as FR-003.
- **FR-003**: The decision record MUST be append-only. Revisiting a decision MUST add a new entry that identifies the entry it replaces; it MUST NOT overwrite or delete the earlier entry.
- **FR-004**: The system MUST record decisions for a keyboard from the beginning of the authoring session, including work done before the keyboard has a permanent identity, and MUST carry those entries forward when the identity is assigned.
- **FR-005**: The decision record MUST persist across studio restarts as part of the keyboard's saved state.
- **FR-006**: Recording MUST NOT alter the keyboard artifact in any way — an identical session with and without recording MUST produce identical output.
- **FR-007**: The event vocabulary MUST align with the two event types defined in [specs/032-journey-corpus](../032-journey-corpus/spec.md); the system MUST NOT introduce a competing vocabulary for the same concepts.

**Impact**

- **FR-008**: For each decision, the system MUST be able to produce the concrete change to the keyboard's source attributable to that decision. For an aggregated editor-activity entry, that change is the recorded net source difference of the step (source before the step vs. after it); counterfactual derivation applies only to survey and derived decisions.
- **FR-009**: The attributed change MUST be derived from the same process that produces the shipped keyboard, so that what the audit reports and what the author ships cannot disagree.
- **FR-010**: Impact MUST be computed only when requested for a specific decision, not eagerly for the whole record.
- **FR-011**: Where a decision's isolated impact cannot be derived because a later irreversible step depends on it, the system MUST report a summary together with the reason, and MUST NOT report a misleading empty or partial change.

**Author-facing trail**

- **FR-012**: Authors MUST be able to view an ordered trail of the decisions that produced their keyboard.
- **FR-013**: Each entry MUST show a plain-language headline stating what was decided, and the headline MUST distinguish an accepted tool-proposed default from an author-set value (e.g. "Accepted suggested …" vs. "Chose …").
- **FR-014**: Each entry MUST be expandable to reveal its attributed source change.
- **FR-015**: Superseded entries MUST remain visible as history and be clearly marked as replaced.
- **FR-016**: All author-facing text introduced by this feature MUST be localisable under the project's existing message-catalogue conventions.
- **FR-017**: The trail MUST be available in production builds (it is not a developer-only surface).

**Shipped evidence**

- **FR-018**: When a keyboard is submitted as a pull request, the system MUST render a human-readable decision summary into the pull request description.
- **FR-019**: The system MUST NOT add any file to the committed keyboard source tree as a result of this feature.
- **FR-020**: The downloadable package MUST contain a machine-readable decision record, placed as a sidecar at the package root — beside, not inside, the keyboard's directory — and clearly named as studio metadata, so the keyboard's directory remains byte-identical to one authored without this feature.
- **FR-021**: The machine-readable record MUST use the "completed instance" format defined in [content/flows/README.md](../../content/flows/README.md), extended to carry aggregated editor activity.
- **FR-022**: The pull-request summary MUST be bounded in length; where the full record is longer, the summary MUST indicate that complete detail is in the package.

**Developer flow-map overlay**

- **FR-023**: The existing developer flow map MUST be able to highlight the path a selected keyboard took, distinguishing traversed steps and branches from untraversed ones.
- **FR-024**: With no keyboard selected, the flow map MUST behave exactly as it does today.
- **FR-025**: The flow map and its overlay MUST remain absent from production builds.
- **FR-026**: At a single inspected decision on the walked path, the system MUST be able to produce, on request, the outcome that a different answer would have produced.
- **FR-027**: The system MUST NOT compute outcomes for untaken branches other than the one explicitly requested; untaken branches otherwise show structural information only.
- **FR-028**: Where an alternative outcome cannot be derived, the system MUST show the branch's structural information and an explanation, not a failure.

### Key Entities

- **Decision entry**: One recorded decision. Carries the step it belongs to, whether it is a survey answer or aggregated editor activity, the substance of what was decided, when, its provenance (author-set, tool-proposed default accepted, or implied by the base keyboard — carried from the base whether or not the author confirmed it), and — if it replaces an earlier decision — a reference to that entry.
- **Decision record**: The ordered, append-only collection of decision entries for one keyboard. Part of that keyboard's saved state; the source of both the author-facing trail and the shipped evidence.
- **Decision impact**: The concrete source change attributable to a single decision, derived on request. May be unavailable with a stated reason where an irreversible dependency exists.
- **Decision summary**: The plain-language headline for an entry, combining a description of what kind of decision it was with the measured magnitude of its effect.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a completed authoring session, 100% of survey answers and 100% of steps in which edits occurred are represented in the decision record.
- **SC-002**: No decision is ever lost: after any sequence of navigation including revisits, the number of entries is monotonically non-decreasing, and every superseded decision remains retrievable.
- **SC-003**: An author who did not build the keyboard can, from the trail alone, correctly state what each decision was and what it changed, for at least 90% of entries, without opening any source file.
- **SC-004**: A reviewer with no access to the studio can, from the pull request description alone, identify which decisions produced a given characteristic of the keyboard.
- **SC-005**: The attributed change shown for a decision matches the actual shipped source for that decision in 100% of verified cases — the audit and the artifact never disagree.
- **SC-006**: Enabling this feature changes the produced keyboard artifact in zero cases.
- **SC-007**: Opening the trail presents the list without perceptible delay; expanding a single entry returns its change without blocking further interaction.
- **SC-008**: Zero files are added to the committed keyboard source tree relative to the same keyboard authored without this feature.
- **SC-009**: A keyboard saved by a studio build without a decision record loads successfully in a build with this feature, and vice versa.

## Out of scope

Deferred to **Phase 2** (editing past decisions):

- Revising a recorded decision from the trail.
- Consuming the §3.5 staleness closure to mark downstream steps affected by a revision.
- Declared per-decision summarisers that license automatic re-derivation, and the rule that a decision type without one cannot auto-re-derive.
- Re-derivation on confirmation, and lock-gate resolution flows.

Deferred to **Phase 3** (character-class decisions):

- Character-class membership definition and providers.
- Authoring a class-scoped placement decision, and per-member instantiation of it.
- Hand-set exceptions surviving class re-derivation.

Also out of scope:

- Any change to the flow map's status as a structural projection of a single source (ADR-0001 stands).
- Telemetry, analytics, or transmission of decision records anywhere other than the author's own submission and download.
- Replaying a recorded session to reproduce a keyboard.
- Recording keystroke-level or input-level activity; only decisions and per-step edit summaries are recorded.

## Assumptions

- **Trail placement**: the trail is reachable as a dedicated view from the authoring surface for the active keyboard and from the saved-keyboards list. A per-step inline variant is a later refinement, not part of this feature.
- **Superseded entries default to collapsed**, shown on demand, so the common case reads as a clean list while history remains available.
- **Aggregation boundary is the step**: editor activity is summarised when a step completes. Activity in a step the author has not yet completed is not yet an entry.
- **Vocabulary alignment is at the level of event kinds and field naming**; producing a record that is directly replayable as a journey-corpus fixture is a desirable side effect, not a Phase 1 requirement.
- **Record size**: decision records for realistic sessions are assumed small relative to the existing saved-state size threshold. If a record would breach it, truncation sheds stored diff/detail payloads (largest or oldest first) before the keyboard's own data is affected — never the entries themselves: every entry's headline, provenance, and supersede links always survive, and the truncation is stated in the trail.
- **The pull-request summary is generated at submission time** from the record as it stands; it is not maintained incrementally.
- **Existing persistence, projection, and output paths are reused** rather than duplicated; this feature adds a record and views over it, and does not introduce a second way to save, project, or emit a keyboard.
- **Sidecar acceptability**: the packaged record's exact file name and shape at the zip root are chosen for Keyman-team acceptability (reviewers may unzip-and-copy; nothing in the keyboard's directory may differ from a hand-authored keyboard). The record doubles as a way to pick up work later, so it must remain self-describing.
- **Owner**: Engine team, per Constitution Article VI — the change touches the SPA, persistence, and output paths.
