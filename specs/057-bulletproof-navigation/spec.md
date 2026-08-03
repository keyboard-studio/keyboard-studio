# Feature Specification: Bulletproof navigation — return where you were, compare without consequence, and jump back to any decision

**Feature Branch**: `057-bulletproof-navigation`

**Created**: 2026-08-03

**Status**: Draft — open clarifications listed below, to be resolved in a clarification session before `/speckit-plan`

**Input**: User description: "I need to be able to jump between the Studio, Preview, Output, Decisions, and flow map tabs and return where I was. Most of the time, returning to Studio puts me back on question one, even though later questions are still filled and things have been chosen. Preview should be renamed to 'Compare', with the purpose of being able to look at another keyboard's implementation, and choices made there should have no effect on the keyboard development flow. Moving around should be bulletproof. Put deep links on the decisions tab to jump back to decision points and revise those choices. I thought Jordan was going to give us breadcrumbs, but they haven't delivered. Add a narrow bottom footer (following the theme) that shows the name of the project and a dot for every completed question (excluding the 'confirm' questions). I want to be able to hover over the dot and return to that question."

## Governing documents

This spec **implements**, and does not restate, the following. On conflict, they win.

- [spec.md](../../spec.md) §8 (data flow) and the v1.3.0 working-copy-spine amendment — a single persistent working copy, instantiated at keyboard selection, mutated by every step, serialized only at output. This feature does not change that model; it fixes the places where *navigation* violates it.
- [specs/026-qu-survey-session-store/](../026-qu-survey-session-store/) — `surveySessionStore` is the single source of truth for wizard traversal (`activeStepId`, `history`, `lastNavigation`). No component may own a competing notion of "where am I in the walk".
- [specs/034-mvp-authoring-walk/](../034-mvp-authoring-walk/) US3 — the durable draft (`TraversalSnapshot` + `WorkingCopySnapshot` + `PhaseBDraftSnapshot` + decision record). Anything this feature adds to "where I was" must round-trip through that envelope or be explicitly declared session-scoped.
- [specs/053-decision-audit/](../053-decision-audit/) and [specs/055-legible-decision-trail/](../055-legible-decision-trail/) — the decision record and the trail. Deep links are an *addition* to the trail surface; the record's append-only model, its supersession chains (FR-015), and the one-diff-per-boundary capture are unchanged. Revising a decision through a deep link is an ordinary revisit that appends a superseding entry — never an edit of history.
- [specs/056-ada-accessibility/](../056-ada-accessibility/) and [docs/accessibility.md](../../docs/accessibility.md) — house rules 2 (no div-buttons), 3 (everything operable by keyboard alone), 4 (focus visible and managed), 6 (contrast, including non-text indicators ≥ 3:1), 7 (colour never carries meaning alone), 9 (name/role/value), 11 (all strings through lingui). The footer dots are the highest-risk surface in this spec against those rules; see FR-042…FR-047.
- [specs/046-i18n-localization/contracts/catalog-format.md](../046-i18n-localization/contracts/catalog-format.md) — message-id rules. An id is a permanent handle; renaming one orphans its translations. The Preview → Compare rename is a *meaning* change, not a wording change, so it takes a new id (see FR-020).
- [specs/047-my-keyboards/](../047-my-keyboards/) — the per-project draft scheme and its display-label precedence. The footer's project name reuses that derivation rather than forking a fourth definition.
- [.specify/memory/constitution.md](../../.specify/memory/constitution.md) Article IV — the single 300 ms debounce cycle. Nothing in this feature validates, so nothing in it may introduce a validation timer. View-state persistence rides the existing autosave/session seams.
- [CLAUDE.md](../../CLAUDE.md) "Conventions" — all route changes go through `navigateTo()` ([packages/studio/src/lib/navigate.ts](../../packages/studio/src/lib/navigate.ts)); do not assign `window.location.hash` in component files. This feature widens `navigateTo`'s vocabulary; it does not add a second router.

## Problem statement

The studio's five top-level tabs behave as if each were a fresh page load of a stateless site. The authoring wizard is not stateless — it is a walk through a manifest with a working copy attached — and the mismatch shows up as the author losing their place, losing work, and being unable to get back to a decision they can plainly see recorded on the Decisions tab.

The reported symptom is precise and worth quoting: *returning to Studio puts me back on question one, even though later questions are still filled and things have been chosen.* That split — position lost, content kept — is the signature of exactly one line of code, and everything else in this spec is either a consequence of it or a surface the author needs once it is fixed.

Alongside that, two tabs are misnamed for what they do. "Preview" is not a preview: it is a second, fully-live authoring surface that writes to the same working copy the wizard is editing, including a base-swap path that offers to discard the author's work. And "Decisions" lists every decision the author made without offering any way to act on one.

### Observed defects

Audited against `main` at commit `70b6c620`, 2026-08-03. Each is evidence for a requirement below, not a task list.

- **D-1 — the wizard resets its traversal on every mount, so leaving the Studio tab restarts the walk.** `SurveyView`'s mount effect calls `useSurveySessionStore.getState().reset()` unless a durable draft happened to be restored at boot ([StudioShell.tsx:452-457](../../packages/studio/src/StudioShell.tsx#L452)). `reset()` clears `activeStepId` back to `"identity"`, empties `history`, and drops `identityResult`, `selectedTrack`, `scaffoldSpec`, `baseConfirmed`, `charactersSubStage`, `touchSeedSource` and `discoveryMethod` ([surveySessionStore.ts:471-486, 562-567](../../packages/studio/src/stores/surveySessionStore.ts#L471)). The working-copy store is a separate singleton and is **not** reset, so the author's answers, carve deletions and assignments all survive. Position lost, content kept — the reported symptom exactly. The behaviour is deliberate and documented ("navigating away and back is a fresh wizard, not a resume", [StudioShell.tsx:103-107](../../packages/studio/src/StudioShell.tsx#L103)); it is the assumption that is wrong, not the implementation of it.

- **D-2 — the reset is then persisted, so the loss survives a reload.** `installDraftAutosave` subscribes the survey-session store and schedules a save on every change ([draftPersistence.ts:872-874](../../packages/studio/src/lib/draftPersistence.ts#L872)). A `reset()` is a change. The next debounced save writes a `TraversalSnapshot` carrying `activeStepId: "identity"` and `history: []` over the one that recorded the real position. The author's place is not merely forgotten for the session; it is overwritten in durable storage.

- **D-3 — three shipped affordances that route into the wizard are structurally broken by D-1.** Each sets the target step and then navigates, and the mount reset immediately discards the target:
  - `OutputScreen.handleGoToGallery` — the coverage-blocked banner's "go finish them now" — calls `backToUnfinishedGallery("mechanisms" | "touch")` then `navigateTo("survey")` ([OutputScreen.tsx:119-133](../../packages/studio/src/components/OutputScreen.tsx#L119)). The author lands on the identity question instead of the gallery they were sent to fix.
  - `ProfileScreen`'s "← Back to studio" ([ProfileScreen.tsx:305-311](../../packages/studio/src/components/ProfileScreen.tsx#L305)).
  - `StepHost`'s Phase-F → `#output` hop ([StepHost.tsx:295](../../packages/studio/src/components/StepHost.tsx#L295)) leaves no way back into the walk that preserves position.

  `MyKeyboardsList.handleResume` is the exception, and it proves the rule: it works only because `resumeProject()` calls `loadDraft()`, which sets the boot flag `wasDraftRestoredThisBoot()` that D-1's guard reads ([draftPersistence.ts:930-946](../../packages/studio/src/lib/draftPersistence.ts#L930)). The comment there describes the workaround in as many words. A navigation primitive that only works if you first perform an unrelated durable-storage read is not a primitive.

- **D-4 — the reset destroys the Phase B alphabet, not just the position.** `reset()` returns `charactersSubStage` to `"prefill"`. Re-confirming the prefill screen calls `resetPhaseBDraft()` ([CharactersStep.tsx:54-60](../../packages/studio/src/survey/CharactersStep.tsx#L54)) — by design, since re-entering the build-list screen is meant to start a fresh alphabet. Composed with D-1, switching to Compare and back mid-characters and continuing forward silently discards every character the author added. This is data loss, not inconvenience, and it is durable via D-2.

- **D-5 — every tab's own view state is component-local, so no tab returns to where it was.** The Flow Map's section sub-tabs (`section` state, [DashboardView.tsx:511-520](../../packages/studio/src/dashboard/DashboardView.tsx#L511)); the Decisions tab's per-stage collapse set and "show replaced decisions" toggle ([DecisionTrailView.tsx:107-112](../../packages/studio/src/decisions/DecisionTrailView.tsx#L107)); the OSK desktop/touch toggle and the resizable pane split on Studio, Preview and Output (`useResizablePanes`, [PreviewScreen.tsx:28-30](../../packages/studio/src/components/PreviewScreen.tsx#L28)); the Preview tab's picker mode, scaffold spec and `.kmn` editor buffer ([usePreviewArtifact.ts:84-88](../../packages/studio/src/hooks/usePreviewArtifact.ts#L84)); and every pane's scroll position. All are `useState` in a component the route switch unmounts.

- **D-6 — the "Preview" tab is a live authoring surface that writes to the shared working copy.** Two write paths, both reachable without warning:
  - `TrackOneIdentityPanel` calls `setIdentity(...)` on the shared working-copy store on every valid change ([TrackOneIdentityPanel.tsx:80, 94](../../packages/studio/src/editors/panels/TrackOneIdentityPanel.tsx#L80)).
  - Picking a *different* base in the tab's own picker reaches `instantiateFromBaseIfConfirmed` ([usePreviewArtifact.ts:172-176](../../packages/studio/src/hooks/usePreviewArtifact.ts#L172)), which pops the rebase-confirm dialog and, on confirm, resets `phaseResults` and `irAxes` — discarding the survey answers. The hook's own comment calls this out as destructive and guards only the same-base case; a genuinely different base is *designed* to fall through.

  A tab named "Preview", which an author will reasonably read as "look, don't touch", is the one place in the studio where a two-click mistake can throw away the session.

- **D-7 — there is no vocabulary for addressing anything smaller than a tab.** `RouteId` is a flat seven-value union and `navigateTo(route)` sets `window.location.hash` ([navigate.ts:8-23](../../packages/studio/src/lib/navigate.ts#L8)). Nothing can name a step, a question, or a decision entry. Consequently the Decisions tab renders rows carrying `stepId` and `payload.questionId` — the exact coordinates a jump would need, already present on every entry ([decisionLogStore.ts:148-157](../../packages/studio/src/decisions/decisionLogStore.ts#L148)) — with no affordance to act on them, and the flow map's walked-path overlay is likewise inert as a navigation surface.

- **D-8 — there is no wayfinding surface at all.** The studio has no breadcrumb (`grep -ri breadcrumb` over `packages/studio` returns nothing) and no footer or status bar (`<footer>` appears once, inside an unrelated panel). The only indication of position is whatever the current step happens to render. An author several tabs deep has no persistent answer to "which project am I in, and how far along am I?".

- **D-9 — the first-visit gate silently discards a deep link.** `hashToRoute` forces a genuine newcomer to `#welcome` and rewrites the address bar to match, dropping whatever location was requested ([StudioShell.tsx:163-183](../../packages/studio/src/StudioShell.tsx#L163)). Today that costs a shared `#survey` link. Once locations name a step or a question, it silently discards strictly more.

The common shape across D-1, D-5 and D-7 is worth naming, because it is what the requirements below are aimed at: **"where the author is" is modelled as component lifetime.** Position survives exactly as long as the component that holds it, and a route change ends that component. Fixing the one reset in D-1 addresses the loudest symptom; it does not, on its own, make navigation bulletproof, because four other kinds of position are held the same way.

## Clarifications

### Deferred — to resolve in a clarification session before planning

The author's brief explicitly defers these ("we'll clarify any open questions later"). Each carries a recommended default so planning is not blocked if a session does not happen; a default that is accepted should be recorded here as an answer rather than left as a default.

- **Q1 — Which questions are "confirm" questions, for the purpose of excluding them from the footer dots?** The codebase has no such category. It has `type: "notice"` nodes (four modules), and seven ids matching `*_confirm`, of which some are substantive questions with recorded answers (`pb_rtl_direction_confirm` is a required boolean that routes the flow) and others are acknowledgement screens (`pb_picker_confirm` is the character grid's "tick everything you use"). **Recommended default:** define the exclusion by *what the question does*, not by its name — a dot exists for every question that produced a recorded decision entry, so `notice` nodes and pure-acknowledgement screens are excluded by construction because they record nothing. Any remaining screen the author considers a "confirm" gets an explicit opt-out flag in its question definition, authored sparsely, in the same spirit as 055's `audit_label`.
- **Q2 — Do the editor stages (carve, mechanisms, touch) get dots?** They are steps, not questions, and the brief says "a dot for every completed question". **Recommended default:** no dot per editor stage in v1; the footer represents question progress only. If stage progress is wanted, it is a second, visually distinct band rather than dots the author cannot distinguish from questions.
- **Q3 — After revising an answer reached by deep link, where does the author land?** Two coherent models: (a) *revise and return* — the author changes the answer, confirms, and returns to the step they came from, with staleness re-propagated; (b) *revise and re-walk* — the answer change puts them back on the walk from that point forward. **Recommended default:** (a) revise-and-return, with an explicit "continue from here instead" affordance. Model (b) as the only option would make a one-field correction cost a full re-walk of everything after it.
- **Q4 — How isolated is the Compare tab?** (a) Read-only: it can load and run another keyboard but exposes no editing controls at all; (b) sandboxed: it may edit its own throwaway copy, which is never serialized and never touches the working copy. **Recommended default:** (a) read-only for v1 — it is the smaller change, it cannot lose work, and it matches the stated purpose ("look at another keyboard's implementation"). (b) can follow if authors ask to experiment there.
- **Q5 — Does the Compare tab remember its selection across tab switches and reloads?** **Recommended default:** across tab switches within a session, yes (it is view state like any other); across reloads, no — it is not part of the project and does not belong in the durable draft.
- **Q6 — Is the footer shown on every tab, including Welcome and Profile?** **Recommended default:** shown on every tab once a project exists; hidden on Welcome (no project yet) and wherever there is no project to name.
- **Q7 — Is a breadcrumb bar in scope alongside the footer, or does the footer subsume it?** The brief mentions breadcrumbs as an unmet expectation rather than as an explicit ask. **Recommended default:** in scope, minimal — a single line naming project → current stage → current question, in the Studio tab's chrome, each segment a link to the corresponding location. It is the "where am I" half; the footer is the "how far along" half, and neither answers the other's question.
- **Q8 — Hover is the stated interaction for the dots. Hover alone is not accessible.** **Recommended default:** hover reveals the question's label; the dot is a real `button` that is tabbable, activates on Enter/Space, and shows the same label to assistive technology as its accessible name. Hover is the shortcut, not the mechanism (see FR-042…FR-047).
- **Q9 — Which view state is session-scoped and which is durable?** **Recommended default:** everything named in FR-030 is session-scoped (survives tab switches, not reloads) except the wizard position and substage, which are already durable via the existing `TraversalSnapshot`. Nothing new is added to the durable envelope in v1.
- **Q10 — Does the browser Back button follow tab switches, deep links, or both?** **Recommended default:** both, because both are `location.hash` changes and the browser will record them whether or not the design acknowledges it. The requirement is that Back must never land the author somewhere the app then silently rewrites (D-9's failure mode).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Leave a tab and come back to exactly where you were (Priority: P1)

An author is on question eleven of the character inventory. They switch to Compare to check how a related keyboard handled a digraph, then switch back to Studio. They are on question eleven, with their answer still in the field and their alphabet intact.

**Why this priority**: This is the reported defect, it causes silent data loss (D-4), the loss is durable (D-2), and it breaks three shipped affordances (D-3). Nothing else in this spec is worth building on top of a wizard that forgets its position.

**Independent Test**: Drive the wizard to any step past the first, navigate to each of the other four tabs in turn, and navigate back. Assert `activeStepId`, `history`, the characters substage, and the Phase B draft alphabet are unchanged each time, and that the durable draft written after the round trip still records the same position.

**Acceptance Scenarios**:

1. **Given** the author is on the mechanisms gallery, **When** they open Output and return to Studio, **Then** they are on the mechanisms gallery with their assignments intact, and Back from there still reaches the step they originally came from.
2. **Given** the author has built a 40-character alphabet on the Phase B build-list screen, **When** they visit Compare and return, **Then** the build-list screen still shows all 40 characters and no prefill screen is interposed.
3. **Given** the author is blocked on Output by inventory coverage, **When** they click "go finish them now", **Then** they land on the gallery that is incomplete — not on the identity question.
4. **Given** the author is mid-walk and has never reloaded the page, **When** they switch tabs twice and then reload the browser, **Then** the restored draft resumes at the step they were on, not at the first question.
5. **Given** the author is on the Profile tab, **When** they click "Back to studio", **Then** they return to the step they left.

---

### User Story 2 - Compare another keyboard without risking your own (Priority: P1)

An author wants to see how an existing keyboard solved a problem they are facing. They open the Compare tab, load that keyboard, type into it, read its `.kmn`, and go back to Studio. Nothing about their own keyboard changed.

**Why this priority**: Same priority as US1 because the current tab can destroy a session in two clicks (D-6), and because the rename is meaningless — arguably worse than no rename — if the tab still writes to the working copy. A tab that says "Compare" and silently rebases the author's project is a trap.

**Independent Test**: Instantiate a working copy, record its full state, then on the Compare tab load a *different* keyboard, exercise every control the tab offers, and assert the working copy's base, identity, phase results, carve layer, assignments and decision record are byte-identical to the recorded state, with no confirmation dialog having been offered.

**Acceptance Scenarios**:

1. **Given** an instantiated working copy with survey answers and carve deletions, **When** the author selects a different keyboard on Compare, **Then** it loads and runs in the Compare pane, no rebase-confirm dialog appears, and the working copy is untouched.
2. **Given** the author is on Compare, **When** they look for identity fields or any control that writes to their project, **Then** none is present.
3. **Given** the author has loaded a keyboard on Compare, **When** they switch to Studio and back, **Then** the same keyboard is still loaded (per Q5's default).
4. **Given** any locale, **When** the author reads the tab bar, **Then** the tab is labelled with the translated equivalent of "Compare", and no surface still calls it "Preview" while meaning this tab.

---

### User Story 3 - Jump from a recorded decision back to the decision point (Priority: P2)

An author reviewing the Decisions tab sees they answered a question one way and wants to change it. They activate the link on that entry, land on that exact question with their current answer shown, change it, and the trail records the revision as superseding the old one.

**Why this priority**: The Decisions tab is already a production surface that names every decision with the coordinates a jump needs (D-7). Without US1 a jump cannot work at all, which is why this sits below it; with US1 it is a small addition to an existing surface with disproportionate value — it is the only route back to an early answer that does not require walking the whole flow backwards.

**Independent Test**: From a completed walk, activate the deep link on an entry from an early step, assert the wizard is on that step and that question with the recorded value present, change the value, and assert the decision record gained a new entry whose `supersedes` names the old one and that downstream steps were marked stale.

**Acceptance Scenarios**:

1. **Given** a trail entry for a survey answer, **When** the author activates its link, **Then** the Studio tab opens on that question with the current answer in the field.
2. **Given** the author changes that answer and confirms, **When** they open the Decisions tab, **Then** a new entry records the new value and the old entry is shown as replaced, exactly as an ordinary revisit would (053 FR-015).
3. **Given** the author changes an answer that later steps depend on, **When** they confirm, **Then** the existing staleness machinery marks the dependent steps stale — no new staleness concept is introduced.
4. **Given** a trail entry for an editor stage rather than a question, **When** the author activates its link, **Then** they land on that stage.
5. **Given** a trail entry whose step is not reachable in the current session (e.g. a step the current track skips), **When** the author activates its link, **Then** they are told why rather than being dropped somewhere arbitrary.

---

### User Story 4 - See the project and its progress at all times, and click back into it (Priority: P2)

A narrow footer sits at the bottom of every screen showing the project's name and one dot per completed question, in the order the author answered them. Hovering a dot names the question; activating it returns to that question.

**Why this priority**: It is the author's persistent answer to "where am I and how far along am I", and it is the second, always-visible route back into the walk. It depends on US1 and shares its jump mechanism with US3.

**Independent Test**: Complete a known number of questions, assert the footer shows exactly that many dots in walk order excluding the categories Q1 settles, assert each dot's accessible name is the question's label, and assert activating one lands on that question.

**Acceptance Scenarios**:

1. **Given** the author has answered eight questions, **When** they look at the footer, **Then** the project name is shown and eight dots are present in the order answered.
2. **Given** the author hovers a dot, **When** the label appears, **Then** it names the question in the active locale.
3. **Given** the author is using a keyboard only, **When** they tab to the footer, **Then** each dot is reachable, its name is announced, and Enter or Space returns them to that question.
4. **Given** the author revises an earlier answer, **When** they return to the footer, **Then** the dot for that question is still a single dot — a revision replaces an answer, it does not add progress.
5. **Given** no project is open, **When** the author is on the Welcome screen, **Then** the footer is absent rather than showing an empty shell (per Q6's default).
6. **Given** a long walk, **When** the dot count exceeds the available width, **Then** the footer degrades legibly and every dot stays reachable, rather than overflowing or silently truncating.

---

### User Story 5 - Each tab remembers its own view (Priority: P3)

Returning to a tab restores what the author had set up there: the Flow Map's section, the Decisions tab's expanded stages, pane splits, OSK mode, and scroll position.

**Why this priority**: Real friction, but the author can re-establish each of these in a click, unlike US1 where the state is unrecoverable. Deliberately last so it cannot delay the fixes above.

**Independent Test**: On each tab, change every restorable view control, navigate away and back, and assert each control's state is as left.

**Acceptance Scenarios**:

1. **Given** the author has expanded three stages on the Decisions tab and revealed replaced decisions, **When** they leave and return, **Then** those stages are still expanded and replaced decisions still shown.
2. **Given** the author has selected the completeness section of the Flow Map, **When** they leave and return, **Then** that section is still selected.
3. **Given** the author has dragged a pane divider and scrolled a long pane, **When** they leave and return, **Then** the split and scroll position are preserved.
4. **Given** the author reloads the browser, **When** the app restores, **Then** view state need not survive (per Q9's default) but the wizard position must.

---

### User Story 6 - Know where you are without leaving the screen (Priority: P3)

A breadcrumb line in the Studio tab names the project, the current stage, and the current question, each segment a link to that location.

**Why this priority**: The brief raises breadcrumbs as an unmet expectation rather than a specified ask, and the footer already delivers the persistent-orientation half. Scoped as P3 and gated on Q7.

**Independent Test**: At three different points in the walk, assert the breadcrumb names the correct project, stage and question, and that activating the stage segment navigates to that stage's first screen.

**Acceptance Scenarios**:

1. **Given** the author is on a question inside the characters stage, **When** they read the breadcrumb, **Then** it reads project → stage → question, with the current question not itself a link.
2. **Given** the author activates the stage segment, **When** the navigation completes, **Then** they are at that stage, and the same revise-or-continue rules as US3 apply.

---

### Edge Cases

- The author deep-links to a question in a step the current track skips (e.g. `project_name` on the adapt track) — the target is named as unreachable rather than being approximated.
- The author deep-links to a step ahead of where they have reached — forward jumps must not bypass a lock or a gate the walk enforces; the request is refused with a reason.
- A restored draft carries a location this build no longer has (a renamed step, a retired question) — the location degrades to the nearest valid ancestor rather than throwing or landing on question one.
- The decision record was truncated or partially unreadable (053 FR-011) — entries that survived still link; entries that did not are not fabricated links.
- The author starts over. Every location, dot, and view state clears with the session; a stale dot pointing into a discarded project is a defect.
- Two tabs of the same browser hold the same project — this feature does not introduce cross-tab coordination, and must not make the existing behaviour worse.
- A first-time visitor opens a shared deep link (D-9) — the welcome gate still applies, but the requested location is honoured after they leave welcome rather than discarded.
- The window is narrow or the author has zoomed to 200% (WCAG 1.4.4) — the footer stays narrow and legible, and does not consume vertical space needed by the walk.
- A question is answered, revised, and revised again — one dot, not three.
- The author navigates with browser Back and Forward across tab switches and deep links — no state is silently rewritten under them.

## Requirements *(mandatory)*

### A. One model of "where the author is"

- **FR-001**: The system MUST hold the author's location — tab, step, and, where applicable, the sub-position within a step — in a single addressable model, not in component lifetime.
- **FR-002**: Switching top-level tabs MUST NOT reset, clear, or otherwise mutate the wizard's traversal state (`activeStepId`, `history`, `lastNavigation`, the characters substage, the fork memories) or any authoring store.
- **FR-003**: The system MUST distinguish *starting a new session* from *navigating within one*. A traversal reset MUST occur only on an explicit start-over or a genuinely new project — never as a side effect of a component mounting.
- **FR-004**: Persistence MUST NOT record a position the author did not navigate to. Any write of the traversal snapshot that would overwrite a real position with an initial one is a defect (D-2).
- **FR-005**: Navigating into the wizard from another tab with a target step already set MUST arrive at that step (D-3), without the caller needing to perform an unrelated durable-storage read first.
- **FR-006**: The system MUST NOT introduce a second router, a second traversal store, or a second notion of the walked path. All top-level navigation continues to flow through the single navigation helper.
- **FR-007**: Re-entering the characters step at its build-list substage MUST NOT clear the Phase B draft alphabet. Clearing remains tied to a genuine prefill → build-list transition, not to a remount (D-4).
- **FR-008**: Every existing entry point that routes into the wizard (the coverage-blocked banner, "Back to studio", "Resume", the Phase F hop) MUST land where it says it lands, and MUST be covered by a test that would fail if a future reset reappeared.

### B. Addressable locations and deep links

- **FR-010**: The system MUST support addressing a location finer than a tab: at minimum a tab, a step within the wizard, and a question within a step.
- **FR-011**: A location MUST be expressible in the browser address bar, shareable, and restorable — subject to the reachability rules in FR-013.
- **FR-012**: Navigating to a location MUST be a single operation with a defined outcome: arrive, or refuse with a stated reason. Partial arrival (right step, wrong question; right tab, reset walk) is not an acceptable outcome.
- **FR-013**: The system MUST refuse a location that is unreachable in the current session — a step the active track skips, a step beyond a lock or gate the walk enforces, a step or question this build no longer has — and MUST state which of those applies rather than approximating.
- **FR-014**: A refused or degraded location MUST NOT leave the author somewhere arbitrary; it MUST land on the nearest valid ancestor location and say so.
- **FR-015**: The first-visit gate MUST preserve the requested location across the welcome screen and honour it once the visitor proceeds, rather than discarding it (D-9).
- **FR-016**: Browser Back and Forward MUST move between locations the author actually visited, and MUST NOT trigger a silent rewrite of the address bar.

### C. The Compare tab

- **FR-020**: The tab currently labelled "Preview" MUST be labelled "Compare" in every author-facing surface, in every locale. Because the tab's *purpose* changes and not merely its wording, the label takes a new message id and the old id is retired per the catalog rules; existing translations of the old id MUST NOT be silently reused for the new meaning.
- **FR-021**: The Compare tab MUST NOT write to the working copy, the survey session, the Phase B draft, or the decision record. No action available on that tab may change the author's project.
- **FR-022**: Selecting a keyboard on the Compare tab MUST NOT instantiate, re-instantiate, or rebase the working copy, and MUST NOT surface a rebase-confirm dialog (D-6).
- **FR-023**: The Compare tab MUST NOT expose controls that edit project identity or project source. Per Q4's default it exposes no editing controls at all; if Q4 resolves to the sandboxed model instead, whatever it exposes MUST operate on a copy that is never serialized and never merged.
- **FR-024**: The Compare tab MUST be able to load and exercise a keyboard the author is *not* authoring — that is its purpose — including running it and reading its source.
- **FR-025**: A test MUST assert the isolation directly: a full working-copy state comparison across an adversarial Compare session (load a different keyboard, exercise every control) with equality required. The absence of a write path is the requirement; a test that only checks the happy path does not establish it.
- **FR-026**: The rename MUST be swept across every surface that names the tab — navigation labels, aria labels, headings, message ids, tests, e2e specs, and documentation — with no surface left calling this tab "Preview". Unrelated uses of the word "preview" (the live OSK inside the Studio tab, the base-preview status store, `usePreviewArtifact`'s role on Output) are NOT in scope for renaming, and the sweep MUST NOT rename them.

### D. Decision deep links

- **FR-030**: Each decision-trail entry that names a survey answer MUST offer an affordance that navigates to that question; each entry that names an editor action MUST offer one that navigates to that stage.
- **FR-031**: Arriving at a question by deep link MUST show the currently-recorded answer, not an empty field and not a re-proposed default.
- **FR-032**: Changing an answer reached by deep link MUST record a superseding entry through the existing append-only path (053 FR-015). No trail entry is edited or removed, and no new supersession concept is introduced.
- **FR-033**: Changing an answer MUST re-propagate consequences through the existing staleness mechanism. This feature adds no second staleness path.
- **FR-034**: After a revision the author MUST be able both to return to where they came from and to continue the walk from the revised point, and the choice MUST be explicit (Q3).
- **FR-035**: Entries whose target is unreachable (FR-013) MUST present the reason in place of a link, rather than a link that fails on activation.
- **FR-036**: The deep-link affordance MUST NOT cause any impact resolution on render — 053's structural guarantee that mounting the trail resolves nothing and expanding one row resolves exactly that row is preserved.

### E. The footer

- **FR-040**: A narrow footer MUST be present on the tabs where a project exists (Q6), styled from the existing theme tokens rather than new hard-coded colours, and MUST NOT materially reduce the vertical space available to the walk.
- **FR-041**: The footer MUST show the project's name, derived through the same precedence the draft layer already uses (scaffold spec display name → identity patch display name → base keyboard display name), not a fourth derivation.
- **FR-042**: The footer MUST show one dot per completed question, in the order the author answered them, excluding the categories Q1 settles. A question that has been revised MUST have exactly one dot.
- **FR-043**: Each dot MUST be a real, individually focusable control with an accessible name naming its question in the active locale — not a decorative element with a hover-only tooltip.
- **FR-044**: Hovering a dot MUST reveal the question's label; the same label MUST be available to keyboard and assistive-technology users without hovering.
- **FR-045**: Activating a dot MUST navigate to that question, using the same mechanism and the same rules as the decision-trail deep links (FR-030…FR-035) — one jump implementation, not two.
- **FR-046**: The dots MUST NOT convey state by colour alone, and their non-text contrast MUST meet the house rule (≥ 3:1). Focus MUST be visible on each dot.
- **FR-047**: When the dot count exceeds the available width the footer MUST degrade legibly and keep every dot reachable — no silent truncation, no horizontal overflow of the page body.
- **FR-048**: All footer strings, including accessible names and tooltips, MUST go through the message catalog.

### F. Per-tab view state

- **FR-050**: Returning to a tab MUST restore, for the current session, at minimum: the Flow Map's selected section; the Decisions tab's per-stage collapse set and replaced-decisions toggle; each screen's pane split; the OSK desktop/touch mode; and each scrollable pane's scroll position.
- **FR-051**: View state MUST be scoped to the session unless Q9 resolves otherwise; it MUST NOT be written into the durable draft in v1.
- **FR-052**: View state MUST clear on start-over, together with the session it belongs to.
- **FR-053**: Restoring view state MUST NOT trigger a recompile, a re-validation, or any authoring side effect.

### G. Breadcrumbs (gated on Q7)

- **FR-060**: The Studio tab MUST show a breadcrumb naming project → current stage → current question.
- **FR-061**: Each breadcrumb segment except the current one MUST navigate to its location under the same rules as FR-030…FR-035.
- **FR-062**: The breadcrumb MUST read from the same location model as everything else (FR-001) — it may not re-derive position from the rendered component tree.

### H. Non-regression

- **FR-070**: The 300 ms validation cycle MUST remain the only validation debounce. Nothing in this feature validates, and nothing in it may add a validation timer.
- **FR-071**: The existing durable-draft envelope MUST continue to round-trip unchanged for drafts written before this feature; a draft carrying no location information MUST restore to the position it already records.
- **FR-072**: Tests that currently encode "navigating away and back is a fresh wizard" MUST be updated to encode the new contract, not deleted. The e2e walk specs' shared helpers MUST be updated in the same change so a tab switch mid-walk is exercised at least once end to end.
- **FR-073**: The message-catalog gates (`i18n-catalog-lint`, `content-i18n-lint`, the collapse guard) MUST pass with the renamed and added ids, and target-locale catalogs MUST not be left claiming a translation for a retired id.

### Key Entities

- **Location**: Where the author is, addressable and shareable. Names a tab; optionally a step within the wizard; optionally a question or sub-position within that step. Has a defined resolution outcome: reachable, unreachable-with-reason, or degraded-to-ancestor.
- **View state**: Per-tab presentation settings that carry no authoring meaning — selected section, collapse sets, pane splits, OSK mode, scroll offsets. Session-scoped; never authoritative for anything the output depends on.
- **Progress dot**: One completed question, as it appears in the footer. Carries the question's location and its author-facing label. Derived from the recorded decisions, not from a parallel counter.
- **Compare session**: A keyboard loaded on the Compare tab for inspection. Has no relationship to the working copy and no path into it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across every ordered pair of top-level tabs, leaving and returning preserves the wizard's step, its history, the characters substage, and the Phase B draft alphabet — 100% of pairs, asserted by test, with zero cases requiring a prior durable-storage read to work.
- **SC-002**: No authoring content is lost by navigation. A tab round trip at any point in the walk changes no authoring store's contents.
- **SC-003**: The durable draft written after a tab round trip records the same position as the one written before it.
- **SC-004**: All four entry points that route into the wizard (coverage banner, "Back to studio", "Resume", Phase F hop) land on their stated target.
- **SC-005**: An adversarial Compare session — loading a different keyboard and exercising every available control — leaves the working copy, survey session, Phase B draft and decision record identical, and raises no confirmation dialog.
- **SC-006**: No author-facing surface in any locale refers to the Compare tab as "Preview" after the rename, and no unrelated use of the word is renamed.
- **SC-007**: Every trail entry whose target is reachable offers a working jump; every entry whose target is not reachable states why. A reader can get from any recorded decision to its decision point, or to a stated reason, in one activation.
- **SC-008**: Revising an answer through a deep link produces exactly one new decision entry linked to the one it replaces, and marks the same steps stale as making the same change in the ordinary walk would.
- **SC-009**: The footer's dot count equals the number of completed, non-excluded questions at every point in a scripted walk, including after revisions.
- **SC-010**: The footer is fully operable by keyboard alone: every dot reachable by Tab, named on focus, activated by Enter and Space, with a visible focus indicator, and the automated accessibility scan reports no new violations on any tab.
- **SC-011**: Restoring a tab's view state performs no compile and no validation run.
- **SC-012**: Opening a shared deep link as a first-time visitor lands on the requested location after the welcome screen, not on the default landing route.

## Assumptions

- The hash-based routing model is retained; this feature widens the location vocabulary rather than replacing the router.
- Location and view state are studio-local. Nothing here is added to the emitted package, the PR body, or any artifact the author ships.
- The working-copy spine is unchanged: one persistent working copy, serialized only at output. The Compare tab sits outside it entirely.
- The decision record remains the source of truth for which questions were answered; the footer derives from it rather than maintaining a parallel progress counter. Answers are recorded at step completion today, so if the footer is required to light a dot the instant a question is answered rather than when its step completes, that is an additional requirement on the recording path and should be raised in the clarification session (the per-question commit signal the runner already emits is the natural seam).
- "Jordan" is not a system component; the breadcrumb work is unowned rather than in flight, and is treated here as new scope gated on Q7.
- Cross-browser-tab coordination, multi-project side-by-side editing, and any change to what the output contains are out of scope.

## Out of scope

- Any change to the emitted keyboard package, the zip, or the managed-PR body.
- Merging or importing anything from a Compare keyboard into the working copy. That is multi-source merge, which spec.md §16 places out of scope for v1.
- Reworking the decision record's model, its truncation rule, or its impact-capture boundary (053/055 own those).
- Replacing the hash router, introducing client-side routing libraries, or changing the URL scheme beyond adding location depth.
- Persisting view state across reloads (deferred by Q9's default).
- Touch-first authoring, which remains out of scope per Decision 6.

## Test surface

Named so planning can size the work; not a task list.

- **Unit**: traversal preserved across simulated route changes; reset occurs only on explicit start-over; location resolution for reachable, unreachable and stale-build targets; footer dot derivation from a fixture decision record, including a revision; project-name precedence.
- **Integration**: each of the four wizard entry points lands correctly; deep link → revise → supersede → staleness; Compare-tab isolation by full store comparison; view-state restoration without a compile.
- **Accessibility**: keyboard-only traversal of the footer and the trail's links; accessible names present and localized; focus visible; automated scan clean on every tab.
- **E2E**: a walk spec that switches tabs mid-flow and continues — the shared helpers in `packages/studio/e2e/helpers/surveyFlow.ts` gain the tab-switch step, and `seedReturningVisitor` interaction with FR-015 is exercised.
- **Existing tests that encode the current contract and must be rewritten rather than removed**: the route/landing tests in `StudioShell.test.tsx`, the substage test in `CharactersStep.test.tsx`, and any preview-screen test that asserts today's shared-store behaviour.
