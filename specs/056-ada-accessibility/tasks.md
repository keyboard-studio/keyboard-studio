# Tasks: ADA / WCAG 2.2 AA Accessibility Baseline

**Feature**: 056-ada-accessibility · **Branch**: `056-ada-accessibility` (see "Branch note" below)
**Inputs**: [spec.md](spec.md), [wcag-2.2-aa-tracker.md](wcag-2.2-aa-tracker.md), [docs/accessibility.md](../../docs/accessibility.md)

**Size**: `normal` (no `size` recorded in `.spec-context.json`) — full phased list.

All paths are repo-relative. Every task names the concrete file it creates or edits.

**Format**: `- [ ] **T###** [P] [US#] Description · path`
`[P]` = independent of the other tasks in its wave (different file, no incomplete dependency), so it can be built in any order or in parallel. A wave of one carries no `[P]`.

---

## Plan basis — read this before starting

**There is no `plan.md` for this feature.** `.spec-context.json` records `plan` as complete at 2026-08-04T22:50:20Z, but no plan artifact was ever written and none exists in git history. This list is therefore derived from [spec.md](spec.md)'s own **"Cycle roadmap (the plan)"** section, which is an explicit, ordered plan, plus the per-criterion state in [wcag-2.2-aa-tracker.md](wcag-2.2-aa-tracker.md). Authoring a separate `plan.md` would duplicate that roadmap and create the divergent-copy problem [CLAUDE.md](../../CLAUDE.md) warns about, so the roadmap section stays the single plan of record. If a reviewer wants a formal `plan.md` with a Constitution Check, run `/speckit.plan` before Phase 1 — nothing below assumes its absence.

Constitution surface, checked by hand against the roadmap: this is studio + tooling work inside the engine team's boundary (spec §12), **no `Pattern`/`Criterion` contract change**, and the one binding invariant is **D3** — FR-008's announcements ride the existing 300 ms validation debounce and MUST NOT add a validation-adjacent timer.

## The honest starting state

Cycle 1 **partially** landed in commit `9715df34` — the two automated gates are live (FR-002 jsx-a11y at error severity in `pnpm lint`; FR-003 `@axe-core/playwright` serious/critical assertions via [packages/studio/e2e/helpers/axe.ts](../../packages/studio/e2e/helpers/axe.ts)), plus a batch of a11y fixes and the six `n/a` media rows.

**Cycle 1's measurement did not land.** The tracker reads `pass 0 · fail 0 · n/a 6 · unknown 49 · compliance 0/49 = 0%`, because the walk-spec axe lane never ran in this branch (the `../keyboards` corpus is absent from the dev container) and no manual pass has happened. So:

- **FR-004 is open** — 49 rows are still `unknown`.
- **SC-001 is unmet** (rows remain `unknown`; the canary has not been demonstrated).
- **SC-002 is unmet** — 0%, not the >=35% Cycle 1 target.

Phase 1 below is that missing measurement, and it **blocks the >=60% promise arithmetically**: `pass / applicable` cannot be claimed against a denominator that has not been confirmed. Do not reorder it behind the fix work.

**Denominator, fixed:** 55 A+AA criteria, 6 confirmed `n/a`, **49 applicable**. SC-003's promise is therefore **>= 30 of 49 verified `pass`**.

## Branch note (blocks `/speckit.implement`)

The working branch is `057-bulletproof-navigation`; no `056-ada-accessibility` branch exists locally or on `origin`. `.specify/scripts/bash/check-prerequisites.sh` derives `FEATURE_DIR` from the current branch, so it currently resolves to `specs/057-bulletproof-navigation` — **`/speckit.implement` will read the wrong feature's tasks until the branch is switched.** Per [CLAUDE.md](../../CLAUDE.md)'s branch policy this work wants its own branch anyway (`km/056-cycle-2-a11y` for a km-lead cycle, or `056-ada-accessibility` to satisfy the spec-kit path derivation — the latter if you want the tooling to resolve without a `--paths-only` override).

---

## Phase 1: Baseline audit and the honest denominator

**Purpose**: close FR-004 and produce the Cycle 1 measurement. **Blocks every fix phase** — a fix with no baseline cannot be scored, and SC-006 ("compliance never decreases") has no floor to hold until this exists.

**Environment precondition (this is why Cycle 1 stalled):** T001 needs the sibling `../keyboards` checkout present and pointed at the `keyboard-studio/keyboards` fork's `master`, plus `npx playwright install chromium` for the pinned Playwright version. Run it in the corpus-having lane, not the dev container.

**Wave 1 — independent (different evidence files, no shared code):**

- [x] **T001** [P] [US2] Run the full walk-spec axe lane and capture the output verbatim, per screen: `pnpm --filter @keyboard-studio/studio test:e2e`. The scans already exist at every screen the four walk specs plus [boot-smoke.spec.ts](../../packages/studio/e2e/boot-smoke.spec.ts) visit — this task **runs and records**, it does not add assertions. Record `minor`/`moderate` findings too: [axe.ts](../../packages/studio/e2e/helpers/axe.ts) deliberately gates only `serious`/`critical`, so the sub-threshold findings are baseline data that never reaches CI output. Also enumerate the live per-node exclusions (`grep -rn "DEBT" packages/studio/e2e/`) so each one is re-audited rather than inherited · `specs/056-ada-accessibility/evidence/cycle1-axe-baseline.md`
- [x] **T002** [P] [US1] Perform the Cycle 1 **keyboard-only manual walk** of the Track 1 (adapt-from-base) route, pointer input unused, and record dated per-criterion findings (FR-012, US1's Independent Test). Cover every stop from the welcome screen through survey composite widgets to output; for each of 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11, 3.2.1, 3.2.2 write pass/fail **with the screen and control that decided it**. This pass is the only evidence that can flip those rows — automated tooling cannot · `specs/056-ada-accessibility/evidence/cycle1-keyboard-walk.md`
- [x] **T003** [P] Resolve the statically-decidable rows with a named check each, so they stop consuming manual-audit time: 2.1.4 (grep for single-key key handlers outside a text field), 2.2.1 / 2.2.2 (grep for `setTimeout`/`setInterval`/session expiry driving content or timing — note that [draftPersistence.ts](../../packages/studio/src/lib/draftPersistence.ts)'s autosave/sync timers change no content and impose no time limit), 2.3.1 (grep for animation/flash), 2.5.4 (grep for device-motion listeners), 1.4.5 (record the reasoning that rendered glyphs are text content, not images of text), 1.3.4 (no orientation lock in [index.html](../../packages/studio/index.html) or CSS), 2.4.5 (record honestly whether a linear wizard qualifies for the "Multiple Ways" exception — do not claim `n/a` without the WCAG-stated basis). Each row gets the literal command or file cited, not a belief · `specs/056-ada-accessibility/evidence/cycle1-static-checks.md`

**Wait for T001, T002 and T003, then — sequential (all three touch the tracker or its issue links):**

- [ ] **T004** Flip **all 49 applicable rows** out of `unknown` to `pass` (evidence pointer named), `fail` (issue link) or `n/a` (justification plus its invalidating condition), per FR-004. Two rows have their answer already and must not be recorded optimistically: **1.4.3 is a `fail`** — [contrastDebt.ts](../../packages/studio/e2e/helpers/contrastDebt.ts) enumerates live offenders (OSK iframe, SignUpPanel button, OskModeToggle pair, glyph key-chip spans, LintChip code badges) currently excluded per-node; and **1.1.1 / 4.1.2 are partial at best** — the character-map cells and glyph cells expose raw glyphs plus hex codepoints, not Unicode names (see T019). A row with an exclusion standing against it is not a `pass` · `specs/056-ada-accessibility/wcag-2.2-aa-tracker.md`
- [ ] **T005** File one `bug(studio)` issue per `fail` row and link it from that row (SC-005). The 1.4.3 issue is **already drafted and unfiled** at [specs/057-bulletproof-navigation/reviews/056-contrast-issue-draft.md](../057-bulletproof-navigation/reviews/056-contrast-issue-draft.md) — file that one rather than writing a second; [contrastDebt.ts](../../packages/studio/e2e/helpers/contrastDebt.ts)'s header comment already promises it exists · `specs/056-ada-accessibility/wcag-2.2-aa-tracker.md`
- [ ] **T006** Recompute the tracker summary line (`pass / (55 - n/a)`) and state **whether SC-002's >=35% was actually met**. If it was not, say so in the summary with the reason — an unmet interim target recorded honestly is the contract this spec opened with; a quietly restated target is the failure mode · `specs/056-ada-accessibility/wcag-2.2-aa-tracker.md`

**Checkpoint**: zero `unknown` rows, the denominator is confirmed at 49, every `fail` has an issue, and Cycle 1's real percentage is on record. SC-001's tracker half is now satisfiable; its canary half is T028.

---

## Phase 2: Foundational shared primitives

**Purpose**: the structural and mechanical pieces **both** US1 and US2 consume. Everything here is small, cross-cutting, and would otherwise be re-solved per component.

Every user-visible or screen-reader-only string added in this phase and below goes through the lingui pipeline per **FR-010** — `t`/`<Trans>` with an id matching `area ( "." segment )+`, then `pnpm --filter @keyboard-studio/studio messages:extract`. See [specs/046-i18n-localization/contracts/catalog-format.md](../046-i18n-localization/contracts/catalog-format.md).

**Wave 1 — independent (different files):**

- [ ] **T007** [P] [US2] Add the document structure [StudioShell.tsx](../../packages/studio/src/StudioShell.tsx) lacks today: a `<main>` landmark, a skip-to-content link as the first focusable element, and exactly one `<h1>` per screen. Verified absent — the shell renders `<nav>` and an `<h2>` but no `main`, no `h1`, no skip link (2.4.1, 1.3.1, 2.4.6) · `packages/studio/src/StudioShell.tsx`
- [ ] **T008** [P] [US2] Add a `useDocumentTitle(title)` hook and drive it from the active route/step, so the SPA's title changes per screen. [index.html](../../packages/studio/index.html) sets a single static `Keyboard Studio` and **nothing in `src/` ever assigns `document.title`** — a one-title SPA fails 2.4.2 for a screen-reader user navigating by title · `packages/studio/src/lib/useDocumentTitle.ts`
- [ ] **T009** [P] [US2] Sync the `<html lang>` attribute to the lingui active locale (3.1.1). `lang="en"` is hardcoded in [index.html](../../packages/studio/index.html), so switching to `fr` leaves the announcement synthesizer on English. Extend [locale-switch.spec.ts](../../packages/studio/e2e/locale-switch.spec.ts) to assert the attribute follows the switch · `packages/studio/src/lib/i18n.ts`
- [ ] **T010** [P] [US2] Create the single `aria-live` announcement primitive — one polite region mounted once in the shell plus an `announce(message)` entry point (FR-008). **D3 constraint, non-negotiable**: it rides the existing 300 ms validation debounce and introduces **no timer of its own**. Existing scattered regions ([DiagnosticsPanel.tsx](../../packages/studio/src/components/DiagnosticsPanel.tsx), [KmnEditor.tsx](../../packages/studio/src/components/KmnEditor.tsx), [BaseKeyboardPicker.tsx](../../packages/studio/src/components/BaseKeyboardPicker.tsx)) are **not** deleted here — they are correct in place; this primitive is for outcomes with no owning panel (autosave state, cross-pane results). Migrating any of them is out of scope · `packages/studio/src/lib/announce.tsx`
- [ ] **T011** [P] [US1] Make the focus indicator universal instead of opt-in. `.ks-focus-ring:focus-visible` exists in [index.css](../../packages/studio/src/index.css) but every control must remember to carry the class; add a baseline `:focus-visible` rule so a control that forgets still gets a visible ring, and keep `.ks-focus-ring` as the stronger explicit form (2.4.7, 1.4.11). Note the inline-style hazard already documented in that file: an inline `boxShadow` beats a class selector, so audit for controls that set one · `packages/studio/src/index.css`

**Wait for T004 (the 1.4.3 verdict) and T005 (the filed issue), then:**

- [ ] **T012** [US2] Fix contrast at the **token** level, not per component (FR-009). Compute the ratios for the dark palette in [index.css](../../packages/studio/src/index.css) — `--subtle: #8493b6` and `--muted: #aebcd6` against `--bg: #15203a` / `--card: #1f2c49` are the first suspects — and raise the failing tokens rather than patching call sites. Then fix each offender named in [contrastDebt.ts](../../packages/studio/e2e/helpers/contrastDebt.ts) (`SHARED_CHROME_DEBT`, `OUTPUT_SCREEN_DEBT`, `GLYPH_KEY_CHIP_DEBT`, `LINT_CHIP_DEBT`) and the severity palette in `packages/studio/src/lint/colors.ts` · `packages/studio/src/index.css`
- [ ] **T013** [US2] Retire the exclusion entries T012 fixed: delete them from [contrastDebt.ts](../../packages/studio/e2e/helpers/contrastDebt.ts) and the spec-local `KNOWN_CONTRAST_DEBT` lists (e.g. in [carve.spec.ts](../../packages/studio/e2e/carve.spec.ts)) so the axe gate actually scans those nodes. `OSK_IFRAME_DEBT` **stays** — KeymanWeb's own markup is not authored here; convert its comment into a permanent third-party justification rather than an open debt. 1.4.3 flips `fail` -> `pass` only when this file holds nothing but that justified exclusion · `packages/studio/e2e/helpers/contrastDebt.ts`

**Checkpoint**: structure, title, `lang`, announcement channel, focus visibility and contrast tokens are in place. Both stories can proceed independently from here.

---

## Phase 3: User Story 1 — Keyboard-only author completes a full authoring walk (P1)

**Goal**: every interactive element on both tracks is reachable, operable and visibly focused, with composite widgets on their ARIA APG keyboard pattern (FR-005).
**Independent test**: the Track 1 walk completes with pointer input unused (SC-004).

**Already conformant — do not rebuild.** [SelectMenu.tsx](../../packages/studio/src/ui/SelectMenu.tsx) is on the APG listbox pattern (portalled `<ul role="listbox">`, `tabIndex={-1}`, `aria-activedescendant`, keyboard handling on the list). [RadioGroup.tsx](../../packages/studio/src/ui/RadioGroup.tsx) wraps native radios in `role="radiogroup"` (native arrow-key semantics). [MultiSelect.tsx](../../packages/studio/src/ui/MultiSelect.tsx) is `role="group"` over native checkboxes. Verify these against T002's findings; only change what the walk actually caught.

**Wave 1 — independent (different files):**

- [ ] **T014** [P] [US1] Put the character-map grid on the APG grid pattern with **roving tabindex**: [CharacterMapGroupSection.tsx](../../packages/studio/src/survey/characterMap/CharacterMapGroupSection.tsx) renders `role="group"` around one `<button>` per cell, so a block puts hundreds-to-thousands of stops in the tab sequence. Arrow keys move within the grid, Tab enters and leaves it. Per the spec's edge case, a virtualized row must not strand `aria-activedescendant` on an unmounted node — if that risk is real here, prefer roving `tabIndex` over `aria-activedescendant` · `packages/studio/src/survey/characterMap/CharacterMapGroupSection.tsx`
- [ ] **T015** [P] [US1] Audit dismiss-and-return focus behaviour on every transient surface — [SearchFiltersPopover.tsx](../../packages/studio/src/survey/characterMap/SearchFiltersPopover.tsx), [ConfirmDialog.tsx](../../packages/studio/src/editors/assignLoop/parts/ConfirmDialog.tsx), [SelectMenu.tsx](../../packages/studio/src/ui/SelectMenu.tsx): Escape dismisses, focus returns to the invoking control, and a modal dialog traps focus **within itself while open** while nothing traps focus permanently (US1 scenario 2, 2.1.2, 1.4.13). Note that `SelectMenu` portals its list to `document.body`, so "return focus to trigger" cannot rely on DOM ancestry · `packages/studio/src/survey/characterMap/SearchFiltersPopover.tsx`
- [ ] **T016** [P] [US1] Verify no context change fires on focus alone and no unexpected change on input (3.2.1, 3.2.2) across the survey: check [SurveyRunner.tsx](../../packages/studio/src/survey/SurveyRunner.tsx) and [PhaseB.tsx](../../packages/studio/src/survey/PhaseB.tsx) for auto-advance on selection and for popovers that open and move focus on focus-in. Where auto-advance exists, either remove it or make it an explicit user action (US1 scenario 3) · `packages/studio/src/survey/SurveyRunner.tsx`
- [ ] **T017** [P] [US1] Ensure a focused element is never fully hidden by the sticky panes or preview overlay (2.4.11) — check the three-pane shell's sticky chrome and the `scroll-margin` on focusable content in the scrolling pane · `packages/studio/src/StudioShell.tsx`

**Wait for T014 through T017, then:**

- [ ] **T018** [US1] Write the keyboard-only walk spec that is SC-004's evidence: drive the Track 1 walk to output using **key events only** — no `click()`, no `fill()` — asserting a visible focus indicator at each stop and no trap. Build it on the shared drivers in [helpers/surveyFlow.ts](../../packages/studio/e2e/helpers/surveyFlow.ts) (call `seedReturningVisitor(page)` before `page.goto`, or the first-visit welcome gate diverts the walk) and reuse `selectMenuOption` rather than re-deriving the portalled-listbox query. Do not add it to a walk spec that also clicks — a mixed spec cannot prove "zero pointer events" · `packages/studio/e2e/a11y-keyboard-walk.spec.ts`

**Checkpoint**: US1 is independently verifiable. Expected flips: 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11, 3.2.1, 3.2.2 (plus 2.4.1, 2.4.6 from T007).

**Deferred by the spec, not overlooked:** 2.5.7 (dragging alternatives) and 2.5.8 (target size) are Cycle 3 per the roadmap and sit **outside** the >=60% promise. [index.css](../../packages/studio/src/index.css)'s `.ks-hit-target` already raises coarse-pointer targets to 44 px, which is a head start, not a pass — 2.5.8 applies regardless of pointer type.

---

## Phase 4: User Story 2 — Screen-reader user perceives structure, state and results (P2)

**Goal**: name/role/state programmatically exposed and kept in sync, codepoint-derived text alternatives everywhere a glyph renders, and asynchronous outcomes announced (FR-006, FR-007, FR-008).
**Independent test**: a scripted NVDA or VoiceOver pass over the welcome screen, one composite-widget survey step, and diagnostics.

**Wave 1 — independent (different files):**

- [ ] **T019** [P] [US2] Route glyph accessible names through [codepointLabel](../../packages/studio/src/survey/codepointLabel.ts) (FR-007). This is a **confirmed live gap**, not a hypothesis: character-map cells build `aria-label={`${actionLabel} ${cell.char} (${cp})${baseOutputHint}`}` ([CharacterMapGroupSection.tsx](../../packages/studio/src/survey/characterMap/CharacterMapGroupSection.tsx):228) and glyph cells build `aria-label={`${display} — ${keys.join(' ')}`}` ([GlyphCell.tsx](../../packages/studio/src/editors/assignLoop/parts/GlyphCell.tsx):81) — both a raw glyph plus a bare hex codepoint, exactly what the spec's US2 scenario 2 forbids. `codepointLabel` is currently consumed by only three components ([PhaseB.tsx](../../packages/studio/src/survey/PhaseB.tsx), [ConvenienceCharsStep.tsx](../../packages/studio/src/survey/convenience/ConvenienceCharsStep.tsx), [RemovalBanner.tsx](../../packages/studio/src/editors/assignLoop/parts/RemovalBanner.tsx)); extend it to the cells, [GlyphCell.tsx](../../packages/studio/src/editors/assignLoop/parts/GlyphCell.tsx) and [KeyCap.tsx](../../packages/studio/src/editors/assignLoop/parts/KeyCap.tsx). The name must derive from the codepoint even when the glyph is tofu or PUA · `packages/studio/src/survey/characterMap/CharacterMapGroupSection.tsx`
- [ ] **T020** [P] [US2] Add `lang` and `dir` to sample text, autonym fields and script previews (3.1.2), so a screen reader switches synthesizer and an RTL sample renders correctly inside the LTR shell. The language tag is available from the survey answers and the langtags lookup — do not guess from the script · `packages/studio/src/survey/PhaseB.tsx`
- [ ] **T021** [P] [US2] Announce autosave and cloud-sync state through T010's `announce()` (FR-008, 4.1.3). The persistence timers in [draftPersistence.ts](../../packages/studio/src/lib/draftPersistence.ts) (`AUTOSAVE_DEBOUNCE_MS`, `CLOUD_SYNC_DEBOUNCE_MS`) are outside D3's scope and already exist — announce off their **existing** completion, adding no timer · `packages/studio/src/components/ResumeDraftBanner.tsx`
- [ ] **T022** [P] [US2] Verify validator diagnostics are identified in text and carry the fix suggestion they already hold (3.3.1, 3.3.3), and that severity is never conveyed by colour alone (1.4.1). [DiagnosticsPanel.tsx](../../packages/studio/src/components/DiagnosticsPanel.tsx) already has `aria-live="polite"`; confirm the announcement actually fires on the D3 cycle rather than only on mount, and that `packages/studio/src/lint/LintChip.tsx` pairs its colour with text or an icon · `packages/studio/src/components/DiagnosticsPanel.tsx`

**Wait for T019 through T022, then — sequential (the sweep reads the fixed state; the manual pass reads both):**

- [ ] **T023** [US2] Name/role/value and state-sync sweep of every custom widget under [packages/studio/src/ui/](../../packages/studio/src/ui/) plus the assign-loop parts (FR-006, 4.1.2): each exposes an accessible name, the right role, and current state, and the exposed state changes **with** the visual state. Watch the `aria-pressed` toggles ([GlyphCell.tsx](../../packages/studio/src/editors/assignLoop/parts/GlyphCell.tsx):82, cells at :227) — a pressed style that outlives its `aria-pressed` is the classic desync. Add or extend component tests asserting state via role queries · `packages/studio/src/ui/`
- [ ] **T024** [P] [US2] Reflow, zoom and text-spacing checks (1.4.4, 1.4.10, 1.4.12): the three-pane shell at 320 CSS px, 200% zoom without loss of content or function, and the WCAG text-spacing overrides applied without clipping. Record measurements, not impressions · `specs/056-ada-accessibility/evidence/cycle2-reflow-zoom.md`
- [ ] **T025** [P] [US2] Run the **manual NVDA or VoiceOver pass** over the P2 scenario set and record dated findings (FR-012, Cycle 2's required manual pass): welcome screen, one composite-widget survey step, diagnostics view. Verify a diagnostic produced mid-pass is announced **without focus movement** — the one thing no automated check covers. Name the tool and version; per the spec's assumptions, one of the two is the gate, both is a nice-to-have · `specs/056-ada-accessibility/evidence/cycle2-screenreader-pass.md`

**Checkpoint**: US2 is independently verifiable. Expected flips: 1.1.1, 1.3.1, 1.3.2, 1.4.1, 1.4.4, 1.4.10, 1.4.12, 1.4.13, 3.1.1, 3.1.2, 3.3.1, 3.3.2, 3.3.3, 4.1.2, 4.1.3.

---

## Phase 5: User Story 3 — Regressions are caught by machines, not by users (P3)

**Goal**: the Cycle 1/2 gains stay won. **Mostly landed already** (FR-002 and FR-003 shipped in `9715df34`); what remains is the proof and the durability work.

**Wave 1 — independent (different files):**

- [ ] **T026** [P] [US3] Demonstrate the canary SC-001 asks for and record it: introduce a `div` with `onClick` and an `img` without `alt` into a studio component, show `pnpm lint` failing **with rule name and location**; introduce a contrast violation on a walk-spec screen, show the axe assertion failing **naming the violating node**; revert both. Without this, "the gates are live" is an unverified claim (US3's Independent Test) · `specs/056-ada-accessibility/evidence/cycle1-canary.md`
- [ ] **T027** [P] [US3] Document the new patterns this feature establishes in [docs/accessibility.md](../../docs/accessibility.md) house rules, so AI-assisted contributions inherit them (FR-011's mechanism is already wired from [CLAUDE.md](../../CLAUDE.md)): the `announce()` primitive and its D3 constraint, codepoint-derived names as the only source for glyph labels, roving tabindex for large grids, contrast fixed at token level, and the rule that a per-node axe exclusion needs a criterion, a reason and a tracker row · `docs/accessibility.md`
- [ ] **T028** [P] [US3] Extract the exclusion inventory into something re-auditable (the spec's "Exclusion" key entity: enumerable by grep). Add a check — or at minimum a documented `grep` recipe in the tracker — that every live exclusion selector maps to a named criterion and a non-`pass` tracker row, so a fixed offender's exclusion cannot silently outlive it · `specs/056-ada-accessibility/wcag-2.2-aa-tracker.md`
- [ ] **T029** [P] [US3] Run `pnpm --filter @keyboard-studio/studio messages:extract` and `pnpm lint` to confirm every string added in Phases 2-4 is in the catalogs with a conforming id, and that `i18n-catalog-lint` / `content-i18n-lint` are clean (FR-010). Requires Node >= 22.19 — on an older Node `lingui` exits 0 having written nothing and the lint then misreports catalogs · `packages/studio/src/locales/en/messages.json`

**Checkpoint**: the gates are proven, documented, and the exclusion set cannot rot.

---

## Phase 6: Cycle close and the SC-003 measurement

**Sequential — each reads the previous result.**

- [ ] **T030** Re-run the whole automated lane (`pnpm lint`, `pnpm test`, `pnpm --filter @keyboard-studio/studio test:e2e`) in the corpus-having environment and confirm the walk-spec axe scans are green with the T013-reduced exclusion set · `specs/056-ada-accessibility/evidence/cycle2-final-run.md`
- [ ] **T031** Update every tracker row the fix phases touched, each with its named evidence — a committed test file, a CI-gating check, or a dated line in one of the Phase 1/4 evidence files. A row with no pointer stays non-`pass` · `specs/056-ada-accessibility/wcag-2.2-aa-tracker.md`
- [ ] **T032** Recompute the summary and **state the SC-003 result plainly**: `pass / 49`, and whether it reached the promised **>= 30 (>= 60%)**. If it fell short, record the count, the specific rows that did not flip, and why — the spec's honesty contract makes an unmet promise reportable, not restatable. Cross-check SC-005 (every `fail` has an open issue) and SC-006 (the percentage did not decrease from T006's figure) · `specs/056-ada-accessibility/wcag-2.2-aa-tracker.md`
- [ ] **T033** Reconcile the tracked issue's acceptance-criteria checkboxes against what shipped and open the PR with `closes`/`refs` chosen by that reconciliation, per [CLAUDE.md](../../CLAUDE.md)'s issue closure policy. Partial closure is normal here — Cycle 3's long tail (2.5.7, 2.5.8, 3.2.3, 3.2.4, 3.2.6, 3.3.4, 3.3.7, 3.3.8, 1.3.5, 2.4.5) is explicitly out of this cycle's scope · no file change

---

## Dependencies

```
Phase 1 (T001-T003 parallel) -> T004 -> T005 -> T006     [the denominator; blocks scoring everything]
                                  |
                                  v
Phase 2  T007-T011 parallel (independent of Phase 1)
         T004+T005 -> T012 -> T013                        [contrast: verdict, then fix, then un-exclude]
                                  |
                +-----------------+-----------------+
                v                                   v
Phase 3 (US1)  T014-T017 parallel -> T018     Phase 4 (US2)  T019-T022 parallel -> T023, T024, T025
                                  |                                   |
                                  +-----------------+-----------------+
                                                    v
Phase 5 (US3)  T026-T029 parallel  ->  Phase 6  T030 -> T031 -> T032 -> T033
```

- **T007-T011 do not wait for Phase 1.** They are unambiguous defects (no `main`, no `h1`, no skip link, one static title, hardcoded `lang`) whose verdict the baseline cannot change. Start them in parallel with the audit.
- **T010 blocks T021** (autosave announcements need the primitive) but not T022 (DiagnosticsPanel has its own region already).
- **T012 blocks T013**, and T013 is what actually flips 1.4.3 — the fix without the un-exclusion leaves the gate blind.
- **Phase 3 and Phase 4 are independent of each other** and can run as two parallel tracks after Phase 2.
- **T025 (the manual screen-reader pass) is a human task** and is the long-lead item in Phase 4. Schedule it early even though it must run after T019-T022 to be meaningful.

## Parallel execution notes

- Phase 1's three tasks touch three different evidence files and no source — genuinely concurrent.
- Phase 2 Wave 1 touches five distinct files ([StudioShell.tsx](../../packages/studio/src/StudioShell.tsx), a new hook, [i18n.ts](../../packages/studio/src/lib/i18n.ts), a new primitive, [index.css](../../packages/studio/src/index.css)) — concurrent, though T007 and T017 both edit `StudioShell.tsx`, so serialize those two.
- Phase 3 and Phase 4 Wave 1 both touch [CharacterMapGroupSection.tsx](../../packages/studio/src/survey/characterMap/CharacterMapGroupSection.tsx) (T014 the grid pattern, T019 the cell name) — **serialize T014 before T019**, or land them as one change.
- Both stories touch [GlyphCell.tsx](../../packages/studio/src/editors/assignLoop/parts/GlyphCell.tsx) (T019 the name, T023 the `aria-pressed` sync) — T019 first.

## Implementation strategy

**Minimum honest increment**: Phase 1 alone. It closes FR-004, fixes the denominator, and turns "0%" into a real number — the only deliverable here that is worthless if deferred, because every later percentage claim depends on it.

**The >=60% promise (SC-003)**: Phase 1 -> Phase 2 -> Phase 3 + Phase 4 -> Phase 6. Phase 5 makes it durable but moves the number very little (automated tooling detects roughly 30-40% of violations, which is why Phases 3 and 4 are predominantly manual work rather than more tooling).

**Do not** claim a row `pass` from a fix alone. The spec's numerator rule is `pass` **with named evidence** — a CI-gating check, a committed test, or a dated manual-audit note. An unverified fix leaves its row `unknown`, and `unknown` counts as non-compliant.
