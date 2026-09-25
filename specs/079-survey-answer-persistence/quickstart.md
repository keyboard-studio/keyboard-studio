# Quickstart: Survey answers persist per question

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md) | **Data model**: [data-model.md](data-model.md) | **Classification**: [contracts/step-classification.md](contracts/step-classification.md)

This is a validation guide, not implementation code. It tells you how to run the automated tests
that prove each user story and how to walk the same scenario by hand in the running studio.

## Prerequisites

- Node >= 22.19.0, pnpm 9.
- `pnpm install` at the repo root.
- `pnpm build` once before any manual walk or typecheck. The studio's typecheck depends on the
  built `engine`/`contracts` output — a bare `tsc -b` inside `packages/studio` without a prior
  build produces phantom `contracts`/`engine` errors that are not real regressions.
- A sibling `../keyboards` checkout (tracking the
  [keyboard-studio/keyboards](https://github.com/keyboard-studio/keyboards) fork's `master`) if
  any scenario below loads a corpus keyboard as its base.
- **Never run bare `vitest` at the repo root.** Every command below is scoped with
  `pnpm --filter <package> test -- <pattern>`.

## Running the automated tests

```
# studio unit tests, filtered to this feature's suites
pnpm --filter @keyboard-studio/studio test -- surveyAnswerStore
pnpm --filter @keyboard-studio/studio test -- MarksSeriesStep
pnpm --filter @keyboard-studio/studio test -- ConvenienceCharsStep
pnpm --filter @keyboard-studio/studio test -- CharactersStep
pnpm --filter @keyboard-studio/studio test -- draftPersistence
pnpm --filter @keyboard-studio/studio test -- progressDots
pnpm --filter @keyboard-studio/studio test -- stepClassification

# engine unit test for the D-6 mark-guards fix
pnpm --filter @keyboard-studio/engine test -- mark-guards

# Playwright e2e (studio), a targeted subset — see docs/tooling.md#end-to-end-tests
pnpm --filter @keyboard-studio/studio test:e2e footer-progress decision-deeplink

# manual walk
pnpm dev
```

`test:e2e` forwards positional args to Playwright as spec-name filters (see
[docs/tooling.md](../../docs/tooling.md)). Run `npx playwright install chromium` once per version
bump if Playwright reports a missing browser.

## Scenario -> tests -> success criteria

Each scenario below names: the manual steps in `pnpm dev`, the automated test(s) that prove it,
and the FR/SC ids it satisfies. Test file names are **planned** — they mirror the model precedent
[PunctuationStep.test.tsx:624](../../packages/studio/src/survey/punctuation/PunctuationStep.test.tsx)
("removals survive a step revisit") unless noted otherwise.

### US1 — Look back and come back with nothing lost

**Manual**: In Accents and marks, un-tick two attachments, change a treatment, advance to the
third station. Click Back to Confirm your alphabet, then Done with no edit. Confirm every
attachment, treatment and the station position are exactly as left.

**Automated**:
- `packages/studio/src/survey/marks/MarksSeriesStep.test.tsx` — a revisit test modelled on
  `PunctuationStep.test.tsx:624`: change several answers away from proposals, unmount/remount (or
  navigate back and forward through the harness), assert every `SavedAnswer` in
  `surveyAnswerStore.steps["marks"].answers` and `position` are unchanged.
- `packages/studio/src/survey/convenience/ConvenienceCharsStep.test.tsx` — un-tick letters, leave
  and return with no upstream change, assert `unchecked` set survives (covers Acceptance Scenario
  2).
- `packages/studio/src/stores/surveyAnswerStore.test.ts` — unit coverage for `saveAnswer` being
  synchronous per FR-001/FR-002, independent of whether the step finished.
- A revisit test per remaining step per FR-051/SC-001 (identity, track, project_name, help,
  invisibles, punctuation, plus the "verify by revisit test" rows in
  [contracts/step-classification.md](contracts/step-classification.md): choose_base, carve,
  touch_seed_source).
- `packages/engine/src/pattern-apply/mark-guards.test.ts` (filter `mark-guards`) — re-completing
  Accents and marks with no change leaves the emitted `.kmn` byte-equal; a "blocked -> none"
  transition leaves no stray `generated_marks_guard` artefacts (D-6, FR-054, SC-005).

**Expected outcome**: FR-001…FR-007, FR-054; SC-001, SC-005.

### US2 — Going back through the prefill confirmation keeps the alphabet

**Manual**: Build an alphabet with an added and a removed character, pick punctuation. Take each
of the three routes with no change: (a) Back twice from Confirm your alphabet then Done on
prefill, (b) Done again on Project name, (c) Done again on the track choice. After each, confirm
the alphabet, punctuation picks and build list are unchanged and non-empty.

**Automated**:
- `packages/studio/src/survey/CharactersStep.test.tsx` — a "prefill routes" test exercising all
  three routes from [advance.ts](../../packages/studio/src/steps/advance.ts) and
  `CharactersStep.tsx:88`'s Back path, asserting `phaseBDraftStore` picks/chars/bases/provenance
  and `alphabetEvidenceKey` (data-model.md §4) are untouched when the key is unchanged.
- `packages/studio/src/survey/punctuation/PunctuationStep.test.tsx` — extends the `alreadyConfirmed`
  guard test to assert it is scoped to the current `resolvedTag|baseId`, not "any confirmed
  inventory" (FR-022).
- A regression test for Acceptance Scenario 3: changing language/script/base and coming forward
  routes into the US3 (carry-over) behavior instead of the "unchanged" path.

**Expected outcome**: FR-020, FR-021, FR-022; SC-002.

### US3 — A real change re-proposes only what it affects

**Manual**: Finish Accents and marks with several answers overturned. Go back, add one base letter
to the alphabet, come forward. Confirm only the answers touching that base (its attachments, and
any treatment whose evidence includes it) are re-proposed and flagged; every other answer is
unchanged. Then change the letter back before revisiting marks, and confirm the flags disappear
and originals return with no reconfirmation needed.

**Automated**:
- `packages/studio/src/survey/marks/MarksSeriesStep.test.tsx` (or a new
  `reconcile.test.ts` beside `steps/evidence.ts`) — the "marks test case" from
  [research.md](research.md) R-02/R-03: add one base letter, assert `reconcile()` returns
  `state: "reproposed"` only for answers whose per-answer evidence key changed (FR-010, SC-003),
  and that an explicitly set `inputOrder` survives unless the change makes it inapplicable
  (FR-012, Acceptance Scenario 2).
- Same suite — change the base letter, then revert it before the dependent step is revisited;
  assert the view returns to `state: "current"` with no flag (FR-014, Acceptance Scenario 3).
- `packages/studio/src/steps/evidence.test.ts` — unit tests for each `keyFn` in
  [data-model.md](data-model.md) §2 (alphabet, marks, punctuation, invisibles, convenience),
  covering step-key and per-answer-key derivation in isolation.
- `packages/studio/src/survey/CharactersStep.test.tsx` — the FR-015 carry-over case: an added
  character outside the new script is kept and flagged `outside-script`, never dropped.
- `packages/studio/src/lib/selectWorkToDo.test.ts` — Acceptance Scenario 5: after adding a letter
  and clicking Next, `selectWorkToDo()` reports `unassigned` work items for the physical and touch
  galleries; the badge clears once the new letter has a key assignment (FR-017).
- `packages/studio/e2e/footer-progress.spec.ts` (extended) or a new
  `packages/studio/e2e/journey-strip-badges.spec.ts` — end-to-end: badge appears on the mechanism
  gallery marks, activating it jumps there without moving the author's saved position elsewhere
  (FR-004, FR-017).

**Expected outcome**: FR-010…FR-017; SC-003, SC-008.

### US4 — Answers survive a reload

**Manual**: Give partial answers in Accents and marks (some stations answered, one in progress)
and in a question-by-question step (e.g. Identity, half-answered). Reload the tab. Confirm every
answer and the current question/station are restored exactly.

**Automated**:
- `packages/studio/src/lib/draftPersistence.test.ts` — a reload round-trip test: populate
  `surveyAnswerStore`, serialize via `installDraftAutosave`, restore, assert `steps[...]` and
  `position` match (FR-030, FR-053).
- Same file — a **pre-feature draft** fixture (no `surveyAnswers` field) restores without error,
  every step falls back to its proposal, and no answer is invented (FR-032, Acceptance Scenario
  3).
- `packages/studio/src/stores/surveyAnswerStore.test.ts` — `reset()` is called only from the two
  known sites (`StudioShell.tsx:1285`, `WelcomeScreen.tsx:333`); a test asserts the call-site set
  so start-over/new-project clearing (FR-033) is not silently widened.

**Expected outcome**: FR-030…FR-034; SC-004.

### #1795 / #1789 — Journey strip: one mark per screen, grouped under section marks

**Manual**: Leave Invisible characters with no interaction; confirm the footer shows exactly one
question mark for it, not one per candidate. Enter Accents and marks; confirm the section expands
in place into one small question mark per station, with the current one highlighted, while every
other section still shows as a single large mark.

**Automated**:
- `packages/studio/src/decisions/progressDots.test.ts` — rework coverage for `buildProgressDots`:
  multiple `survey-answer` entries sharing one `screenId` collapse to one question mark (FR-060,
  FR-061, SC-009); a raw answer id such as `invisibles.u2068` never appears as a label (FR-062);
  section fill states `full`/`partial`/`none` render the documented glyphs.
- `packages/studio/e2e/footer-progress.spec.ts` — end-to-end: enter Accents and marks, assert the
  expanded question marks are present and one collapses back to its section mark on leaving; the
  collapsed mark's activation jumps to the author's last position there (FR-063).

**Expected outcome**: FR-060…FR-063; SC-009.

### #1796 — Convenience letters does not skip itself on missing evidence

**Manual**: Reach Convenience letters on the defaults path while the orthography signal is not yet
resolved. Confirm the step is shown (not silently skipped) or the gap is surfaced. Separately,
reach it on a base with genuinely no surplus letters and confirm it passes with a visible
"passed — reason" state, not silently.

**Automated**:
- `packages/studio/src/survey/convenience/ConvenienceCharsStep.test.tsx` —
  `computeConvenienceGate` returns `unknown{reason}` when the signal is not yet known and the step
  renders rather than skips (FR-064); `not-applicable{reason}` writes `not-asked` status with no
  `retainedConvenienceChars` and appends no decision entry (FR-065).
- `packages/studio/src/hooks/useCarveNeededSet.test.ts` — defaults path and ask-me path produce
  the same `hasSignal` for the same evidence (FR-066, SC-010).
- `packages/studio/src/editors/carve/CarveGalleryV2.test.tsx` — carve treats an absent
  `retainedConvenienceChars` / `not-asked` status as "no retention decision", not "keep none"
  (FR-065).
- `packages/studio/src/survey/convenience/ConvenienceCharsStep.test.tsx` — a later alphabet edit
  that creates surplus letters flips a skipped step to work-to-do via `selectWorkToDo()`, without
  moving the author (FR-067, FR-068).

**Expected outcome**: FR-064…FR-068; SC-010.

## Gates

Run these before considering any phase of this feature done:

```
pnpm typecheck
pnpm lint
pnpm --filter @keyboard-studio/studio test -- stepClassification
```

- **`pnpm typecheck`** — run only after `pnpm build` (studio typecheck needs engine/contracts
  built first; a bare `tsc -b` without it produces phantom errors).
- **`pnpm lint`** — chains ESLint, `depcruise`, and the plain-node checkers; no new checker is
  introduced by this feature, but the manifest-shape checker will reject a `STEP_MANIFEST` entry
  missing a `persistence` field once R-12 lands.
- **Manifest persistence-declaration test (R-12)** — the vitest over `STEP_MANIFEST` referenced
  above fails if any step lacks a `persistence` declaration, if an `exempt` justification is
  empty, or if [contracts/step-classification.md](contracts/step-classification.md) is missing a
  manifest id or disagrees with its declaration. This is the mechanical check behind FR-007,
  FR-050 and SC-007 ("unjustified exemptions: zero").
- **spec-trace note**: this feature narrows 057 FR-042/FR-049/FR-007 and refines the 053 capture
  boundary (see [spec.md](spec.md) Amendments). Once those sections' text changes, run
  `node utilities/spec-trace check` and `acknowledge` the affected units — do not let 057/053's
  spec-trace hashes silently drift out of sync with this feature's amendments.

## Out of scope for this quickstart

Per [spec.md](spec.md) Assumptions: the Compare tab (read-only, 057), `RawKmnFragment` content,
and any change to the decision record's model. No scenario above touches those surfaces.
