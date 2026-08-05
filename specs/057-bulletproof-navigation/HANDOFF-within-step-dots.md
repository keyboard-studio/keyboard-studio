# Handoff — within-step position model (per-question footer dots)

**Follow-up to spec 057 bulletproof-navigation**, addressing four author-reported
defects against the landed feature (commit `d0ab11d4`). This is a *separate* piece
of work from [HANDOFF.md](HANDOFF.md) (which tracks 057's own blocked T073 E2E
gate); nothing here unblocks that.

- **Date:** 2026-08-05
- **Status:** code complete, unit-verified, **uncommitted**
- **Branch:** none yet — all changes sit in the working tree on `main`
- **E2E:** not run in this environment

---

## 1. What the author reported

Verbatim, four items in one message (2026-08-04):

1. "the dozen questions inside 'Mechanisms' must show in the breadcrumb bar in the
   footer (instead of one dot for mechanisms)"
2. "if I jump away from later questions in Mechanisms without completing all of
   them, I can't get back to the question I was on"
3. "The goal was to have every question (except the 'Confirm youre language Code')
   available as a dot"
4. "when I jump then browse back and forth, sometimes the previously filled value
   of 'confirm language code' and 'Which script' is empty"

Scope was clarified by `AskUserQuestion`: the author picked **"All editor stages,
generally"** — "Carve, Mechanisms and Touch all collapse to one dot each; you want
every stage's internal position addressable, not just Mechanisms."

---

## 2. Root cause

The footer row's finest granularity inside an unfinished step was the **stage**,
because nothing in the app exposed "which question / which character is this step
showing right now". Two consequences, both of which the author hit:

- A stage with a dozen internal stops rendered as one dot.
- Leaving such a stage mid-way (a tab switch unmounts the step component) lost the
  position entirely, because position lived in component state.

Item 4 was a *separate* defect in `SurveyRunner`: the answer walk was a
truncate-on-Back stack, so going Back and forward again re-seeded the next
question from scratch rather than restoring what the author had typed.

---

## 3. The fix, in one paragraph

Extend the existing `Location` model one level: **route -> step -> position**. The
component that owns a step publishes an ordered list of stops plus which one is
current into a module-level store (`stores/stepWalkStore.ts`), which survives route
unmount. `resolveLocation` learns to treat a published stop as addressable;
`jumpToLocation` writes the within-step cursor; `progressDots` renders one dot per
stop instead of one per stage; the owning component reads the cursor on mount and
on live change. This is **not** the "second notion of position" FR-006 forbids —
it is the same model at finer grain, with a single writer per step and nothing
derived from the rendered DOM (FR-062 holds).

---

## 4. Files

### New (7)

| File | What it is |
|---|---|
| [`packages/studio/src/lib/stepWalk.ts`](../../packages/studio/src/lib/stepWalk.ts) | Pure vocabulary: `StepWalkPosition` / `StepWalkMap` / `StepCursorMap`, the codepoint <-> hash-token codec (`charToPositionToken` / `positionTokenToChar`), `cursorCharIn` (NFC identity), `charWalkLabel`, `stepPositionIds`. Lives in `lib/` so `decisions/` may import it. |
| [`packages/studio/src/stores/stepWalkStore.ts`](../../packages/studio/src/stores/stepWalkStore.ts) | Module-level zustand store: `walks`, `cursors`, `answerDrafts`, plus `peekStepCursor` / `peekAnswerDraft` for non-reactive mount-time reads. Has `samePositions` / `sameAnswerDraft` equality guards so a no-change publish from a per-render effect is a genuine no-op. |
| [`packages/studio/src/hooks/useCharWalkPosition.ts`](../../packages/studio/src/hooks/useCharWalkPosition.ts) | The shared MechanismGallery/TouchGallery binding: publish positions, publish cursor on `currentChar` change, apply an external cursor. |
| [`packages/studio/src/survey/identityLiteResult.ts`](../../packages/studio/src/survey/identityLiteResult.ts) | Type-only leaf holding `IdentityLiteResult`, moved verbatim out of `IdentityLite.tsx`. Exists solely to break a depcruise `no-circular` violation — see §6. |
| `packages/studio/src/lib/stepWalk.test.ts` | Token round-trips (BMP, multi-codepoint, astral), and a real round-trip through `parseLocation`/`formatLocation` so the token is proven legal against the actual `SEGMENT` regex. |
| `packages/studio/src/stores/stepWalkStore.test.ts` | Equality-guard identity assertions; `clearStepWalk` keeps the cursor; `reset` clears all three slices. |
| `packages/studio/src/survey/SurveyRunner.walk.test.tsx` | 11 tests covering the value-loss fix and walk publication. |

### Modified (16)

| File | Change |
|---|---|
| `lib/resolveLocation.ts` | `ResolveContext` gains optional `stepPositions`; new `isAddressablePosition()` accepts either a `questionRegistry` id **or** a position published for *that step*. |
| `lib/jumpToLocation.ts` | `liveResolveContext()` supplies `stepPositions`; a jump naming a question now also calls `setStepCursor(step, question)`. |
| `decisions/progressDots.ts` | The bulk of the work — see §5. |
| `components/StudioFooter.tsx` | Reads the live walk store, passes `stepWalks`/`stepCursors` and `stepPositions` down. Dot React key changed to `${step}:${id}` (ids are no longer unique per kind). |
| `survey/SurveyRunner.tsx` | Cursor-based walk instead of truncate-on-Back; `keepAhead`; `bankInFlightEdit`; publishes positions / cursor / answer draft; applies an external cursor. |
| `editors/assignLoop/MechanismGallery.tsx`, `TouchGallery.tsx` | Call `useCharWalkPosition`; the existing arrival-sync effect prefers a requested cursor (`cursorCharIn(peekStepCursor(...), list)`) over "first uncovered". |
| `StudioShell.tsx`, `components/WelcomeScreen.tsx` | `useStepWalkStore.getState().reset()` on Start Over / "I'm new". |
| `stores/surveySessionStore.ts`, `survey/IdentityLite.tsx` | `IdentityLiteResult` repointed at the new leaf; `IdentityLite.tsx` re-exports it so no call site moved. |
| `test-setup.ts` | Global `beforeEach` reset of the walk store — a module-level store leaks between tests in one file otherwise (this caused 3 real failures, see §6). |
| `decisions/progressDots.test.ts`, `lib/resolveLocation.test.ts`, `editors/assignLoop/MechanismGallery.test.tsx`, `components/StudioFooter.a11y.test.tsx` | New coverage appended. |

---

## 5. `progressDots.ts` — the derivation, and the two rules worth knowing

The row is now assembled in **one pass over the manifest** rather than by
concatenating three independently-ordered lists (record order, then the current
dot, then a manifest-ordered look-ahead). That concatenation read correctly only
because a stage contributed at most one dot; with a stage able to contribute a
dozen, and with FR-063 keeping record dots for stages the author has since jumped
back behind, the three lists would interleave wrongly. Record entries whose
`stepId` is not in this build's manifest are appended at the tail rather than
dropped, so FR-013's stated reason still surfaces on activation.

**Rule 1 — suppression is per QUESTION, not per step.** This was the last thing
fixed and the subtlest. A stage can be walked by more than one flow in sequence:
`characters` runs PhaseA's prefill confirmations and then PhaseB, and the second
runner's publish *replaces* the first's in the store. Suppressing a walked step's
record dots wholesale would have made PhaseA's dots **vanish** once PhaseB
published — dots disappearing as the author moves forward. The union keeps both:
the walk owns the questions it names (it has live `done` state the record cannot
have until the step completes), and the record covers the rest. Emission order
within a step is record-then-walk, which is the order the author answered them in.
Covered by `progressDots.test.ts` -> "keeps a step's record dots for questions its
CURRENT walk does not name".

**Rule 2 — `DOTLESS_QUESTION_IDS`.** A single `Set` containing `il_language_code`,
applied at the one place a dot is created, so the walk and the decision record
cannot disagree about it. **See caveat (a) in §8 — this reading needs your
confirmation.**

Kinds inside a step: `current` is the walk's cursor *on the active step only* (a
cursor stored for another step describes where a jump would land, not where the
author is — two "you are here" markers would be worse than none); `completed` is
`position.done`; `upcoming` is an unsettled stop. Note an upcoming *stop* resolves
`reachable` (the step is already reached) whereas an upcoming *stage* resolves
`beyond-gate` — they render identically per FR-046 because to the author both mean
"nothing there yet".

---

## 6. Problems hit along the way (so they are not re-discovered)

- **Characters are not legal hash segments.** `SEGMENT = /^[a-z0-9_]+$/`. Hence the
  codepoint token: `á` -> `u00e1`, `Ə́` -> `u018f_0301`, `U+1E900` -> `u1e900`.
  `stepWalk.test.ts` round-trips through the real `parseLocation`/`formatLocation`
  rather than asserting against a copy of the regex.
- **`decisions/` may not import `stores/`** (depcruise `decisions-layer`). Walk data
  therefore arrives as explicit `ProgressDotsInput` fields, which is also what keeps
  the derivation a fixture-testable pure function. `StudioFooter.tsx` is not
  boundary-restricted and is where the live store is read.
- **depcruise `no-circular` violation.** `SurveyRunner` newly importing
  `surveySessionStore` closed the loop `IdentityLite.tsx -> SurveyRunner.tsx ->
  surveySessionStore.ts -> IdentityLite.tsx`. The rule follows type-only imports
  (`tsPreCompilationDeps: true`), so the type import was the load-bearing edge.
  Fixed by extracting `survey/identityLiteResult.ts`.
- **Three pre-existing resume tests went red** (`IdentityLite.resume.test.tsx` x2,
  `SurveyRunner.resume.test.tsx` x1) — all "expected vi.fn() to be called 1 times,
  but got 0". Cause: a module-level store persists across tests *within a file*, so
  an earlier test's cursor became the next test's arrival position and the runner
  mounted on an earlier question ("Next", not "Finish"). Fixed by the global
  `beforeEach` reset in `test-setup.ts`, plus implementing `answerDrafts` so the
  mid-step case is genuinely restorable.
- **A React correctness trap, self-caught:** a flag set *inside* a `setWalk` updater
  is not readable on the following line (React may run the updater during a later
  render). The external-cursor decision is made outside the updater from the render
  closure, with a comment saying why.
- **`bankInFlightEdit` exists because of a real gap:** Back used to discard the
  uncommitted field edit. Both Back and the external-cursor effect now bank
  `currentValueRef.current` onto the entry being left, so `answersDiffer` compares
  against what the author actually typed.
- **Stale build artifacts** produced a confusing first `tsc -b` failure (missing
  engine/contracts exports in four unrelated files). Run
  `pnpm --filter @keyboard-studio/contracts build` then
  `pnpm --filter @keyboard-studio/engine build` before believing studio typecheck
  errors.
- **One flaky full-suite run** failed 354 files with
  `ENOENT ... AppData\Local\Temp\<id>\client\.tmp-*` — a Windows temp-dir race in
  Vite's dep optimizer across 354 concurrent workers, not a code failure (0 failed
  assertions; 596 tests passed before the workers died). An immediate re-run was
  fully green. If you see this shape, re-run before investigating.

---

## 7. Verification performed

| Gate | Result |
|---|---|
| `pnpm typecheck` | **Done** — all 7 workspace projects |
| `pnpm --filter @keyboard-studio/studio test` | **366 files / 5452 tests passed** |
| `pnpm run depcruise` | **clean** — no violations (947 modules, 3237 dependencies) |
| `npx eslint` on the 8 new/changed source modules | **clean** |
| `pnpm run i18n-catalog-lint` | `[OK] message catalogs are in sync` |
| `pnpm run content-i18n-lint` | `[OK]` |
| `pnpm run test-antipattern-lint` | `[OK] scanned 451 test files` |
| `pnpm crew-lint` | all 7 checks GREEN |
| **Playwright E2E** | **NOT RUN** — see caveat (e) |

(The i18n / antipattern / crew lint results were recorded before the final
`progressDots.ts` union change, which touched no strings and no crew files. The
typecheck, vitest, depcruise and eslint rows are post-change.)

---

## 8. Caveats the author must see

**(a) `il_language_code` — the exclusion reading may be backwards.** The report
said "every question (except the 'Confirm youre language Code')". That was read as
*`il_language_code` gets no dot*. The opposite reading — "every question, and also
the language-code confirmation" — is grammatically available. Flipping it is a
one-line change: empty the `DOTLESS_QUESTION_IDS` set in
[`progressDots.ts`](../../packages/studio/src/decisions/progressDots.ts). Two tests
in the `il_language_code` describe block encode the current reading and would need
inverting.

**(b) `carve` still shows a single dot.** The carve gallery is a *grid*, not a
linear walk — there is no ordered sequence of stops to publish. Making it
addressable would mean inventing an ordering the UI does not have. Left as one
stage dot deliberately.

**(c) `marks` and `convenience` also keep single stage dots.** They render bespoke
components (`MarksSeriesStep`, `ConvenienceCharsStep` — see
`steps/manifest.ts`), not `SurveyRunner`, so they publish no walk. They *can* be
wired the same way (publish positions + cursor, read `peekStepCursor` on mount);
it was not in scope for the reported defects. `mechanisms`, `touch`, and every
`SurveyRunner`-driven stage (`identity`, `characters`, `project_name`, `help`, …)
are done.

**(d) Row length on a large inventory.** A keyboard with ~60 added characters
produces ~130 dots across mechanisms + touch. The footer already scrolls
horizontally (FR-047) and auto-scrolls the current dot into view, so this is
handled — but it is now the common case rather than the edge case, and is worth a
look on a real inventory before this ships.

**(e) No E2E run.** Playwright was not run here. `e2e/footer-progress.spec.ts` is
the spec most likely to be affected — it asserts on footer dots, and its
`characters` expectations were what surfaced the per-question union bug in §5.
Also check `decision-deeplink.spec.ts` and `tab-roundtrip.spec.ts`.

---

## 9. Immediate next steps

1. **Branch and commit.** Everything is uncommitted on `main`. Per the branch
   policy this needs a feature branch — suggested `km/within-step-dots`.
   Suggested title: `fix(studio): per-question footer dots and within-step position
   across editor stages`.
2. **Resolve caveat (a)** with the author before the PR lands — it changes shipped
   behaviour and two tests.
3. **Run the E2E suite**, at least the three specs named in caveat (e).
4. **Re-run `pnpm lint`** in full (the i18n/crew rows above predate the last edit).
5. Decide whether caveat (c) — `marks` / `convenience` — is in scope for the same PR
   or a follow-up.
