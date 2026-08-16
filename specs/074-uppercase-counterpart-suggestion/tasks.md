---
description: "Task list for feature 051 — suggest the uppercase counterpart when a lowercase cased letter is placed"
---

# Tasks: Suggest the uppercase counterpart when a lowercase cased letter is placed

**Input**: Design documents from `/specs/074-uppercase-counterpart-suggestion/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/case-pair-proposal.md](contracts/case-pair-proposal.md),
[contracts/touch-layer-targeting.md](contracts/touch-layer-targeting.md), [quickstart.md](quickstart.md)

**Tests**: INCLUDED. Both contracts publish an explicit "Test surface" table and the plan's
sequencing makes the pre-existing test suites the regression floor for the two riskiest changes
(the extraction, SC-005; and touch-layer targeting, absent-`layer` compatibility). Test tasks are
therefore first-class, not optional.

**Organization**: grouped by user story. US1/US2/US3 are all P1 in [spec.md](spec.md); they are
ordered here by the plan's "Implementation sequencing" (US1's extraction is the reference the other
two consume), and US2/US3 are independent of each other once Phase 3 lands.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task names its exact file path

## Path conventions

Monorepo, no new package ([plan.md](plan.md) "Structure Decision"):

- Studio UI: `packages/studio/src/editors/assignLoop/`
- Engine appliers: `packages/engine/src/pattern-apply/`
- i18n catalogs: `packages/studio/src/locales/{en,fr}/messages.json` (Lingui, JSON "minimal" style)

**Deliberately unchanged**: `packages/engine/src/character-discovery/casePair.ts`,
`packages/engine/src/pattern-apply/shiftRules.ts`, `packages/contracts/**`, `content/patterns/**`.
A non-empty diff in any of those is a violation ([data-model.md](data-model.md) §Invariants).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirm the working tree builds and capture the pre-change baselines the regression
floors will be measured against. No production code is written in this phase.

- [x] T001 Verify toolchain and build: `node --version` (must be >= 22.19.0), `pnpm install`, `pnpm build` from repo root per [quickstart.md](quickstart.md) §Prerequisites
- [x] T002 [P] Capture the engine touch-applier baseline: run `pnpm --filter @keyboard-studio/engine test src/pattern-apply/applyTouchAssignments.test.ts src/pattern-apply/applyTouchAssignmentsToRawJson.test.ts` and record the passing case list — this is the absent-`layer` regression floor for Phase 2
- [x] T003 [P] Capture the studio companion baseline: run `pnpm --filter @keyboard-studio/studio test src/editors/assignLoop/MechanismGallery.test.tsx` and record the names of the existing `pendingCompanion` cases (CAPS quad, non-CAPS append, mnemonic suppression) — these must pass **unedited** after the Phase 3 extraction (SC-005)
- [x] T004 [P] Record the current `editor.assignLoop.companion.*` ids and their exact English messages from `packages/studio/src/locales/en/messages.json` — reused ids must keep their current messages (renaming or rewording orphans translations)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: engine touch-layer targeting. Nothing in touch can be case-correct without it — "put the
capital on the shift layer" is currently **unexpressible** ([research.md](research.md) R5). Contract:
[contracts/touch-layer-targeting.md](contracts/touch-layer-targeting.md).

**CRITICAL**: US3 cannot begin until this phase is complete. US1 and US2 do not depend on it and may
run concurrently with it (plan sequencing step 1 is independent of step 2).

- [x] T005 Generalize layer resolution in `packages/engine/src/pattern-apply/applyTouchAssignments.ts`: resolve `slotValues.layer ?? "default"` **per mechanism** (not per assignment) against `phonePlatform.layers` by `id`, replacing the hardcoded `"default"` lookup
- [x] T006 Add the missing-target-layer path in `packages/engine/src/pattern-apply/applyTouchAssignments.ts`: push `[touch-apply] target layer "<id>" not found in phone platform — assignment for "<char>" skipped`, skip that mechanism only, never throw, **never** fall back to `"default"` ([research.md](research.md) R7)
- [x] T007 Update the host-key-missing warning in `packages/engine/src/pattern-apply/applyTouchAssignments.ts` to name the layer: `host key "<hostKey>" not found in phone layer "<id>"`
- [x] T008 Convert the single-`defaultLayerIndex` rebuild in `packages/engine/src/pattern-apply/applyTouchAssignments.ts` to a per-touched-layer rebuild, preserving structural sharing (untouched layers and platforms returned by reference) and purity (no input mutated)
- [x] T009 [P] Re-key the pre-built key lookup in `packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.ts` from `platformName → { keyId → RawKey }` (default layer only) to include the layer id, and resolve `slotValues.layer ?? "default"` per mechanism
- [x] T010 [P] Update the raw-JSON warnings in `packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.ts`: "found in no platform's `<layer>` layer"; unknown layer warns + skips without throwing or defaulting; keep `defaultHint: "dot"` promotion trigger/scope and splice-in-place fidelity (unknown fields, key order) unchanged
- [x] T011 Add engine tests to `packages/engine/src/pattern-apply/applyTouchAssignments.test.ts`: `layer: "default"` identical to absent; `layer: "shift"` places on the shift layer with the default layer untouched; two mechanisms on one character on different layers both apply; unknown layer warns + skips with no throw and no default fallback; untouched layers/platforms returned by reference
- [x] T012 [P] Add the matching cases to `packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.test.ts`: absent ≡ `"default"`, `layer: "shift"`, unknown layer warn+skip, host key absent from target layer but present in another, and preservation of unknown fields and key order
- [x] T013 Verify the regression floor: every **pre-existing** case in both applier test files passes with **no edit to its input fixtures** (compare against the T002 baseline). Editing an existing fixture to make it pass is a contract violation, not a fix

**Checkpoint**: touch placements can name a layer; every existing assignment, fixture, and stored draft behaves byte-identically.

---

## Phase 3: User Story 1 - Physical key: capital proposed on Shift/Caps of the same key (Priority: P1) 🎯 MVP

**Goal**: extract the shipping `pendingCompanion` state + inline banner out of `MechanismGallery.tsx`
into one shared hook (`useCasePairCompanion`) and one shared component
(`CasePairProposalBanner`), with the physical mechanism as its only consumer — so FR-011 holds
structurally and FR-002 ("no second casing path") becomes impossible to violate by construction.

**Independent Test**: assign a lowercase cased letter (e.g. `θ`) to a physical key on a non-mnemonic
keyboard; the case-pair banner offers `Θ` on that key's shift layer, confirming records exactly the
assignment the prompt was raised for, dismissing records nothing, and a mnemonic layout raises nothing.

**Gate (SC-005)**: the existing `MechanismGallery.test.tsx` companion cases pass **unedited**. That is
what proves the extraction was behavior-preserving; it is not optional polish.

### Tests for User Story 1

> Write T014 first and let it fail against the not-yet-existing module.

- [x] T014 [US1] Create `packages/studio/src/editors/assignLoop/casePairCompanion.test.ts` covering the hook's suppression and locale contract: caseless input (`ا`, `क`), self-mapping (`ĸ` U+0138), multi-character expansions (`ß`, `ﬃ`) and uppercase input all return `false` and raise nothing; identity `bcp47: "tr"` proposes `İ` for `i` (not `I`); a malformed `bcp47` degrades to locale-insensitive mapping rather than throwing

### Implementation for User Story 1

- [x] T015 [US1] Create `packages/studio/src/editors/assignLoop/casePairCompanion.ts` with the `CasePairProposal` discriminated union (`physical` | `combo` | `touch` variants) and `CasePairProposalInput` (the same union minus `counterpart`) per [data-model.md](data-model.md) §1
- [x] T016 [US1] Implement `useCasePairCompanion()` in `packages/studio/src/editors/assignLoop/casePairCompanion.ts` returning `{ proposal, propose, dismiss, clear }`: `propose` is the sole caller of `caseCounterpart(char, bcp47)` (callers cannot pass a counterpart in), returns `false` on `null` or `direction !== "toUpper"`, reads `bcp47` from `useWorkingCopyStore((s) => s.identity?.bcp47)` normalizing `""` → `undefined`, and keeps at most one pending proposal (a second `propose` replaces it)
- [x] T017 [US1] Create `packages/studio/src/editors/assignLoop/CasePairProposalBanner.tsx` — `{ proposal, onConfirm, onDismiss }`, `role="note"`, one prompt line plus Confirm/Dismiss, lifted **verbatim** (markup + styling) from the inline banner in `MechanismGallery.tsx`, reusing the shipped ids `editor.assignLoop.companion.ariaLabel` / `.prompt` / `.confirmButton` / `.declineButton` / `.confirmAriaLabel` / `.declineAriaLabel` with their current English messages. No third button, no "apply to all"
- [x] T018 [US1] Remove the local `pendingCompanion` state and the inline banner JSX from `packages/studio/src/editors/assignLoop/MechanismGallery.tsx` and adopt `useCasePairCompanion` + `<CasePairProposalBanner>`; clear the proposal from the existing current-character reset effect
- [x] T019 [US1] Raise the physical proposal from the `method === "swap"` branch of `handleApply` in `packages/studio/src/editors/assignLoop/MechanismGallery.tsx` via `propose({ mechanism: "physical", ... })`, preserving the existing gates: `effectiveLayer === "base"` and `shiftLayerAllowed` (mnemonic suppression, FR-010) enforced at propose time, and carrying `vkey`, `capsHandling` from `planShiftAssignment(ir, "main", vkey)`, and `baseAssignment` by object identity (FR-008)
- [x] T020 [US1] Move the physical confirm logic **verbatim** from `handleCompanionConfirm` in `packages/studio/src/editors/assignLoop/MechanismGallery.tsx` onto the banner's `onConfirm`: `capsHandling === true` replaces the base assignment (index via `indexOf(baseAssignment)`) with one combined `buildCasePairRuleLines(vkey, originalChar, counterpart, { capsHandling: true })` assignment; `capsHandling === false` appends a `buildShiftRuleLines(vkey, counterpart, { capsHandling: false })` assignment targeting `counterpart`. Do not re-derive this branch — it is Layer-A Check #10 load-bearing ([research.md](research.md) R10)
- [x] T021 [US1] Add the stale-base guard to the confirm path in `packages/studio/src/editors/assignLoop/MechanismGallery.tsx`: if `baseAssignment` is no longer present in the assignment list, `clear()` and record nothing (FR-008)
- [x] T022 [US1] Extend `packages/studio/src/editors/assignLoop/MechanismGallery.test.tsx` with the two identity cases from the contract test surface: confirm applies to the raising placement when the character carries multiple mechanisms, and a base assignment removed before confirm records nothing. Do **not** modify any existing companion case
- [x] T023 [US1] Run the SC-005 gate: `pnpm --filter @keyboard-studio/studio test src/editors/assignLoop/MechanismGallery.test.tsx` — all pre-existing companion cases pass with a zero-line diff against the T003 baseline; plus `pnpm --filter @keyboard-studio/studio test src/editors/assignLoop/casePairCompanion.test.ts`

**Checkpoint**: physical-key behavior is byte-identical to today, now served by the shared hook + banner. MVP.

---

## Phase 4: User Story 2 - Cased combo / dead-key: uppercase base letter → uppercase output (Priority: P1)

**Goal**: raise the parallel-combo proposal from **both** combo call sites — S-02 dead key in
`MechanismGallery`, S-03 sequence in `SequenceBuilderPanel` ([research.md](research.md) R2) —
case-shifting the **base/content letter and the output**, never the trigger/indicator
([research.md](research.md) R3, which corrects the spec's literal wording).

**Independent Test**: build a dead-key or sequence combo that outputs a lowercase cased letter with a
single-character uppercase counterpart; a proposal is offered whose trigger/indicator is unchanged and
whose base letter and output are both case-shifted; confirming records that parallel combo; a
multi-character content (`ng`) raises nothing.

**Depends on**: Phase 3 (the shared hook). Independent of Phase 5.

### Tests for User Story 2

- [x] T024 [P] [US2] Add S-02 cases to `packages/studio/src/editors/assignLoop/MechanismGallery.test.tsx`: a dead-key apply producing a lowercase accented letter raises a proposal; confirming appends a `PATTERN_DEADKEY` ref with `triggerKey` / `deadkeyName` / `accentChar` **unchanged** and `baseLetters` / `accentedForms` case-shifted; a caseless or self-mapping base letter raises nothing
- [x] T025 [P] [US2] Add S-03 cases to `packages/studio/src/editors/assignLoop/SequenceBuilderPanel.test.tsx`: a sequence apply whose `firstLetterOut` is a single cased character raises a proposal; confirming appends a `PATTERN_SEQUENCE` ref with `secondLetter` unchanged and `firstLetterOut` / `collapsedChar` case-shifted; multi-character content (`ng`) raises **no** proposal ([research.md](research.md) R4); an already-recorded parallel combo is a no-op under the existing `(firstLetterOut, secondLetter)` dedup, not a duplicate ref

### Implementation for User Story 2

- [x] T026 [US2] Add the `DeadkeyCombo` / `SequenceCombo` shapes to `packages/studio/src/editors/assignLoop/casePairCompanion.ts` per [data-model.md](data-model.md) §2, mirroring the existing slot vocabulary exactly, and extend `propose`'s `combo` branch to also resolve the input side through `caseCounterpart` — if **either** the input side or the output side returns `null`, raise nothing
- [x] T027 [US2] Raise the S-02 proposal from the `method === "deadkey"` branch of `handleApply` in `packages/studio/src/editors/assignLoop/MechanismGallery.tsx`, passing `{ mechanism: "combo", combo: { kind: "deadkey", triggerKey, deadkeyName, accentChar, baseLetter }, baseAssignment }` with `baseAssignment` by object identity
- [x] T028 [US2] Implement the S-02 confirm in `packages/studio/src/editors/assignLoop/MechanismGallery.tsx`: append a parallel `PATTERN_DEADKEY` `MechanismRef` with `triggerKey` / `deadkeyName` / `accentChar` unchanged, `baseLetters` = the uppercased base letter, `accentedForms` = `counterpart`, applied to exactly the raising assignment (stale-base guard as in T021)
- [x] T029 [US2] Raise the S-03 proposal from `handleApply` in `packages/studio/src/editors/assignLoop/SequenceBuilderPanel.tsx` by calling into MechanismGallery's shared hook through the existing `onApplied` callback seam — no second banner is rendered in the panel
- [x] T030 [US2] Implement the S-03 confirm: append a `PATTERN_SEQUENCE` ref to the character's sequence bucket via `partitionSequenceAssignment` with `secondLetter` unchanged, `firstLetterOut` = the uppercased content, `collapsedChar` = `counterpart`, relying on the existing `(firstLetterOut, secondLetter)` dedup
- [x] T031 [US2] Add the combo prompt wording to `packages/studio/src/editors/assignLoop/CasePairProposalBanner.tsx` as the **additive** id `editor.assignLoop.companion.prompt.combo` ("the uppercase combo"), leaving the physical `.prompt` id and its message untouched
- [x] T032 [US2] Run `pnpm --filter @keyboard-studio/studio test src/editors/assignLoop/MechanismGallery.test.tsx src/editors/assignLoop/SequenceBuilderPanel.test.tsx` — new S-02/S-03 cases pass and every pre-existing case still passes

**Checkpoint**: US1 and US2 both work independently; the trigger/indicator is never case-shifted.

---

## Phase 5: User Story 3 - Touch keyboard: capital proposed on the shift/caps layer of the edited layer (Priority: P1)

**Goal**: make case **representable** in a touch placement (FR-006 — derive the layer from the placed
letter's case, which also fixes the inverse case the spec did not name), then raise the shift-layer
proposal on top (FR-005).

**Independent Test**: on a touch layer, place a lowercase decomposable accented letter (`á`) — its
long-press/host suggestion targets the **default** layer's key and a separate banner offers `Á` on the
shift layer; place an accented **uppercase** letter (`Á`) directly and it lands on the `shift` layer,
not `default`; a caseless letter raises nothing.

**Depends on**: Phase 2 (engine layer targeting) and Phase 3 (the shared hook). Independent of Phase 4.

### Tests for User Story 3

- [x] T033 [P] [US3] Add layer cases to `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`: `buildTouchMechanismRef` emits `layer: "default"` for a lowercase letter and `layer: "shift"` for an uppercase one (including decomposable accented `á` / `Á`), and `mechanismRefEquals` treats `{K_A, á, default}` and `{K_A, Á, shift}` as distinct refs
- [x] T034 [P] [US3] Add proposal cases to `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`: a lowercase touch placement raises a proposal whose confirm records the counterpart with `layer: "shift"` via `appendMechanismToChar`; dismissing records nothing; a caseless letter raises nothing; `suggestionResolved` (the placement-suggestion card's set) is **not** consulted or written by the case-pair path ([research.md](research.md) R9)

### Implementation for User Story 3

- [x] T035 [US3] Add `TouchLayerId` and `casePairTouchLayer(editingLayer)` to `packages/studio/src/editors/assignLoop/touchBehavior.ts` per [data-model.md](data-model.md) §3: `"default"` → `"shift"`; `"shift"` / `"caps"` / anything else → `null`
- [x] T036 [US3] Introduce an explicit `editingLayer` value in `packages/studio/src/editors/assignLoop/TouchGallery.tsx`, fixed to `"default"` for v1 and named so a future layer selector widens the mapping instead of rewriting the proposal site ([research.md](research.md) R6)
- [x] T037 [US3] Derive the `layer` slot value in `buildTouchMechanismRef` (`packages/studio/src/editors/assignLoop/TouchGallery.tsx` ~L222–250) from the placed character's case: `\p{Lu}` → `"shift"`, otherwise `"default"` (FR-006). Leave `hostKey` semantics untouched — it stays a resolved vkey, and the existing `K_${base.toUpperCase()}` at ~L1194 builds a **vkey name**, not a letter, so it stays
- [x] T038 [US3] Raise the touch proposal from the touch apply path in `packages/studio/src/editors/assignLoop/TouchGallery.tsx` via `propose({ mechanism: "touch", hostKey, targetLayer: casePairTouchLayer(editingLayer), baseRef })`, suppressing when `casePairTouchLayer` returns `null` or the counterpart is already produced on the parallel slot
- [x] T039 [US3] Render `<CasePairProposalBanner>` in `packages/studio/src/editors/assignLoop/TouchGallery.tsx` and implement its confirm: append a touch ref for `counterpart` via `appendMechanismToChar` carrying the same `hostKey` and `layer: targetLayer`, with the stale-`baseRef` guard (identity, not target/index)
- [x] T040 [US3] Add the touch prompt wording as the additive id `editor.assignLoop.companion.prompt.touch` ("the shift layer") in `packages/studio/src/editors/assignLoop/CasePairProposalBanner.tsx`
- [x] T041 [US3] Run `pnpm --filter @keyboard-studio/studio test src/editors/assignLoop/TouchGallery.test.tsx` plus the Phase 2 engine applier tests, confirming a confirmed proposal reaches the shift layer end-to-end

**Checkpoint**: all three mechanisms raise the same proposal through the same affordance; touch placement is case-correct in both directions.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T042 Extract i18n catalogs: `pnpm --filter @keyboard-studio/studio messages:extract`, then confirm `packages/studio/src/locales/en/messages.json` gained only the additive `editor.assignLoop.companion.prompt.combo` / `.prompt.touch` ids and that every reused `editor.assignLoop.companion.*` id keeps its exact T004-recorded English message
- [x] T043 Verify `packages/studio/src/locales/fr/messages.json` key-set parity after extraction so `i18n-catalog-lint` passes (no orphaned or missing ids)
- [x] T044 [P] Audit the "single casing source" invariant: grep the diff for `toUpperCase(` / `toLocaleUpperCase(` and confirm the only surviving occurrence on the touch path is the vkey-name construction in `TouchGallery.tsx` (~L1194). Zero new casing calls on the proposal path ([data-model.md](data-model.md) §Invariants 1)
- [x] T045 [P] Confirm the deliberately-unchanged files have an empty diff: `packages/engine/src/character-discovery/casePair.ts`, `packages/engine/src/pattern-apply/shiftRules.ts`, `packages/contracts/**`, `content/patterns/**`
- [x] T046 Run the repo gates from [quickstart.md](quickstart.md) §6: `pnpm typecheck`, `pnpm -r test`, `pnpm lint`
- [ ] T047 Walk [quickstart.md](quickstart.md) §5 manually under `pnpm dev` — steps 2 (physical confirm/dismiss), 3 (dead key: trigger unchanged, base letter capitalized), 4 (`á` on `default`, `Á` on `shift` in the generated `.keyman-touch-layout`), 5 (the inverse case: `Á` placed directly lands on `shift`), 6 (caseless: no banner)
- [x] T048 [P] Update [docs/keyboard-index.md](../../docs/keyboard-index.md) **only if** the manual walkthrough or any new test fixture references a keyboard not already in the phonebook (mandatory when it does; otherwise a no-op)

---

## Phase 7: Follow-up fixes (post-#1411)

**Purpose**: close the two defects the T047 manual walk exposed — both inside the shipped
FR-005/FR-006 boundary ([spec.md](spec.md) 2026-07-28 amendment, US4, FR-012, FR-013). No new
mechanism, no new UI affordance; both fixes route existing derivation through the helpers Phase 5
already built rather than adding a second casing/layer path.

- [x] T049 [P] [US4] Fix FR-012 in `packages/studio/src/editors/assignLoop/TouchGallery.tsx`:
  rewrite `handleUseSuggestion` (~L1519–1522) to build its `ref` via
  `buildTouchMechanismRef(nextMethod, hk, "", currentChar)` instead of the bare
  `{ patternId, slotValues: { hostKey, char } }` literal, so `layer` is always derived through
  `touchLayerForChar` — the same "one casing source" invariant `data-model.md` §Invariants 1
  already requires of every other placement path. Do not hand-add a second `touchLayerForChar`
  call at the suggestion site.
- [x] T050 [US4] Add cases to `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`
  pinning `handleUseSuggestion`'s output: accepting a longpress/replace suggestion for `ă` yields a
  ref with `layer: "default"`; accepting one for `Ă` yields `layer: "shift"`, not a silent default.
- [x] T051 [P] [US4] Fix FR-013 in `packages/studio/src/editors/assignLoop/TouchGallery.tsx`: give
  `hostKeyShortLabel` (~L154–156) a required `layer: TouchLayerId` parameter and case the returned
  letter uppercase when the layer id's hyphen-joined components include `shift` or `caps`,
  lowercase otherwise (leaving non-casing ids such as `alt`/`ctrl`/`rightalt`/`rightctrl`/
  `leftctrl`/`ncaps` out of scope, per FR-013 — do not invent a rendering rule for them); update
  both call sites — the configured-mechanism chip in `touchMechanismLabel` (~L179, pass the
  mechanism's own `slotValues.layer ?? "default"`) and the placement-suggestion text (~L1942,
  ~L1970, pass `touchLayerForChar(currentChar)`). Leave `slotValues.hostKey` itself untouched — it
  stays a resolved vkey name in both cases.
- [x] T052 [US4] Add cases to `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`
  pinning the label cases: `hostKeyShortLabel("K_A", "default")` reads lowercase `a`;
  `hostKeyShortLabel("K_A", "shift")` reads uppercase `A`; a casing-bearing compound id such as
  `"rightalt-shift"` also reads uppercase; a non-casing id such as `"alt"` reads the raw uppercase
  vkey letter `A` (`hostKeyShortLabel("K_A", "alt")` — today's unchanged floor, not a rule this
  feature defines); the configured-mechanism chip for a `default`-layer mechanism and the
  suggestion text for a lowercase placement both render the lowercase form.
- [x] T053 [P] [US4] If T051 changes any `Trans`/`t()` message content (not just the interpolated
  value), extract catalogs: `pnpm --filter @keyboard-studio/studio messages:extract`, then confirm
  `packages/studio/src/locales/en/messages.json` gained no unintended id changes and
  `packages/studio/src/locales/fr/messages.json` keeps key-set parity, per the T042/T043 recipe, so
  `i18n-catalog-lint` passes. A no-op if the fix only changes the label helper's return value, not
  message text.
- [x] T054 Run the repo gates: `pnpm typecheck`, `pnpm -r test`, `pnpm lint`. Run 2026-07-28:
  typecheck clean (7/7 packages); engine 2139 pass once `pnpm run fetch-sldr` restored the
  gitignored SLDR extract the `exemplarCodegen` determinism test regenerates against; studio
  4476/4480 pass, the four failures being the pre-existing Windows-checkout CRLF floor in
  `projectWorkingCopyVfs.flagParity` (×3) and `articleIVProbe` (×1) — neither file is in this
  change's diff; ESLint 0 errors (128 warn-only `lingui/no-unlocalized-strings`, pre-existing, and
  the 3 `react-hooks/exhaustive-deps` warnings on the touched file predate it — no dependency array
  changed vs. `main`); depcruise clean over 859 modules. **`pnpm lint` does not run to completion on
  this checkout**: `crew-lint` crashes with EISDIR when `.claude/worktrees/` is present, a known
  local-environment defect unrelated to this change (no `.claude/**/km-*` file was touched).
- [ ] T055 Re-walk the T047 manual steps from [quickstart.md](quickstart.md) §5 under `pnpm dev`,
  now including the two defect scenarios: accepting the suggestion for `ă` lands on `default` with
  a lowercase label; accepting it for `Ă` lands on `shift` with an uppercase label.

**Checkpoint**: the suggestion-Accept path and every host-key label agree with the case-aware
layer targeting Phase 5 introduced; T047 passes clean.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no dependencies; T002/T003/T004 are the baselines the later gates compare against, so they must be captured **before** any production edit.
- **Phase 2 (Foundational, engine layer targeting)** — depends on Phase 1. **Blocks US3.** Does *not* block US1 or US2.
- **Phase 3 (US1, extraction)** — depends on Phase 1. Blocks US2 and US3 (both consume the shared hook). Can run concurrently with Phase 2.
- **Phase 4 (US2, combo)** — depends on Phase 3. Independent of Phase 2 and Phase 5.
- **Phase 5 (US3, touch)** — depends on Phase 2 **and** Phase 3. Independent of Phase 4.
- **Phase 6 (Polish)** — depends on every user-story phase intended to ship.
- **Phase 7 (Follow-up fixes, post-#1411)** — depends on the shipped Phases 1–6 (it fixes code
  those phases already landed). The FR-012 fix (T049–T050) and the FR-013 fix (T051–T052) touch the
  same file but different functions/call sites and are otherwise independent — they can run in
  parallel. Both precede the manual re-walk (T055).

### Within each user story

- The failing test comes first where it is cheap to write against a not-yet-existing module (T014).
- Types → hook/helper → gallery wiring → confirm handler → banner wording.
- The regression gate (T013, T023) closes the phase; it is not deferred to Polish.

### Parallel opportunities

- **Phase 1**: T002, T003, T004 all in parallel.
- **Phase 2**: the IR path (T005–T008) and the raw-JSON path (T009–T010) touch different files and can run in parallel; T011 and T012 likewise.
- **Phase 2 ∥ Phase 3**: the engine appliers and the studio extraction share no file.
- **Phase 4 ∥ Phase 5**: once Phase 3 lands, the combo work (`MechanismGallery` + `SequenceBuilderPanel`) and the touch work (`TouchGallery` + `touchBehavior`) are independent — except that both add an id to `CasePairProposalBanner.tsx` (T031, T040), which is a one-line conflict to sequence.
- **Phase 6**: T044, T045, T048 in parallel; T042 → T043 → T046 in sequence.

---

## Parallel Example: Phase 2

```bash
# IR path and raw-JSON path together (different files):
Task: "Generalize layer resolution in packages/engine/src/pattern-apply/applyTouchAssignments.ts"
Task: "Re-key the lookup in packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.ts"

# Then both test files together:
Task: "Add layer cases to applyTouchAssignments.test.ts"
Task: "Add layer cases to applyTouchAssignmentsToRawJson.test.ts"
```

## Parallel Example: US2 ∥ US3 (after Phase 3)

```bash
Task: "US2 — raise + confirm the S-02 parallel combo in MechanismGallery.tsx"
Task: "US3 — editingLayer + case-derived layer on refs in TouchGallery.tsx"
```

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 Setup — capture the baselines.
2. Phase 3 US1 — extract the hook + banner, physical mechanism as sole consumer.
3. **STOP and VALIDATE**: T023's zero-diff gate on the existing companion tests (SC-005). If any
   pre-existing case needed an edit, the extraction changed behavior — fix the extraction, not the test.

US1 alone ships no new user-visible capability; its value is that FR-011 and FR-002 become structural.
It is the MVP because US2 and US3 both build on it.

### Incremental delivery

1. Phase 1 + Phase 2 → touch can name a layer (engine-only, no UI change, independently shippable).
2. + Phase 3 → shared affordance, physical behavior unchanged.
3. + Phase 4 → combos propose their parallel (SC-001 two-thirds).
4. + Phase 5 → touch proposes on the shift layer, and the casing defect is gone (SC-002).
5. + Phase 6 → i18n, invariant audit, repo gates.

### Parallel team strategy

- Dev A: Phase 2 (engine appliers).
- Dev B: Phase 3 (studio extraction).
- Then Dev A: Phase 5 (touch, needs both), Dev B: Phase 4 (combo, needs Phase 3). Sequence the two
  `CasePairProposalBanner.tsx` id additions (T031/T040) between them.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- **Never edit an existing applier fixture or an existing companion test to make a change pass** — both
  suites are the regression floor ([plan.md](plan.md) §Risks).
- `caseCounterpart` is the only casing source; `propose` is its only caller on this path.
- Propose, never apply: no code path records an uppercase placement without an explicit confirm (FR-001, spec §3c).
- Absent `layer` ≡ `"default"` is the compatibility guarantee the whole touch change rests on.
- Commits: `feat(engine)` for Phase 2, `feat(studio)` for Phases 3–5, per the repo commit style. No emoji in console output.
