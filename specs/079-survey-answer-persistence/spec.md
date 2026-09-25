# Feature Specification: Survey answers persist per question — navigation never undoes a decision

**Feature Branch**: `km/079-survey-answer-persistence`

**Created**: 2026-09-24

**Status**: Clarified 2026-09-24 — six decisions recorded (see Clarifications): alphabet edits carry over (FR-015), record on Next (FR-040), unsaved questions must justify (FR-007), confirm-on-Next vs live galleries (FR-008), non-blocking re-proposal notice (FR-016), no auto-move plus journey-strip work-to-do badges (FR-013, FR-017).

**Input**: User description: "Every survey question saves its answer as soon as it is given, and navigation never undoes a decision. Moving back to earlier questions and returning (without changing responses) must never undo any decision, even if a full set of questions was not completed. Every question should save its results, unless we jump to a clarifying question that will determine the shape of the current question." Origin: issue #1787 (Accents and marks answers lost after Back to Confirm your alphabet, then Done), which is one instance of a systemic defect. Designed together with the flow-interrelated issues #1795 (the journey strip floods with one dot per recorded answer), #1789 (per-question dots inside multi-screen steps) and #1796 (Convenience letters skips itself on missing evidence); see section F2.

## Governing documents

This spec **implements**, and does not restate, the following. On conflict they win, except where this spec explicitly amends them (see [Amendments](#amendments-to-existing-specs)).

- [spec.md](../../spec.md) §3c (v1.3.1, defaults-first) — a default the author confirmed or overturned is **their decision**. Silently putting the proposal back undoes that decision, so it is a defect under "no default is a defect", not an inconvenience.
- [specs/057-bulletproof-navigation/](../057-bulletproof-navigation/spec.md) — the author's *location* survives navigation (FR-001…FR-008), a deep link arrives at the recorded answer, not a re-proposed default (FR-031), and revisions re-propagate through the existing staleness mechanism (FR-033). This feature is 057's counterpart for *answer content*: 057 made the author's position durable, this makes every answer at that position durable.
- [specs/026-qu-survey-session-store/](../026-qu-survey-session-store/) — the single source of truth for traversal. This feature adds no second notion of "where am I".
- [specs/034-mvp-authoring-walk/](../034-mvp-authoring-walk/) US3 — the durable draft envelope. Anything this feature makes durable must round-trip through that envelope.
- [specs/071-marks-question-series/](../071-marks-question-series/spec.md) — the Accents and marks series. FR-023 (re-confirmation when alphabet edits change the evidence behind a completed station) is the model for this spec's shape-change rule, generalised to every step.
- [specs/075-punctuation-defaults/](../075-punctuation-defaults/spec.md) — the punctuation step's seed-once-per-evidence-key behaviour and its "removals survive a step revisit" guarantee, which this feature adopts as the rule for every step.
- [specs/053-decision-audit/](../053-decision-audit/spec.md) and [specs/055-legible-decision-trail/](../055-legible-decision-trail/spec.md) — the append-only decision record. This feature does not change the record's model.
- [specs/012-step-model-manifest/](../012-step-model-manifest/) and constitution Article IX — the manifest is the single source of survey ordering. This feature adds no survey surface.
- Constitution Article IV / decision D3 — nothing in this feature validates, so it introduces no validation timer. Saving answers rides the existing autosave seam, which D3 does not govern.

## Problem statement

The rule the author is entitled to expect is simple: **an answer, once given, stays given until the author changes it.** The studio does not honour it. Several steps keep the author's answers only while the step is on screen, and write anything durable only when the whole step is finished. Leaving a step, even to look at an earlier question and come straight back without touching anything, destroys those answers. When the author returns, the step rebuilds itself from its proposals and starts again at its first question. Nothing tells the author this happened.

Issue #1787 reported this for **Accents and marks**. An audit of every step in the manifest (2026-09-24) found the same class of defect in other steps. In one case it is worse: the author's **alphabet itself** can be wiped.

### Observed defects

File references are to [packages/studio/src](../../packages/studio/src/) and are evidence for planning, not requirements.

- **D-1 — Accents and marks holds every answer only while it is on screen.** The mark attachments, per-class and per-mark treatment, promotions, explicitly set input order, output form, stacking choice, confirmed stacks and the current station all live in component state ([MarksSeriesStep.tsx](../../packages/studio/src/survey/marks/MarksSeriesStep.tsx)). Leaving the step discards them. Returning rebuilds them from proposals and returns to the first station. The only durable output is the step's *derived* result, recorded on completion, from which the raw answers cannot be rebuilt. The re-proposal rules that fire when evidence changes (071 FR-023) are therefore applied to nothing: they reset to proposals rather than adjusting saved answers. This is issue #1787.
- **D-2 — Convenience letters holds its answers only while it is on screen.** The author's un-ticked convenience letters are component state ([ConvenienceCharsStep.tsx](../../packages/studio/src/survey/convenience/ConvenienceCharsStep.tsx)). On return, every letter is ticked again. The recorded result of the step is never read back.
- **D-3 — Passing back through the prefill confirmation wipes the alphabet.** Confirming the prefill screen always starts a fresh alphabet ([CharactersStep.tsx](../../packages/studio/src/survey/CharactersStep.tsx)). That clears the characters, bases, marks, their provenance and the punctuation picks. The prefill screen is only a confirmation of the language, script and base already chosen. It asks nothing new, yet passing through it unchanged discards everything built after it. Routes that pass through it with no change:
  - Back twice from Confirm your alphabet, then forward again.
  - Pressing Done again on Project name (copy track) or on the track choice (adapt track), which routes into the characters step at prefill ([steps/advance.ts](../../packages/studio/src/steps/advance.ts)).

  After the wipe, the author lands on an **empty** build list, because the method they chose for building it is kept. Punctuation proposals are also never offered again, because the step remembers that it already proposed them. 057 FR-007 tied clearing to "a genuine prefill → build-list transition" and fixed the remount case, but a deliberate pass through an unchanged prefill still counts as genuine. This spec narrows that (see Amendments).
- **D-4 — Steps that share a phase overwrite each other's recorded answers.** Accents and marks, Punctuation, Invisible characters and Convenience letters all record their result into the same phase slot. The last step to finish replaces the others' recorded answers ([workingCopyStore.ts](../../packages/studio/src/stores/workingCopyStore.ts), `recordPhase`). For example, finishing Convenience letters erases the Invisible characters answers from the phase result. The UI is currently unaffected only because the decision record is kept separately. Anything that restores answers from the phase result would restore the wrong ones.
- **D-5 — Question-by-question steps survive leaving, but not a reload.** Identity, Track, Project name, Help and the manual characters path keep each unfinished answer and the current question in a store that outlives the component. That store is deliberately left out of the saved draft ([stepWalkStore.ts](../../packages/studio/src/stores/stepWalkStore.ts)), so reloading the page loses them. The stated reason (the walk is derived and large) applies to the walk, not to the author's answers or position, which are small.
- **D-6 — Re-completing Accents and marks re-applies its effects.** Each completion of the step re-applies its mark guards to the working copy. Whether that is idempotent is unverified. If it is not, "complete the step again with no change" is itself a change.

Steps already correct (precedents): **Punctuation** and **Invisible characters** keep their answers in a durable shared draft, seed proposals once per evidence key, and keep the author's removals across revisits. The punctuation step's "removals survive a step revisit" test is the model. The base, carve, mechanisms and touch steps keep their answers in the working copy and are believed correct, but that was not verified in depth.

## Clarifications

### Session 2026-09-24

- Q: If the author really changes their language, script or base, what happens to the characters they added or removed by hand? → A: They carry over to the new proposal. Additions are kept where they still fit, removals are re-applied, and anything that no longer makes sense is flagged for reconfirmation (FR-015).
- Q: When do answers reach the decision trail? → A: When the author clicks Next on the question. Each Next is a recording point, whether or not the step is finished. A Next with no change records nothing (FR-040).
- Q: May a question leave its answer or status unsaved? → A: Only with an explicit written justification (FR-007).
- Q: When does a saved answer take effect on the keyboard? → A: For survey questions, on Next, which confirms it. In the mechanism galleries, where the author works through many sub-tasks and tests as they go, each action updates the keyboard immediately, as it does today. Navigation between questions puts neither kind of decision at risk (FR-008). Addendum: gallery pages that do not show the keyboard must still save every action immediately, but need not recompile the keyboard while it cannot be seen. Whether to apply each action fully or hold them provisionally and batch them on confirm is left to planning.
- Q: When is the author told that a change will re-propose later answers? → A: On Next at the changed question, with a notice that does not block and names the later answers that will need reconfirming. The per-question flags remain as well (FR-016).
- Q: Where does the author land when a step they return to has flagged answers? → A: Where they were. The step lists its flagged earlier questions with links, and Next is blocked until those before the author's position are resolved (FR-013). New mechanism: after a change such as adding a letter, the footer's journey-strip marks for every question or stage with work to do, such as the physical and touch mechanism galleries, carry a "work to do" badge. The author jumps there from the badge and is never moved automatically (FR-017).
- Q: How do multi-question steps show on the journey strip? → A: As two tiers, in a `000000oooo000` layout. The existing rule that a filled dot means "has a response" is kept at both tiers, and size is the tier cue. Every section is a large mark, and the section the author is in expands in place into small question marks, one per screen, with the current one highlighted. Question marks are never subsumed into one dot and never one per recorded answer (FR-060).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Look back and come back with nothing lost (Priority: P1)

An author is partway through a step. In Accents and marks, say, they have un-ticked two attachments, changed a treatment and are on the third station. They go Back to an earlier question to check something, change nothing, and come forward again. Every answer they gave is still there, and they are on the station they left.

**Why this priority**: This is the reported data loss (#1787) and the core promise. An author who cannot safely look back cannot trust the survey at all.

**Independent Test**: For each survey step, answer some questions away from their proposals without finishing the step. Navigate back one or more steps and forward again with no changes. Compare every answer and the current question with what was there before leaving. Delivers value on its own for any single step fixed.

**Acceptance Scenarios**:

1. **Given** an author has changed answers in Accents and marks and moved on to later stations, **When** they go Back to Confirm your alphabet and press Done without editing the alphabet, **Then** every Accents and marks answer is as they left it and they are on the station they left.
2. **Given** an author has un-ticked some convenience letters, **When** they leave the step and return with no upstream change, **Then** those letters are still un-ticked.
3. **Given** an author is partway through a step and has *not* finished it, **When** they leave and return with no upstream change, **Then** their partial answers and their position are kept. Finishing a step is not a precondition for its answers being kept.
4. **Given** an author has already finished a step, **When** they revisit it and leave without changing anything, **Then** no answer changes, the step's effects on the keyboard are not re-applied in a way that alters it, and no new decision is recorded.

---

### User Story 2 - Going back through the prefill confirmation keeps the alphabet (Priority: P1)

An author has built an alphabet and chosen punctuation. They step back past Confirm your alphabet to the prefill confirmation, or press Done again on Project name or on the track choice, then come forward without changing their language, script or base. Their alphabet, punctuation choices and everything after them are intact.

**Why this priority**: This is the largest loss the audit found: the whole alphabet, not just one step's answers. It is reachable with two Back presses.

**Independent Test**: Build an alphabet with added and removed characters, pick punctuation, then take each of the three routes through the prefill confirmation with no change. Verify the alphabet, punctuation picks and later steps' answers are unchanged.

**Acceptance Scenarios**:

1. **Given** a built alphabet and punctuation picks, **When** the author goes Back twice from Confirm your alphabet and then forward through the prefill confirmation without changing anything, **Then** the alphabet and punctuation picks are unchanged and the build list is not empty.
2. **Given** the same state, **When** the author presses Done again on Project name or on the track choice with no change, **Then** the alphabet and every later answer are unchanged.
3. **Given** the same state, **When** the author changes their language, script or base keyboard and comes forward, **Then** the alphabet is treated as depending on a changed shape-determining answer and handled under User Story 3.

---

### User Story 3 - A real change re-proposes only what it affects (Priority: P2)

An author goes back and changes a clarifying answer that decides the shape of a later question, such as adding a base letter to the alphabet after Accents and marks is done. Only the later answers that the change actually affects are proposed again, and the author is told which. Everything the change does not touch is kept exactly as they left it.

**Why this priority**: This is the one sanctioned exception to "never undo". Getting its boundary right is what keeps User Story 1 from being over-applied, where a stale answer silently survives a change that invalidated it, or under-applied, where a whole step is reset for a one-letter edit.

**Independent Test**: Complete Accents and marks with several answers overturned. Go back and make one alphabet edit that affects a single mark. Return and verify that only that mark's answers are re-proposed and flagged, and that all other answers are unchanged.

**Acceptance Scenarios**:

1. **Given** Accents and marks is answered, **When** the author adds one base letter to the alphabet, **Then** only the answers involving that base (its attachments and any treatment whose evidence it changes) are re-proposed and flagged for reconfirmation, and every other answer is kept.
2. **Given** the author explicitly set an input order, **When** an alphabet change re-proposes attachment answers, **Then** the explicitly set input order is kept unless the change makes it inapplicable.
3. **Given** a shape-determining answer was changed and then changed back to its original value before the dependent step was revisited, **When** the author returns to the dependent step, **Then** their original answers are restored and nothing is flagged.
4. **Given** an answer was re-proposed because of a shape change, **When** the author views that question, **Then** they can see that it was re-proposed and why, in terms they understand.
5. **Given** the author has assigned keys in the physical and touch mechanism galleries, **When** they go back, add a letter and click Next, **Then** they stay where they are. A notice names the later work, and the journey-strip marks for the physical and touch galleries carry a "work to do" badge. Activating a badge takes them to that gallery, and the badge clears once the new letter has a key.

---

### User Story 4 - Answers survive a reload (Priority: P2)

An author closes the tab or reloads partway through any step. When their draft is restored, every answer they had given, finished step or not, and the question they were on are exactly as they left them.

**Why this priority**: Durability across a reload is the same promise as durability across navigation, at a longer range. Without it, D-5 leaves the question-by-question steps half-fixed.

**Independent Test**: For each step, give partial answers, reload the studio, restore the draft, and compare answers and position.

**Acceptance Scenarios**:

1. **Given** partial answers in Accents and marks, **When** the author reloads and the draft is restored, **Then** every answer and the current station are restored.
2. **Given** a half-answered Identity or Project name question, **When** the author reloads, **Then** the answer and current question are restored.
3. **Given** a draft saved before this feature shipped, **When** it is restored, **Then** it loads without error. Answers it never saved fall back to proposals, and nothing is invented.

---

### Edge Cases

- **Several steps sharing a phase.** Recording one step's answers must never erase another step's answers (D-4).
- **A step judged not to apply, later made applicable.** For example, Convenience letters is skipped, then an alphabet edit leaves surplus letters. This is a shape change: the step gets a work-to-do badge and is never silently left behind (FR-067).
- **A screen that records many answers at once**, such as Invisible characters with one answer per candidate. It is one question mark on the journey strip, never one per answer (FR-060).
- **A multi-question step**, such as the Accents and marks stations. While the author is in it, each question has its own visible question mark in the expanded section, never one mark for the whole step (FR-060).
- **Rapid Back/Forward.** Navigating away before a just-given answer has been written durably must not lose it. The answer is saved when it is given, not when the author leaves.
- **Revisit without change of a completed step.** It must not append a decision-record entry, must not mark anything stale, and must not re-apply step effects non-idempotently (D-6).
- **Shape change to a step the author never reached.** Nothing to re-propose. The step derives its proposals fresh when first reached.
- **Shape change that removes a question entirely**, such as removing the last diacritic so Accents and marks no longer applies. The step's saved answers are kept but inactive. If the change is reversed, they come back rather than being re-proposed.
- **Start over / new project.** Explicit start-over and switching to a genuinely new project still clear answers (057 FR-003). This feature must not make a new project inherit the previous one's answers.
- **Deep link to a question** (057 FR-031). Arrives at the saved answer, including for a step that was never finished.
- **Compare tab** (057 FR-021). Reads nothing into and writes nothing to the saved answers.

## Requirements *(mandatory)*

### A. The rule

- **FR-001**: Every survey question MUST save the author's answer at the moment it is given, into state that outlives the question's presentation. No answer may exist only while its question is on screen.
- **FR-002**: A step's answers MUST be saved whether or not the step has been finished. Finishing a step MUST NOT be a precondition for any of its answers being kept.
- **FR-003**: Navigating away from a question, by Back, by the footer, by a deep link, by switching tabs or by reloading, and returning to it MUST present the saved answer, not a proposal, unless FR-010 applies.
- **FR-004**: Returning to a step MUST return the author to the question or station within it they were last on. This holds even when a shape change has flagged answers elsewhere: the system MUST NOT move the author because of a flag (FR-017).
- **FR-005**: Passing through an earlier question or confirmation screen without changing its answer MUST NOT alter any later answer. "Without changing" means the answer's value is unchanged. Re-confirming, re-pressing Done or re-visiting is not a change.
- **FR-006**: Revisiting a finished step and leaving it without changing any answer MUST NOT append a decision-record entry, mark any consequence stale, or change the keyboard being authored.
- **FR-007**: Saving is the default for every question, with no exceptions by omission. A question whose answer or status is **not** saved MUST carry an explicit, written justification for why saving is unnecessary or harmful, such as a purely transient UI toggle that records no decision. The justification MUST sit beside the question's declaration, where a reviewer sees it, and MUST be listed in the FR-050 classification. An unsaved question with no justification is a defect. The shape-determining exception (FR-010) is not an exemption from saving: the answer is saved and then re-proposed.
- **FR-008**: When an answer takes effect on the keyboard depends on the kind of surface (clarified 2026-09-24):
  - **Survey questions**: a saved answer is a draft until the author clicks Next to confirm it. On Next, the keyboard is updated and the answer is recorded (FR-040) together, so the decision trail always explains what the keyboard does. Leaving by any other route keeps the draft answer (FR-003) but does not apply it.
    - **Multi-screen steps** (such as the Accents and marks stations), whose keyboard effect depends on the whole series: each screen's Next confirms and records that screen's answers (FR-040), but the keyboard is updated only at the step's final Next, once every screen's answer is recorded. An intermediate screen's recorded answers carry no source impact. The trail marks them as confirmed but not yet applied, never as applied (clarified at planning, research R-05).
  - **Mechanism galleries** (the physical and touch key-assignment surfaces, where the author works through many sub-tasks and tests as they go): each action MUST be saved immediately.
    - On a gallery page that **shows the keyboard**, each action MUST continue to update it immediately, as it does today, so the author can try it out at once.
    - On a gallery page that **does not show the keyboard**, each action MUST still be saved immediately. The keyboard need not recompile until it is next visible or the author confirms. Whether such actions are applied fully at once, or held provisionally and applied as a batch on confirm, is deferred to planning. Either way, no action may be lost.
  - For both kinds, navigating between questions, stations or gallery sub-tasks MUST NOT undo, revert or re-propose any decision already made, whether confirmed, still in draft, or applied by a gallery action.

### B. The one exception: shape-determining answers

- **FR-010**: When the author **changes** an answer that determines the shape of a later question, the system MUST re-propose only the later answers the change actually affects, and MUST keep every other saved answer. A step MUST NOT be reset wholesale because one of its inputs changed.
- **FR-011**: Each step MUST declare which earlier answers are shape-determining for it, and each saved answer MUST record the value of that evidence it was given against, so that the system can tell a real change from a revisit.
- **FR-012**: Re-proposal MUST start from the **saved** answers and adjust them. It MUST NOT start from nothing. Answers the author set explicitly, such as an explicitly chosen input order, MUST be kept unless the change makes them inapplicable. This generalises 071 FR-023 to every step.
- **FR-013**: A re-proposed answer MUST be visibly marked as needing reconfirmation, with a reason naming the change that caused it, in the author's terms. The author MUST NOT be able to pass a flagged question without either confirming the re-proposal or overturning it. Within a step, the author stays where they were. The step lists its flagged earlier questions, each with a link to it, and Next is blocked until every flagged question before the author's position is resolved (clarified 2026-09-24).
- **FR-014**: If a shape-determining answer is changed and then restored to its earlier value before the dependent answers are reconfirmed, the dependent answers MUST return to their saved values, with no flags.
- **FR-017**: **Work-to-do badges on the journey strip.** When a change leaves work to do at a later question or stage, the corresponding mark on the footer's journey strip (057 FR-042) MUST carry a "work to do" badge (clarified 2026-09-24). Work to do includes:
  - flagged, re-proposed answers (FR-013)
  - new items that a later stage must handle, such as a newly added letter that still needs a key in the physical or touch mechanism gallery
  - The author MUST NOT be moved. The badge is how they find the work.
  - Activating a badged mark MUST jump to that question or stage through the existing jump mechanism (057 FR-045). This is one jump implementation, not a second.
  - The badge MUST clear once the work at that question or stage is resolved.
  - The badge MUST carry a non-colour cue, and the mark's accessible name MUST state that work is waiting and what kind, in the active locale (057 FR-043, FR-046, spec 056 house rules). All strings go through the message catalog.
  - A badge MAY appear on an upcoming-stage mark, such as a gallery not yet reached. Activating it follows 057 FR-045's rules for upcoming stages: it is refused with a reason if a lock or gate stands in the way.
- **FR-015**: When the author changes a shape-determining answer that affects the alphabet (the language, script or base keyboard), the author's own alphabet edits MUST carry over to the new proposal. Characters the author added MUST be kept where they still fit the new language, script and base. Characters the author removed MUST be removed again from the new proposal. An edit that no longer makes sense against the new evidence, such as an added character outside the new script, MUST be flagged for reconfirmation under FR-013, never silently dropped. The author's edits MUST NOT be discarded, even with a warning (clarified 2026-09-24).
- **FR-016**: When the author clicks Next on a changed shape-determining answer, and the change re-proposes one or more later answers, the system MUST show a notice that does not block, naming in the author's terms which later steps and answers will need reconfirming (clarified 2026-09-24). The notice MUST NOT appear when the change re-proposes nothing. It MUST NOT gate the Next, and it does not replace the FR-013 flags or the FR-017 badges. It MUST point the author to the badged marks on the journey strip, where they can jump to the work. Like every status message, it MUST be announced to assistive technology (spec 056 house rules) and go through the message catalog.

### C. The characters step

- **FR-020**: Passing through the prefill confirmation with the language, script and base unchanged MUST NOT clear or replace the alphabet, its provenance, or the punctuation picks. This applies on every route: Back through it, and re-pressing Done on Project name or on the track choice.
- **FR-021**: The author MUST never land on an empty build list as a result of navigation when they previously had an alphabet.
- **FR-022**: When a genuine change to language, script or base does require the alphabet to be re-proposed, proposals that depend on it, such as punctuation defaults, MUST be re-derived for the new evidence rather than suppressed because they were offered once before.

### D. Durability

- **FR-030**: Every saved answer, and each step's current question or station, MUST be included in the durable draft and restored with it. This covers the question-by-question steps currently excluded (D-5).
- **FR-031**: Recording one step's answers MUST NOT erase or overwrite another step's answers, including steps that share a phase (D-4).
- **FR-032**: Restoring a draft saved before this feature MUST succeed. Any answer that draft never saved MUST fall back to its proposal, and the author MUST NOT be shown an answer they never gave.
- **FR-033**: Explicit start-over and switching to a new project MUST continue to clear saved answers (057 FR-003). Nothing else may.
- **FR-034**: Saving answers MUST NOT introduce a validation timer or a second validation path (D3). It MAY use the existing autosave mechanism.

### E. Decision record

- **FR-040**: An answer MUST be recorded in the decision record when the author clicks Next on its question or station, whether or not the step is finished (clarified 2026-09-24). Saving (FR-001) and recording are distinct:
  - An answer is saved the moment it is given.
  - It is recorded when the author moves forward past it.
  - Leaving by Back, by the footer, by a deep link or by switching tabs saves the answer but does not record it. It is recorded at the next Next past it.
  - A Next with no changed answer since the last recording MUST record nothing (FR-006).
  - Changing a recorded answer and clicking Next again MUST append a superseding entry (FR-041), never a duplicate.
- **FR-041**: A re-proposal caused by a shape change (FR-010) that the author then confirms or overturns MUST be recorded through the existing append-only supersession path (053 FR-015). No new supersession concept is introduced.

### F2. Flow-interrelated defects folded in

These two issues sit on the same seams as FR-008, FR-017 and FR-040 (what gets recorded, what the journey strip shows, and when a step may pass without asking). They are designed together with this feature rather than fixed separately.

**#1795 and #1789: one screen, one question mark, grouped under section marks.**

Leaving the Invisible characters step with no interaction adds dozens of dots to the journey strip, one per offered candidate, each labelled with a raw id such as `invisibles.u2068`. The step deliberately records one answer per candidate, so the decision record can tell "declined" from "never asked". The journey strip then draws a mark for every recorded answer. Because FR-040 now records at every Next, and FR-017 hangs badges on those marks, the grain of a mark has to be fixed.

- **FR-060**: The journey strip MUST have two tiers of mark, laid out as an inline expansion of the current section (clarified 2026-09-24):

  ```
  ● ● ● ● ● ●  • • ◎ ·  □ □ □
  sections     current  sections
  before       section  ahead
               (small)
  ```

  The strip's existing visual vocabulary is kept, and the tier is added on top of it, not in place of any part of it:
  - **Fill means "has a response".** A filled mark has an answer; an empty mark has none yet. This is unchanged and applies at both tiers.
  - **Shape** still separates reached marks (circles) from upcoming stages (hollow squares).
  - **The current position** keeps its ring and `aria-current`.
  - **Size** is the tier cue. Section marks are larger than question marks. Because size is therefore no longer free to mark the current position, the current position MUST be distinguishable by its ring alone, still never by colour alone (057 FR-046).

  In the diagram: `●` is an answered section, `•` an answered question, `·` an unanswered question, `◎` the current question, and `□` an upcoming section.

  Structure:
  - **Section marks** (large): one per step or section, such as Characters, Accents and marks, Invisible characters, or the physical and touch galleries.
  - **Question marks** (small): one per author-facing question or station, meaning one screen and one Next. The section the author is **in** MUST expand in place into its question marks, with the current question highlighted by a non-colour cue as well as colour (057 FR-046). Every other section MUST be shown as its single section mark.
  - Within the current section, question marks MUST be shown, never hidden, and several questions or stations MUST NOT be subsumed into one mark. This applies to every multi-question step, such as the Accents and marks stations and the characters sub-screens (#1789).
  - A question mark is per screen, not per recorded answer. A Next that records several answers, such as one per offered candidate on Invisible characters, MUST add exactly one question mark (#1795).
  - A single-screen section expands to one question mark.
  - When the author moves into another section, that section expands and the one they left collapses back to its section mark. Collapsing never loses progress. A collapsed section mark is filled when every question in it has a response, and MUST show a distinct, non-colour "partly answered" state when only some do. The exact glyph for that state is left to planning.
  - Activating a collapsed section mark MUST jump to the author's last position in that section (FR-004) through the one jump mechanism (057 FR-045).
  - 057 FR-047's overflow rules apply: every mark stays reachable, and the current position stays visible.
- **FR-061**: Recording several answers on one Next MUST keep every one of them in the decision record, with "declined" and "never asked" still distinguishable. FR-060 governs how they are shown, not what is recorded.
- **FR-062**: Every mark's label and accessible name MUST be a human-readable question or stage name from the message catalog. A raw answer id MUST never be shown.
- **FR-063**: Work-to-do badges (FR-017) attach to the question mark of each screen with work to do. A badge on a multi-answer screen covers every answer on that screen. When the section is collapsed, its section mark MUST show that some question in it has work waiting. Activating a badged, collapsed section mark MUST jump to the earliest question in that section with work to do, rather than to the author's last position there. All jumps go through the one jump mechanism (057 FR-045).

**#1796: a step may not skip itself on missing evidence.**

The Convenience letters step checks when it mounts whether it applies. If it doesn't, it completes itself without showing anything and records "asked, kept nothing". If the orthography signal is merely **not yet known**, as can happen on the defaults path, the step vanishes. It then records a decision the author never made, and carve proposes removing every surplus letter.

- **FR-064**: A step MAY pass without asking only when its evidence shows the question genuinely does not apply. An example is a base that has no surplus letters for the confirmed orthography. Evidence that is **missing or unknown** MUST NOT count as "does not apply". In that case the step MUST be asked, or the gap MUST be surfaced to the author, and the step MUST NOT be skipped.
- **FR-065**: A step that passes without asking MUST record "not asked", with its reason and the evidence key it was judged against. It MUST NOT record an answer. A downstream step MUST treat "not asked" differently from an answer. For example, carve MUST NOT read a skipped Convenience letters step as "keep none".
- **FR-066**: The defaults path and the ask-me path MUST produce the same evidence for later steps. Accepting defaults is a confirmation, and later steps MUST see it as one. A step's applicability MUST NOT depend on which path the author took.
- **FR-067**: When later evidence makes a previously skipped step applicable, the skip MUST be treated as a shape change (FR-010). An example is an alphabet edit that leaves surplus letters. The step becomes work to do, with a badge on its journey-strip mark (FR-017). The author MUST NOT be moved to it (FR-004).
- **FR-068**: A step MUST NOT skip itself silently. Even when a skip is legitimate, the journey strip and the decision trail MUST show the step as passed with its reason, not as an ordinary answer.

### F. Coverage and verification

- **FR-050**: Every step in the manifest MUST be classified as compliant, non-compliant, or justified-exempt (FR-007) with FR-001…FR-007, with evidence, and every non-compliant step MUST be fixed by this feature or have a tracked follow-up. Accents and marks (D-1), Convenience letters (D-2), the characters step (D-3), the shared phase slot (D-4) and the question-by-question steps' durability (D-5) are in scope for this feature.
- **FR-051**: Each fixed step MUST have a test that leaves the step with changed answers, returns with no upstream change, and asserts every answer and the current position are unchanged. The punctuation step's "removals survive a step revisit" test is the model.
- **FR-052**: Each step with shape-determining inputs MUST have a test that changes one input and asserts that only the affected answers are re-proposed.
- **FR-053**: A test MUST cover save-and-reload of partial answers for at least Accents and marks and one question-by-question step.
- **FR-054**: Re-completing Accents and marks with no change MUST leave the keyboard being authored unchanged, verified by test (D-6).

### Key Entities

- **Saved answer**: the author's response to one question. It holds its value, whether it was proposed, confirmed or overturned, whether it is still a draft or has been confirmed by Next (FR-008), and the evidence key it was given against. It outlives the question's presentation and is part of the durable draft.
- **Evidence key**: a compact fingerprint of the shape-determining answers a question depends on, such as the confirmed alphabet for Accents and marks, or the language, script and base for the alphabet. A saved answer is *current* when its evidence key matches the present one, and *affected* when it does not.
- **Step position**: the question or station within a step the author was last on. Part of the durable draft.
- **Re-proposal flag**: marks a saved answer that a shape change re-proposed. It carries the reason and clears when the author confirms or overturns the answer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every survey step, leaving with changed answers and returning with no upstream change keeps 100% of answers and the current position. Verified by one revisit test per step.
- **SC-002**: Zero routes exist by which passing through an unchanged earlier question or confirmation clears a later answer. Verified for the three prefill routes (D-3) and the marks route (#1787).
- **SC-003**: A single-item upstream change, such as adding one letter, re-proposes only the answers that depend on that item. In the marks test case, every answer not involving the added item is unchanged.
- **SC-004**: After a reload, 100% of saved answers and positions are restored for every step covered by FR-053.
- **SC-005**: Revisiting a finished step without change adds zero decision-record entries and leaves the keyboard source unchanged.
- **SC-006**: All acceptance criteria of issues #1787, #1789, #1795 and #1796 are met.
- **SC-007**: Every question that does not save its answer or status appears in the FR-050 classification with a written justification. Unjustified exemptions: zero.
- **SC-009**: Completing Invisible characters, with or without interaction, adds exactly one question mark. While the author is in Accents and marks, every station has its own visible question mark in place of the section mark, and the current one is highlighted. Every other section shows as one section mark. No mark anywhere shows a raw answer id (#1795, #1789).
- **SC-010**: On both the defaults path and the ask-me path, when the base has surplus letters for the confirmed orthography, Convenience letters is asked before carve. It is skipped only when there are genuinely none, and a skip is recorded as "not asked" with its reason (#1796).
- **SC-008**: After an upstream change that leaves later work, 100% of the affected questions and stages show a "work to do" badge on the journey strip, none of the unaffected ones do, and the author's position does not change.

## Amendments to existing specs

- **057 FR-042/FR-049** (journey strip grain) is pinned. The strip shows every section as a large mark, and the current section expands in place into small question marks, one per author-facing screen, never one per recorded answer (FR-060). This covers #1789 (per-question dots inside multi-screen steps).
- **057 FR-042** "a dot appears when its step completes… the decision-recording path is NOT changed to commit per question" is superseded. Recording now happens at each Next (FR-040), so a question mark becomes a completed mark at its own Next, not when its step finishes.
- **057 FR-042** (journey strip) gains a mark state. Any mark may carry a "work to do" badge (FR-017), alongside its existing class and position cues. 057's accessibility and jump rules apply to it unchanged.
- **057 FR-007** is narrowed. Clearing the alphabet is tied not to "a genuine prefill → build-list transition" but to a **change** in the language, script or base the prefill confirms (FR-020). Passing through the prefill confirmation unchanged is not a change.
- **053 capture boundary** is refined. The decision record's append-only model and supersession chains are unchanged, but the capture point moves from step completion to **each Next** within a step (FR-040). A multi-question step therefore records per question as the author advances, rather than once when it is finished.
- **053 / 055 capture boundary** (continued). An intermediate Next in a multi-screen step is a capture boundary whose net diff is empty, so its entries carry the `{state: "none"}` impact. The step's final Next carries the whole series' diff (research R-05, plan risk 2).
- **071 FR-023** is generalised. Its re-confirmation behaviour applies to saved answers (FR-012), whether or not the marks series was completed, and becomes the pattern for every step (FR-010…FR-014).

## Assumptions

- Only an answer's **value** determines whether it changed. Re-confirming an unchanged value is never a change (FR-005).
- A shape-determining answer is always earlier in the walk than the answers it shapes. The manifest ordering guarantees this.
- The base, carve, mechanisms and touch steps already keep their answers in the working copy and are compliant. FR-050's classification will confirm or refute this, and any gap it finds is either fixed or filed.
- Re-proposed answers are flagged rather than silently changed (FR-013), following 071 FR-023's reconfirmation model. The wording of the flag is Content-owned survey text.
- Ownership: Engine team (studio SPA, stores, draft persistence). The wording of re-proposal notices is Content-owned (Article VI).
- Out of scope: survey-editing opaque `RawKmnFragment` content, the Compare tab (read-only under 057), and any change to the decision record's model.
