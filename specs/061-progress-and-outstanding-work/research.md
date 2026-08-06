# Phase 0 Research: 061 — Honest progress and outstanding work

Every decision below was taken against read code, not inferred from behaviour. File and line
references are the evidence.

## R1 — Where the one derivation lives

**Decision**: a pure `packages/studio/src/lib/outstandingWork.ts` plus a thin
`packages/studio/src/hooks/useOutstandingWork.ts` seam that reads the stores and calls it.

**Rationale**: this is the existing gate-composition idiom, not a new one —
[lib/accountedForGate.ts](../../packages/studio/src/lib/accountedForGate.ts) is a pure function
over an `InventoryCoverageGate`, and
[hooks/useAccountedForGate.ts](../../packages/studio/src/hooks/useAccountedForGate.ts) is its
five-line React wrapper. FR-011 asks for exactly that shape and FR-016 forbids store reads from the
pure module. It is also forced by layering: `.dependency-cruiser.cjs`'s `decisions-layer` rule
(line 95) forbids `decisions/ -> stores/` *and* `decisions/ -> components/`, with
`tsPreCompilationDeps: true` so even a type-only import is blocked. `progressDots.ts` therefore
cannot reach the derivation through a store; it must receive it as an input, the way `stepWalks`
already arrives.

**Alternatives considered**: putting the derivation in `decisions/` (blocked by the depcruise rule
the moment it needs coverage state); putting it only in a hook (not purely unit-testable, so FR-013's
restored-draft case could only be tested through a rendered tree, which is how D-8 happened).

## R2 — How a passed section keeps a mark, without a fourth shape

**Decision**: extend the manifest pass in `buildProgressDots` with a *behind*-position counterpart
to `aheadStageDot`. A step behind the current position that contributed no finer marks emits one
mark: `kind: "completed"` when it owes nothing, `kind: "upcoming"` (the existing hollow shape) when
it does. `ProgressDot` gains `outstandingCount?: number`, set only on the hollow-behind case.

**Rationale**: this is the minimal closure of D-1/D-2. Today
[progressDots.ts:642](../../packages/studio/src/decisions/progressDots.ts) guards the stage-dot
fallback with `!isActiveStep && stepRecordDots.length === 0 && walkDotCount === 0` and then calls
`aheadStageDot`, which returns `null` for anything at or behind the author
(`if (stepIndex <= currentIndex) return null`). So the branch that should represent a finished
section already exists and simply has nothing to call. Q4 forbids a fourth shape, and FR-008
forbids sharing an accessible name — `outstandingCount` resolves that tension structurally: the
renderer branches on a field's presence, not on a guess about position, so "outstanding behind" and
"not yet reached" can render the same square with different names. Reusing `kind: "upcoming"` keeps
FR-031 true by construction: `ProgressDotKind` stays a three-member union.

**Alternatives considered**: a fourth `ProgressDotKind` (violates FR-031 and Q4, and every
`kind`-switching renderer and test would need a new arm); inferring behind-ness in the renderer from
`resolution.reason` (`resolveLocation` returns `reachable` for a visited step whether it is ahead or
behind, so the reason cannot carry the distinction).

## R3 — Making the marks stations addressable costs nothing extra

**Decision**: `MarksSeriesStep` publishes `publishStepWalk("marks", positions)` from its already-
computed `visibleStations` array
([MarksSeriesStep.tsx:360](../../packages/studio/src/survey/marks/MarksSeriesStep.tsx)), and honours
an external cursor to set `stationIndex` on arrival — except when the FR-023 evidence-changed reset
has fired, which keeps precedence.

**Key finding, and the reason this is cheap**: the four station ids (`marks_attachment`,
`marks_treatment`, `marks_output_form`, `marks_stacking`) are already `[a-z0-9_]+`, so they are legal
`Location` question segments. They have no `questionRegistry` entry, which would normally make
`resolveLocation` refuse them as `question-not-in-build` — but `liveResolveContext()` passes
`stepPositions: stepPositionIds(useStepWalkStore.getState().walks)`
([jumpToLocation.ts:128](../../packages/studio/src/lib/jumpToLocation.ts)), the exact mechanism that
makes a gallery's character tokens resolvable. Publishing the walk therefore makes every station
individually jumpable with no resolver change at all. Q2's "one mark per visible station" then falls
out of `buildWalkDots`, which already emits one dot per stop for a non-character walk.

**Alternatives considered**: promoting each station to its own manifest step (reorders the manifest,
which the spec's out-of-scope list forbids); registering the stations in `questionRegistry` (they are
not survey questions and would acquire question semantics — labels, prefills, audit entries — they
do not have).

## R4 — Required-ness, and what an absent declaration means

**Decision**: add `required?: boolean` to `StepWalkPosition`. **Absent means not required.**
Character walks (`useCharWalkPosition`) and the marks stations publish `required: true` explicitly,
per assumptions A1 and A2; `SurveyRunner` publishes it per question from the surface that owns the
question.

**Rationale**: FR-007 requires the owning surface to declare required-ness rather than have the row
infer it, and the additive-optional default has to be the *safe* one. Absent-means-required would
make every existing publisher instantly contribute outstanding work — a row that reports work the
author does not owe, which is the same class of dishonesty this feature exists to remove. The
conservative default is also correct in practice: a flow gates its own advance, so a section cannot
be *behind* the author with a genuinely-required question unanswered. Note `StepWalkPosition` today
carries only `id`, `label?`, `done`
([lib/stepWalk.ts:41](../../packages/studio/src/lib/stepWalk.ts)) — there is no existing optionality
signal anywhere in the question layer to reuse.

**Alternatives considered**: deriving required-ness from the question registry (no such field
exists, and adding one would put the declaration on the registry rather than the owning surface,
against FR-007); treating every stop as required (breaks FR-007's scenario 5 outright).

## R5 — FR-013 is satisfied by *sourcing*, not by new persistence

**Decision**: the derivation takes its character-coverage input from `useInventoryCoverageGate()`
and its per-section question state from the walk map, and never treats an absent walk as
completeness.

**Key finding**: `useInventoryCoverageGate` already reads `phaseResults`, `touchLayoutJson`, and
`session.confirmedInventory` from `useWorkingCopyStore`
([useInventoryCoverageGate.ts:30](../../packages/studio/src/hooks/useInventoryCoverageGate.ts)) —
the durable-draft envelope — not from the session-scoped `stepWalkStore`. So coverage is *already*
reload-correct, and FR-013 needs no new persistence: it needs the derivation to read coverage from
that hook rather than from `stepWalks`. This is also the real fix for D-3. The galleries keep their
mark today only because `clearStepWalk` has no production caller (confirmed: the only references are
the store definition and `test-setup.ts`), so a stale walk survives. After R2 the behind-section mark
is structural, and a reload with an empty walk map still yields a hollow mark plus a nudge.

**Alternatives considered**: persisting walks into the draft envelope (explicitly out of scope per
the spec, and it would make a session artifact durable for no gain); counting from the walk map
with a "no walk means unknown" branch (a second notion of completeness, which FR-009 forbids).

## R6 — One traversal primitive for a backward landing

**Decision**: collapse `jumpToStep` and `backToUnfinishedGallery` into a single
section-id-taking action on `surveySessionStore`, and have `jumpToLocation` call it. The nudge then
does nothing but `jumpToLocation(target.location)`.

**Rationale**: FR-019 requires the nudge to route through the one jump implementation and says that
where a backward landing needs a traversal primitive, that primitive is to be *generalized*, not
duplicated. The two existing actions are the same operation with different history arithmetic:
`jumpToStep` truncates every entry after the target and is a **no-op when the target is not in
`history`** ([surveySessionStore.ts:397](../../packages/studio/src/stores/surveySessionStore.ts));
`backToUnfinishedGallery` exists precisely because the caller stands on `help`, whose target is not
in `history`, and pops one balanced entry instead (its docstring at line 445 records the P0 history
corruption that a forward `advance()` caused there). That asymmetry is a latent defect in
`jumpToLocation` today, not only a nudge problem: `visited` is monotonic and is what
`resolveLocation` gates on, so a target in `visited` but absent from `history` resolves `reachable`
and `jumpToLocation` reports `arrived` while `jumpToStep` silently does nothing. The unified action
truncates when the target is in `history` and takes the balanced-pop path when it is in `visited`
only — one place, both cases, and the three existing `backToUnfinishedGallery` call sites
(PhaseFGate, OutputScreen, StudioShell) migrate onto it.

**Alternatives considered**: letting the nudge call `backToUnfinishedGallery` directly and widening
its parameter to `ActiveStepId` (leaves D-6 unfixed — the nudge would still bypass resolution and get
no refusal reason, which is the defect FR-019 names); leaving `jumpToStep` alone and adding a third
action (three primitives for one operation, and the latent `arrived`-but-didn't bug stays).

## R7 — Splitting download from publish, and the exact terms that must not move

**Decision**: remove `!coverageGate.blocked` from `canDownload` and introduce a separate
`canPublish` that carries its own coverage term; gate the download behind an explicit
acknowledgement rather than behind the flag.

**Key finding — this is the whole of D-7 in one line**:
[OutputScreen.tsx:715](../../packages/studio/src/components/OutputScreen.tsx) passes
`canSubmit={canDownload}`. Publish has no coverage term of its own; it borrows download's. So
relaxing `canDownload` alone would silently make an incomplete keyboard publishable — precisely the
inversion FR-027 exists to prevent, and the reason FR-027 demands a test that asserts publish stays
refused *while* download is permitted.

`canDownload` today is a five-term conjunction
([usePreviewArtifact.ts:324](../../packages/studio/src/hooks/usePreviewArtifact.ts)):
`stage.kind === "ready" && isInstantiated && !coverageGate.blocked && !attributionMissing &&
licenseUnparseable === null`. **Exactly one term is removed.** The other four, plus `touchStale`
in the button handlers, stand unchanged per FR-030.

**Arrival relaxations (FR-028)** — the places that prevent reaching Output, all four verified:

1. [advance.ts:255](../../packages/studio/src/steps/advance.ts) — the `help` case returns
   `{ next: "help" }` while coverage is blocked. This is the actual hard gate; it becomes an
   unconditional `{ next: "done", navigate: "output" }`.
2. [PhaseFGate.tsx](../../packages/studio/src/editors/adapters/PhaseFGate.tsx) — the wrapper that
   explains the refusal becomes a warning that names the outstanding work and lets the author pass.
3. [StudioShell.tsx:1649](../../packages/studio/src/StudioShell.tsx) — `outputNavBlocked` marks the
   Output tab `aria-disabled` with an explanatory `title`. The title stays as the warning; the
   `aria-disabled` goes, since the tab must be usable.
4. `canDownload`'s coverage term itself, above — the button-level refusal on arrival.

**Complaint dialog**: reuse `editors/assignLoop/parts/ConfirmDialog.tsx`. It already carries a prop
choosing which action Escape/backdrop routes to, and documents "conventional modal semantics:
Escape/backdrop = cancel/stay, never an implicit confirm" — FR-025 exactly, with no new component
and no new dismissal semantics to get wrong. No depcruise rule forbids `components/ -> editors/`.

**Alternatives considered**: keeping one flag and adding a boolean bypass beside it (FR-027 rules
this out by name — a later edit to the shared flag reopens publish); a new bespoke modal (duplicates
a dismissal contract that already exists and is already tested); relaxing only the download button
and leaving arrival blocked (the author reaches a screen they cannot navigate to, so the feature
would be unreachable in practice).

## R8 — Pinning the row so D-8 cannot recur

**Decision**: an exact-ordered-match unit test of `buildProgressDots` against the real
`steps/manifest.ts` with a project open, and replacement of the shell-level assertion.

**Key finding**: [StudioShell.test.tsx:2614](../../packages/studio/src/StudioShell.test.tsx) asserts
`querySelectorAll("[data-progress-dot-kind]").length` `.toBeGreaterThan(0)` — it would pass with a
single mark, which is the reported defect. The unit-level upcoming assertions likewise use subset
matchers. SC-008 requires an exact match, not a subset and not a minimum, so the new test asserts
the full ordered `(step, kind)` sequence and the shell assertion becomes an exact count.

**Alternatives considered**: a snapshot test (a snapshot absorbs a regression on update, which is
how a subset matcher fails in slow motion).
