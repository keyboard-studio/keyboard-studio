# Handoff: decisions modular underneath, whatever their UI

**Branch:** `km/modular-decisions` (cut from `main` at 18e63aa4, after spec 087 merged as #1938)
**Status:** handoff, not yet a spec. Start with `/speckit-specify` using this file as input.
**Spec number:** 088 (086 is claimed by open PR #1956; 087 is merged).

## The goal, in the owner's words

> I have been trying for months to make decisions modular underneath, even if they have custom UI.

Every choice the author makes is a **decision**. That covers a single survey question, a gallery
such as carve or marks, and a picker such as the starting-point keyboard or the layout. Each
decision is one self-contained unit: it says what it needs, how it reads a value from the
starting point, how it validates, how it writes its effect, how it is stored and how it is shown.
A **step** is only where a decision is displayed, and its position is derived from the decisions'
dependencies. Moving a decision should take one edit to its `requires` and nothing else.

**The acceptance test for the whole effort.** Add `requires: ["authoring-track"]` to
`il_copyright_holder` and change nothing else. The question then appears after the track choice.
On the adapt track it arrives pre-filled from the keyboard's own copyright, labelled
"from <keyboard>". On the copy track it defaults to the author, because the copied keyboard's
notice is kept automatically. Run this test in the **live wizard**, not the demo.

## Why spec 087 didn't deliver this

Spec 087 unified **ordering** only. It made `provides`/`requires` the single source of order and
deleted the hand-written lists, and that part is real. It was built to keep the existing order
exactly (stable tie-break plus parity tests), so nothing visibly moved. Underneath, decisions are
still not modular. Its success criteria (SC-001: 83% pre-filled; SC-004: adapt flow) were
measured in `DecisionsDemo` and `src/test/sc004Harness.ts`, not in the live wizard.

**Lesson to carry forward:** every success criterion in 088 must be measured in the live app, as
a Playwright walk in `pnpm dev` or a store-level test that drives the real `StepHost`. Demo and
harness results do not count.

## Current state (verified 2026-10-06 on `main` 18e63aa4)

### G1. No live DecisionSet exists
- `gatedBy` reads a set built for each call by `decisionsFromTraversal`
  ([steps/decisionsFromTraversal.ts:19-39](../../packages/studio/src/steps/decisionsFromTraversal.ts)).
  That set only ever holds two decisions: `authoring-track` and `touch-seed-source`. Both are
  copied out of `surveySessionStore` fields (`selectedTrack` and `touchSeedSource`).
  - Built from both fields by `advance.ts:173-177`.
  - Built from the track only by `lib/resolveLocation.ts:98-101`.
- No store holds a `DecisionSet`, and no draft saves one.
- The "decision record" in `steps/reducer.ts` (`recordStepCompletion`, :576-582) is a different
  thing: the spec 053/055 **decision log** (`DecisionEntry` keyed by step and question, recording
  how each answer came about). It is not the 087 `Decision`
  `{ value, provenance: asked|extracted|default, source }`.

### G2. `extract()` never runs in the live app
- The only callers are `decisions/decisionFlow.ts:67` (`runDecisionFlow`), which only
  `DecisionsDemo` (DEV-only), `sc004Harness` and tests use, and `decisions/corpusMine.ts`, which
  only tests use.
- Modules with an `extract`: `il_language_english`, `il_language_code`, `il_target_script`,
  `il_copyright_holder` and `pb_character_inventory`. `pb_character_inventory` is in no flow.
- Even if wired, the `il_*` extractors couldn't fire. Identity is asked before `choose_base`, so
  no starting point exists yet.
- Every live pre-fill today is step-specific seeding:
  - `IdentityLite.tsx:385-444` (langtags and GitHub profile);
  - `Prefill.tsx` and `CharactersStep.tsx:100-135`;
  - `prefillCarveDispositions`;
  - `PHASE_F_SEEDS` (`editors/adapters/flowStepOptions.tsx:336-390`).

### G3. Answers are saved by step code, not by decisions
- **identity:** `IdentityLiteAdapter` (`editors/adapters/panelAdapters.tsx:104-110`) calls
  `setIdentityResult`, `setSurveyContext` and `setIdentityPhaseResult` on the session, and
  `setAttribution` on the working copy. It reads answers by question id
  (`IdentityLite.tsx:82-85`).
- **track:** `trackOptions.onCommit` (`flowStepOptions.tsx:79-89`) calls `setSelectedTrack`,
  plus `setScaffoldSpec(null)` on adapt.
- **project_name:** `onCommit` (`flowStepOptions.tsx:235-252`) calls `setScaffoldSpec` and then
  `workingCopy.setIdentity`. Its modules declare `writes` (`header.name`, `header.keyboardId`)
  but have no `mutate`, so the declared write path skips them.
- **help:** `onCommit` (`flowStepOptions.tsx:554-575`) calls `setHelpDocs` and
  `setHistoryEntryState`.
- **The module write path is barely used.** `routeAnswersThroughMutate` (reducer.ts:584-601) is
  the only consumer of `QuestionModule.writes`/`mutate`. It is gated by `VITE_KM_MUTATE_SEAM=1`,
  which is off by default (`flags/mutateFlag.ts:35`). The only live module that uses it is
  `pb_standard_letters`.

### G4. Questions are tied to steps three ways
1. **Which questions a step shows:** `stepDependencies.ts` `flowRefs` decide which flow a step
   runs, and a step's `provides` is computed from that flow. No question is placed by the sort.
2. **How a step saves its answers:** each flow has its own `extract`/`onCommit` in
   `flowStepOptions.tsx`, and identity and characters bypass the factory entirely.
3. **Where answers are stored:** every save is keyed by step id.
   - `surveyAnswers.steps[stepId].answers[answerId]` (`stores/surveyAnswerStore.ts:110-162`;
     SurveyRunner keys by `activeStepId`, `SurveyRunner.tsx:469`);
   - `workingCopy.phaseAnswersByStep[phase][stepId]` (`workingCopyStore.ts:2056-2081`);
   - the decision-log slot key `stepId|q|questionId` (`decisionLogStore.ts:148-150`).

   A question moved to another step would lose its saved answer on resume and break its
   superseded-answer history in the log.

### G5. Gallery and picker decisions are only names on a step
- `layout`, `choose_base`, `characters`, `marks`, `punctuation`, `invisibles`, `convenience`,
  `carve`, `deadkeys`, `rules`, `mechanisms`, `touch_seed_source`, `touch` and `help` list their
  decisions as `settles: [...]` strings in `stepDependencies.ts`. No module exists behind those
  names. Each component writes to its stores directly.
- The per-step write sites are in the table at the end of this file.

### G6. The renderer field is declared but never used
- `DecisionRendererProps<T>` (`decisions/decisionTypes.ts:187-191`) and
  `QuestionModule.renderer?` (`survey/types.ts:334`) exist.
- The only implementation is `InventoryRenderer`, on `pb_character_inventory`, which is in no
  flow.
- Nothing reads `module.renderer` at runtime.

### G7. Related defects found while mapping (verify, then fix inside 088)
- **The track is chosen after the keyboard is already set up.** `choose_base` comes before
  `track`, so the first `doCommit` always sees `selectedTrack === null` and sets up the working
  copy as new-from-base. The adapt track only takes effect on a second commit (StudioShell.tsx
  :645-655 documents the refresh hazard). A decision graph with `instantiate requires
  authoring-track` fixes this structurally.
- **The starting-point entry in the decision log is probably never written.**
  `recordStepCompletion` runs synchronously at StepHost.tsx:451, before the commit effect sets up
  the working copy, so `recordBaseContribution` returns null (`recordBaseContribution.ts:117`).
- **Several steps leave no decision-log entry:** `layout`, `rules`, `touch_seed_source`,
  `deadkeys`, and usually `punctuation` and `convenience` (empty `answers`).

## Target architecture

### One module type for every decision

Extend `QuestionModule` into a `DecisionModule` (or merge the two) that covers both survey
questions and custom-UI decisions:

| member | meaning | today |
|---|---|---|
| `provides` / `requires` | ordering and placement | exists |
| `gatedBy` (derived from routing) | when the decision applies | exists |
| `extract(ctx)` | value read from the starting point, if any | exists, never runs live |
| `validate(value)` | rejects bad values, extracted or typed | exists for questions |
| `apply(value, ctx)` | the decision's **only** write: working-copy patch and/or session fields | spread across adapters and `onCommit`s |
| `renderer` | `"question"` (the default `QuestionField`) or a custom component | declared, unused |

Custom UI stays as it is. `CarveGalleryV2`, `MarksSeriesStep`, `LayoutStep` and the rest become
the `renderer` of their decision module. A renderer receives the current decision and its
provenance, and returns a value through `onDecide(value)`. It no longer writes to stores itself:
the store writes now in the adapters and `onCommit`s move into `apply`. Some galleries keep
internal draft state while open, such as the working-copy overlay for carve. That is fine, but
their *commit* must go through `apply`.

### A live decision store
- `decisionStore` holds the `DecisionSet` and the provenance of each decision. It is the only
  thing `gatedBy` reads, which retires `decisionsFromTraversal`.
- `selectedTrack` and `touchSeedSource` become ordinary decisions, not session fields.
- Drafts save per decision id. The decision-log slot key becomes the decision id; the step id is
  kept only as display metadata.

### Steps are derived
- **Placement rule:** each decision goes into the earliest slot after everything it `requires` is
  settled. Ties keep the current order; the owner wants the default order kept.
- A custom-UI decision gets a step of its own.
- Consecutive survey-question decisions merge into one survey screen, so identity still reads as
  one page. A `group` hint (e.g. `"identity"`, `"attribution"`) on the module labels the screen.
  It never affects order.
- `stepDependencies.ts`, with its `flowRefs` and `settles`, is replaced by the modules' own
  declarations.

### Extraction runs live
- Once the starting point is chosen and the working copy set up, run every applicable `extract`.
- Seed each decision the author hasn't answered with
  `{ provenance: "extracted", source: <keyboard id> }`. The renderer shows the "from <keyboard>"
  label.
- An answer the author already gave is never overwritten, but the extracted value is shown
  beside it.
- This follows the project principle that values from the starting point become defaults the
  author knowingly confirms, changes or overturns. They are never applied silently.
- The step-specific seeders (G2) become `extract`s, or seeds of the same shape, one decision at
  a time.

### Non-negotiables
- **Every answer is saved the moment it is given.** Navigating never undoes a decision. Only a
  clarification that changes the shape of the keyboard re-proposes the answers it affects.
- **D3 is not affected.** This work adds no validation timer.
- **No change to the Pattern schema or `packages/contracts`.** `QuestionModule` and
  `decisionTypes` live in `packages/studio`. If a change starts to reach `contracts`, stop and
  check with the owner.
- **i18n message ids don't change.** Moving a question changes where it appears, not its id.
- **Old drafts migrate automatically** (087 Q5 precedent). Answers saved under step ids map onto
  decision ids when a draft loads. Any answer with no matching decision is shown to the author,
  never dropped.

## Suggested phases (one commit per phase, pushed to the branch as each phase passes)

1. **Decision store and per-decision saving, with no visible change.**
   - Every completion writes `Decision` records into `decisionStore`, and `gatedBy` reads from it.
   - Delete `decisionsFromTraversal`.
   - Save drafts per decision id, and migrate old drafts.
   - The parity tests stay green.
2. **Questions write through `apply`.**
   - Move the identity, track, project_name and help `onCommit`/adapter writes into module
     `apply`.
   - Remove the `VITE_KM_MUTATE_SEAM` flag, or make `apply` the only path.
   - Delete the per-flow `extract`/`onCommit` in `flowStepOptions.tsx` as each one becomes empty.
3. **Custom-UI decisions become modules.**
   - Give each `settles` name a module whose `renderer` is the existing component, and turn its
     store writes into `apply`.
   - Start with the small ones (`layout`, `touch_seed_source`, `track`, `choose_base`), then
     `marks`, `punctuation`, `invisibles` and `convenience`, then `carve`, `deadkeys`, `rules`,
     `mechanisms` and `touch`.
   - Fix the G7 log gaps here: every decision gets a log entry.
4. **Steps are derived from decisions.**
   - Placement by the rule above, with screens merged by `group`.
   - Remove `flowRefs` and `settles`.
   - Answers are stored per decision.
   - Update the parity tests deliberately. They should prove "same order unless a `requires`
     says otherwise", not freeze literal lists for good.
5. **Live extraction, and the acceptance test.**
   - Run extraction after the working copy is set up, with "from <keyboard>" labels in both the
     default and custom renderers.
   - Fix the G7 track-before-setup ordering: setting up the working copy requires
     `authoring-track`.
   - Add `requires: ["authoring-track"]` to `il_copyright_holder` and walk both tracks in the
     live wizard with Playwright.

Phases 1 and 2 are worth landing as their own PR if the effort runs long. They remove most of the
coupling with no visible change.

## Per-step write sites (starting map for phase 3)

| step | renderer today | completion writes |
|---|---|---|
| identity | `IdentityLiteAdapter` (panelAdapters.tsx:82) | session `setIdentityResult`/`setSurveyContext`/`setIdentityPhaseResult`; working copy `setAttribution` |
| layout | `LayoutStep` (survey/layout/LayoutStep.tsx:53) | `savePickedWindowsLayout` → `surveyAnswerStore.saveAnswer("layout","host_layout")` (lib/layoutFamily.ts:92-104) |
| choose_base | `BaseResolutionAdapter` (panelAdapters.tsx:188) | `setLocalBase`/`setBaseConfirmed`; working copy set up later in StudioShell.tsx:1143-1161 → reducer R3 (reducer.ts:462-525) |
| track | flow factory (flowStepOptions.tsx:586) | `setSelectedTrack`, `setScaffoldSpec(null)` on adapt |
| project_name | flow factory (flowStepOptions.tsx:587) | `setScaffoldSpec`, `workingCopy.setIdentity` |
| characters | `CharactersStep` | `phaseBDraftStore`; `setCharactersSubStage`/`setDiscoveryMethod`; `pb_standard_letters` mutate (flag) |
| marks | `MarksSeriesStep` | `saveAnswer("marks", …)` (:354-632); reducer MARKS `applyMarkGuards` → `setWorkingIR` (reducer.ts:358-382); context tolerance via `applyMutatePatch` |
| punctuation | `PunctuationStep` | `phaseBDraftStore`; `saveAnswer("punctuation","punctuation.inventory")` (:467) |
| invisibles | `InvisiblesStep` | `phaseBDraftStore` accept/decline |
| convenience | `ConvenienceCharsStep` | `saveAnswer("convenience", …)` (:245) |
| carve | `CarveAdapter` / `CarveGalleryV2` | working-copy overlay (CarveGalleryV2.tsx:703-712); `applyCarveMutate` in projection (projectWorkingCopyVfs.ts:459) |
| deadkeys | `DeadkeyAdapter` | `commitDeadkeyOp` → `applyMutatePatch(DEADKEY_WRITES)` → `setWorkingIR` |
| rules | `RulesStep` (survey/rules/RulesStep.tsx:46) | builder-owned state; `onComplete(undefined)` |
| mechanisms | `AddPhysicalAdapter` / `MechanismGallery` | `recordAssignments` (:1568); reducer R1 `lockDesktop`; `repropagate` |
| touch_seed_source | `TouchSeedSourcePanel` | `setTouchSeedSource` (:358-361) |
| touch | `AddTouchAdapter` | `setTouchDraft`/`deleteTouchKey`; reducer R2 `setTouchLayoutJson` + `clearStale` (reducer.ts:413-457) |
| help | `PhaseFGate` → flow factory | `setHelpDocs`, `setHistoryEntryState` |

## Pointers
- Spec 087 docs: [spec.md](../087-decision-backend/spec.md),
  [ARCHITECTURE.md](../087-decision-backend/ARCHITECTURE.md) and
  [followups.md](../087-decision-backend/followups.md). Item 4 of the follow-ups (tie-break
  pairs) is the inventory of decisions that would move once real `requires` edges are declared.
- The one ordering function: `orderByDependencies` in
  [decisions/orderDecisions.ts](../../packages/studio/src/decisions/orderDecisions.ts).
- Terminology: the keyboard Track 1 starts from is the **copied keyboard**. The **base keyboard**
  is the OS layout. The decision id `base-keyboard` and the code names `baseIr`/`baseVfs` predate
  this and are misnomers. Don't spread them into new names; say "starting point".
