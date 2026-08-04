# Feature Specification: Output-screen picker scope

**Feature Branch**: `km/057-output-picker-scope`

**Created**: 2026-08-04

**Status**: Implemented (US1–US3, FR-001…FR-010)

**Governing spec**: [spec.md](../../spec.md) §12 (output), §3c (defaults-first — "propose-then-confirm everywhere"), v1.3.0 working-copy spine ([docs/workflow-model.md](../../docs/workflow-model.md)). Accessibility house rules: [docs/accessibility.md](../../docs/accessibility.md).

**Input**: Author observation — at the end of the keyboard-creation flow, the Output screen's left pane is headed "Keyboard Studio", offers an `Open base` / `New from base` mode toggle and a base-keyboard picker, and reads "Pick a base keyboard to start". It is unclear why an author would switch base at the point of shipping.

---

## Problem statement

The Output screen mounts [PickerPane](../../packages/studio/src/components/PickerPane.tsx) wholesale — the same left pane [PreviewScreen](../../packages/studio/src/components/PreviewScreen.tsx) uses ([PickerPane.tsx:1-8](../../packages/studio/src/components/PickerPane.tsx#L1-L8), [OutputScreen.tsx:3-4](../../packages/studio/src/components/OutputScreen.tsx#L3-L4)). The reuse is deliberate for the *pipeline*: `#output` is directly reachable by nav click, typed hash, or bookmark without passing through the survey, so the screen must be able to select and compile a base standalone or `stage` never reaches `ready` and `canDownload` stays false ([usePreviewArtifact.ts:8-12](../../packages/studio/src/hooks/usePreviewArtifact.ts#L8-L12), [OutputScreen.tsx:10-14](../../packages/studio/src/components/OutputScreen.tsx#L10-L14)).

That rationale covers *cold arrival*. It does not cover the common case — an author who has just finished the survey and has a fully-edited working copy. For them the pane presents four defects:

- **D1 — The mode toggle misreports state.** `pickerMode` is local `useState<PickerMode>("open")`, re-initialized to `"open"` on every mount ([usePreviewArtifact.ts:87](../../packages/studio/src/hooks/usePreviewArtifact.ts#L87)), while `baseKeyboard` lazy-inits from the working-copy store ([usePreviewArtifact.ts:84-86](../../packages/studio/src/hooks/usePreviewArtifact.ts#L84-L86)). A keyboard created via Track 1 scaffold still renders with `Open base` pressed. The control is a mode *input* placed where an author reads it as a state *display*.
- **D2 — A destructive control sits on the ship-it screen.** Selecting a different base re-instantiates the working copy, discarding carve deletions and recorded survey phases; the only guard is a native `window.confirm` ([confirmRebase.ts:51](../../packages/studio/src/lib/confirmRebase.ts#L51), [confirmRebase.ts:126-142](../../packages/studio/src/lib/confirmRebase.ts#L126-L142)). One misread click at the finish line discards the session's work behind a browser dialog authors habitually dismiss.
- **D3 — The copy is at the wrong altitude.** The pane reads "Pick a base keyboard **to start**; the right pane shows the compiled result" ([PickerPane.tsx:57-59](../../packages/studio/src/components/PickerPane.tsx#L57-L59)). On Output the right pane is download + submit, not a compiled-result view. Both clauses are false there.
- **D4 — The download aria-label derives the keyboard id a second time, divergently.** `downloadKeyboardId` is computed from `pickerMode` / `scaffoldSpec` / `baseKeyboard.id` ([OutputScreen.tsx:157-162](../../packages/studio/src/components/OutputScreen.tsx#L157-L162)), but the emitted filename comes from `identity.keyboardId` in the store via `serializeWorkingCopy` ([serializeWorkingCopy.ts:124](../../packages/studio/src/lib/serializeWorkingCopy.ts#L124), [:288](../../packages/studio/src/lib/serializeWorkingCopy.ts#L288)). Because `pickerMode` is always `"open"` on this screen, a screen-reader user is told "Download keyboard **us** as zip" while the file that lands is `dagbanli-<version>.zip`. This is a WCAG 2.2 AA concern (2.5.3 Label in Name / 4.1.2), not merely cosmetic.

D2 and D4 are defects independent of the visual-clarity complaint; D1 and D3 are the complaint itself.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Finished author sees a ship-it pane, not a start-over pane (Priority: P1)

An author completes the survey for their Dagbanli keyboard and lands on Output. The left pane confirms *what they built* — display name, keyboard id, the base it derives from — and offers download/submit on the right. There is no `Open base` / `New from base` toggle and no base dropdown, because neither action belongs at ship time.

**Why this priority**: This is the reported confusion and the destructive-control exposure (D1, D2, D3) in one slice. It is also the overwhelmingly common path — every successful authoring session ends here.

**Independent Test**: Complete (or seed) an instantiated working copy, navigate to `#output`, and assert the mode toggle and base picker are absent while identity, KMN editor, and the download/submit controls remain. Delivers the fix with no change to cold-arrival behaviour.

**Acceptance Scenarios**:

1. **Given** an instantiated working copy, **When** the author navigates to `#output`, **Then** no `Open base` / `New from base` toggle and no base-keyboard picker are rendered.
2. **Given** the same state, **Then** the pane's heading and description describe shipping the current keyboard, not picking a base to start.
3. **Given** the same state, **Then** the base keyboard is shown as read-only provenance (name + id), not as an editable control.
4. **Given** the same state, **Then** `TrackOneIdentityPanel` and `KmnEditor` still render and remain editable — naming the keyboard and a final source tweak are legitimate at ship time.
5. **Given** the same state, **When** the author downloads, **Then** the resulting zip filename and the download control's accessible name name the same keyboard id.

---

### User Story 2 — Changing base at ship time routes back to the survey (Priority: P2)

An author on Output realises they picked the wrong base. Rather than mutating the working copy in place from the ship-it screen, an explicit "Change base keyboard" control returns them to the survey's `choose_base` step, where the existing preview-before-commit gate and rebase confirm already live.

**Why this priority**: Keeps the capability that the removed toggle nominally provided, but relocates it to the one screen designed to handle it. Depends on US1 having removed the in-place control, so it ships second.

**Independent Test**: From an instantiated working copy on `#output`, activate the control and assert the app navigates to the survey at `choose_base` with survey history consistent (no stale forward entry a later Back would resurface).

**Acceptance Scenarios**:

1. **Given** an instantiated working copy on Output, **When** the author activates "Change base keyboard", **Then** the app navigates to the survey at the `choose_base` step.
2. **Given** they then pick a *different* base and confirm, **Then** the existing `confirmRebaseTo` dialog warns about discarding edits before anything is committed ([confirmRebase.ts:102-105](../../packages/studio/src/lib/confirmRebase.ts#L102-L105)).
3. **Given** they re-confirm the *same* base, **Then** no confirm appears and no edits are discarded — the established same-base no-op ([confirmRebase.ts:90-94](../../packages/studio/src/lib/confirmRebase.ts#L90-L94)).
4. **Given** they navigate Back from `choose_base` afterwards, **Then** survey history contains no stale entry pointing forward past the step they left.

**Note**: relocating base-switching to `choose_base` means the *existing* synchronous guard covers it. No new destructive code path is introduced on Output — this story removes one rather than adding one.

---

### User Story 3 — Cold arrival at `#output` still works standalone (Priority: P2)

An author opens a bookmarked `#output` in a fresh session with no working copy. The full picker (including the mode toggle, since scaffolding is a legitimate cold-start choice) renders exactly as it does today, so a base can be selected, compiled, and the coverage/staleness gates evaluated on this screen alone.

**Why this priority**: Preserves the documented reason the picker is on Output at all. Must not regress, but is not the reported problem — hence P2 rather than P1.

**Independent Test**: With an empty working-copy store, mount `#output` and assert the picker and mode toggle render and a selection drives `stage` to `ready`.

**Acceptance Scenarios**:

1. **Given** no instantiated working copy, **When** the author lands on `#output`, **Then** the base picker and mode toggle render as they do today.
2. **Given** that state, **When** a base is selected, **Then** the compile pipeline reaches `ready` and download eligibility is evaluated on this screen without a prior Preview visit.
3. **Given** a base is selected cold and then instantiated, **Then** the pane transitions to the US1 reduced form for the remainder of the visit — it does not keep offering the picker beside an instantiated copy.

---

### Edge Cases

- **Late instantiation race.** `usePreviewArtifact` already handles the case where SurveyView's `onInstantiate` has not settled by the time Output mounts ([usePreviewArtifact.ts:110-118](../../packages/studio/src/hooks/usePreviewArtifact.ts#L110-L118)). The pane variant must be derived from *live* store state, not a mount-once read, or a late-settling instantiation leaves the full picker on screen for an author who has one. This is the mirror of the D1 bug and must not be reintroduced as the variant switch.
- **Cold-arrival transition mid-visit.** US3 scenario 3: the variant must flip when `isInstantiated()` becomes true during the visit, without unmounting `TrackOneIdentityPanel` mid-edit or discarding a partially-typed keyboard id.
- **Coverage-blocked / touch-stale arrival.** The existing blocked banners and their "go to gallery" control ([OutputScreen.tsx:119-133](../../packages/studio/src/components/OutputScreen.tsx#L119-L133), [:135-142](../../packages/studio/src/components/OutputScreen.tsx#L135-L142)) are unaffected; the reduced pane must not suppress or duplicate them.
- **PreviewScreen unchanged.** Preview keeps the full pane. "Pick a base and watch it compile" is exactly that screen's job, and the toggle reports state correctly there because the author is choosing in the moment.
- **Mock-engine path.** `instantiateFromBaseIfConfirmed` returns false with no IR/VFS ([confirmRebase.ts:131-134](../../packages/studio/src/lib/confirmRebase.ts#L131-L134)); under the mock engine the store never instantiates, so the pane stays in cold form. Acceptable, but tests that assert the reduced form must seed the store rather than rely on a mock compile.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `PickerPane` MUST accept a variant that suppresses the mode toggle and the picker slot, and MUST accept screen-appropriate heading and description text. The existing full behaviour MUST remain the default so `PreviewScreen` is untouched.
- **FR-002**: `OutputScreen` MUST select the reduced variant when the working-copy store reports an instantiated copy, and the full variant otherwise.
- **FR-003**: The variant selection MUST be derived from a live store subscription, not a mount-once read, so a late-settling instantiation flips the pane within the same visit (see Edge Cases).
- **FR-004**: In the reduced variant the base keyboard MUST be presented as read-only provenance with a programmatically-associated label, not as a `select`/combobox.
- **FR-005**: In the reduced variant `TrackOneIdentityPanel` and `KmnEditor` MUST continue to render and remain editable; flipping the variant MUST NOT unmount or reset in-progress identity input.
- **FR-006**: The reduced variant MUST offer a "Change base keyboard" control that navigates to the survey at `choose_base` and MUST NOT itself call `instantiateFromBase` or any other working-copy mutation.
- **FR-007**: The `choose_base` back-navigation MUST leave `surveySessionStore.history` free of stale forward entries, following the established `backToUnfinishedGallery` / `backToTouchSeedSource` pop semantics ([surveySessionStore.ts:545-560](../../packages/studio/src/stores/surveySessionStore.ts#L545-L560)) rather than a forward `advance` push.
- **FR-008**: `OutputScreen`'s download aria-label MUST derive the keyboard id from the same source as the emitted filename (`identity.keyboardId`, falling back to the base id) — the divergent `pickerMode`/`scaffoldSpec` derivation MUST be removed, not merely corrected in place. Fixes D4.
- **FR-009**: All new and changed user-visible strings MUST be Lingui-wrapped with ids per the §046 convention (`output.*` area), and MUST NOT reuse an existing id whose meaning has changed.
- **FR-010**: No new debounce timer, validation cycle, or working-copy mutation path may be introduced — this change is presentational plus one navigation action (decision D3 scope, working-copy spine).

### Key Entities

- **PickerPane variant** — a presentational mode ("full" vs "shipping"), not new persisted state. Derived, never stored.
- **`isInstantiated()`** — the existing working-copy-store predicate; the single input to variant selection. Do not fork a second notion of "has a working copy".
- **`choose_base` back-navigation** — a new `surveySessionStore` action in the existing `backTo*` family, or reuse of an existing one if it already satisfies FR-007. Decide during `/speckit-plan`.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An author arriving at Output with an instantiated working copy is presented with zero controls that can discard carve deletions or survey answers without leaving the screen.
- **SC-002**: The base keyboard shown on Output matches the instantiated working copy's base in 100% of cases, for both Track 1 and Track 2 provenance (D1 closed).
- **SC-003**: The download control's accessible name and the emitted zip filename name the same keyboard id in 100% of cases (D4 closed), evidenced against the WCAG 2.2 AA tracker rows for 2.5.3 / 4.1.2 ([specs/056-ada-accessibility/wcag-2.2-aa-tracker.md](../056-ada-accessibility/wcag-2.2-aa-tracker.md)).
- **SC-004**: Cold arrival at `#output` with an empty store still reaches a downloadable artifact with no Preview visit — verified by the existing standalone-pipeline coverage, unchanged.
- **SC-005**: No text on the Output screen instructs the author to "start" or describes the right pane as a compiled-result view (D3 closed).

---

## Assumptions

- Naming the keyboard (`TrackOneIdentityPanel`) and a final source edit (`KmnEditor`) are legitimate at ship time and stay. Only base *selection* is out of place. If the author disagrees, US1 scenario 4 is the line to move.
- The Output screen's right pane (download, submit-to-community, sign-up) is out of scope; this spec touches the left pane and one aria-label.
- `PreviewScreen` is out of scope and must be provably unchanged.
- The `#output` cold-entry path is a real supported entry point, per the existing docstrings, and is not being reconsidered here.
- Scaffold mode (`New from base`) remains reachable from Preview and the survey; this spec removes it only from the *instantiated* Output pane, not from the product.

---

## Out of scope

- Reconsidering whether Output should be directly reachable via `#output` at all.
- Any change to the coverage gate, touch-staleness gate, or their banners.
- Restyling the Output right pane or the submit flows.
- Replacing the native `window.confirm` rebase dialog with an in-app modal. It remains the guard on the survey path; a nicer dialog is a separate concern and this spec deliberately reduces reliance on it rather than reworking it.
