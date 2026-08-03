# Feature Specification: Legible decision trail — every stage reports what it did

**Feature Branch**: `055-legible-decision-trail`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "We defined touch and physical keys, but the decision trail only logs deletion. Design a spec that gets maximum readability and results in the decision tree at each stage."

## Governing documents

This spec **implements**, and does not restate, the following. On conflict, they win.

- [specs/053-decision-audit/spec.md](../053-decision-audit/spec.md) — the decision audit itself. Every requirement there (FR-001…FR-028, SC-001…SC-009) **stands unchanged**. This feature does not revise 053's model; it closes the gap between what 053 requires and what the shipped build delivers. In particular 053's FR-013 (plain-language headline), FR-011 (state the reason, never a misleading empty change), SC-001 (100% of edited steps represented) and SC-003 (a reader can state what each decision changed for ≥90% of entries) are the requirements this feature is written to actually satisfy.
- [specs/032-journey-corpus/spec.md](../032-journey-corpus/spec.md) — the two-event-type vocabulary. `gallery_edit` / `mechanism_edit` / `touch_edit` are that vocabulary and MUST NOT be forked or renamed.
- [specs/050-flow-question-i18n/spec.md](../050-flow-question-i18n/spec.md) — the `content/i18n/en/flowQuestions.json` catalog and its `content.flowQuestion.<id>.<field>` key convention. Any new author-facing per-question text belongs there, extracted by `utilities/i18n-content-extract`, not hand-maintained.
- [specs/046-i18n-localization/contracts/catalog-format.md](../046-i18n-localization/contracts/catalog-format.md) — message-id rules. Ids are permanent handles; a headline's *meaning* changing warrants a new id, its *wording* changing does not.
- Spec v1.3.1 §3c "Defaults are the product" — the motivating principle. A tool that decides on the author's behalf owes them a legible account of what it decided.
- [CLAUDE.md](../../CLAUDE.md) "Contract source-of-truth chain" — `EditorActionSummary` and `DecisionImpact` live in `packages/contracts/src/decisionRecord.ts` with a zod mirror in `schemas.ts` bound by compile-time drift guards. Any field change here MUST land in both files in the same commit.
- Constitution Article IV (single 300 ms debounce cycle) — this feature adds no validation timer. All recording remains on step-completion events.

## Problem statement

053 specified an audit that tells an author what their decisions did. The shipped build tells them, for a full authoring session in which they carved a layout, assigned mechanisms, and built a touch layout, approximately this:

```
Chose Ewondo for il_language_english
  This question has no re-derivable write path in this build, so its effect cannot be shown on its own.
Chose ewo for il_language_code
  This question has no re-derivable write path in this build, so its effect cannot be shown on its own.
Edited gallery_edit: 172 keys removed, 0 added, 0 mechanisms assigned, 0 touch keys affected
Edited mechanism_edit: 0 keys removed, 0 added, 0 mechanisms assigned, 0 touch keys affected
Edited touch_edit: 0 keys removed, 0 added, 0 mechanisms assigned, 50 touch keys affected
```

Three things are wrong with that, and they are independent failures rather than one bug: work that happened is reported as zero, an artifact was changed but the trail says it cannot say how, and what *is* reported is written in the vocabulary of the implementation rather than the author's.

### Observed defects

Audited against `main` at commit `2f35a50e`, 2026-08-02. Each is evidence for a requirement below, not a task list.

- **D-1 — `mechanism_edit` structurally always reports zero.** `observeEditorStep` counts mechanisms from `result.assignments` ([recordEditorStep.ts:99](../../packages/studio/src/decisions/recordEditorStep.ts#L99)), but the mechanisms step's adapter calls `onComplete(undefined)` ([addPhysicalAdapter.tsx:38](../../packages/studio/src/editors/adapters/addPhysicalAdapter.tsx#L38)). The count cannot be non-zero in a shipped build. The assignments themselves exist, in the store at `phaseResults.find(p => p.phase === "C").assignments`, where `TouchGallery` already reads them ([TouchGallery.tsx:1680](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx#L1680)). This is 053 SC-001 failing: a step in which edits occurred is present in the record but reports no edits.
- **D-2 — `keysAdded` has no producer anywhere in the monorepo.** Hardcoded `0` at all three branches of `observeEditorStep` ([:131](../../packages/studio/src/decisions/recordEditorStep.ts#L131), [:146](../../packages/studio/src/decisions/recordEditorStep.ts#L146), [:157](../../packages/studio/src/decisions/recordEditorStep.ts#L157)). The field exists in the contract, in its zod mirror, and in the PR-summary formatter, and no code path can make it non-zero. The mechanisms step is registered as an *add* gallery (`writes: [...ADD_GALLERY_WRITES]`, [registerEditorSteps.ts:151](../../packages/studio/src/steps/registerEditorSteps.ts#L151)); keys the author places are counted nowhere.
- **D-3 — decisions that only change package metadata report `no-rederivable-write-path`.** Both impact sources read the `.kmn` alone: the boundary capture via `findKmnPath` ([StudioShell.tsx:627](../../packages/studio/src/StudioShell.tsx#L627)) and the counterfactual via `emitKmn` ([impact.ts:105](../../packages/studio/src/decisions/impact.ts#L105)). Identity answers land in the `.kps` through the projection's identity overlay ([projectWorkingCopyVfs.ts:496](../../packages/studio/src/lib/projectWorkingCopyVfs.ts#L496)) and the `<Version>` patch ([serializeWorkingCopy.ts:217](../../packages/studio/src/lib/serializeWorkingCopy.ts#L217)). The trail's message is literally true of the current wiring and useless to the author, who can see the language name on the finished keyboard.
- **D-4 — author-facing headlines interpolate internal identifiers.** `headlineOf` passes `payload.questionId` and `payload.actionType` straight into the catalog ([headline.ts:68-75](../../packages/studio/src/decisions/headline.ts#L68)), so `trail.entry.headline.chose` renders "Chose Ewondo for il_language_english" and `…editorStep` renders all four counts including the zeros. 053 FR-013 asks for a plain-language headline; an identifier is not plain language.
- **D-5 — the reviewer-facing surface is already correct, and disagrees with the author-facing one.** The engine's PR summary has a human label per editor (`EDITOR_LABEL`, [prSummary.ts:66](../../packages/engine/src/decision-audit/prSummary.ts#L66)), drops zero-valued categories with the reasoning stated in a comment, pluralizes, and says "no net change" for an empty step ([prSummary.ts:84-95](../../packages/engine/src/decision-audit/prSummary.ts#L84)). A reviewer who never opens the studio gets a better account of the author's own work than the author does. The target rendering already exists and is tested — it simply is not the one authors see, and it cannot be reused as-is because it is English prose in the engine, which 053 FR-016 correctly forbids as the source of localized text.
- **D-6 — the recording tests pin the defects rather than catching them.** [reducer.decisionRecording.test.ts:150-174](../../packages/studio/src/steps/reducer.decisionRecording.test.ts#L150) feeds the recorder a hand-built `{ answers: [], assignments: [...] }` and correctly asserts `mechanismsAssigned === 2` — a payload shape the real adapter never emits — and asserts `keysAdded === 0` with a comment explaining why it should stay 0. Both assertions pass. Neither describes the shipped build.

- **D-7 — the base keyboard's contribution is absent from the record, and the machinery to express it is already built and unreachable.** 053's Clarifications state that provenance distinguishes decisions *implied by the base keyboard* — "carried from the base, confirmed or not — these are implied decisions that affect the output". The `"base-derived"` agency exists in the contract, and the catalog carries `trail.entry.headline.fromBase` ("Carried {value} for {question} from the base keyboard", [messages.json:257](../../packages/studio/src/locales/en/messages.json)). Neither is reachable: `base-derived` is only ever derived from a matched proposal whose source is `"base"` ([recordSurveyAnswers.ts:84](../../packages/studio/src/decisions/recordSurveyAnswers.ts#L84)), the proposal register is optional, and `StudioShell` does not supply one ([StudioShell.tsx:637-658](../../packages/studio/src/StudioShell.tsx#L637)). So every entry records `"hand-set"` and that headline is dead code. Beyond provenance, the base's *substance* — the keys it brought, the axes derived from it, the metadata it carried — was never a survey answer and is recorded nowhere at all. The consequence is visible in the reported defect: the trail opens with "172 keys removed" against a starting inventory it never describes, and a count with no denominator is not legible regardless of how well it is worded.

The common shape across D-1, D-2 and D-3 is worth naming, because it is what the anti-regression requirements below are aimed at: **a reporting field whose producer was never wired, protected by a test that asserts the unwired value.** The trail reports deletions and touch keys because those two paths happen to read a source that is populated; nothing structural distinguishes them from the paths that report zero.

## Clarifications

### Session 2026-08-02

- Q: `keysAdded` has no producer (D-2) and FR-004 forces removal-or-producer — which? → A: Give it a producer. The mechanisms stage counts keys it newly occupied: a key that carried no character before the stage and carries one after. The field, its zod mirror, and the existing PR-summary formatting are retained.
- Q: Does every question need an author-facing audit name, or only those visible in trails (FR-009)? → A: Neither — the headline reuses the question's existing `prompt` by default, with an optional `audit_label` field in the same catalog overriding it where the prompt reads badly in a headline. Most questions need no new content, and FR-014's fallback carries no routine traffic because a prompt is always present. The override field is optional, so target-locale key-set parity must tolerate its absence.
- Q: Where a stage produced one change and several decisions, does the system state the sharing or split the capture boundary (FR-019)? → A: State the sharing. One change is captured per boundary and attributed jointly to the decisions made in that step; each entry says the change is shared and names its co-decisions. No per-answer projection, and 053's one-diff-per-boundary model is preserved. This converts the current dead end — four identical "cannot be shown" messages — into a joint statement of what those decisions did together.
- Q: Should the record include what the **base keyboard** contributed — its keys, axes, and metadata — rather than starting at the author's first answer? → A: Yes. Choosing a base is itself a decision, and everything inherited from it is an implied decision that affects the output. The base's contribution is recorded at the point the base is chosen, so later counts have a baseline: "172 keys removed" is only meaningful against a recorded starting inventory. This is 053's existing `base-derived` provenance finally being reachable, not a new provenance concept.
- Q: Which produced-package files are in scope for a decision's attributed change (FR-016)? → A: Every text file the projection produces — the whole projected VFS, binaries skipped — rather than a curated list. A named list is how the metadata file came to be missed (D-3), and a whole-package comparison covers any future emitted file with no list to keep in sync. Stored size stays bounded by 053's existing truncation rule.
- Q: How does the record represent *unmeasured*, as distinct from measured-zero (FR-005)? → A: By absence — each count becomes optional (`number | undefined`), and an absent value means the dimension was not measured. A present `0` means measured and unchanged. Consumers must handle absence explicitly, so an unwired producer fails typecheck rather than silently reporting `0` (the D-1/D-2 failure mode). Note the limit: records already written carry a **present** `0` for dimensions that could not be measured, so absence does not retroactively disambiguate them — that is why the migration question below stays open.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every stage reports what it actually did (Priority: P1)

An author completes a session in which they carve keys, assign mechanisms to characters, and build a touch layout. Opening the trail, each of those three stages reports the work that stage performed, in the units that stage works in. No stage that did work reports having done none.

**Why this priority**: This is the feature's core claim and the one the other stories rest on. A trail that under-reports is worse than no trail: it is affirmative evidence that nothing happened. It is also the defect the author actually hit.

**Independent Test**: Complete a session with edits in all three editor stages, open the trail, and confirm each entry's reported counts match the edits made. Delivers value alone even if every headline still reads awkwardly.

**Acceptance Scenarios**:

1. **Given** an author has assigned mechanisms to characters in the mechanisms stage, **When** they open the trail, **Then** that stage's entry reports the number of mechanisms assigned, and that number matches the assignments the stage recorded.
2. **Given** an author has placed characters onto keys that previously carried none, **When** they open the trail, **Then** that stage's entry reports those keys as added.
3. **Given** an author has carved keys, **When** they open the trail, **Then** that stage's entry reports the number removed, as it does today.
4. **Given** an author has built a touch layout, **When** they open the trail, **Then** that stage's entry reports the touch keys affected, as it does today.
5. **Given** an author enters an editor stage and completes it without making any change, **When** they open the trail, **Then** the entry says the stage made no change — as a statement, not as a row of zeros.
6. **Given** any editor stage's entry, **When** its reported counts are compared against the working copy's own state after that stage, **Then** they agree.

---

### User Story 2 - Every entry reads as a sentence (Priority: P1)

An author who has never seen the codebase reads their trail and understands every line without inference. Questions are named the way they were asked. Stages are named for what they do. A stage's summary mentions only the dimensions in which something happened.

**Why this priority**: Co-P1 with Story 1 because the two failures compound: a correct count expressed as `mechanism_edit: 0 keys removed, 0 added, 7 mechanisms assigned, 0 touch keys affected` still fails 053 SC-003. Both are needed before the trail discharges its purpose, and each is independently testable.

**Independent Test**: Render a trail containing one entry of every kind and confirm no internal identifier appears in the output and no zero-valued dimension is mentioned. Testable without completing a session.

**Acceptance Scenarios**:

1. **Given** an entry for a survey answer, **When** its headline renders, **Then** the question is named in the author's language — the wording the question was asked in — and not by its internal id.
2. **Given** an entry for an editor stage, **When** its headline renders, **Then** the stage is named for what it does, and not by its internal action type.
3. **Given** an editor entry in which exactly one dimension is non-zero, **When** its headline renders, **Then** only that dimension is mentioned.
4. **Given** any author-facing text this feature renders, **When** it is inspected, **Then** it contains no snake_case or camelCase identifier drawn from the payload.
5. **Given** a count of exactly one, **When** the headline renders, **Then** it reads in the singular.
6. **Given** an author using a locale with a translated catalog, **When** they open the trail, **Then** every line this feature renders is translated, including the question and stage names.
7. **Given** a question whose author-facing name is missing from the catalog, **When** its headline renders, **Then** it degrades to a readable fallback and never to a raw identifier or a blank.

---

### User Story 3 - The base keyboard's contribution is on the record (Priority: P2)

An author chose a base keyboard and then removed most of its keys. Opening the trail, they see the base selection as the decision it was, with an account of what that base brought — how many keys, which axes, what metadata — so every later count reads against a stated starting point rather than against nothing.

**Why this priority**: This supplies the denominator the P1 stories' counts are read against, and it is the difference between a trail that begins mid-story and one that begins at the beginning. It is P2 rather than P1 because US1 and US2 deliver real value against the current implicit baseline, and this story is additive to them rather than a precondition. It should nonetheless be built alongside US1, since both read the same working-copy state.

**Independent Test**: Instantiate from a base, open the trail, and confirm the base selection appears with an account of what it contributed. Delivers value alone — an author can see what they started from even if nothing else in this feature ships.

**Acceptance Scenarios**:

1. **Given** an author has chosen a base keyboard, **When** they open the trail, **Then** the base selection appears as a decision naming the base chosen.
2. **Given** the base contributed keys to the starting layout, **When** the author reads that entry, **Then** it states how many keys the base brought.
3. **Given** the base contributed properties the studio derived from it (its axes) or metadata the keyboard inherited, **When** the author reads that entry, **Then** those contributions are stated, in the author's language.
4. **Given** a later stage removed keys the base contributed, **When** the author reads that stage's entry, **Then** the count is interpretable against the base's recorded starting inventory.
5. **Given** a value the keyboard carried from its base rather than one the author set, **When** its decision is shown, **Then** it is marked as carried from the base and not as author-set — 053's `base-derived` provenance, reachable.
6. **Given** an author later overrides a value the base supplied, **When** they open the trail, **Then** both are visible: what the base carried and what the author replaced it with, under 053 FR-015's supersede semantics.

---

### User Story 4 - Decisions that shape the package show their effect (Priority: P2)

An author who set their language's name, code, and script expands one of those decisions and sees what it changed about the keyboard being produced — not a message saying the studio cannot tell.

**Why this priority**: P2 rather than P1 because these entries are currently *honestly* unhelpful rather than wrong — the message is accurate about the build's limits, which 053 FR-011 explicitly permits. Fixing it is high value and lower risk than either P1 story, but the trail is not lying today.

**Independent Test**: Complete the identity stage, expand each of its decisions, and confirm the change shown corresponds to the metadata that decision set in the produced package. Testable against a projection, with no PR or download needed.

**Acceptance Scenarios**:

1. **Given** an author has set the language's English name, code, and script, **When** they expand those decisions, **Then** they see the change each made to the produced package.
2. **Given** a decision that changes only package metadata and not the keyboard's rules, **When** its change is shown, **Then** the file it changed is identified, and it is not reported as having changed nothing.
3. **Given** a stage in which several questions were answered together, **When** the author expands one of them, **Then** they are told either what that decision alone did, or that the stage's change cannot be split and which decisions share it — never a change belonging to a sibling decision.
4. **Given** a decision whose isolated effect genuinely cannot be derived, **When** it is expanded, **Then** the reason is stated in the author's terms, as 053 FR-011 requires, and the statement distinguishes "the studio cannot isolate this" from "this changed nothing".
5. **Given** the change shown for any decision, **When** it is compared against the shipped package, **Then** they agree — 053 SC-005 continues to hold across the widened scope.

---

### User Story 5 - The trail reads as a staged narrative (Priority: P3)

An author scans the trail and sees the shape of their session — the stages they went through, in order, each with a one-line account of what it produced — and expands a stage to see the individual decisions inside it.

**Why this priority**: This is presentation over a record the first four stories make trustworthy, and it should absorb scope cuts first. A flat list of correct, legible entries already satisfies 053. Grouping makes a long trail scannable, which matters most for the sessions that are hardest to read.

**Independent Test**: Open a trail from a full session and confirm entries are grouped by stage in flow order with a per-stage summary line, and that the flat ordering remains available.

**Acceptance Scenarios**:

1. **Given** a completed session, **When** the author opens the trail, **Then** decisions are grouped under the stage they were made in, and the stages appear in the order the author walked them.
2. **Given** a stage group, **When** it renders collapsed, **Then** it shows one line stating what that stage produced.
3. **Given** a stage the author revisited, **When** its group renders, **Then** the revisit is visible as history within that stage, consistent with 053 FR-015.
4. **Given** a stage in which no decision was recorded, **When** the trail renders, **Then** that stage is either omitted or shown as untouched, and never shown as a stage that made changes.
5. **Given** a grouped trail, **When** the author looks for a single decision, **Then** every entry visible in today's flat trail is still reachable — grouping hides nothing.

### Edge Cases

- **A stage that did work the record has no unit for**: reported by the units that do apply, with the remainder stated as unquantified rather than dropped silently or coerced to zero.
- **A stage whose store-derived counts are unavailable** (no working copy, a projection failure): the entry states that its effect is unknown for that stage. It MUST NOT fall back to zero, which would be indistinguishable from "did nothing".
- **A question answered with an empty value**: the headline says the author chose nothing, distinctly from the value being missing — the existing `formatAnswerValue` distinction between `(blank)` and `(none)` is preserved.
- **A record written by an earlier build**, in which `mechanismsAssigned` is 0 because it could not be anything else: the trail MUST NOT retroactively claim work that build did not record. Note that FR-005's absence convention does not resolve this on its own — those records carry a **present** zero, indistinguishable by shape from a measured zero — so the disambiguation must come from elsewhere (see the open question on migration presentation). What the trail must not do is present a pre-feature zero as a measured finding.
- **A keyboard with no base** (instantiated from scratch, if reachable): the record states that the session started empty rather than omitting the baseline, so a later removal count is still interpretable.
- **A base swapped mid-session**: the earlier base's contribution remains on the record as history and the new base's is recorded as a superseding baseline; the trail MUST NOT present the new base's inventory as though it had been the starting point all along.
- **A locale with a partially translated catalog**: untranslated lines fall back per the project's existing i18n conventions; the fallback is prose, never an identifier.
- **An extremely long trail**: grouping must not require rendering every entry to compute the group summaries, and expanding one stage must not compute impact for any entry (053 FR-010/FR-027 continue to hold).
- **A decision that changes many files at once** (an identity change touching metadata and rule source together): each changed file is identified separately rather than merged into one diff, so the author can see which part of the package each change landed in.
- **Widened comparison against the size threshold**: comparing every produced file makes stored detail larger per entry. 053's truncation rule (shed detail, never entries) is what bounds it; this feature must not raise the threshold or exempt itself from shedding.
- **A shed entry** (detail dropped for size, 053's truncation rule): its headline still reads legibly, and its stage roll-up still counts it.

## Requirements *(mandatory)*

### Functional Requirements

**Truthful stage reporting**

- **FR-001**: Every editor stage in which the author made a change MUST report that change in the record, in every dimension the record defines that the stage can affect.
- **FR-002**: The mechanisms stage MUST report the mechanisms it assigned. Its count MUST derive from the same assignment state the rest of the studio reads, so that the trail and the studio cannot disagree about how many assignments exist.
- **FR-003**: A stage that places characters onto keys that previously carried none MUST report those keys as added. "Added" means newly occupied: the key carried no character before the stage and carries one after. A key that already carried a character and was reassigned is not an addition — it is counted only as a mechanism assigned (FR-002), so the two counts never double-count the same edit.
- **FR-004**: A reporting dimension defined in the record MUST have at least one production code path that can make it non-zero. A dimension no stage can produce MUST be removed from the record rather than retained as a permanent zero.
- **FR-005**: Where a stage's effect in a given dimension cannot be measured, the record MUST distinguish *unmeasured* from *zero*, and MUST represent unmeasured by the **absence** of that dimension's value. A present zero MUST mean the stage was measured and changed nothing in that dimension.
- **FR-005a**: Every consumer of a stage's counts — headline, pull-request summary, stage roll-up, and the packaged record — MUST handle an absent value explicitly, and MUST NOT coerce it to zero or render it as a number. An absent value is reported in words as not measured.
- **FR-006**: Reporting MUST derive from state the studio already holds. This feature MUST NOT introduce a second source of truth for what an editor stage did, and MUST NOT require an editor component to report its own activity in a shape maintained only for the audit.
- **FR-007**: This feature MUST NOT alter the keyboard artifact. 053 FR-006 and SC-006 continue to hold: an identical session with and without these changes produces identical output.

**Inherited baseline**

- **FR-030**: Choosing a base keyboard MUST be recorded as a decision, naming the base chosen.
- **FR-031**: That entry MUST state what the base contributed to the working copy — at minimum the number of keys in the starting layout, the properties the studio derived from the base, and the metadata the keyboard inherited from it.
- **FR-032**: A value the keyboard carries from its base rather than from the author MUST be recorded with base-derived provenance, and MUST be presented as carried from the base rather than as author-set. This makes 053's existing `"base-derived"` agency and its headline reachable; it MUST NOT introduce a competing provenance concept.
- **FR-033**: Where the author later replaces a base-supplied value, both MUST remain visible under 053 FR-015's supersede semantics — the base's contribution is history, not a value to overwrite.
- **FR-034**: A stage's counts MUST be interpretable against the recorded starting inventory. A removal count MUST NOT be the only thing on the record about a layout whose starting size was never stated.
- **FR-035**: Recording the base's contribution MUST derive from the working copy as instantiated, not from a re-read of the base keyboard's source, so the record describes what the author actually started from.

**Plain language**

- **FR-008**: No author-facing text this feature renders may contain an internal identifier — not a question id, an action type, a step id, a message id, or a field name.
- **FR-009**: A survey decision's headline MUST name its question in the author's own language, sourced from the existing flow-question content catalog rather than a second per-question label store. It MUST use the question's existing prompt by default, and MUST prefer an optional per-question audit label where one is authored. The override field MUST be optional, so a locale that has not authored it — and a question that does not need it — remain valid.
- **FR-010**: An editor decision's headline MUST name its stage for what the stage does.
- **FR-011**: An editor decision's headline MUST mention only the dimensions in which something happened. A stage that changed nothing MUST be described as such in words.
- **FR-012**: Counts in author-facing text MUST agree in number with their nouns.
- **FR-013**: All text introduced by this feature MUST be localisable under the project's existing catalog conventions, and the selection of *which* message a headline uses MUST remain testable without rendering — the existing headline-spec split is preserved, not bypassed.
- **FR-014**: Where an author-facing name for a question or stage is unavailable — a question absent from the catalog entirely, or a record referencing a question the build no longer has — the headline MUST degrade to readable prose. It MUST NOT fall back to an identifier, and MUST NOT render blank. Because a prompt is always present for a live question, this path MUST NOT carry routine traffic; it exists for the missing-question case.
- **FR-015**: The author-facing trail and the reviewer-facing pull-request summary MUST describe the same decision consistently — same stage naming, same zero-suppression, same singular/plural discipline — while each remains responsible for its own text (the engine ships codes and counts; the studio ships the localized sentence, per 053 FR-016).

**Impact across the produced package**

- **FR-016**: A decision's attributed change MUST span every text file the projection produces, not the keyboard's rule source alone. The compared set MUST be derived from what the projection emitted, not from a maintained list of file names, so a newly emitted file is covered without an edit here. Binary files are excluded from comparison.
- **FR-017**: A decision that changes only package metadata MUST have its change shown, with the affected file identified. Where a decision changed more than one file, each changed file MUST be identified.
- **FR-017a**: Content that changes on every projection independently of any decision (a timestamp, a build stamp, a recomputed version) MUST NOT be attributed to a decision. Such content is either excluded from comparison or held stable across the comparison, so an entry's change contains only what that decision caused.
- **FR-018**: Widening the attributed change MUST NOT weaken 053 FR-009/SC-005: every file compared MUST come from the same projection that produces the shipped keyboard.
- **FR-019**: Where a stage produced one change and several decisions, the system MUST NOT attribute that change to any one of them as though it were solely responsible. It MUST instead attribute the change jointly: each of those entries shows the shared change, states that it is shared, and names the co-decisions it is shared with.
- **FR-019a**: Joint attribution MUST NOT require more than one comparison per stage boundary. 053's one-change-per-boundary model stands; this feature changes how that change is attributed, not how often it is captured.
- **FR-020**: The two unavailability reasons MUST remain distinguishable to the author, and MUST remain distinct from "changed nothing" (053 FR-011).
- **FR-021**: Impact MUST continue to be computed only on request for a specific decision (053 FR-010), and expanding one entry MUST NOT compute impact for any other.

**Staged presentation**

- **FR-022**: The trail MUST group decisions by the stage they were made in, in the order the author walked those stages.
- **FR-023**: Each stage group MUST show a one-line account of what that stage produced, available without expanding the group.
- **FR-024**: Every entry reachable in the current flat trail MUST remain reachable after grouping.
- **FR-025**: A stage in which nothing was recorded MUST NOT be presented as a stage that made changes.
- **FR-026**: Revisits MUST remain visible as history within their stage, per 053 FR-015.

**Anti-regression**

- **FR-027**: Tests that assert what the record contains for a step MUST drive the production completion path for that step. A test MUST NOT establish a record's contents by constructing a payload shape no production caller emits.
- **FR-028**: The absence of an internal identifier from author-facing trail text MUST be enforced mechanically, not by review.
- **FR-029**: Every reporting dimension MUST have a test that drives it to a non-zero value through the production path. This is the direct guard on FR-004: a dimension no test can move is a dimension with no producer.

### Key Entities

- **Editor action summary** *(existing, `packages/contracts`)*: the per-stage counts. All four dimensions are retained: `keysAdded` gains a producer rather than being removed (see Clarifications), so FR-004 is satisfied without a field removal. Each count becomes **optional**, with absence meaning unmeasured and a present zero meaning measured-and-unchanged (FR-005). Both changes land in the type and its zod mirror in the same commit, per the contract source-of-truth chain.
- **Decision impact** *(existing, `packages/contracts`)*: the change attributed to one decision. Widened from a single rule-source path to a **set of per-file changes** covering every text file the projection produced that the decision altered (FR-016), and gains the shared-change statement (FR-019). The single-`path` shape is the field this widening changes; its zod mirror moves with it.
- **Headline spec** *(existing, studio)*: which message a headline uses and the values it interpolates. Gains author-facing question and stage names in place of identifiers (FR-009/FR-010) and the non-zero-dimension selection (FR-011).
- **Base contribution** *(new)*: what the working copy inherited when it was instantiated — the base chosen, the starting key count, the derived properties, and the inherited metadata. Recorded once, at base selection, as the baseline every later count is read against (FR-030/FR-031). Distinct from provenance: provenance says *who chose* a value, this says *what the session started with*.
- **Stage group** *(new, presentation only)*: a stage, its decisions in order, and its one-line account. Derived from the record and the flow's own stage ordering; not persisted, and not a second record.
- **Question audit label** *(new, content, optional)*: an override for the author-facing name a question is given in a decision headline, in the existing flow-question catalog under its established key convention. Authored only where the question's prompt reads badly as a headline; absent otherwise, in which case the prompt is used. Optional in every locale. Content-team owned.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a session with edits in all three editor stages, every stage reports non-zero activity in at least one dimension, and every reported count matches the working copy's own state for that stage. Today: one of three.
- **SC-002**: Zero reporting dimensions exist that no production code path can make non-zero. Verified by a test per dimension that drives it non-zero through the production path.
- **SC-003**: Zero occurrences of an internal identifier in rendered author-facing trail text, across an entry of every kind. Mechanically checked.
- **SC-004**: No editor headline mentions a dimension whose value is zero.
- **SC-005**: An author who did not build the keyboard can, from the trail alone, correctly state what each decision was and what it changed for at least 90% of entries — 053 SC-003, re-measured after this feature, and the criterion this spec exists to make achievable.
- **SC-006**: Every decision in the identity stage shows either a change to the produced package or a stated reason. Zero report a reason that a widened comparison would have resolved.
- **SC-007**: The trail and the pull-request summary, generated from the same record, agree on every decision's stage name, mentioned dimensions, and counts.
- **SC-008**: The produced keyboard artifact is unchanged by this feature in all verified cases (053 SC-006 preserved).
- **SC-009**: Opening the trail still presents the list without computing any entry's impact; expanding one entry computes only that entry's (053 FR-010/SC-007 preserved).
- **SC-010**: Every test asserting record contents for a step drives that step's production completion path. Zero rely on a synthetic payload shape.
- **SC-011**: A record written before this feature loads and renders without claiming activity that build did not measure.
- **SC-012**: For every keyboard instantiated from a base, the record states the base chosen and what it contributed. Today: zero.
- **SC-013**: Every value the keyboard carried from its base is presented as carried from the base, not as author-set. Today the shipped build renders every entry as author-set, so the measured rate is zero.

## Out of scope

- **Revising a decision from the trail**, and staleness-driven re-derivation — 053's Phase 2, unchanged.
- **Character-class decisions** — 053's Phase 3, unchanged.
- **Finer-grained editor decisions.** Unwrapping a monolithic gallery step into per-key decisions is 053's stated future direction. This feature makes the *aggregate* truthful and legible; it does not subdivide it.
- **Enabling the `mutate()` seam.** The seam is gated off by design ([mutateFlag.ts](../../packages/studio/src/flags/mutateFlag.ts), spec 014 F2), and turning it on is that feature's rollout decision, not this one's. FR-016/FR-017 are satisfied by widening the *captured* comparison, which does not depend on the seam.
- **Implementing `mutate()` for the identity questions.** Those modules are declared stubs; giving them real write paths is spec 014's work.
- **Retroactively enriching existing records.** Records written by earlier builds are read as-is (see Edge Cases and SC-011).
- **Changing the journey-corpus event vocabulary**, the flow map's status as a structural projection (ADR-0001), or the sidecar's placement and naming (053 FR-020).
- **Any new validation timer** (Constitution Article IV).

## Assumptions

- **The counts come from the store, not from the editors.** The pattern that already works — `gallery_edit` reading deletion state via an injected dep — is the pattern to extend, rather than threading audit-shaped payloads out through editor components. This keeps editors unaware of the audit and gives the recorder one consistent way to observe a stage. It also means the fix for D-1 is a new dep alongside the existing ones, not a change to any adapter's prop shape.
- **Question names come from the existing flow-question catalog.** Spec 050 already extracts `prompt` and `help_text` per question under `content.flowQuestion.<id>.<field>`; the optional audit label is a third field in that same catalog, with the same extraction and the same lint. A second label store would drift.
- **The optional audit label must not break catalog parity checks.** `content-i18n-lint` enforces target-locale key-set parity for any locale that has started a catalog. An optional per-question field is absent for most questions in every locale, so the parity rule must treat it as optional rather than as a missing translation — otherwise adding the field turns every started locale red.
- **Reused prompts are imperative, not interrogative, in the questions that matter most.** "Confirm your language's code" reads acceptably in a headline; a long "What is your language called in English?" reads worse. The override field exists for the latter, so the content cost is paid only where it buys something.
- **Stage names already exist in English** in the engine's `EDITOR_LABEL`. This feature does not reuse that string — 053 FR-016 requires the localized sentence to come from the studio's catalog — but it does adopt its wording and its zero-suppression, so the two surfaces agree without sharing code.
- **Grouping is presentation over the existing record.** No new persisted state, no record-format change for Story 5, so it can be cut without affecting the others.
- **The base's contribution is read from the instantiated working copy**, whose axes and starting layout the store already holds, rather than by re-parsing the base's source. This keeps FR-035 true and reuses the same store-read pattern as FR-006.
- **Making `base-derived` provenance reachable requires the proposal register that 053 left as a seam.** `recordSurveyAnswers` documents it as fully implemented and unwired; FR-032 depends on supplying it, which is the contained follow-up that module's header anticipates. This is wiring, not new design.
- **Stage order comes from the flow's own manifest**, so the trail's ordering cannot drift from the order the author actually walked.
- **`EditorActionSummary` is not a Day-1 locked type.** It is 053's own contract, so a field change follows the ordinary drift-guard discipline (type plus zod mirror in one commit) rather than requiring a joint session. Confirm before changing it, per spec §18.
- **Owner**: Engine team for the studio, contracts, and impact work; Content team for the question audit names. Per Constitution Article VI.

## Open questions

Deferred past the clarification quota. Both are lower impact than the five resolved above and neither blocks planning; each is a contained decision that can be taken at plan time.

1. **Migration presentation (SC-011).** A pre-feature record's zeros are unmeasured but stored as a present `0`, which FR-005's absence convention cannot disambiguate on its own. Options: mark by record version, present all pre-feature editor entries as unmeasured, or accept the ambiguity and state it once at the top of the trail.
2. **Does the stage roll-up (FR-023) restate its entries, or summarize the stage's net effect?** These differ for a revisited stage, where the entries include superseded history but the net effect does not.

Also unconfirmed, and worth resolving before the contract work begins: the Assumptions section reads `EditorActionSummary` as 053's own contract rather than a Day-1 locked type, so field changes follow ordinary drift-guard discipline. Both FR-004's producer and FR-005's optionality depend on that reading.
