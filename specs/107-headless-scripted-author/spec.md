# Feature Specification: Headless scripted author for decision walks

**Feature Branch**: `107-headless-scripted-author` (based on `main`; its PR targets `main`. See Dependencies)

**Created**: 2026-10-30

**Status**: In implementation

**Input**: User description: "A headless AUTHOR that produces the decisions a walk makes. At each step it calls the product's own proposal and suggestion functions and applies the walk policy (accept the top suggestion, else the default, else a placeholder sequence), writes the decisions into the stores, then hands off to the existing headless replay. It replaces the 32-case Playwright harness for decision coverage."

## Context

Decision records (the `.studio/decision-record.json` a walk leaves) come only from Playwright UI
walks today. The harness lives outside this repo, in
`ks-2302-main/tools/testing-profiles-2302`:

- `harness/cases.json` holds the 32 cases (4 copied keyboards x 4 profiles x 2 backspace answers).
  This spec commits a copy to the repo as the canonical case definitions (FR-035).
- `harness/run-zip.mjs` drives one case through `scripts/phase{1,2,3,4}.template.js`.

One case takes about 25 minutes, needs a dev server and a free port, and is flaky under load. On
2026-10-30 a walk spent hours surfacing a pure engine defect: `applyAssignments` merged `group(main)`
into a keyboard that declares `group(Main)` case-sensitively, so a duplicate group failed `kmcmplib`
(fixed in `502fb061`, now on `main` as `sameGroupName` in `packages/engine/src/codec/groupName.ts`). A headless run would have caught it in seconds.

Spec 106 US1 already supplies headless **replay**. Given a recorded DecisionSet it seeds the real
studio stores, rebuilds the working copy, runs the real download path, compiles, simulates and
checks consistency gates G1-G8. The pieces are:

- `packages/studio/src/test/decisionPointFixture.ts`
- `recordToDecisionSet.ts`
- `decisionPointBases.ts`
- `consistencyGates.ts`
- `decisionPoint.corpus.test.ts`
- `packages/studio/scripts/genDecisionPoints.ts`

Spec 032's `packages/studio/src/test/journey-runner.ts` already walks the product's own step routing
headlessly. Neither one **produces** decisions. Replay only covers the 4 recorded copied keyboards,
and a new keyboard or profile still needs a 25-minute browser walk before it can be replayed.

This spec adds the missing half: a **headless scripted author**. It is a test tool. It changes
nothing an author sees, and it follows Constitution v2 Art. X: every value it writes comes from a
product proposal, and it records that value's provenance the way the UI records it.

### Governing rule: the author bypasses the UI and nothing else

**The headless author is the product with the React rendering layer removed. It MUST NOT be able
to diverge from the product's code below the UI.** This rule governs every other requirement in
this spec. Where any requirement, plan step or task reads otherwise, this rule wins.

Everything below the UI runs as the product's own code, called unmodified, at the same seam the UI
calls it:

- step routing;
- proposals, ranking and pre-selection;
- store actions and provenance;
- validation;
- the working-copy rebuild;
- projection, compile and output.

The author may contain only four things:

1. **Case input**: reading a case description.
2. **The click**: choosing one of the options the product offered, by the walk policy, and applying
   it through the same function the UI control's handler calls.
3. **The typing**: the placeholder text the harness types where nothing is offered (`zzq<hex>`). It
   stands for keyboard input from an author, not a product value.
4. **Reporting**: what it chose, skipped and observed.

Anything else in the author is a defect, however small and however well tested. That covers a
re-stated rule, a compensating branch, a shim, a stub, a mock of a product module, a direct store
write, a second step list, or a "headless" flag in product code. The **only** legal response when
the author cannot reach a behaviour without the UI is one of:

- **lift** it into product code that the UI then calls (US5, FR-040);
- **list** it as Playwright-only (FR-042).

The same holds when the author and the UI disagree (a parity difference). The fix is never author
logic. Either the author is made to call the product exactly as the UI does, or the product changed
and the record is explained (FR-021).

This is enforced by tests, not by review discipline: FR-013 to FR-017 and SC-010. A change that
would let the author diverge MUST fail CI on the PR that makes it.

### Relationship to spec 106

- Spec 106 US8 tasks **T063** (harness: drop the `zzq` path, port the gates, add the G6 touch diff)
  and **T064** (run the 32 cases) **depend on this spec**. Once this spec's US1-US3 land, the 32 cases
  run through the headless author instead of the Playwright harness. Their evidence is the headless
  run's per-case gate report, not walk zips.
- Spec 106 **T065** (the T013 corpus test has zero `it.fails` left) **stays in spec 106**. This spec
  neither owns nor relaxes that gate.
- This spec does not edit any spec 106 *document*. The dependency is recorded here, and spec 106's tasks are
  updated in a spec 106 change. It does add rows to spec 106's test-code `KNOWN_GAPS` table (FR-030):
  G1 on `bj_cree_woods`, and G6 on every touch-bearing keyboard walked. The G6 row is `walkOnly`: it
  applies to author runs, not to the decision-point replay, which walks no touch step.

## Clarifications

### Session 2026-10-30 (carried from the request, closed)

- Q: What does the author do at a step? → A: It calls the product's own proposal functions and applies the walk policy: accept the top suggestion, else the default, else a placeholder sequence (`zzq<hex>` with indicator `j`, exactly as the harness does today).
- Q: May the author re-implement a proposal to avoid a component? → A: No. Logic it needs that lives only in a component or hook is lifted into a store action or a pure function that the component then calls. There is no behaviour change, and the component's existing tests stay green.
- Q: What keeps Playwright? → A: UX and accessibility walks (the golden walk, the a11y specs), behaviour that is genuinely component-held, and the download wiring. The 32-case harness is retired for decision coverage.
- Q: Is `fallbackPolicy` fixed here? → A: No. It is a known gap carried over: it is in no decision value and not in the record (see the `decisionPointFixture.ts` header). The author surfaces it and does not fix it. The fix is tracked as issue #2366.

### Session 2026-10-30 (owner rulings, closed)

- Q: Does 107 wait for spec 106's replay code to reach `main`, or stack on it? → A: It stacked on `106-consistent-keyboard-output` by merge. Later the same day the whole spec 106 stack merged to `main` (#2358, #2362, #2364, #2365, #2369), so 107 merged `origin/main` and is now based on `main`; its PR targets `main`. See Dependencies.
- Q: Which slice runs in CI on a pull request (FR-031)? → A: A **minimal curated set** of keyboards chosen by shape, each with a recorded reason: a few simple ones, structurally different ones, and keyboards whose bugs were repaired, kept as regression guards. Adding a keyboard to this set is part of fixing a keyboard-specific bug. The wider sweep (the Latin codec-clean slice, the whole eligible corpus) is opt-in or scheduled, never required on a PR.
- Q: What is the PR CI time budget? → A: Total PR CI wall time (the whole PR run, not just this spec's share) must finish in under 10 minutes, preferably under 5. Larger-corpus scans run occasionally (scheduled or on demand), never on PRs. See SC-002 (PR budget) and SC-009 (scheduled scan).
- Q: Are walk zips (or more walk records) imported to cover parity? → A: No. The repo keeps the **framework** that produces walk records (the headless author, and the Playwright harness for UX walks) but does not commit walk zips to `main`. Parity runs against the decision records spec 106 already commits under `packages/studio/src/lib/__fixtures__/decision-points/records/`, plus any record a maintainer produces on demand with the framework. The zips stay on `km/2302-walk-zips`.
- Q: Is `fallbackPolicy` fixed here? → A: No; it is tracked as issue #2366 (FR-060).
- Q: Does the PR lane run in its own CI job or inside `build`? → A: In its own job, `headless-author`, running in parallel and required (owner ruling, 2026-10-30, superseding an earlier "step inside `build`" ruling the same day). GitHub runs jobs concurrently unless `needs:` chains them; on `main`, `ci.yml` is `changes` -> {`fast` -> `build`, `e2e-desktop`, `e2e-mobile`, `e2e-golden`}, so PR wall time is the longest chain, `fast` (about 2.1 min) + `build` (about 2.9 min), about 5.0-5.1 min on #2368's run. A step inside `build` would lengthen that chain; a job that needs only `changes` runs beside it and adds no wall time while its own total time stays within about 5 minutes. `headless-author` has `needs: changes` only, and `build` does not need it. It pays its own install and build (runner minutes, not wall time). It gates merges by being added to the required status checks of the `main: CI + integrity` ruleset, an owner action taken after the job has run green on `main` at least once (a required check that never reports blocks every PR). Once required, the job name must not change. See SC-002 and FR-036.
- Q: How large may the PR lane's cap be? → A: Owner follow-up, 2026-10-30: "5 minutes is fine if needed." The cap is not a fixed 60 s: it is `timeout-minutes` set from T051's measurement of the job plus about 50% headroom, rounded up to a whole minute, hard ceiling 5. All six PR-set keyboards stay unless the job would exceed 5 minutes; only then is the set cut, weakest shape first, both regression guards kept.
- Q: May the headless route diverge from the backend codebase in any way? → A: No (owner ruling, 2026-10-30). "We are only bypassing the UI." The author is the product minus React rendering, and divergence must be structurally impossible, not just discouraged: see the governing rule under Context, FR-013 to FR-017 and SC-010.
- Q: Does "codec-clean" exclude `round-trip-divergence` keyboards? → A: No (owner ruling, 2026-10-30, option A). Codec-clean means the codec parses the keyboard without error; round-trip divergence is not a reason to skip, and neither is the Layer A' I1 token-count heuristic. The stricter first reading excluded three of the six PR-set keyboards that spec 106's replay already compiles. See FR-032 and research R6.
- Q: Where do the harness case definitions live? → A: In this repo (owner, 2026-10-30), committed once from `km/2302-walk-zips` with their provenance, at `packages/studio/src/test/headlessAuthor/cases/harness-cases.json`. It is a case description, not a zip or a record, so it fits "keep the framework, no zips on main". That copy is canonical: the PR set and the scheduled run read it, and the Playwright harness should read from it or be synced from it (a follow-up for the harness owner; `km/2302-walk-zips` is not edited here). See FR-035.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One case, headless, from a case description (Priority: P1)

A maintainer describes a case the way `harness/cases.json` does:

- the copied keyboard (id and group) and the track;
- the language identity (English name, autonym, code, script);
- the marks profile (input order, output form, backspace answer);
- the sample text;
- any overrides, such as "overwrite `ŋ` onto `K_X`".

They run it in vitest. The headless author walks every step the product would show, makes each
decision by the walk policy, writes them into the real stores, and hands off to the existing replay.
The maintainer gets three things back: a decision record in the shape the UI writes, the output
bundle, and the G1-G8 gate results. It needs no browser, no dev server and no port.

**Why this priority**: This is the whole point. Without it, every new keyboard or profile still costs
a 25-minute flaky walk before anything can be checked. It would have caught the `group(Main)` defect
in seconds.

**Independent Test**: Run `p1-whole-bafut-kbdus` headlessly. It completes, the bundle compiles, the
gates are reported per gate, and a second run produces a byte-identical record and bundle.

**Acceptance Scenarios**:

1. **Given** a case description, **When** the author runs it, **Then** it produces a decision record, a DecisionSet, the output bundle and the gate results, with no browser.
2. **Given** a case whose override assigns `ŋ` to `K_X`, **When** the author reaches `ŋ` in the mechanism step, **Then** it applies "Assign to a key" on `K_X` and resolves any displacement proposal with the harness order (confirm the move, else keep both, else leave it).
3. **Given** a step where no suggestion and no default exist, **When** the author reaches it, **Then** it uses the placeholder sequence and counts it in the run report.
4. **Given** the same case run twice, **When** the outputs are compared, **Then** the record (minus timestamps), the DecisionSet and the bundle are identical.
5. **Given** a copied keyboard the codec cannot parse, or one missing from `../keyboards`, **When** the case runs, **Then** it is skipped with a named reason and never passes silently.

---

### User Story 2 - The author matches the UI (parity) (Priority: P1)

For every case that has a recorded UI walk, the headless author's decisions equal the recorded ones.
Every difference is listed in a reviewed allow-list with a reason. That proves the author takes the
decisions an author clicking through the UI with the walk policy would take.

**Why this priority**: Without parity, a green headless run proves nothing about the product. The
author could be walking a path no user can walk.

**Independent Test**: Compare the author's DecisionSet with each recorded walk. That means the four
records spec 106 commits under `packages/studio/src/lib/__fixtures__/decision-points/records/`, plus
any decision record a maintainer produces on demand (a UX walk run with the Playwright harness) and
hands to the parity run by path. On-demand records are inputs to a run, not repo fixtures: they are
not committed, and no walk zip is imported. Compare per decision id and value. The test fails on any
unexplained difference.

**Acceptance Scenarios**:

1. **Given** a recorded walk, **When** the author runs the same case on the same build, **Then** every decision id the walk recorded has an equal value from the author, or an allow-list entry with a reason.
2. **Given** a record that predates a product change (for example the round-3 records, which predate the S-02 deadkey-purpose fix), **When** compared, **Then** the difference is explained by an allow-list entry naming that change, never by editing the record.
3. **Given** an allow-list entry whose difference no longer occurs, **When** parity runs, **Then** the stale entry is reported so it can be removed.

---

### User Story 3 - The 32 harness cases run headless (Priority: P2)

The 32 cases of `harness/cases.json` run as a vitest suite through the headless author. They produce
the same per-case gate report the Playwright harness was meant to produce for spec 106 T063/T064, plus
the count of placeholder decisions. That report replaces the walk as the evidence for decision
coverage.

The 32-case suite is an **on-demand** (and scheduled) run, not a PR gate. It reads the committed
canonical case definitions (FR-035). What runs on every PR is the minimal curated set (FR-031).

**Why this priority**: This unblocks spec 106 US8 (T063/T064) without 32 browser walks.

**Independent Test**: Run the 32-case suite. Every case reports G1-G8 and its placeholder count, and
the suite finishes within the SC-008 budget.

**Acceptance Scenarios**:

1. **Given** the 32 case descriptions, **When** the suite runs, **Then** each case reports every gate, every placeholder decision it made, and every displacement action it took.
2. **Given** a gate that fails on a case, **When** the suite reports it, **Then** the report names the case, the gate and the decision point, which is enough to reproduce it with one command.
3. **Given** a gap that spec 106 already tracks as an expected failure, **When** the suite runs, **Then** it is reported as expected, with its owning story, and it does not hide new failures.

---

### User Story 4 - Corpus sweep: any copied keyboard x profile (Priority: P2)

A maintainer can run the author over keyboards beyond the four recorded ones: any copied keyboard
from `../keyboards` crossed with any profile. Engine defects that only some keyboards trigger, like
the case-sensitive group merge, then show up across the corpus before any author meets them.

Two tiers run the same sweep code (FR-031):

- the **PR set**: a minimal curated set of keyboards chosen by shape, required on every PR and sized
  to the PR budget (SC-002);
- the **wide sweep**: the Latin codec-clean slice or the whole eligible corpus, run on a schedule or
  on demand, never required on a PR. Its failures are filed as issues; they never block a PR.

**Why this priority**: Breadth is what replay alone cannot give. It comes after US1-US3 because it
reuses them unchanged.

**Independent Test**: Run the PR set, then the wide sweep over the eligible slice. Every case either
completes with a gate report or is skipped with a named reason. The sweep summary groups failures by
gate and by first failing step.

**Acceptance Scenarios**:

1. **Given** the eligible slice (FR-031), **When** the sweep runs, **Then** each keyboard x profile yields a gate report or a named skip reason. A keyboard over the rule cap (`too-large`, 9 of 921) is skipped in the sweep tiers, never in an explicit run.
2. **Given** a keyboard whose script routes to the "not yet supported" stub (CJK, Ethiopic), **When** swept, **Then** it is skipped with that reason. The author never forces a path the product does not offer.
3. **Given** a sweep failure, **When** it is reported, **Then** the failing case can be re-run alone as a US1 case.
4. **Given** a PR that fixes a keyboard-specific bug, **When** it lands, **Then** that keyboard is in the curated PR set with a reason naming the bug, so the PR set guards the fix from then on.
5. **Given** a scheduled wide sweep that finds a failure, **When** it finishes, **Then** the failure is filed (or an existing issue updated) with the case, gate and decision point, and no PR is blocked by it.

---

### User Story 5 - Lift component-held decision logic (Priority: P2)

Every rule the author needs that lives only in a React component or hook is moved into a store action
or a pure function. The component then calls that function, so the UI and the author share one
implementation. Nothing changes for the author at the keyboard.

**Why this priority**: Logic that lives only in components blocks headless testing. Copying it into
the test author would recreate the drift this spec exists to remove.

**Independent Test**: For each lifted rule, the component's existing tests stay green unchanged, the
golden walk does not need re-baselining, and a unit test calls the lifted function directly.

**Acceptance Scenarios**:

1. **Given** carve's "marked until Continue" semantics (the spec 106 FR-042 ruling), **When** they are lifted, **Then** the UI's Continue and the author's Continue both call one function, and both record the same removals and the same suggestion state. Today this logic is `isMarkedRow`, `applySuggestion` and `handleSkip` in `packages/studio/src/editors/carve/CarveGalleryV2.tsx`, plus the provenance rule in `editors/adapters/carveAdapter.tsx`.
2. **Given** the mechanism card's suggestion order and pre-selection (`orderedVisibleSuggestions` in `MechanismGallery.tsx`, pre-selected by spec 106 T062), **When** lifted, **Then** the author's "top suggestion" is the chip the UI shows first.
3. **Given** a rule that the author needs and that cannot be lifted without a behaviour change, **When** that happens, **Then** the step is listed as Playwright-only with its reason, and the author does not copy the rule.

---

### User Story 6 - Touch default layers checked headlessly (Priority: P3)

The author also completes the touch-seed step through the product's own seeding function. Gate G6
(no alphabet letter missing from any touch `default` layer) is then evaluated headlessly, rather
than only on walk zips.

**Why this priority**: G6 is walk-only in spec 106. Making it headless closes the last gate that still
needs a browser, but the gate set is useful without it.

**Independent Test**: Run a case whose copied keyboard has a touch layout. G6 is reported from the
headless bundle. Where a maintainer has an on-demand walk of the same case, G6 agrees with that walk's touch
layout; no walk zip is committed for this check.

**Acceptance Scenarios**:

1. **Given** a copied keyboard with a touch layout, **When** the author confirms the touch seed source with the product's proposal, **Then** the bundle carries the seeded layout and G6 is evaluated (today a `walkOnly` known gap).
2. **Given** a copied keyboard with no touch layout, **When** the case runs, **Then** G6 is reported as not applicable, not as passed.

### Edge Cases

- **Proposal function throws.** If a product proposal throws (an injected throw, in the tests), the case reports the throw at that step and decision point and fails. The author never substitutes a default for a thrown proposal. The tolerance analysis on `sil_cameroon_azerty` is not such a case: the product catches it and publishes `status: failed`, the author continues, and G2 fails as an expected, owned gap.
- **Step skips itself.** A step the product auto-completes (an empty mechanism diff, no marks) is passed the way the product passes it. There is no `caps-handling` step in this build, so the module default applies. The author does not write a decision the product would not write.
- **Displacement chains.** An override displaces a character that a later step needs. The author resolves each displacement proposal once, in harness order, and records each action.
- **Placeholder clash.** The placeholder sequence `zzq<hex>` collides with an existing sequence in the copied keyboard. The case reports the collision; the author does not invent a second placeholder scheme.
- **Missing decision.** A decision the record cannot carry (`fallbackPolicy`) runs with the store default, and the run report says so.
- **Proposal depends on network data.** Exemplars, langtags and SLDR data are read from the pinned prebuild data only. A case whose proposal would need a network fetch fails with that reason.
- **Proposal changes over time.** A product change alters a proposal, so parity breaks on recorded cases. The parity report names the decision id and both values. Fixing it is either an allow-list entry citing the change or a re-recorded walk; the author is never adjusted to match an old record.

## Requirements *(mandatory)*

### Functional Requirements

**Case input and run (US1)**

- **FR-001**: The author MUST take a case description with the same fields as
  `harness/cases.json`, plus the copied keyboard's group and track:
  - `id`;
  - copied keyboard id (`base`) and group;
  - track;
  - `english`, `autonym`, `code`, script;
  - `inputOrder`, `outputForm`, `backspace`, `backspaceOnDiagonal`;
  - `sampleText`;
  - overrides (`overwriteChar` / `overwriteKey`, and any later override kind).

  It MUST read the committed canonical copy (`packages/studio/src/test/headlessAuthor/cases/harness-cases.json`, FR-035) directly, and any other file in the same shape.
- **FR-002**: The author MUST visit steps in the order the product's own step routing yields, by reusing the routing that spec 032's journey runner drives (`steps/advance.ts`, `steps/reducer.ts`, the survey runner's exported routing). It MUST NOT use a hard-coded step list.
- **FR-003**: At each decision, the author MUST apply the walk policy in this order:
  1. accept the top suggestion the product offers;
  2. else apply the product's default;
  3. else enter the placeholder sequence `zzq` + the lowercase hex code points of the character, with indicator `j`.

  Case overrides take precedence over the policy, for the decisions they name.
- **FR-004**: The author MUST write each decision through the same store actions the UI uses, with the provenance the UI would record for that action:
  - an untouched default stays `default`;
  - an accepted or chosen value is `asked`.

  It MUST state how its 088 DecisionSet provenance maps to the 053 record's vocabulary (Constitution Art. III).
- **FR-005**: After the last step, the author MUST hand off to the existing replay (`buildDecisionPointFixture`'s path: `rebuildWorkingCopyFromStores`, `buildOutputBundle`, compile, `checkConsistencyGates`). It MUST NOT add a second projection or compile path.
- **FR-006**: The author MUST return:
  - a decision record that `parseDecisionRecord` accepts and `recordToDecisionSet` folds;
  - the DecisionSet;
  - the output bundle;
  - per-gate results;
  - a run report listing every placeholder, every displacement action, every skipped step, the `fallbackPolicy` value used, and `notCovered`: the ids of the Playwright-only rules the run cannot cover (FR-042).
- **FR-007**: Runs MUST be deterministic. The same case on the same build MUST yield an identical record (ignoring timestamps), DecisionSet and bundle.
- **FR-008**: The author MUST need no browser, no dev server, no network and no port. It MUST run under the studio corpus vitest config, as the decision-point suites do.

**Non-divergence and drift guard (all stories; governing)**

- **FR-013**: The author MUST bypass the UI rendering layer and nothing else (the governing rule
  under Context). Every behaviour below the UI MUST run as the product's own unmodified code, called
  at the seam the UI calls it from. The author's own code MUST be limited to case input, the walk
  policy's choice among product-offered options, the placeholder text, and reporting.
- **FR-014**: A **boundary test** (`HA/boundary.test.ts`, default vitest config, so it runs on every
  PR) MUST statically scan every file under `packages/studio/src/test/headlessAuthor/` and fail on
  any of the following:
  - an import of product code (studio source outside `src/test/`, `@keyboard-studio/engine`,
    `@keyboard-studio/contracts`) that is not in the drift-guard inventory (FR-011) with a named
    production caller. Spec 106's replay modules in `src/test/` are the only other permitted
    imports. **The author calls only what the UI calls.**
  - any `vi.mock`, `vi.doMock`, `vi.spyOn` or `vi.stubGlobal`. Spec 106's replay mocks nothing, so
    the author path mocks nothing.
  - any direct store write (`setState`, assignment through `getState()`). The one exception is the
    per-case reset (contract guarantee 4), which lives in one named function the test allow-lists
    by file and name.
  - an inventory entry not imported by **both** its production caller and an `HA/` driver. The
    inventory is two-sided, so a proposal pasted into a driver in place of its import fails, even
    when the copy is verbatim.
- **FR-015**: The walk policy MUST apply its choice through the same function the UI control's
  handler calls: the chip click, the Continue, the banner action, the confirm. It MUST NOT write the
  resulting value itself. Where that function is inside a component today, it is lifted first
  (FR-040).
- **FR-016**: Product code MUST NOT know the author exists. No file under `packages/*/src` outside
  `src/test/` may import from `src/test/headlessAuthor/` (a depcruise rule, `product-not-to-headless-author`).
  No product file may branch on an author or headless flag or read a `KS_AUTHOR*` variable (checked
  by the boundary test). No product export may exist only so the author can skip a step or a
  validation.
- **FR-017**: When the author and the product disagree, the fix MUST be on the product side or the
  record side, never in author logic:
  - make the author call the product exactly as the UI does;
  - lift the rule (FR-040), or list it as Playwright-only (FR-042);
  - or explain a product change against an old record with an allow-list entry (FR-021).

  A change that adds a conditional, a constant or a computed value to the author to make a run
  pass, rather than calling a product function, violates FR-013.

- **FR-010**: The author MUST obtain every suggestion and default by calling the product's own functions. It MUST NOT re-implement any of them. The functions known today are:

  | Step | Product functions |
  |---|---|
  | Identity prefill | `defaultsFor` (`packages/studio/src/lib/langtagsDefaults.ts`), `deriveScriptPrefill` (`lib/scriptAxes.ts`) |
  | Windows layout | `proposeWindowsLayout` (`lib/windowsLayouts.ts`) |
  | Track | `proposeTrack` (`lib/proposeTrack.ts`), recorded for comparison when the case names the track |
  | Character inventory | the build-list path: `survey/charactersStepRules.ts`, with `proposeTextSampleInventory` and `confirmTextSample` (`survey/marksTextSample.ts`); exemplars from `survey/sourcedExemplarsLookup.ts` over the pinned data. `suggestMissingChars` has no production caller, so it is not inventoried. |
  | Marks attachment and treatment | `proposeAttachments` (engine `marks/attachment-proposals.ts`), `computeMarkTreatmentPrefills` (`marks/treatment-prefill.ts`) |
  | Output form and backspace | `resolveOutputFormProposal`, `resolveBackspaceProposal` (`marks/output-form-policy.ts`) |
  | Context tolerance | `analyseContextTolerance` (`lib/contextToleranceAnalysis.ts`), `applyContextToleranceDecision` (`lib/contextToleranceApply.ts`), `proposeNormalizationStep` (engine `pattern-apply/normalization-step`) |
  | Convenience characters | `computeConvenienceGate` (`survey/convenience/convenienceGate.ts`) with `deriveCarveNeededSet` (engine `marks/carve-needed-set.ts`) |
  | Carve | `recommendedRemovalChars` (`lib/irToCarveNodes.ts`), `suggestionFingerprintOf` and `isUntouchedSuggestion` (`survey/carve/carveValue.ts`), and the lifted Continue rule (FR-040) |
  | Mechanism placement | `buildPlacementSeeds` and `getRankedSuggestionsForChar` (`survey/placementSeeds.ts`) |
  | Displacement | `displacedFor` and `orthographyTier` (`survey/slotOccupancy.ts`) |
  | S-02 purpose trigger | `proposeS02TriggerKey` and `deadkeyPurposeOf` (`editors/assignLoop/deadkeyPurpose.ts`) |
  | Case-pair companion | the logic behind `useCasePairCompanion` (`editors/assignLoop/casePairCompanion.ts`, lifted per FR-040) |
  | Caps handling | the `caps-handling` proposal of spec 106 US5. Not built: no such step exists in this build, so the module default applies, as `recordToDecisionSet` already assumes. The phase-F metadata proposals (`proposeProjectUrl`, `proposeProvenanceBasis`, `proposeTroubleshooting`) reach the walk through live extraction. |

  The plan MUST confirm each entry against the code and name any function this table missed.
- **FR-011**: A drift-guard test MUST fail when one of the FR-010 functions is renamed, removed, or no longer called by the UI component that renders its suggestion, so a proposal the UI uses cannot silently drop out of the author.
- **FR-012**: The author MUST NOT change what the product proposes. Any change to a proposal is out of scope (see Out of scope). A product defect that parity, the PR set or the sweep exposes is fixed on the product side (FR-017), in its own commit, and listed in the phase commit message.

**Parity (US2)**

- **FR-020**: A parity test MUST compare the author's DecisionSet, per decision id and value, with:
  - the four records spec 106 commits in `decision-points/records/` (always, on every run that includes their keyboards);
  - any decision record a maintainer produces on demand with the walk framework and passes to the run by path.

  On-demand records are run inputs. They are not committed, and walk zips are not imported into the repo; the zips stay on `km/2302-walk-zips` (owner ruling, 2026-10-30). Growing the committed record set beyond spec 106's four is out of scope.
- **FR-021**: Every difference MUST either be absent or carry an allow-list entry with three fields:
  - the decision id;
  - the reason;
  - the product change or record age that explains it.

  An entry also explains that decision's agency difference, if any.

  An unexplained difference fails the test. Records are never edited to make parity pass.
- **FR-022**: Allow-list entries whose difference no longer reproduces MUST be reported as stale.
- **FR-023**: The parity comparison MUST state how it treats values that are inherently run-specific (timestamps, fingerprints, generated ids, tester-typed text). Each MUST be either normalised by a named rule or compared exactly. The named rules are four: timestamps dropped; `zzq<hex>` reduced to `zzq`; the carve fingerprint recomputed on both sides; and **tester-typed**, where the author's own `PolicyStep` rule for a decision is `placeholder` and the record's value is compared on presence only. Both sides are folded from their records with `recordToDecisionSet`. The author's live DecisionSet is not compared, because a decision is recorded when its step completes and later steps keep seeding the live draft.

**Harness cases (US3)**

- **FR-030**: The 32 cases of `harness/cases.json` MUST run as a headless suite. Each case reports G1-G8, its placeholder count, its displacement actions, and any known gap that spec 106's `KNOWN_GAPS` owns (as expected, with its owner). The author adds two rows to that test-code table: G1 on `bj_cree_woods` (a dead rule after carving a whole `any()` store), and G6 on every touch-bearing keyboard walked. The G6 row is `walkOnly`, so it applies to author runs and not to the decision-point replay. The suite reads the committed canonical case definitions (FR-035) and runs on demand or on the schedule (FR-034). It is not a PR gate.
- **FR-031**: A corpus sweep mode MUST run the author over any copied keyboard in `../keyboards` crossed with any profile. It runs in two tiers (owner ruling, 2026-10-30):
  - **PR set (required on every PR).** A minimal curated set of keyboards chosen by shape. Each entry is a committed case description (keyboard, profile, sample text, overrides) with a recorded reason. An entry whose keyboard and profile are among the harness cases references that case by id in the canonical copy (FR-035); only keyboards outside the harness set (`bj_cree_woods`, `chechen_latin`) carry their own case description. No walk zip or walk record is needed to run it. The set covers:
    - a few **simple** keyboards (for example `basic_kbdus`);
    - **structurally different** keyboards: deadkey-heavy, a shipped touch layout, `any()`/`index()` store pairs, read-only or opaque groups, mixed-case group names;
    - **regression guards**: keyboards whose keyboard-specific bugs were repaired. The seeds are `bj_cree_woods` (a `group(Main)` duplicate-group merge, fixed in `502fb061`) and `basic_kbdfr` with Ewondo (S-02: three deadkeys on `K_COLON`, fixed in #2358).

    Adding a keyboard to the PR set is part of fixing a keyboard-specific bug: the fix's PR adds the case and its reason. The set's size is bounded by the PR budget (SC-002), so a new entry that would break the budget replaces a weaker one of the same shape rather than growing the set.
  - **Wide sweep (never required on a PR).** The Latin-script codec-clean slice, or the whole eligible corpus, crossed with the profiles. It runs on a schedule or on demand (FR-034).

  The initial PR set, with its reasons, is:

  | Keyboard | Profile | Shape and reason |
  |---|---|---|
  | `basic_kbdus` | `p1-whole-bafut-kbdus` | Simple: no deadkeys, no stores, one group. Has a committed walk record, so it also anchors parity (US2). |
  | `basic_kbdfr` | `p1-whole-ewondo-kbdfr` | Regression guard: S-02 put three deadkeys on `K_COLON` (fixed in #2358). Also an AZERTY base with a `deadkeys` group. Has a committed walk record. |
  | `bj_cree_woods` | a whole-alphabet profile (the plan names it) | Regression guard: `applyAssignments` merged `group(main)` into the declared `group(Main)`, a duplicate group that failed `kmcmplib` (fixed in `502fb061`). Also mixed-case group names, heavy `any()`/`index()` store pairs (about 70/58), an opaque `option-store-directive` fragment the codec preserves, a non-Latin script (Canadian syllabics), and no touch layout (G6 not applicable). Expected: G1 fails, a dead rule after carving a whole `any()` store; a `KNOWN_GAPS` row owns it. |
  | `sil_cameroon_qwerty` | `p4-unwrap-bafut-camqwerty` | Structural: a shipped touch layout with `any()`/`index()` pairs and a `deadkeys` group. Has a committed walk record. |
  | `sil_cameroon_azerty` | `p4-unwrap-ewondo-camazerty` | Structural: deadkey-heavy (about 37 deadkey references). The tolerance analysis (#2363) does not throw in the product: it publishes `status: failed`, the author continues, and G2 fails as an expected, owned gap. Has a committed walk record. |
  | `chechen_latin` | a whole-alphabet profile (the plan names it) | Structural: three `readonly` groups ahead of `group(main)`, which the codec keeps as fidelity-only groups, plus a shipped touch layout. |

  The plan confirms each keyboard is codec-clean and that the set fits SC-002. A keyboard that fails either check is replaced by another of the same shape, and the reason column is updated.
- **FR-032**: The sweep MUST skip, with a named reason, any keyboard that is:
  - missing;
  - not codec-clean, meaning the codec reports parse errors for it (`docs/import-corpus.json`). A
    `round-trip-divergence` keyboard that parses is codec-clean for this spec: byte-identical round-trip is out of scope for v1 (owner ruling,
    2026-10-30);
  - routed to the "not yet supported" stub (CJK, Ethiopic);
  - outside the eligible slice;
  - **too large**, in the sweep tiers only (`latin`, `eligible`): `too-large` applies to a keyboard with more than `MAX_SWEEP_RULE_COUNT` (2,000, measured) rules. It excludes 9 of the 921 keyboards (owner ruling, 2026-10-31). It never applies to an explicit harness run, a PR-set run or a `KS_AUTHOR_CASE` run, which name their keyboards on purpose.
- **FR-033**: Spec 106 T063/T064 MUST be satisfiable from this suite's report, with no Playwright run. Spec 106 T065 (zero `it.fails` in the decision-point corpus test) remains a spec 106 gate.
- **FR-034**: The wide sweep and the 32-case suite MUST run as a scheduled workflow, separate from the PR workflow. It also runs on manual dispatch. Each run MUST:
  - publish its per-case gate report as a run artifact;
  - file each new failure as a GitHub issue naming the case, gate and decision point, or add to the open issue for that same failure rather than filing a duplicate;
  - never block, fail or gate a PR.

  A shard killed mid-case still reports that case as `hung`: the report is rewritten before each case, and the merge files the entry.

  The plan fixes the cadence and the issue-filing rules.
- **FR-035**: The harness case definitions MUST be committed to this repo at `packages/studio/src/test/headlessAuthor/cases/harness-cases.json`, copied byte for byte from `km/2302-walk-zips` (`tools/testing-profiles-2302/harness/cases.json`), with a `PROVENANCE.md` beside it naming the source branch and commit. That copy is canonical:
  - the PR set (FR-031) and the scheduled run (FR-034) read it; no run fetches case definitions from another branch;
  - a change to a case is a change to this file, reviewed like any other;
  - the Playwright harness should read from it or be synced from it. That is a follow-up for the harness owner; this spec does not edit `km/2302-walk-zips` or `ks-2302-main`.

- **FR-036**: The PR lane MUST run as its own CI job, `headless-author`, in `.github/workflows/ci.yml`, with `needs: changes` only (no job needs it, and `build` does not), path-gated on the `changes` job's `e2e` output like `e2e-desktop`, and with a `timeout-minutes` set from T051's measurement of the job plus about 50% headroom, rounded up to a whole minute, hard ceiling 5. It becomes merge-gating when the owner adds it to the required status checks of the `main: CI + integrity` ruleset, after it has run green on `main` at least once. Its job name MUST stay stable once required; renaming it requires updating the ruleset in the same change.
**Lifting component logic (US5)**

- **FR-040**: Each rule the author needs that lives only in a component or hook MUST move to a store action or pure function, and the component MUST call it. Known rules:
  - **Carve "marked until Continue" (spec 106 FR-042).** `isMarkedRow`, `applySuggestion` and `handleSkip` in `CarveGalleryV2.tsx`, plus the provenance choice in `carveAdapter.tsx`.
  - **Mechanism card suggestion order and pre-selection.** `orderedVisibleSuggestions` in `MechanismGallery.tsx`, with spec 106 T062's pre-selection.
  - **S-02 deadkey identity resolution.** `resolveS02DeadkeyIdentity` in `MechanismGallery.tsx`.
  - **Displacement banner action order.** `DisplacementProposalBanner.tsx` with `MechanismGallery.tsx`.
  - **Case-pair companion acceptance.** The `useCasePairCompanion` hook.
  - **Marks series assembly.** How the marks-series value is assembled from the station answers (`MarksSeriesStep.tsx`, `OutputFormStation.tsx`).
  - **Text-sample proposal and confirm.** `MarksTextSamplePrompt.tsx`.

  As built, the lifts also cover: the characters, punctuation and invisibles step rules; `sourcedExemplarsLookup`; the touch seed (`touchSeedSourceContinue`, `touchStepCompletion`); `keyboardCatalog`; `analyseWorkingCopyContextTolerance`; `languageResultsFor`; `baseCoverageOf`; `displacementOutcomeFor`; and the mechanism placement sequence.
- **FR-041**: Each lift MUST be behaviour-preserving:
  - the component's existing tests pass unchanged;
  - the golden walk needs no re-baseline;
  - the lifted function has its own unit test.

  A lift MUST NOT add a second author-truth store (spec 105).
- **FR-042**: A rule that cannot be lifted without a behaviour change MUST be listed as Playwright-only with its reason, and its decision is recorded as not covered by the author.

**Touch (US6)**

- **FR-050**: The author SHOULD complete the touch-seed step with the product's seed proposal (`deriveSeedLayout` in `lib/buildTouchLayoutJson.ts`, and the seed-source step's default). G6 SHOULD then be evaluated on the headless bundle. A keyboard with no touch layout reports G6 as not applicable.

**Known gap carried over**

- **FR-060**: `fallbackPolicy` is not in any decision value and not in the decision record. The author MUST run with the store default, MUST report the value it used, and MUST NOT write it anywhere the record does not already carry it. The gap is reported here and fixed by #2366; adding it to the record is out of scope for this spec. When #2366 lands, the author reads and writes it like any other decision, and the run report drops the entry.

**Playwright's remaining role**

- **FR-070**: After this spec, Playwright keeps the following:
  - UX and accessibility walks (the golden walk, the a11y specs);
  - component-held behaviour listed under FR-042;
  - the download wiring (the Output tab, `emit-download`, and the saved zip).

  The 32-case harness is no longer required for decision coverage. Retiring it from `ks-2302-main` is a harness-repo change, not a change in this repo.

### Key Entities

- **Case**: one row in the shape of `harness/cases.json`. It names the copied keyboard, the language identity, the marks profile, the sample text and the overrides.
- **Walk policy**: the ordered rule the author applies at each decision. Overrides come first, then the top suggestion, then the default, then the placeholder.
- **Author run**: one case through the author. It yields the decision record, DecisionSet, bundle, gate results and run report.
- **Run report**: the placeholders, displacement actions, skipped steps, known gaps and `fallbackPolicy` of one run, plus `notCovered`: the 15 Playwright-only rules from `HA/playwrightOnly.ts` (FR-042).
- **Parity allow-list**: reviewed entries that explain each difference between an author run and a recorded walk. Each entry carries a decision id, a reason and the explaining change.
- **Lifted rule**: a decision rule moved out of a component into a store action or pure function, called by both the UI and the author.
- **Author boundary**: the line the boundary test enforces between the author (case input, the click, the typing, reporting) and the product (everything below the UI). Only inventoried product functions cross it, and only in one direction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One case runs headlessly, end to end (author, replay, compile, gates), in under 60 seconds on a maintainer's machine from a cold vitest start, and adds under 5 seconds per further case in the same run. That is down from about 25 minutes for a Playwright walk. Baseline measured for the plan on 2026-10-30: the existing replay alone takes about 25 s of one-time module load and 0.06-1.0 s per fixture warm (the full-decision `tolerance` fixture: 0.08 s on `basic_kbdus`, 1.0 s on `sil_cameroon_azerty`).
- **SC-002**: PR CI stays inside the owner's budget (2026-10-30): the **whole** PR run finishes in under 10 minutes of wall time. Today it is about 5.1 minutes, set by the longest job chain, `fast` then `build` (#2368's run). This spec's PR lane (the curated PR set of FR-031, parity on the committed records, and the drift guard) is the parallel job `headless-author` (`needs: changes` only; `build` does not need it), so **PR wall time does not grow** as long as the job's total time stays within the `fast` + `build` chain. Its cap is `timeout-minutes` set from T051's measurement of the job plus about 50% headroom, rounded up to a whole minute, hard ceiling 5; the job never runs longer than 5 minutes. All six PR-set keyboards stay unless the job would exceed 5 minutes; only then is the set cut, weakest shape first, both regression guards kept. Basis: replay measured at about 25 s one-time module load plus 0.04-0.8 s per case; the author's proposal calls are budgeted at under 5 s per case until T051 measures them, so the six cases are expected to take about 30-60 s of test time, plus the job's own install and build. The PR set fails 0 times out of 5 repeated runs for reasons other than a real gate failure (no flakiness). Local figures from T071 (5 runs, 0 non-gate failures): PR set plus parity 55-60 s; drift guard plus boundary 32-35 s. These are local, not CI, so T051 still sets the cap. The wide sweep and the 32-case suite never run on a PR.
- **SC-003**: Parity holds on 100% of recorded walks: every decision equal, or explained by an allow-list entry. 0 unexplained differences, and 0 records edited.
- **SC-004**: 100% of the suggestions and defaults the author uses come from product functions covered by the drift guard (FR-011). The author contains 0 copies of proposal logic.
- **SC-005**: Re-introducing the `group(main)` vs `group(Main)` defect (reverting `502fb061`) makes the PR set fail on its `bj_cree_woods` case, in under 60 seconds.
- **SC-006**: Every lifted rule (FR-040) leaves its component's existing tests and the golden walk unchanged: 0 re-baselines.
- **SC-007**: Spec 106 T063/T064 close on this suite's report with 0 Playwright case walks.
- **SC-008**: The 32 harness cases, run on demand, finish in under 10 minutes in one vitest run, with no browser, dev server or port, and fail 0 times out of 5 repeated runs for reasons other than a real gate failure.
- **SC-009**: The scheduled wide sweep (FR-034) runs on its cadence without blocking any PR. Every failure it finds is filed or appended to an existing issue within that run, with the case, gate and decision point, and no failure it finds is lost. That includes a hung case: a killed shard still reports its case as `hung`, and the merge files it.
- **SC-010**: Divergence cannot land unnoticed. The boundary test (FR-014) and the depcruise rule
  (FR-016) run on every PR and report 0 violations. A deliberate mutation check, run once and
  recorded, shows each of these fails CI:
  - a proposal function copied into `HA/`;
  - a `vi.mock` of a product module in `HA/`;
  - a direct `setState` on a decision store in `HA/`;
  - a product file importing from `HA/`.

## Out of scope

- Changing what the product proposes, ranks or pre-selects. Spec 106 US8 owns pre-selection; this spec only consumes it.
- Any `Pattern` schema change (Constitution Art. I).
- LDML output; touch-first authoring (Decision 6); CJK and Ethiopic paths (stubbed and skipped).
- Adding `fallbackPolicy` to the decision record (issue #2366).
- Committing walk zips, or walk records beyond spec 106's four, to the repo. The zips stay on `km/2302-walk-zips`. (The harness **case definitions** are committed; see FR-035.)
- Editing `km/2302-walk-zips` or the harness to read the canonical case file; that is the harness owner's follow-up (FR-035).
- Running the wide sweep or the 32-case suite on PRs.
- Retiring or editing the harness in `ks-2302-main`. That is a separate repo, and its retirement follows FR-070.
- Editing spec 106 documents. (The two `KNOWN_GAPS` rows in test code are in scope; see FR-030.)

## Dependencies

- **Based on `main`.** 107 needs spec 106 US1's replay pieces (`decisionPointFixture.ts`, `recordToDecisionSet.ts`, `consistencyGates.ts`, `decisionPoint.corpus.test.ts`). It first stacked on `106-consistent-keyboard-output` by merge; on 2026-10-30 the whole spec 106 stack merged to `main` (#2358, #2362, #2364, #2365, #2369), so 107 merged `origin/main` (a merge, never a rebase, because the branch is pushed). 107 is now based on `main` and its PR targets `main`.
- **On `main` now.** Everything this spec names from spec 106 is on `main`: the replay code; the Ewondo `kbdfr` re-record after the S-02 fix (one deadkey on `K_COLON`, G1 passing); the group-name fix `502fb061` (`sameGroupName`, `packages/engine/src/codec/groupName.ts`), which the `bj_cree_woods` guard and SC-005 rely on; and the carve "marked until Continue" code (`suggestionFingerprintOf` and `isUntouchedSuggestion` in `survey/carve/carveValue.ts`; `isMarkedRow`, `applySuggestion` and `handleSkip` in `CarveGalleryV2.tsx`), which the FR-040 carve lift moves.
- **PR CI budget baseline.** After #2368, e2e-desktop on PRs runs only boot-smoke, decision-store reload and spec 104 walk 1 (the full set runs nightly), and the PR critical path is `fast` then `build`, about 5.1 minutes measured on #2368's run. This spec's PR lane is the parallel job `headless-author`, so it adds no wall time while it finishes within that chain, and never runs longer than 5 minutes (SC-002).
- **Build side effect, closed.** `pnpm build` used to rewrite `baseLayouts.generated.json` and `windowsLayouts.generated.json` with a one-line change. PR #2370 (deterministic codegen) fixes it; it is not an open item here.
- **Issues.** #2363 (tolerance analysis fails on `sil_cameroon_azerty`: the product publishes `status: failed` and G2 fails), #2361 (`nul`/`beep` in starting stores), and #2366 (`fallbackPolicy` in the record) are owned elsewhere. The author reports them as expected, with their owner, and does not fix them.

## Assumptions

- **Corpus.** `../keyboards` points at the keyboard-studio fork's `master`, as the decision-point suites already require. Cases skip with a reason when a keyboard is missing.
- **Overrides.** The harness's `overwriteChar` / `overwriteKey` are the only override kind in the 32 cases. Further override kinds are added as cases need them, with the same precedence rule.
- **Parity runs.** Parity runs on the same build that produced the record when that build is known (`records/PROVENANCE.md`). Otherwise the differences are explained against the record's build.
- **Proposals in flight.** Proposal functions that spec 106 is still adding (caps handling, US5; top-candidate pre-selection, US8) are consumed when they land. Until then the author follows today's product behaviour for those steps.
- **Gates.** The G1-G8 definitions stay owned by spec 106's `consistencyGates.ts`. This spec reuses them unchanged.
