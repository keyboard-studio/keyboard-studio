# Feature Specification: Survey progress buttons live in the footer

**Feature Branch**: `km/footer-step-nav`

**Created**: 2026-09-25

**Status**: Draft. Two open questions remain (FR-031, FR-042).

**Input**: User description: "Move the survey progress buttons (Back / Skip / Continue / Next / Done / Confirm) out of each survey page and into the global footer. The nav cluster goes on the left and the progress dots are right-aligned." Origin: issue #1778 (`feat(studio): move survey progress buttons (Back/Continue) into the footer, dots right-aligned`). This spec **refs #1778**.

## Governing documents

This spec **implements** the following and does not restate them. They win on conflict, except where this spec explicitly amends them (see [Amendments](#amendments-to-existing-specs)).

- [specs/057-bulletproof-navigation/](../057-bulletproof-navigation/spec.md) section E:
  - 057 FR-040: the footer is narrow, present from the first question onward, and MUST NOT materially reduce the walk's vertical space.
  - 057 FR-043: every dot is a real, focusable, named control.
  - 057 FR-047: overflow degrades legibly, every mark stays reachable, and the current position stays visible.
  - 057 FR-062: the footer reads the location model, not the rendered component tree.

  This feature adds a second occupant to that footer and keeps all four guarantees.
- [specs/079-survey-answer-persistence/contracts/journey-strip-contract.md](../079-survey-answer-persistence/contracts/journey-strip-contract.md):
  - **§6 Overflow**: horizontal scroll inside the dot row, scroll-to-current, and the fixed 40 px height.
  - **§9 The FR-016 notice**: the footer's single `role="status"` polite region is shared by the jump-refusal and re-proposal notices.

  This spec keeps §9 as written and amends §6's height for coarse pointers only.
- [specs/056-ada-accessibility/](../056-ada-accessibility/) and [docs/accessibility.md](../../docs/accessibility.md), house rules 1-4, 8, 11 and 12. Conformance evidence goes in [wcag-2.2-aa-tracker.md](../056-ada-accessibility/wcag-2.2-aa-tracker.md).
- [specs/046-i18n-localization/](../046-i18n-localization/) and its [catalog-format contract](../046-i18n-localization/contracts/catalog-format.md). A message id is a permanent handle. Moving a string does not change its meaning, so its id stays.
- [specs/012-step-model-manifest/](../012-step-model-manifest/) and constitution Article IX. The manifest stays the single source of step ordering. This feature adds no step and changes no ordering.
- Constitution Article IV / decision D3. Nothing here validates, so this feature adds no timer.

## Problem statement

The Back and forward buttons move around from one survey page to the next. Some steps put them at the top of the section, some at the bottom, and several split them, with Back at the top and Continue at the bottom. On every page the author has to hunt for the control that moves them on. Nothing is shared: every step hand-rolls its own buttons, labels and disabled gating, and many steps run an internal walk (question cursor, marks stations, per-character galleries, prefill to build list). In those steps, Back steps back locally before it ever reaches the step boundary.

Audit findings (2026-09-25; evidence for planning, not requirements; full detail in the [Step inventory](#appendix-a-step-inventory)):

- **A-1: No consistent position.** The nav controls sit at the top, the bottom, in a header bar, inline mid-page, or split between two of these, depending on the step.
- **A-2: Buttons with no test handle.** Back on PhaseB intro, PhaseB build list, Convenience letters, Accents and marks, the mechanism gallery, the touch gallery, Carve, the gallery intro splash and the gallery empty state has no `data-testid`. Neither do the gallery "Next character" and Carve "Skip" buttons, or the splash "Get started" button.
- **A-3: An inert Back.** Convenience letters always renders Back, even when the step has nowhere to go back to. It does nothing when pressed.
- **A-4: Back-less traps.** The base-resolution loading, error and empty states, and the Carve loading state, render no Back at all.
- **A-5: Untranslated labels.** Carve's Back, Skip and Continue labels, and its loading text, are hard-coded English. The retired v1 Carve had catalog ids for them, which were deleted with it.
- **A-6: Buried disabled reasons.** Several forward buttons are disabled with a reason ("why blocked") shown next to them. Moving the button moves it away from its reason.

## Clarifications

None recorded yet. The open items are marked inline (FR-031, FR-042).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The progress buttons are always in the same place (Priority: P1)

An author working through the survey finds Back on the left of the footer on every page, then Skip if the page has one, then the forward action (Next, Continue, Done or Confirm), with the progress dots on the right. They never scroll or scan the page to find how to move on.

**Why this priority**: This is the reported problem (#1778) and the whole of the feature's value. Every other story protects this one.

**Independent Test**: Walk the golden path (both tracks) from the first question to the output step. On each page, confirm that the page body contains no Back, Skip or forward progress button, and that the footer's left cluster contains them in the order Back, secondary, primary.

**Acceptance Scenarios**:

1. **Given** any in-scope survey page (Appendix A), **When** it is shown, **Then** its progress buttons appear in the footer's nav cluster and nowhere in the page body.
2. **Given** a page with a Back, a Skip and a Continue (Carve), **When** it is shown, **Then** the footer shows them left to right in that order, before the project label and the dots.
3. **Given** a page with a forward action only, or a Back only (the gallery empty state), **When** it is shown, **Then** the footer shows exactly those buttons and leaves no empty placeholder slot.
4. **Given** any page, **When** the footer renders, **Then** the dot row is right-aligned, scrolls horizontally on overflow, and keeps the current mark visible (057 FR-047, 079 contract §6).

---

### User Story 2 - The buttons behave exactly as they did (Priority: P1)

Moving a button does not change what it does. Back still steps back through a step's internal walk before leaving the step. Continue is still disabled for exactly the same reasons, with the same label and the same accessible description. Pressing Enter to advance, auto-advance, and a step completing or backing out on its own all keep working.

**Why this priority**: The move is only acceptable if it is behaviour-neutral. A footer Back that jumped straight out of a half-walked step would lose the author's position, which is the class of defect specs 057 and 079 exist to prevent.

**Independent Test**: For each row of Appendix A, drive the step through its gating states (enabled, disabled, each label variant, each internal-walk position). Assert the footer buttons' label, disabled state, accessible name and description, and the effect of pressing them, against the pre-change baseline.

**Acceptance Scenarios**:

1. **Given** the author is on the third question of a question flow, **When** they press the footer Back, **Then** they land on the second question of the same flow, not on the previous step.
2. **Given** the author is on the second marks station, **When** they press the footer Back, **Then** they return to the first station.
3. **Given** a per-character gallery walk on its third character, **When** the author presses the footer Back, **Then** the walk returns to the second character.
4. **Given** the PhaseB build list has no characters, **When** it is shown, **Then** the footer Done is disabled, just as the in-page Done was.
5. **Given** a question whose answer is incomplete, **When** it is shown, **Then** the footer Next is disabled and still carries the same progress description ("question N of M").
6. **Given** a text question with a valid answer, **When** the author presses Enter in the field, **Then** the flow advances exactly as before. Enter-to-advance does not depend on where the button is rendered.
7. **Given** the touch per-character gallery has orphaned edits, **When** the author presses the footer Done once, **Then** they see the same press-twice warning as before, and the second press proceeds.

---

### User Story 3 - No stale or duplicate buttons (Priority: P1)

When the author moves from one step to another, the footer shows only the new step's buttons. A Continue left over from the previous step never appears, even for a moment, and no page ever shows two Back buttons.

**Why this priority**: A stale Continue would complete the wrong step. A duplicate Back makes assistive-technology navigation ambiguous and breaks role-based test queries (see Appendix B).

**Independent Test**: Navigate between every adjacent pair of steps, forward, back and by journey-strip jump. After each transition, assert that the footer's buttons belong to the new step and that the document has at most one element with each nav role and name.

**Acceptance Scenarios**:

1. **Given** the author presses Done on Punctuation, **When** Invisible characters mounts, **Then** the footer forward button is Invisibles' Continue, and Punctuation's Done is not rendered at any point after the step change.
2. **Given** a step unmounts without a successor, for example when the author goes to the output screen, **When** the footer renders, **Then** it shows no nav buttons.
3. **Given** a step that nests another nav-rendering component (a question flow inside the characters step, the identity step, PhaseA or the PhaseB manual path), **When** it is shown, **Then** only the innermost owner of the walk publishes buttons, and exactly one Back and one forward button exist.

---

### User Story 4 - Keyboard and screen-reader users keep a fast, understandable path (Priority: P2)

A keyboard user who answers a question can reach Continue quickly. The footer buttons have the same names, states and descriptions as before. A disabled Continue still tells them why it is disabled.

**Why this priority**: Moving the buttons to the end of the DOM changes Tab order for every page. Unless it is handled on purpose, this regresses 2.4.3 Focus Order and can hide the reason a control is disabled.

**Independent Test**: The docs/accessibility.md rule 12 keyboard walk. Tab through each Appendix A page with the mouse untouched and complete the step. Also run an axe scan of the footer in the enabled, disabled and blocked states.

**Acceptance Scenarios**:

1. **Given** the author has answered the last field on a page, **When** they press Tab, **Then** the next focus stops are the footer nav buttons (Back, secondary, primary), before the project label and the dots.
2. **Given** Continue is disabled because of a blocking condition (marks, mechanisms, touch completion gate), **When** a screen reader reaches the button, **Then** the reason text, which stays in the step body, is announced as the button's description.
3. **Given** the author presses the footer Next within a multi-question step, **When** the next question renders, **Then** focus stays on the footer Next, as it does today within a step.
4. **Given** the footer publishes a jump refusal or a re-proposal notice, **When** it is announced, **Then** it comes from the footer's single existing status region. The nav cluster adds no second live region.

---

### User Story 5 - Every step has a way back and a translated label (Priority: P2)

On every page that was reached by moving forward, the author can go back, including while the page is loading or has failed to load. Every nav label appears in the author's locale.

**Why this priority**: These fix real defects (A-3, A-4, A-5) that the move exposes. The fixes cost little once the buttons are shared.

**Independent Test**: Force each loading, error and empty state of base resolution and Carve, and confirm that the footer offers a working Back. Switch to French and confirm that no nav label is in English (other than untranslated catalog entries, which fall back as usual).

**Acceptance Scenarios**:

1. **Given** base resolution is loading, has failed, or found nothing, **When** it is shown, **Then** the footer offers Back, which behaves as the loaded state's Back does.
2. **Given** Carve is loading, **When** it is shown, **Then** the footer offers Back, and the loading text is localised.
3. **Given** Convenience letters was reached with nowhere to go back to, **When** it is shown, **Then** no Back button is rendered, rather than an inert one.
4. **Given** the French locale, **When** Carve is shown, **Then** Back, Skip and Continue are localised under the restored `editor.carve.*` ids.

---

### User Story 6 - The footer still fits (Priority: P3)

The footer keeps its narrow height on desktop. On touch devices it grows only as much as full-size touch targets need. Long labels such as "Discard touch edits & confirm" or "Continue, keeping 12 letters" fit alongside the dots down to narrow widths, and the buttons are never clipped.

**Why this priority**: 057 FR-040 requires that the walk's vertical space is not materially reduced. The issue also asks that any height change be deliberate. It is P3 because it constrains the P1 layout rather than delivering value on its own.

**Independent Test**: Render the footer with the longest nav label set at widths 1600, 1024, 768, 530 and 375 CSS px, with fine and coarse pointers. Measure the footer height, check that no button text is clipped, and check that the current dot stays visible.

**Acceptance Scenarios**:

1. **Given** a fine pointer, **When** any in-scope page is shown, **Then** the footer is 40 px tall.
2. **Given** a coarse pointer, **When** any in-scope page is shown, **Then** the footer is exactly as tall as the 44 px minimum hit target plus its padding (FR-020a), and no taller.
3. **Given** a 375 px viewport and the longest label set, **When** the footer renders, **Then** every nav button's text is fully visible, the project label is hidden, and the dot row shrinks but keeps the current mark in view.

---

### User Story 7 - The dormant inheritance-posture step is consistent when it lands (Priority: P3)

The inheritance-posture step is built but not yet mounted in production. When it is mounted, its Back and Confirm follow the same footer convention.

**Why this priority**: No author sees it today. It is included so that the step does not arrive as the one exception.

**Independent Test**: Mount the step in a test harness and confirm that it publishes its buttons to the footer rather than rendering them in place.

**Acceptance Scenarios**:

1. **Given** the inheritance-posture step is mounted, **When** it renders, **Then** Back and "Confirm and continue" appear in the footer nav cluster.

---

### Edge Cases

- **Step change mid-render**: the footer only renders nav published for the step that is currently active. A publication tagged with any other step is ignored (FR-012).
- **A step publishes no nav**, such as Welcome, Output, or a step outside the scope of this feature: the footer shows no nav cluster, and no fallback Back is invented (FR-013).
- **Modal open** (PhaseF gate, confirm dialogs): the dialog owns focus as it does today. The footer buttons are behind the modal and inert with the rest of the page.
- **Deep-link banner** "Continue from here instead": this is not progress nav. It stays in the step body (FR-004).
- **Start-over buttons in StepHost**: out of scope. They stay where they are.
- **In-page decisions that complete the step**: "Keep all / Keep none" in Convenience, and "Add these rules / Leave my keyboard as it is" in the context-tolerance station. These are answers, not progress nav, so they stay in the body (FR-005).
- **Rebase cancelled from base Confirm**: when the author cancels the rebase confirmation, the footer Confirm returns to its prior state and the step does not advance.
- **Label changes while focused**: when the label on a focused button changes (for example Next becomes Finish, or a count changes), focus stays on the button and the accessible name updates.
- **Footer hidden today** before the journey starts (057 FR-040): if a step publishes nav while the footer would otherwise be hidden, the footer shows (FR-021).
- **Very narrow widths (under about 375 px)**: the nav buttons keep priority, and the dot row may shrink to its minimum viewport. 320 px reflow stays a known gap under the existing 1.4.10 tracker row. This feature must not make it worse (FR-024).

## Requirements *(mandatory)*

### A. Placement

- **FR-001**: On every in-scope step (Appendix A), the progress buttons (Back, secondary forward such as Skip, and primary forward such as Next, Continue, Done, Confirm or Get started) MUST render in the footer's nav cluster and MUST NOT also render in the step body.
- **FR-002**: The footer MUST lay out, left to right and in DOM order: the nav cluster (Back, then secondary, then primary); the project label; the dot row, right-aligned. The single status region keeps its role and its single instance (FR-030). Its visual position is a layout detail, but it MUST NOT come between two nav buttons.
- **FR-003**: The dot row MUST keep its 057 FR-043…FR-047 behaviour and its 079 contract §6 overflow behaviour (horizontal scroll, scroll-to-current on `data-progress-dot-kind="current"`) unchanged.
- **FR-004**: The StepHost deep-link banner ("Continue from here instead"), the StepHost start-over controls, modal dialogs, WelcomeScreen, OutputScreen and the PhaseF gate modal are NOT progress nav and MUST stay where they are.
- **FR-005**: In-page decision buttons, which record an answer and may then complete the step, MUST stay in the step body. These are Convenience "Keep all / Keep none" and the context-tolerance station's "Add these rules / Leave my keyboard as it is". Only buttons whose sole effect is to move the author (back, skip or forward past the current screen) move to the footer.
- **FR-006**: The gallery intro splash's "Get started" MUST be the footer's primary forward action on that screen. *Rationale*: it is the one control that moves the author forward from the splash. Leaving it in the body would reproduce the inconsistency this feature removes.
- **FR-007**: The legacy TrackStep and ProjectNameStep panels are unreachable in production (the live steps are question flows). They MUST NOT be converted. A follow-up to delete them MUST be filed. *Rationale*: converting dead code adds test surface for no author value.

### B. Behaviour parity

- **FR-010**: Every footer nav button MUST have the same label, disabled state, accessible name and `aria-describedby` target as the in-page button it replaces, in every gating state listed in Appendix A.
- **FR-011**: A footer Back MUST invoke the step's own back behaviour, which walks the step's internal cursor (question, station, character or sub-stage) before leaving the step. It MUST NOT bypass that walk by calling the step-boundary back directly.
- **FR-012**: The footer MUST render only nav published for the currently active step. Publications MUST be cleared when a step changes or unmounts, so that no button from a previous step is ever rendered or activatable after the step changes.
- **FR-013**: Each mounted step MUST have exactly one nav publisher, which is the innermost component that owns the walk. Wrapper components that host a question flow (the characters step, identity, PhaseA, the PhaseB manual path, the flow step host) MUST NOT publish. No component may synthesise a default Back on a step's behalf. *Rationale*: a synthesised Back would call the step-boundary handler and violate FR-011. A trap is fixed at the step (FR-015), not papered over by the footer.
- **FR-014**: Non-button advance and back paths MUST keep working unchanged. These are Enter-to-advance (question flows, prefill), auto-advance, auto-complete, auto-back on pop (Convenience), the touch gallery's press-twice confirm, and the base Confirm's rebase-cancel path.
- **FR-015**: Every in-scope step that was reached by moving forward MUST offer a Back in every render state, including loading, error and empty states (base resolution and Carve loading, per A-4). A step with nowhere to go back to MUST render no Back, rather than an inert one (Convenience, per A-3).
- **FR-016**: The press-twice and guarded flows (touch orphaned edits, TouchSeedSource "Discard touch edits & confirm", marks and mechanisms blocked states) MUST keep their warnings in the step body, with identical copy.

### C. Footer frame

- **FR-020**: The footer MUST stay 40 px tall under a fine pointer (057 FR-040, 079 contract §6).
- **FR-020a**: Under a coarse pointer, the footer MAY grow to exactly the house 44 px minimum hit target plus 4 px vertical padding on each side, 52 px in all, and no more. This is a deliberate, recorded change to 079 contract §6 (see Amendments). *Rationale*: every Button carries the house hit-target rule, which is 44 px under a coarse pointer. Exempting the footer buttons from that rule would make the most-used controls in the studio the smallest touch targets. An extra 12 px on touch devices only is not a material reduction of the walk's space.
- **FR-021**: The footer MUST be visible whenever a nav cluster is published, in addition to its existing visibility conditions.
- **FR-022**: Footer nav buttons MUST NOT shrink, wrap or clip their text. When space runs short, the footer MUST give it up in this order: first the project label (ellipsis, then hidden), then the dot row (which shrinks to a minimum viewport that still shows the current mark). The nav cluster is never truncated.
- **FR-023**: The footer nav buttons MUST use a compact visual treatment that fits the frame. They MUST keep the primary / secondary / back visual distinction, meet contrast and focus-visible rules (house rules 4, 6), and keep the hit-target rule (FR-020a).
- **FR-024**: The page body MUST NOT scroll horizontally because of the footer at any width 375 px or above. At narrower widths the footer MUST be no worse than the current 1.4.10 baseline.

### D. Accessibility

- **FR-030**: The footer MUST keep exactly one `role="status"` live region, shared as in 079 contract §9. The nav cluster MUST NOT add a live region.
- **FR-031**: Tab order MUST run from the step content to the footer nav cluster (Back, secondary, primary), then the project label, then the dots. Enter-to-advance MUST be kept wherever it exists today. [NEEDS CLARIFICATION: Is Enter-to-advance plus nav-first-in-footer enough to keep Continue "quick to reach" on long pages such as the mechanism and touch galleries? Or should this feature also add a skip link ("Skip to step navigation") or a keyboard shortcut for the primary action? A skip link would also advance tracker row 2.4.1. A shortcut needs a collision audit against the OSK and text inputs. Proposed default: no new mechanism in this feature, and file a follow-up.]
- **FR-032**: Focus MUST behave as it does today. Within a step, the footer button that was pressed keeps focus across screen changes. On a step change, the footer's nav buttons MUST remount, so focus is not carried into the next step and Enter cannot be repeated onto a step the author has not seen. *Rationale*: this matches current behaviour, where the in-body button unmounts with its step. Moving focus to the new step's heading is a separate improvement and is out of scope.
- **FR-033**: A disabled forward button's "why blocked" reason (marks, mechanism gallery, touch completion gate) MUST stay in the step body and MUST be referenced by the footer button's `aria-describedby`. The question-flow progress description MUST stay mounted, with a unique id, and stay referenced by the footer Next.
- **FR-034**: The nav cluster MUST be a labelled group (for example "Step navigation", via the catalog) inside the footer landmark, so its buttons are identifiable as a set (3.2.3, 3.2.4).
- **FR-035**: Rows 2.4.3, 2.4.11, 2.5.8, 3.2.3 and 3.2.4 of the WCAG tracker MUST be updated with named evidence (tests or a dated manual-walk note). Rows 1.4.10 and 2.4.1 MUST be annotated with this feature's effect. A row flips to `pass` only with evidence (docs/accessibility.md measurement rule 2).
- **FR-036**: The footer nav MUST NOT be covered by any sticky pane, preview overlay or OSK when focused (2.4.11). A footer-rendered button MUST NOT cover the focused element in the step body.

### E. Test handles and i18n

- **FR-040**: Every existing nav `data-testid` MUST be preserved on the footer-rendered button that replaces it (Appendix A, "Existing").
- **FR-041**: Every nav button that has no test handle today MUST gain the stable handle listed in Appendix A ("New"). Test mocks that invented handles the real components never had MUST be updated to use the real ones.
- **FR-042**: A disabled forward button's reason must reach sighted users too. [NEEDS CLARIFICATION: Once the forward button is in the footer, is the in-body "why blocked" hint close enough for a sighted author who sees a greyed Continue at the bottom of the window? Or should the footer also show a short visible cue next to the disabled button (for example a "Why?" link that scrolls to and focuses the hint)? Proposed default: keep the hint in the body only, and link it by `aria-describedby` (FR-033). Revisit after the manual walk.]
- **FR-043**: Every existing nav message id MUST be kept. The strings keep their meaning, so their ids stay (spec 046).
- **FR-044**: Carve's Back, Skip, Continue and loading strings MUST be localised. Back, Skip and Continue MUST reuse the retired `editor.carve.backButton`, `editor.carve.skipButton` and `editor.carve.continueButton` ids, restored with their original source strings, so that the existing Crowdin translations come back. The loading string and the nav group label (FR-034) get new ids that follow the `area.segment` convention.
- **FR-045**: The en and fr catalogs MUST be re-extracted, sorted and linted (`i18n-catalog-sort`, `i18n-catalog-lint`) with the change.

### F. Verification

- **FR-050**: The nav publish/subscribe channel MUST have unit tests covering publish, identity no-op (republishing an equal spec does not notify), clear-on-unmount, the step-id guard (FR-012), and the one-publisher rule (FR-013).
- **FR-051**: Unit tests that render a step on its own MUST be able to find its nav buttons through a shared, opt-in test harness that mounts the footer nav outlet. They MUST NOT each hand-roll a footer.
- **FR-052**: The footer a11y test suite MUST cover the nav cluster: roles, group label, order, disabled state and description, Tab order (nav before dots), and the single status region.
- **FR-053**: The existing E2E suite MUST pass. The only permitted edits are selector scoping where a selector assumed the footer's first button is a dot (Appendix B). Placement assertions (the BaseResolution "Back before search" test) are expected to be rewritten to assert footer placement.
- **FR-054**: The docs/accessibility.md rule 12 keyboard walk MUST be run on the golden path of both tracks, and its outcome recorded in the tracker (FR-035).

### Key Entities

- **Step nav spec**: what one mounted step offers as navigation right now. It has an optional back action, an optional secondary forward action, and an optional primary forward action. Each action carries its label, handler, disabled state, test handle, and optional accessible name and description reference. The spec is tagged with the step it belongs to.
- **Nav publisher**: the single component per mounted step that owns the step's walk and keeps its step nav spec current. It clears the spec when it unmounts.
- **Footer nav cluster**: the footer region that renders the active step's nav spec as a labelled group of buttons, ahead of the project label and the dots.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On 100% of in-scope pages (Appendix A), the progress buttons are in the footer and there are 0 progress buttons in the step body, across a golden-path walk of both tracks.
- **SC-002**: For every Appendix A row and gating state, the footer buttons' label, disabled state, accessible name and description match the pre-change baseline, with 0 regressions.
- **SC-003**: 100% of existing nav test handles resolve to the footer buttons, and 100% of the nav buttons listed as "New" in Appendix A have a handle.
- **SC-004**: The E2E suite passes, and the only diffs are the selector-scoping and placement-assertion edits allowed by FR-053.
- **SC-005**: After 100% of step transitions in the transition test, 0 buttons from the prior step are present, and no page has more than one Back.
- **SC-006**: The footer is 40 px tall under a fine pointer and at most 52 px under a coarse pointer, on every in-scope page.
- **SC-007**: At viewport widths of 375 px and above, 0 nav button labels are clipped and the current dot is visible, with the longest label set.
- **SC-008**: The Carve and base-resolution loading, error and empty states each offer a working Back (4 of 4 states), and no nav label is hard-coded English.
- **SC-009**: Axe reports 0 violations on the footer in its enabled, disabled and blocked states. The rule 12 keyboard walk completes every in-scope step without the mouse.

## Amendments to existing specs

- **079 journey-strip-contract §6** ("fixed 40 px height"): now fixed at 40 px under a fine pointer, and up to 52 px under a coarse pointer (FR-020a). The dot row's never-grow-vertically rule is unchanged.
- **057 FR-040** is not amended. The coarse-pointer growth is recorded here as *not* a material reduction of the walk's space, and 057 FR-040 is cited as the governing constraint.

## Assumptions

- Every in-scope step can express its current nav as a step nav spec. The galleries' existing forward-button specs already have this shape.
- The footer is rendered on every studio route after the step content (StudioShell), including full-screen gallery steps. No layout change is needed to give it its height in those layouts.
- A cross-subtree `aria-describedby` (body hint to footer button) resolves correctly, because both are in the same document.
- The golden-walk and render-smoke contracts (StepHost's direct-parent wrapper) stay as they are. This feature does not touch StepHost's layout wrapper.
- Ownership: Engine team (studio SPA). Nav label wording is unchanged. Any new strings (group label, Carve loading) are Content-reviewed catalog text.

## Out of scope

- Progress buttons on the retired TrackStep and ProjectNameStep panels (FR-007). A deletion follow-up is filed instead.
- PhaseF gate modal, WelcomeScreen ("Continue as guest"), OutputScreen, confirm dialogs (exemplar apply, key-grid confirms), StepHost start-over controls, and the deep-link banner (FR-004).
- In-page decision buttons (FR-005).
- A skip link or keyboard shortcut for the primary action (pending FR-031).
- Moving focus to the new step's heading on a step change (FR-032).
- Meeting 1.4.10 Reflow at 320 px (FR-024).
- Porting the deleted v1 Carve gallery. It was removed after the issue was filed, so that row of the issue is moot.

## Implementation notes (non-normative)

These follow the issue's proposal and existing precedent. Planning may choose otherwise within the FRs.

- **Store**: `stores/stepNavStore.ts`, a plain zustand `create`, modelled on `stepWalkStore.ts`. It would have `publish(stepId, spec)`, `clear(stepId)` and `reset()`, plus an equality guard like `samePositions` so that publishing on every render is a no-op. Handlers would be published as stable wrappers over a ref, following the `startOverStore` writer pattern in StudioShell, and set with `set({ ... })` in object form to avoid the updater-function mix-up that `startOverStore` documents. The store keys by step id, and the footer reads only the active step's entry (FR-012; 057 FR-062).
- **Hook**: `usePublishStepNav(stepId, spec)` publishes in an effect and clears on unmount. The step id comes from the existing location model, not from the component tree.
- **Payload**: `{ back?, secondary?, forward? }`, where each is `{ label, onClick, disabled?, testId, ariaLabel?, ariaDescribedBy? }`. The gallery `ForwardButtonSpec` and `TouchForwardButtonSpec` map onto `forward` directly.
- **One-publisher rule**: mirror the CharactersStep guard that already stops it double-publishing the step walk while its nested question flow publishes.
- **Footer button**: a compact footer treatment of `ui/Button` (a `size` prop or a footer class). It drops the `back` variant's legacy `marginTop` and keeps `.ks-hit-target`. The frame's height switches under `@media (pointer: coarse)`.
- **Test harness**: add an opt-in `withStepNav` option to `src/test/renderWithI18n.tsx` that mounts the footer nav outlet alongside the rendered step, so existing `getByTestId` queries keep working. Update `studioShellMocks` to use the real handles.
- **Remount on step change** (FR-032): key the nav cluster by the active step id.

## Appendix A: Step inventory

Paths are under [packages/studio/src](../../packages/studio/src/). Line numbers are as of 2026-09-25 and are evidence, not requirements. "Existing" lists test handles to preserve (FR-040). "New" lists test handles to add (FR-041).

| # | Step / screen | Current location (file:line) | Buttons today | Existing testids | New testids | Gating to carry over | Local walk (Back goes here first) |
|---|---|---|---|---|---|---|---|
| 1 | Question flows: identity-lite, PhaseA, track, project name, PhaseB manual/text sample, PhaseF help docs | survey/SurveyRunner.tsx:1082-1110 | Back; Next / Finish | `survey-back`, `survey-advance` | none | Back when `cursor>0 \|\| onBack` (:704). Next disabled `!canAdvance` (:708). Label depends on `isLastQuestion` (:715). `aria-describedby={progressDescId}` (:555/:901) | `handleBack` (:842) walks the cursor. Enter (:873-881) skips BUTTON targets. Auto-advance `requestAdvance` (:836). Sole publisher. The wrappers FlowStepHost.tsx:64, IdentityLite :578, PhaseB :1339 and PhaseA render no nav |
| 2 | Characters prefill | survey/Prefill.tsx:195-217 | Back; Confirm and continue | `prefill-back`, `prefill-confirm` | none | none | Enter (:132) |
| 3 | PhaseB intro chooser | survey/PhaseB.tsx:1490-1510 | Back; Continue | `phase-b-intro-next` | `phase-b-intro-back` | none | none |
| 4 | PhaseB build list | survey/PhaseB.tsx:789-795, 910-959 | Back (top); Done (N chars) | `phase-b-done` | `phase-b-back` | `doneDisabled = chars.length===0 \|\| nextGate.blocked` (:764). Plural label. Flag cues at :898-907 stay in the body | Back calls `setDiscoveryMethod(null)` (returns to the intro chooser) |
| 5 | Punctuation | survey/punctuation/PunctuationStep.tsx:482-491, 818-836 | Back (top); Done / Continue without | `punctuation-back`, `punctuation-done` | none | Label is `doneButtonNone` or a plural. Disabled `nextGate.blocked`. `completedRef` guard | none |
| 6 | Invisible characters | survey/invisibles/InvisiblesStep.tsx:273-282, 371-392 | Back (top); Continue (N) | `invisibles-back`, `invisibles-continue` | none | Label depends on count | none |
| 7 | Convenience letters | survey/convenience/ConvenienceCharsStep.tsx:245-247, 339-358 | Back (top, always rendered); Continue (3 variants) | `convenience-continue` | `convenience-back` | Back only when `onBack` is defined (fixes A-3). Three label variants | Auto-complete / auto-back on pop (:186-202). "Keep all/none" stay in the body |
| 8 | Accents and marks | survey/marks/MarksSeriesStep.tsx:1075-1079, 1194-1204 | Back (top); Continue | `marks-continue` | `marks-back` | Disabled `nextGate.blocked` (:761). Blocked hint (:1186-1192, `role=status`) stays in the body and is referenced by `aria-describedby` | `handleStationBack` (:1062) walks stations. Context-tolerance decisions (ContextToleranceStation.tsx:180-190) stay in the body |
| 9 | Base resolution | editors/panels/BaseResolution.tsx:226-237 (Back, top), 301-334 (Confirm, inside search block) | Back; Confirm | `base-back`, `base-confirm` | none | Confirm disabled `previewedBase===null \|\| previewStatus!=="ready"`. Adapter editors/adapters/panelAdapters.tsx:188-228 can cancel via `confirmRebaseTo`. Loading/error/empty early returns (:214-221) must gain Back (A-4). The placement test BaseResolution.test.tsx:139-149 is rewritten | none |
| 10 | Carve (V2) | editors/carve/CarveGalleryV2.tsx:666-694; loading :651-656 | Back; Skip; Continue (header) | `carve-continue` | `carve-back`, `carve-skip` | Hard-coded English. Restore the `editor.carve.backButton` / `skipButton` / `continueButton` ids (FR-044). The loading state gains Back and a localised string | Skip = `keepAll(); onComplete()` |
| 11 | Mechanism gallery | editors/assignLoop/MechanismGallery.tsx:4052-4110 (spec :3790, :3805-3940) | Back; Done / Continue / Next character (4 branches plus hidden) | `mechanisms-continue` | `mechanisms-back`, `mechanisms-next-char` | Back when `onBack \|\| currentIdx>0`. `allCovered`, `unaccountedChars`, `locked`, `canGoNext`, `hasAnotherCharAfterCurrent`. Blocked hint :4121-4133 stays in the body and is referenced | `handleBack` (assignLoop/usePositionalCharNav.ts:232) walks characters |
| 12 | Touch gallery, no-new-chars panel | editors/assignLoop/TouchGallery.tsx:5921-5979 | Back; Done | `touch-continue` | `touch-back` | none | none |
| 13 | Touch gallery, per-character | editors/assignLoop/TouchGallery.tsx:6025-6094 (spec :5571) | Back; Next character / Done | `touch-continue` | `touch-back` (exclusive with row 12) | Back only when the current character is in `touchLettersToAdd`. Position-dependent aria-label. `completionGateNotice` (:5770-5799) stays in the body and is referenced. Stale comment at :6018-6024 | Press-twice `handleContinue` (:4007) on orphaned edits |
| 14 | Touch gallery, key mode | editors/assignLoop/TouchGallery.tsx:6705-6734 | Back; Continue | `touch-key-mode-back`, `touch-key-mode-continue` | none | Continue disabled `unaccountedTouchChars.length>0` | none |
| 15 | Gallery intro splash (both galleries) | editors/assignLoop/IntroSplash.tsx:70-79, 146-162 | Back; Get started | none | `gallery-intro-back`, `gallery-intro-start` | none. Get started is the primary forward action (FR-006) | none |
| 16 | Gallery empty state | editors/assignLoop/parts/GalleryEmptyState.tsx:43-52 | Back only | none | `gallery-empty-back` | none. This page is a dead end, so only Back is shown | none |
| 17 | Touch seed source | editors/touchSeedSource/TouchSeedSourcePanel.tsx:394-404, 500-509 | Back (top); Confirm / Discard touch edits & confirm | `seed-source-back`, `seed-source-confirm` | none | Label depends on `showDraftWarning`. The draft warning (:489) stays in the body | none |
| 18 | Inheritance posture (not mounted) | adaptation/InheritancePostureStep.tsx:183-197 | Back; Confirm and continue | (as present) | as needed | none (US7, P3) | none |
| - | TrackStep, ProjectNameStep | editors/panels/ | - | - | - | Dead code. Not converted (FR-007) | - |

Footer infrastructure (as of 2026-09-25): components/StudioFooter.tsx:262-357 is the footer. It contains the `aria-label` footer, then the project label (max 30%), then the dot row (flex 1, `overflowX:auto`), then the single status span (:354). The frame is 40 px, `flexShrink 0`, `overflow:hidden` (:265-286). The visibility gate is at :259. Auto-scroll-to-current is at :242-253. StudioShell.tsx:1973-2011 renders the footer after the content on every route. Full-screen steps return the step host unwrapped (:1504). Pane steps sit inside `<section aria-label="Survey questions">` (:1521). StepHost.tsx: `handleBack` is at :521, `canGoBack` at :534, the deep-link banner at :564-582, and the render-smoke wrapper at :584-591.

## Appendix B: Known test collisions

- e2e/journey-strip-badges.spec.ts:168 uses `footer.locator('[role="button"], button').first()`, which assumes the first footer button is a dot. The fix is to scope the selector to the dot row (FR-053).
- e2e/footer-progress.spec.ts:106/109 and journey-strip-badges.spec.ts:224 use `footer.getByRole("status")`. These require exactly one status region (FR-030).
- e2e/copy-edit.spec.ts:743-783 (`getByRole("button", {name:"Back", exact:true})`) and exemplar-prefill.spec.ts:128 (`"Back"` `.first()`) must never see a duplicate Back (US3).
- The e2e/footer-progress.spec.ts:120 axe scan now covers the nav cluster (SC-009).
- e2e/helpers/surveyFlow.ts and touchKeyWalk.ts use test handles and the role query `/^(Next character|Done)$/`. Both still work if handles and labels are preserved.
- Unit tests that query nav test handles on standalone steps include StudioShell.test (32, via `studioShellMocks`), MarksSeries (32), PhaseBExemplarPrefill (19), Punctuation (17), CharactersStep (14), BaseResolution (13), and about 20 more. The shared harness (FR-051) covers them. The shared helper is `src/test/renderWithI18n.tsx:44` (127 users). `tests/steps/stepHost.goldenWalk.test.tsx:380-463` clicks one handle per step. The `tests/steps/stepHost.renderSmoke.test.tsx:314-351` direct-parent contract stays.
- components/StudioFooter.a11y.test.tsx:496 asserts "no second aria-live region". It stays true (FR-030).
