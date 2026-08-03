# Feature Specification: Bulletproof navigation — return where you were, compare without consequence, and jump back to any decision

**Feature Branch**: `057-bulletproof-navigation`

**Created**: 2026-08-03

**Status**: Clarified 2026-08-03 — Q1, Q2, Q3, Q4 and Q7 resolved in session (see Clarifications), plus the footer's journey model and dot timing. Q5, Q6, Q8, Q9 and Q10 remain on their recommended defaults, each settled by existing architecture or house accessibility rules rather than by an open design choice.

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

- **D-9a — the browser-history bridge is built on the assumption D-1 encodes, so fixing D-1 changes its ground truth.** `useSurveyBrowserHistorySync` pushes one browser entry per manifest-step advance and accepts a `popstate` only when the entry's `ksStep` tag equals the `expectedBackTarget` it predicts from the store ([useSurveyBrowserHistorySync.ts](../../packages/studio/src/hooks/useSurveyBrowserHistorySync.ts)). Its documented design explicitly names the current behaviour as a premise: "hash-route jumps away from `#survey` (this hook is unmounted with `SurveyView`; the returning hashchange remounts `SurveyView` fresh — an existing, unrelated invariant — and this hook's mount effect re-tags the current entry to match)". Once the position survives the round trip, the mount-time re-tag no longer re-tags a *reset* store but a *preserved* one, and the entries pushed before the author left are still on the browser stack. This is not a defect in the hook; it is a coupling that must be re-derived deliberately rather than discovered by a failing walk. The hook is covered by a live e2e spec ([browser-back.spec.ts](../../packages/studio/e2e/browser-back.spec.ts)) and a unit spec, both of which are the early-warning system for getting this wrong.

- **D-9 — the first-visit gate silently discards a deep link.** `hashToRoute` forces a genuine newcomer to `#welcome` and rewrites the address bar to match, dropping whatever location was requested ([StudioShell.tsx:163-183](../../packages/studio/src/StudioShell.tsx#L163)). Today that costs a shared `#survey` link. Once locations name a step or a question, it silently discards strictly more.

The common shape across D-1, D-5 and D-7 is worth naming, because it is what the requirements below are aimed at: **"where the author is" is modelled as component lifetime.** Position survives exactly as long as the component that holds it, and a route change ends that component. Fixing the one reset in D-1 addresses the loudest symptom; it does not, on its own, make navigation bulletproof, because four other kinds of position are held the same way.

## Clarifications

### Session 2026-08-03

- Q: Q7 — Is a breadcrumb bar in scope alongside the footer, or does the footer subsume it? → A: The breadcrumb bar **is** the footer. The footer with its navigation dots serves both purposes — "where am I" and jumping back to previous questions. There is no separate breadcrumb bar.
- Q: When does a footer dot appear, given answers are recorded at step completion? → A: Hybrid — dots derive from recorded decision entries (appearing as steps complete); the current-position marker reads the live question from traversal state. The decision-recording path is not changed.
- Q: Q4 — How isolated is the Compare tab? → A: Read-only. It loads another keyboard, runs it (typing into the OSK is allowed) and shows its source, but exposes no editing controls at all. The isolation is structural — no write path exists — not a guarded one.
- Q: Q3 — After revising an answer reached by deep link, what is the default landing? → A: Revise-and-return — confirming returns the author to the location they jumped from, with staleness re-propagated; an explicit "continue from here instead" affordance is offered. No prompt on every revision.
- Q: Q2 — Do the editor stages get dots, and is the footer only a history of what is done? → A: No — the row is the **whole journey**. It shows dots for completed questions *and* for the stages still to come, so the author sees the shape of what remains. Stages and questions are visually distinguished by size or shape as well as colour.
- Q: Which questions and stages appear in the row? → A: Only those on **this author's path**. Nothing off-path is shown, not even greyed out. The look-ahead is the projected remaining path given the answers so far (the flow map's existing projection, not a second derivation), so when the walk reaches an optional or conditional question the row **grows** to include it.
- Q: Q1 — How is a "confirm" question excluded from the footer dots? → A: By construction only — a dot exists exactly when the question produced a recorded decision entry, so notice nodes and acknowledgement screens are excluded because they record nothing. No opt-out flag is added in v1; none is known to be needed.

### Deferred — to resolve in a clarification session before planning

The author's brief explicitly defers these ("we'll clarify any open questions later"). Each carries a recommended default so planning is not blocked if a session does not happen; a default that is accepted should be recorded here as an answer rather than left as a default.

- ~~**Q1 — Which questions are "confirm" questions, for the purpose of excluding them from the footer dots?**~~ **Resolved 2026-08-03 — see Session above.** By construction only: a dot exists exactly when the question produced a recorded decision entry, so `notice` nodes and pure-acknowledgement screens are excluded because they record nothing, while a substantive question that merely has `confirm` in its id (`pb_rtl_direction_confirm`) correctly keeps its dot. **No opt-out flag is added in v1** — no question is known to need one, so the field would ship unused; it can be added later if a screen turns out to need suppressing.
- ~~**Q2 — Do the editor stages (carve, mechanisms, touch) get dots?**~~ **Resolved 2026-08-03 — see Session above.** Yes. Stages appear in the row, including the ones still ahead of the author, and are visually distinct from question dots by size or shape as well as colour (FR-042, FR-046). The row is the whole journey, path-scoped per FR-049.
- ~~**Q3 — After revising an answer reached by deep link, where does the author land?**~~ **Resolved 2026-08-03 — see Session above.** Revise-and-return is the default, with an explicit "continue from here instead" affordance; see FR-034.
- ~~**Q4 — How isolated is the Compare tab?**~~ **Resolved 2026-08-03 — see Session above.** Read-only; see FR-023. The sandboxed model can follow as its own feature if authors ask to experiment there.
- **Q5 — Does the Compare tab remember its selection across tab switches and reloads?** **Recommended default:** across tab switches within a session, yes (it is view state like any other); across reloads, no — it is not part of the project and does not belong in the durable draft.
- **Q6 — Is the footer shown on every tab, including Welcome and Profile?** **Recommended default:** shown on every tab once a project exists; hidden on Welcome (no project yet) and wherever there is no project to name.
- ~~**Q7 — Is a breadcrumb bar in scope alongside the footer, or does the footer subsume it?**~~ **Resolved 2026-08-03 — see Session above.** The footer *is* the breadcrumb: one strip, carrying both orientation and progress. US6 and FR-060…FR-062 are folded into US4 and section E accordingly.
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

A narrow footer sits at the bottom of every screen showing the project's name and the author's whole journey as a row of dots: one per completed question, a marker for where they are now, and one per stage still ahead on their path. Hovering a dot names its question or stage; activating a reached one returns to it.

**Why this priority**: It is the author's persistent answer to "where am I, how far have I come, and how much is left", and it is the second, always-visible route back into the walk. It depends on US1 and shares its jump mechanism with US3.

**Independent Test**: Complete a known number of questions, assert the row contains exactly those completed questions plus the current-position marker plus the stages still projected on this author's path — with nothing off-path present — assert question and stage dots are distinguishable by size or shape and not by colour alone, assert each dot's accessible name is its question's or stage's label, and assert activating a reached dot lands on it while an upcoming-stage dot is refused with a reason.

**Acceptance Scenarios**:

1. **Given** the author has answered eight questions, **When** they look at the footer, **Then** the project name is shown, eight completed-question dots are present in the order answered, the current position is marked, and the stages still ahead on their path are shown as visually distinct dots.
2. **Given** the author hovers a dot, **When** the label appears, **Then** it names the question or stage in the active locale, and an upcoming stage is identifiable as not yet reached.
3. **Given** the author is using a keyboard only, **When** they tab to the footer, **Then** each dot is reachable, its name is announced, and Enter or Space returns them to that question or stage.
4. **Given** the author revises an earlier answer, **When** they return to the footer, **Then** the dot for that question is still a single dot — a revision replaces an answer, it does not add progress.
5. **Given** no project is open, **When** the author is on the Welcome screen, **Then** the footer is absent rather than showing an empty shell (per Q6's default).
6. **Given** a long walk, **When** the mark count exceeds the available width, **Then** the footer degrades legibly, every mark stays reachable, and the current position stays visible without scrolling — rather than overflowing or silently truncating.
7. **Given** the author reaches an optional question that was not previously on their projected path, **When** it is presented, **Then** a dot for it is appended to the row.
8. **Given** the author's track skips a step, or a branch they did not take contains questions, **When** they look at the footer, **Then** no dot for any of those appears — not even greyed out.
9. **Given** an upcoming-stage dot for a stage behind a gate the walk enforces, **When** the author activates it, **Then** the jump is refused with a stated reason rather than skipping the gate.

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

### User Story 6 - Know where you are now, in the same strip that shows how far you have come (Priority: P3)

**The footer is the breadcrumb** (Q7, resolved). There is no separate breadcrumb bar. The one narrow strip names the project, marks the author's *current* position in the dot row, and lets them jump back to any earlier question — orientation and progress in the same surface.

**Why this priority**: US4 builds the strip; this story is the orientation half of it — the current-position marker and the stage context that answer "where am I" rather than "how far along". Separable because the strip is useful with dots alone, so it must not block US4.

**Independent Test**: At three different points in the walk, assert the footer names the correct project, that the current position is marked distinguishably in the dot row (by more than colour), and that the current question is identifiable by name without hovering.

**Acceptance Scenarios**:

1. **Given** the author is on a question inside the characters stage, **When** they read the footer, **Then** the project is named and the current position is marked in the dot row, distinguishable from completed questions by shape or another non-colour cue as well as colour.
2. **Given** the author is on a question, **When** they inspect the current-position marker by keyboard or assistive technology, **Then** its accessible name identifies the current question, and it is not presented as a jump target to itself.
3. **Given** the author jumps back to an earlier question, **When** the footer re-renders, **Then** the current-position marker has moved to that question and the dots ahead of it are still present (a jump back is not a loss of progress).

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
- **FR-016**: Browser Back MUST remain correct once positions survive tab switches: it MUST step the wizard back through steps the author actually walked, and MUST NOT trigger a silent rewrite of the address bar. The existing history bridge's accepted degrades — a browser Forward is a deliberate no-op, and the first native Back after an in-app Back is absorbed — are NOT reopened by this feature. Changing either is a separate, explicit decision; what this feature MUST NOT do is break them by accident (D-9a).
- **FR-017**: The history bridge's premise MUST be re-derived against the new contract. Its mount-time entry tagging, its back-target prediction, and its handling of entries pushed before the author left the tab MUST be correct when the wizard's position is preserved across a hash-route round trip, and MUST degrade to a no-op — never to a corrupted traversal — for any browser entry it cannot verify.

### C. The Compare tab

- **FR-020**: The tab currently labelled "Preview" MUST be labelled "Compare" in every author-facing surface, in every locale. Because the tab's *purpose* changes and not merely its wording, the label takes a new message id and the old id is retired per the catalog rules; existing translations of the old id MUST NOT be silently reused for the new meaning.
- **FR-021**: The Compare tab MUST NOT write to the working copy, the survey session, the Phase B draft, or the decision record. No action available on that tab may change the author's project.
- **FR-022**: Selecting a keyboard on the Compare tab MUST NOT instantiate, re-instantiate, or rebase the working copy, and MUST NOT surface a rebase-confirm dialog (D-6).
- **FR-023**: The Compare tab MUST expose **no editing controls at all** (Q4 resolved 2026-08-03: read-only). That includes controls that edit project identity or project source. Typing into the loaded keyboard's OSK and reading its source are inspection, not editing, and remain in scope per FR-024. The isolation MUST be structural — no reachable write path — rather than a guarded or flag-gated one, so that FR-025's adversarial test establishes an absence rather than a condition.
- **FR-024**: The Compare tab MUST be able to load and exercise a keyboard the author is *not* authoring — that is its purpose — including running it and reading its source.
- **FR-025**: A test MUST assert the isolation directly: a full working-copy state comparison across an adversarial Compare session (load a different keyboard, exercise every control) with equality required. The absence of a write path is the requirement; a test that only checks the happy path does not establish it.
- **FR-026**: The rename MUST be swept across every surface that names the tab — navigation labels, aria labels, headings, message ids, tests, e2e specs, and documentation — with no surface left calling this tab "Preview". Unrelated uses of the word "preview" (the live OSK inside the Studio tab, the base-preview status store, `usePreviewArtifact`'s role on Output) are NOT in scope for renaming, and the sweep MUST NOT rename them.

### D. Decision deep links

- **FR-030**: Each decision-trail entry that names a survey answer MUST offer an affordance that navigates to that question; each entry that names an editor action MUST offer one that navigates to that stage.
- **FR-031**: Arriving at a question by deep link MUST show the currently-recorded answer, not an empty field and not a re-proposed default.
- **FR-032**: Changing an answer reached by deep link MUST record a superseding entry through the existing append-only path (053 FR-015). No trail entry is edited or removed, and no new supersession concept is introduced.
- **FR-033**: Changing an answer MUST re-propagate consequences through the existing staleness mechanism. This feature adds no second staleness path.
- **FR-034**: After a revision the author MUST be able both to return to where they came from and to continue the walk from the revised point, and the choice MUST be explicit. **The default is revise-and-return** (Q3 resolved 2026-08-03): confirming the changed answer returns the author to the location they jumped from, and "continue from here instead" is offered as an explicit alternative rather than as a prompt on every revision. The jump therefore MUST carry its origin location so the return has a target.
- **FR-035**: Entries whose target is unreachable (FR-013) MUST present the reason in place of a link, rather than a link that fails on activation.
- **FR-036**: The deep-link affordance MUST NOT cause any impact resolution on render — 053's structural guarantee that mounting the trail resolves nothing and expanding one row resolves exactly that row is preserved.

### E. The footer

- **FR-040**: A narrow footer MUST be present on the tabs where a project exists (Q6), styled from the existing theme tokens rather than new hard-coded colours, and MUST NOT materially reduce the vertical space available to the walk.
- **FR-041**: The footer MUST show the project's name, derived through the same precedence the draft layer already uses (scaffold spec display name → identity patch display name → base keyboard display name), not a fourth derivation.
- **FR-042**: The footer's dot row MUST be a **whole-journey** strip, not a history: it shows where the author has been, where they are, and what is still to come. It carries three classes of mark, in journey order (resolved 2026-08-03):
  - **Completed question** — one dot per completed question, in the order answered. Derived from the recorded decision entries, so a dot exists exactly when the question recorded one; `notice` nodes and pure-acknowledgement screens are therefore excluded by construction, with no exclusion list to maintain (Q1 resolved 2026-08-03). A dot appears when its step completes and the answer is recorded; the decision-recording path is NOT changed to commit per question. A question that has been revised MUST have exactly one dot.
  - **Current position** — the author's live position, per FR-060, read from traversal state rather than from the record, so it is per-question accurate even inside a step whose answers are not yet recorded.
  - **Upcoming stage** — the stages still ahead of the author on their projected path, so the strip shows the shape of the remaining journey rather than ending at the present moment.
- **FR-043**: Each dot MUST be a real, individually focusable control with an accessible name naming its question or stage in the active locale — not a decorative element with a hover-only tooltip. An upcoming-stage dot MUST announce that it is not yet reached, so its name is not mistaken for completed progress.
- **FR-044**: Hovering a dot MUST reveal its label; the same label MUST be available to keyboard and assistive-technology users without hovering.
- **FR-045**: Activating a *reached* dot MUST navigate to that question or stage, using the same mechanism and the same rules as the decision-trail deep links (FR-030…FR-035) — one jump implementation, not two. Activating an **upcoming-stage** dot MUST NOT jump forward past a lock or gate the walk enforces: it is refused with a reason under FR-013's `beyond-gate`, exactly as a forward deep link is.
- **FR-046**: The dots MUST NOT convey class or state by colour alone. Question dots and stage dots MUST differ by **size or shape as well as colour**, and the current-position marker MUST likewise carry a non-colour cue. Non-text contrast MUST meet the house rule (≥ 3:1), and focus MUST be visible on every dot.
- **FR-047**: The row is longer than a completed-only row would be, since it includes the journey ahead. When the mark count exceeds the available width the footer MUST degrade legibly and keep every mark reachable — no silent truncation, no horizontal overflow of the page body, and the current position MUST remain visible without the author having to scroll to find it.
- **FR-048**: All footer strings, including accessible names and tooltips, MUST go through the message catalog.
- **FR-049**: The dot row MUST be scoped to **this author's path**, and MUST grow as the path resolves:
  - a. A question or stage that is **not on the author's path** MUST NOT get a dot — not now and not as a greyed-out placeholder. A step the active track skips, a branch not taken, and a question behind an unmet condition are all absent from the row rather than shown as unreachable.
  - b. The look-ahead MUST be derived from the **projected remaining path given the answers so far**, not from the full manifest. The flow map already computes this projection; the footer MUST read that same derivation rather than forking a second one.
  - c. When the walk reaches an **optional or conditional** question that was not previously known to be on the path, its dot MUST be **appended** to the row at that point. The row therefore lengthens during the walk, and that is expected — not a defect.
  - d. When a branch resolves such that previously-projected stages are no longer on the path, their dots MUST leave the row. Dots for questions already **completed** MUST NOT be removed by a later branch change; only the not-yet-reached look-ahead is re-projected (FR-063 already forbids a jump from truncating completed progress).

### F. Per-tab view state

- **FR-050**: Returning to a tab MUST restore, for the current session, at minimum: the Flow Map's selected section; the Decisions tab's per-stage collapse set and replaced-decisions toggle; each screen's pane split; the OSK desktop/touch mode; and each scrollable pane's scroll position.
- **FR-051**: View state MUST be scoped to the session unless Q9 resolves otherwise; it MUST NOT be written into the durable draft in v1.
- **FR-052**: View state MUST clear on start-over, together with the session it belongs to.
- **FR-053**: Restoring view state MUST NOT trigger a recompile, a re-validation, or any authoring side effect.

### G. Orientation — the footer as breadcrumb (Q7 resolved)

There is no separate breadcrumb bar. These requirements constrain the same footer section E specifies.

- **FR-060**: The footer MUST mark the author's current position in the dot row, so the strip answers "where am I" as well as "how far along". The marker MUST be distinguishable from a completed-question dot by a non-colour cue as well as colour (FR-046 applies to it unchanged).
- **FR-061**: The current-position marker MUST NOT be a jump target to itself, and its accessible name MUST identify the current question. Every *other* dot navigates under the same rules as FR-030…FR-035 and FR-045 — one jump implementation, still not two.
- **FR-062**: The footer MUST read position from the same location model as everything else (FR-001) — it may not re-derive position from the rendered component tree.
- **FR-063**: Jumping back MUST NOT remove the dots ahead of the landing point. A jump is navigation, not a truncation of progress; only an answer change (FR-033's staleness) has downstream consequences.

### H. Non-regression

- **FR-070**: The 300 ms validation cycle MUST remain the only validation debounce. Nothing in this feature validates, and nothing in it may add a validation timer.
- **FR-071**: The existing durable-draft envelope MUST continue to round-trip unchanged for drafts written before this feature; a draft carrying no location information MUST restore to the position it already records.
- **FR-072**: Tests that currently encode "navigating away and back is a fresh wizard" MUST be updated to encode the new contract, not deleted. The e2e walk specs' shared helpers MUST be updated in the same change so a tab switch mid-walk is exercised at least once end to end.
- **FR-073**: The message-catalog gates (`i18n-catalog-lint`, `content-i18n-lint`, the collapse guard) MUST pass with the renamed and added ids, and target-locale catalogs MUST not be left claiming a translation for a retired id.

### Key Entities

- **Location**: Where the author is, addressable and shareable. Names a tab; optionally a step within the wizard; optionally a question or sub-position within that step. Has a defined resolution outcome: reachable, unreachable-with-reason, or degraded-to-ancestor.
- **View state**: Per-tab presentation settings that carry no authoring meaning — selected section, collapse sets, pane splits, OSK mode, scroll offsets. Session-scoped; never authoritative for anything the output depends on.
- **Progress dot**: One mark in the footer's journey row. Has a **class** — completed question, current position, or upcoming stage — which determines both how it is drawn (size or shape, never colour alone) and whether it is a jump target. Carries its location and its author-facing label. Completed-question dots derive from the recorded decisions, not from a parallel counter, so they appear when their step completes; upcoming-stage dots derive from the projected remaining path.
- **Projected path**: The steps and questions this author will still walk, given the answers so far. Supplies the footer's look-ahead and is the reason a dot row can grow (an optional question is reached) or shrink at its tail (a branch resolves away). Read from the flow map's existing projection rather than re-derived. Nothing off this path is ever shown in the row.
- **Current-position marker**: Where the author is *now*, shown in the same footer strip as the dots (FR-060). Derived from traversal state, not from the decision record, so it is per-question live even inside a step whose answers are not yet recorded. Not a jump target to itself (FR-061).
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
- **SC-009**: At every point in a scripted walk, the footer's row contains exactly: one dot per completed non-excluded question, the current-position marker, and one dot per stage still ahead on the projected path — with nothing off-path present, including after revisions and after a branch resolves. Reaching an optional question appends its dot; the completed-question dots are never removed by a later re-projection.
- **SC-010**: The footer is fully operable by keyboard alone: every dot reachable by Tab, named on focus, activated by Enter and Space, with a visible focus indicator, and the automated accessibility scan reports no new violations on any tab.
- **SC-011**: Restoring a tab's view state performs no compile and no validation run.
- **SC-012**: Opening a shared deep link as a first-time visitor lands on the requested location after the welcome screen, not on the default landing route.
- **SC-013**: A browser-level walk that switches tabs mid-flow completes to a downloadable artifact, and the two gating E2E specs are demonstrated red against `main` and green after the fix, with both runs' output recorded.
- **SC-014**: The native Back sequence in `browser-back.spec.ts` passes with a tab round trip inserted mid-walk, proving the history bridge survives a preserved position (FR-017).

## Assumptions

- The hash-based routing model is retained; this feature widens the location vocabulary rather than replacing the router.
- Location and view state are studio-local. Nothing here is added to the emitted package, the PR body, or any artifact the author ships.
- The working-copy spine is unchanged: one persistent working copy, serialized only at output. The Compare tab sits outside it entirely.
- The decision record remains the source of truth for which questions were answered; the footer derives its dots from it rather than maintaining a parallel progress counter. Answers are recorded at step completion, and that timing is retained (resolved 2026-08-03): dots appear as steps complete. The footer therefore has two sources by design — the record for *progress* (the dots) and traversal state for *position* (FR-060's current-position marker). Neither is a parallel counter of the other, and the recording path is untouched, so 053's capture boundary and supersession chains are unaffected.
- "Jordan" is not a system component; the breadcrumb work is unowned rather than in flight. Q7 resolved it into the footer rather than as a separate bar, so there is no distinct breadcrumb deliverable.
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

- **Unit (vitest)**: traversal preserved across simulated route changes; reset occurs only on explicit start-over; location resolution for reachable, unreachable and stale-build targets; footer row derivation — completed dots from a fixture decision record including a revision, look-ahead dots from a fixture projected path, path-scoping (nothing off-path), row growth when an optional question is reached, and tail re-projection when a branch resolves (FR-049); project-name precedence; the history bridge's tag/prediction behaviour under a preserved position (FR-017).
- **Integration (vitest + Testing Library)**: each of the four wizard entry points lands correctly; deep link → revise → supersede → staleness; Compare-tab isolation by full store comparison; view-state restoration without a compile.
- **Accessibility**: keyboard-only traversal of the footer and the trail's links; accessible names present and localized; focus visible; the axe scan clean on every tab.
- **Existing tests that encode the current contract and must be rewritten rather than removed**: the route/landing tests in `StudioShell.test.tsx`, the substage test in `CharactersStep.test.tsx`, `useSurveyBrowserHistorySync.test.ts`, and any preview-screen test asserting today's shared-store behaviour.

Unit and integration work is where most of this feature is *proven*. E2E is where it is *demonstrated* — a tab round trip is a browser-level event, and the position loss this spec exists to fix is only fully real once a browser has done it.

## Playwright E2E process

This feature is the first one whose central claim ("moving around is bulletproof") can only be demonstrated in a browser, so the E2E process is specified rather than left to the implementer. It rides the existing harness — one runner package, one config, one set of helpers — and adds no second lane.

### Harness as it stands

- Runner: the `playwright` devDependency of `@keyboard-studio/studio`. Specs import from `"playwright/test"`. **Do not** add `@playwright/test` as a second runner package ([playwright.config.ts](../../packages/studio/playwright.config.ts) states this; CLAUDE.md repeats it).
- Config: `testDir: "e2e"`, `baseURL: http://localhost:5273`, a 240 s per-test timeout, and a `webServer` block that runs `pnpm dev` with `reuseExistingServer: true`.
- Helpers: [e2e/helpers/surveyFlow.ts](../../packages/studio/e2e/helpers/surveyFlow.ts) (16 exported step drivers, from `seedReturningVisitor` and `driveIdentityLite` through `navigateToOutput` and `triggerDownload`) and [e2e/helpers/axe.ts](../../packages/studio/e2e/helpers/axe.ts) (`expectNoSeriousAxeViolations`, gating `serious`/`critical` only, per spec 056 FR-003).
- E2E is deliberately excluded from both CI lanes — vitest excludes `e2e/**`, and tsc's include does not cover `e2e/**` or `playwright.config.ts`. Browser runs are a separate step.

### Commands

Run from `packages/studio` unless noted.

| Purpose | Command |
|---|---|
| One-time browser binaries (repeat per version bump) | `npx playwright install chromium` |
| Whole E2E suite | `pnpm --filter @keyboard-studio/studio test:e2e` (repo root) |
| One spec | `npx playwright test e2e/tab-roundtrip.spec.ts` |
| One test by title | `npx playwright test e2e/tab-roundtrip.spec.ts -g "returns to the same step"` |
| Watch the browser | `npx playwright test e2e/tab-roundtrip.spec.ts --headed` |
| Step through interactively | `npx playwright test e2e/tab-roundtrip.spec.ts --debug` |
| Author selectors against a live app | `npx playwright codegen http://localhost:5273` |
| Post-run report | `npx playwright show-report` |
| Trace a failure | `npx playwright test --trace on` then `npx playwright show-trace <trace.zip>` |

Notes that save an afternoon: the first test in a run pays a cold `../keyboards` catalog enumeration plus a kmcmplib WASM compile, which is why the timeout is 240 s — later tests are much faster because the dev server caches the catalog. `reuseExistingServer: true` means a `pnpm dev` you already have running is used as-is, so a stale build can silently be what you tested; restart it after engine changes.

### Required new specs

- **`e2e/tab-roundtrip.spec.ts` (US1, gating).** Drive the walk to a mid-flow step, then round-trip through each of the other four tabs in turn, asserting after each return: same step on screen, in-app Back still reaches the prior step, and — for the characters case — the built alphabet intact. This is the spec that would have caught the reported defect, and it must fail against `main` before it passes. Reuse `seedReturningVisitor` + `driveIdentityLite` + `pickBaseKeyboard` + `chooseAdaptTrack`; the tab switches themselves become a new shared helper (`switchTab`) rather than inline hash assignments in each spec.
- **`e2e/compare-isolation.spec.ts` (US2, gating).** Establish a working copy, snapshot the observable project state through the app's own surfaces, run an adversarial Compare session (load a *different* keyboard, exercise every control the tab offers), return, and assert the project is unchanged and no rebase-confirm dialog ever appeared. Model the adversarial shape on the two existing base-switch specs ([switch-base-exploration.spec.ts](../../packages/studio/e2e/switch-base-exploration.spec.ts), [switch-base-rebase.spec.ts](../../packages/studio/e2e/switch-base-rebase.spec.ts)) — they already encode what a rebase prompt looks like from the outside.
- **`e2e/decision-deeplink.spec.ts` (US3).** Complete a walk, open Decisions, activate the link on an early answer, assert arrival on that question with the recorded value present, change it, and assert the trail shows the supersession and the dependent steps went stale.
- **`e2e/footer-progress.spec.ts` (US4).** Assert the row's full composition against a scripted walk — completed-question dots in order, the current-position marker, and the upcoming-stage dots for this author's path with nothing off-path present; assert question and stage dots are distinguishable by size or shape, not colour alone; drive the footer **keyboard-only** (Tab to a dot, assert its accessible name, activate with Enter) and assert arrival; assert a revision does not add a dot; assert reaching an optional question appends one; assert an upcoming-stage dot behind a gate is refused with a reason.

### Specs that must be extended, not left alone

- [browser-back.spec.ts](../../packages/studio/e2e/browser-back.spec.ts) — the direct guard on D-9a/FR-017. Extend it with a tab round trip in the middle of its walk, so the native Back sequence is exercised against a *preserved* position rather than only a fresh one. Its existing assertion that browser Forward is a no-op stays as-is; FR-016 keeps that degrade deliberate.
- [copy-edit.spec.ts](../../packages/studio/e2e/copy-edit.spec.ts) and the two touch-derivation walks — add one tab round trip mid-walk so the long walks prove position survival incidentally, the way they already prove autosave incidentally.
- [locale-switch.spec.ts](../../packages/studio/e2e/locale-switch.spec.ts) — extend to cover the Compare label in a non-English locale (FR-020/SC-006).
- Every touched spec calls `expectNoSeriousAxeViolations` on the screens it visits, including the footer once it exists.

### Gating policy

- **FR-080**: The two gating specs (`tab-roundtrip`, `compare-isolation`) MUST be written to fail against `main` before the fix lands, and that failure MUST be recorded — an E2E spec that has never been seen red is not evidence.
- **FR-081**: E2E stays out of the unit CI lanes, matching current house arrangement. A green E2E run is a named prerequisite for closing this feature, produced by a deliberate run and reported with its output, not assumed.
- **FR-082**: New E2E steps MUST land in `e2e/helpers/surveyFlow.ts` rather than being copy-pasted per spec — the helper module is the reason the existing walks survived the spec 036 question-reordering, and a tab-switch step is exactly the kind of thing that will need to change in one place later.
- **FR-083**: No spec added by this feature may be committed `.skip`-ped. If a lane is not ready, the spec is not written yet; a skipped spec reads as coverage and is not.
