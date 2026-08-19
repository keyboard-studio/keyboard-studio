# Tasks: Output-screen picker scope

**Input**: Design documents from `specs/058-output-screen-picker-scope/`
**Prerequisites**: [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/picker-pane-variant.md](contracts/picker-pane-variant.md)

> ## Retroactive task list (2026-08-19)
>
> Per [plan.md](plan.md)'s retroactive note, this feature landed on `main`
> before this `specs/058-output-screen-picker-scope/` directory was created
> during the 2026-08-18 spec-number-collision cleanup (#1643). Every task
> below is checked off because it documents work already shipped and verified
> against the current source tree, not work queued for `/speckit-implement`.
> Task bodies name the real file, the real symbol, and the FR it satisfies so
> the list is traceable evidence rather than a plan.

**Tests**: The feature's dedicated test file
(`OutputScreen.pickerScope.test.tsx`) already exists and passes; per the
spec's Testing section the three pre-existing `OutputScreen.*.test.tsx`
suites were re-run (not rewritten) to prove no regression. No new test
authoring remains.

## Phase 1: Setup

No setup tasks — this is a change confined to existing files in
`@keyboard-studio/studio`; no new package, dependency, or config was added
(plan.md Project Structure / Structure Decision).

## Phase 2: Foundational

**Wave 1 — independent (different files):**

- [x] **T001** [P] Add `PickerPaneVariant = "full" | "shipping"` type and
  `resolveOutputKeyboardId(identity, baseKeyboard)` helper as a standalone
  module (not re-exported from `serializeWorkingCopy.ts`, per research.md's
  mock-boundary decision) · `packages/studio/src/lib/outputKeyboardId.ts`
- [x] **T002** [P] Add `surveySessionStore.backToChooseBase()` to the
  existing `backTo*` action family — rewinds `history` to the prefix walked
  before `choose_base` was first reached and clears `baseConfirmed`; never
  mutates the working copy (FR-006, FR-007) ·
  `packages/studio/src/stores/surveySessionStore.ts`
- [x] **T003** [P] Extract `PANE_SECONDARY_BUTTON` shared style constant
  (review-cycle finding, km-qc) so the two mode-toggle buttons and "Change
  base keyboard" stop hand-copying the same style object ·
  `packages/studio/src/components/previewOutputLayout.ts`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T004** Add `variant?: PickerPaneVariant` (default `"full"`) and
  `changeBaseSlot?: ReactNode` props to `PickerPane`; suppress the mode
  toggle, picker slot, scaffold-form slot, and `MetadataCard` when
  `variant === "shipping"`; render `BaseProvenance` (read-only, rows keyed by
  field name per research.md) plus `changeBaseSlot` in that variant;
  `identityPanelSlot`/`kmnEditorSlot` render unconditionally at the same tree
  position in both variants (FR-001, FR-004, FR-005) ·
  `packages/studio/src/components/PickerPane.tsx`

## Phase 3: User Story 1 — Finished author sees a ship-it pane, not a start-over pane (Priority: P1) 🎯 MVP

**Goal**: An instantiated working copy on `#output` shows the ship-it pane —
no mode toggle, no editable base picker, base shown as read-only provenance —
with a download control whose accessible name names the same keyboard id as
the emitted file.

**Independent Test**: Complete (or seed) an instantiated working copy,
navigate to `#output`, and assert the mode toggle and base picker are absent
while identity, KMN editor, and the download/submit controls remain.

### Implementation

**Wave 1 — independent (different files, all depend on T001/T004 above):**

- [x] **T007** [P] [US1] Route the emitted `<id>-<version>.zip` filename
  through `resolveOutputKeyboardId`, replacing its inline
  `identity.keyboardId` derivation (FR-008, D4) ·
  `packages/studio/src/lib/serializeWorkingCopy.ts`
- [x] **T008** [P] [US1] Convert the sibling D4 site to call
  `deriveProjectKeyFromWorkingCopy` (`draftPersistence.ts`) instead of
  restating the same `identity?.keyboardId ?? …` expression by comment-only
  convention (pattern-audit sibling fix) ·
  `packages/studio/src/decisions/createStudioDecisionRecorder.ts`
- [x] **T009** [P] [US1] Lingui-wrap the `"shipping"`-variant strings under
  the `picker.*` area (`picker.pane.label.shipping`, `picker.shipping.heading`,
  `picker.shipping.intro`, `picker.shipping.provenance.heading`,
  `picker.shipping.provenance.name` / `.id` / `.script`) per §046 (FR-009) ·
  `packages/studio/src/components/PickerPane.tsx`

**Same file, sequential (both edit `OutputScreen.tsx` — not a parallel-safe
pair, independent of Wave 1 above):**

- [x] **T005** [US1] Subscribe to
  `useWorkingCopyStore((s) => s.isInstantiated())` as a live selector (not a
  mount-once read) and pass `variant={instantiated ? "shipping" : "full"}` to
  `PickerPane` (FR-002, FR-003) · `packages/studio/src/components/OutputScreen.tsx`
- [x] **T006** [US1] Route the download and `.kmp` aria-labels
  (`output.download.aria.ready`, `output.download.aria.kmp`) through
  `resolveOutputKeyboardId(identity, baseKeyboard)`, removing the divergent
  `pickerMode`/`scaffoldSpec`-derived expression entirely (FR-008, D4) ·
  `packages/studio/src/components/OutputScreen.tsx`

**⟶ Wait for both groups above to finish, then:**

- [x] **T010** [US1] Write `OutputScreen.pickerScope.test.tsx` covering
  variant selection, provenance rendering, and the matching
  aria-label/filename keyboard id (US1 scenarios 1–5) ·
  `packages/studio/src/components/OutputScreen.pickerScope.test.tsx`

**Checkpoint**: US1 is independently functional — an instantiated working
copy on Output renders the reduced ship-it pane with a correct, single-sourced
keyboard id, verified by `OutputScreen.pickerScope.test.tsx`.

## Phase 4: User Story 2 — Changing base at ship time routes back to the survey (Priority: P2)

**Goal**: A "Change base keyboard" control on the `"shipping"` variant
navigates to the survey's `choose_base` step as a pure navigation action,
leaving the existing `confirmRebaseTo` gate as the only re-base confirmation.

**Independent Test**: From an instantiated working copy on `#output`,
activate the control and assert the app navigates to the survey at
`choose_base` with survey history free of stale forward entries.

**Depends on**: US1 (T004's `changeBaseSlot` prop and T005's variant
selection) and Phase 2's `backToChooseBase` action (T002).

### Implementation

- [x] **T011** [US2] Add the "Change base keyboard" control
  (`output-change-base` test id, `output.changeBase.label` string), rendered
  via `changeBaseSlot` only when `baseKeyboard !== null`; wire its handler to
  call `backToChooseBase()` then `navigateTo("survey")`, with no
  `instantiateFromBase` or other working-copy mutation call in the handler
  (FR-006) · `packages/studio/src/components/OutputScreen.tsx`
- [x] **T012** [US2] Cover US2 scenarios 1–4 (navigation to `choose_base`,
  the existing rebase-confirm dialog on a different base, the established
  same-base no-op, and no stale forward history entry after a subsequent
  Back) in `OutputScreen.pickerScope.test.tsx` ·
  `packages/studio/src/components/OutputScreen.pickerScope.test.tsx`

**Checkpoint**: US1 and US2 both work independently — base-switching at ship
time relocates to the survey's pre-existing confirm gate with no destructive
control left on Output.

## Phase 5: User Story 3 — Cold arrival at `#output` still works standalone (Priority: P2)

**Goal**: An author who opens a bookmarked `#output` with no working copy
still sees the full picker (mode toggle included) and can select, compile,
and ship a base from Output alone — unchanged from today.

**Independent Test**: With an empty working-copy store, mount `#output` and
assert the picker and mode toggle render and a selection drives `stage` to
`ready`.

**Depends on**: T004 (`variant` defaulting to `"full"`) and T005 (variant
flips to `"shipping"` in place once instantiation settles, without
unmounting `TrackOneIdentityPanel`/`KmnEditor` mid-edit).

### Implementation

- [x] **T013** [US3] Re-run (not rewrite) the pre-existing
  `OutputScreen.test.tsx`, `OutputScreen.coverageBanner.test.tsx`, and
  `OutputScreen.kmp.test.tsx` suites to confirm cold-arrival behaviour, the
  coverage/staleness banners, and download/`.kmp` gating are unchanged (US3
  scenarios 1–2, SC-004) · `packages/studio/src/components/`
- [x] **T014** [US3] Confirm the mid-visit `full → shipping` transition
  (base selected cold, then instantiated) reconciles in place — no remount of
  `TrackOneIdentityPanel`/`KmnEditor` — closing the Edge Cases late-
  instantiation race (US3 scenario 3) ·
  `packages/studio/src/components/OutputScreen.pickerScope.test.tsx`

**Checkpoint**: All three user stories work independently — cold arrival is
provably unchanged while an instantiated visit gets the reduced, correctly-
labeled ship-it pane.

## Phase 6: Polish

- [x] **T015** Pattern audit swept D1 (`useState`/store-authoritative-state
  shadowing shape) across every `aria-pressed`/`aria-selected`/`aria-current`
  site and `useState…getState()` initializer in `packages/studio/src`;
  concluded no further sibling beyond the fixed `pickerMode` site (spec.md
  Pattern audit, D1 table) · `specs/058-output-screen-picker-scope/spec.md`
- [x] **T016** Pattern audit swept D4 (derived-id-computed-twice shape)
  across `identity?.keyboardId ?? …`/`?? base…id` call sites; one sibling
  fixed (T008), one filed as a follow-up rather than smuggled in
  (`draftAutosave.ts:229` — different input type and load-bearing fallback)
  (spec.md Pattern audit, D4 table) ·
  `specs/058-output-screen-picker-scope/spec.md`
- [x] **T017** Verified against the WCAG 2.2 AA tracker rows for 2.5.3 Label
  in Name / 4.1.2 Name, Role, Value (SC-003) ·
  `specs/056-ada-accessibility/wcag-2.2-aa-tracker.md`

## Dependencies & Execution Order

- **Phase 2 (Foundational) blocks every user-story phase.** T001/T002/T003
  (Wave 1) are independent files; T004 (`PickerPane` variant prop) waits on
  T001 for the `PickerPaneVariant` type.
- **Phase 3 (US1) is the MVP** and blocks Phase 4 (US2 reuses its
  `changeBaseSlot` prop and variant selection) and Phase 5 (US3 asserts the
  cold-arrival default T004/T005 established). Within Phase 3, T005–T009 are
  independent files (Wave 1); T010 (the dedicated test) waits on all of them.
- **Phase 4 (US2)** is a single task plus its test — no internal wave split.
- **Phase 5 (US3)** re-runs existing suites (T013) and confirms the mid-visit
  transition (T014); both depend only on Phase 2/3, not on each other.
- **Phase 6 (Polish)** is retroactive evidence (pattern-audit conclusions,
  accessibility verification) — no code dependency, run last for
  traceability.

**Parallel opportunities**: Within Phase 2, T001/T002/T003 touch three
different files with no shared dependency. Within Phase 3, T007/T008/T009
each touch a distinct file and run as one wave; T005/T006 both edit
`OutputScreen.tsx` and are sequenced instead of parallelized.
