# Feature Specification: ADA / WCAG 2.2 AA Accessibility Baseline

**Feature Branch**: `056-ada-accessibility`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Get us started on ADA compliance and make a plan that will honestly hit more than 60% of compliance after a couple of cycles. Add the resources and craft the spec."

**Governing docs**: ADA compliance maps to WCAG 2.2 Level AA conformance (rationale, resources, and house rules in [docs/accessibility.md](../../docs/accessibility.md)). Per-criterion state lives in [wcag-2.2-aa-tracker.md](wcag-2.2-aa-tracker.md), the single source of truth for the compliance percentage. This spec cites spec.md §4 (SPA overview) and decision D3 (single 300 ms validation debounce) rather than re-deriving them.

## The honesty contract

"More than 60% compliance" is only a meaningful promise if the denominator and the evidence rules are fixed in advance:

- **Denominator**: the 55 WCAG 2.2 A+AA success criteria. Criteria exit the denominator only via a justified `n/a` row in the tracker, confirmed during the Cycle 1 baseline audit (expected: the five prerecorded/live media criteria and audio control, leaving ~49 applicable).
- **Numerator**: criteria whose tracker row is `pass` **with named evidence** — a CI-gating automated check, a committed test, or a dated manual-audit note. Unverified beliefs stay `unknown` and count as non-compliant.
- **Target**: after Cycle 2, `pass / applicable ≥ 60%` — i.e. **at least 30 of ~49 applicable criteria verified passing**. Automated tooling alone cannot reach this (it detects roughly 30–40% of violations), which is why Cycle 2 is predominantly manual keyboard/screen-reader work rather than more tooling.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keyboard-only author completes a full authoring walk (Priority: P1)

A keyboard author who cannot or does not use a pointer — a screen-reader user, a switch-device user, or simply a keyboard-first power user — opens the studio, gets through the welcome screen, selects a base keyboard, answers the survey (including composite widgets: select menus, radio groups, multi-selects, the character map), reviews diagnostics, and reaches output, using only the keyboard.

**Why this priority**: Operability is the largest single cluster of WCAG failures in AI-authored UIs, it is untestable by automated tools beyond trivial cases, and it is this product's most on-brand obligation — the users are keyboard authors. Criteria 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11, 3.2.1, 3.2.2 all hang off this walk.

**Independent Test**: Complete the Track 1 (adapt-from-base) walk from the E2E suite start-to-finish with pointer input disabled; every interactive element en route is reachable, operable, and visibly focused.

**Acceptance Scenarios**:

1. **Given** a fresh session at the welcome screen, **When** the author navigates using only Tab/Shift-Tab/Enter/Space/arrow keys, **Then** they can reach the survey's first question with focus visibly indicated at every stop and no focus trap anywhere en route.
2. **Given** an open composite widget (SelectMenu, MultiSelect, RadioGroup, character-map grid, SearchFiltersPopover), **When** the author operates it per its ARIA APG keyboard pattern and dismisses it with Escape, **Then** the widget behaves per the pattern and focus returns to the invoking control.
3. **Given** any screen in the walk, **When** focus lands on a control, **Then** merely receiving focus never triggers a context change (no auto-advance, no popover auto-open that moves focus).

---

### User Story 2 - Screen-reader user perceives structure, state, and results (Priority: P2)

A screen-reader user (NVDA or VoiceOver) can identify where they are (page title, landmarks, headings), what each control is and does (name, role, value — including character/codepoint content, which must expose Unicode names rather than bare glyphs), and hears asynchronous results (validation diagnostics from the debounced compile cycle, autosave state) without hunting for them.

**Why this priority**: Perceivability failures make the app unusable rather than merely awkward, but most of the structural half (labels, roles, landmarks, contrast) is cheaply verifiable by automated scans — so it lands in Cycle 1, with the announcement/state-sync half verified manually in Cycle 2.

**Independent Test**: A scripted NVDA pass over the welcome screen, one survey step containing composite widgets, and the diagnostics view; every control announces a name/role/state, and a validation diagnostic produced during the pass is announced without focus movement.

**Acceptance Scenarios**:

1. **Given** any studio screen, **When** a screen-reader user requests the landmarks/headings list, **Then** the page exposes a title, a `main` landmark, and a heading hierarchy matching the visual structure.
2. **Given** a character-map cell or key cap showing a glyph (including PUA codepoints), **When** a screen reader focuses it, **Then** it announces a human-readable character name, not silence or a raw codepoint.
3. **Given** the author edits a value that triggers the D3 validation cycle, **When** diagnostics arrive, **Then** an `aria-live` region announces the outcome (riding the existing debounce — no new timer), and severity is not conveyed by color alone.

---

### User Story 3 - Regressions are caught by machines, not by users (Priority: P3)

A developer (human or AI) introducing an accessibility defect — an unlabeled input, a click-only `div`, an invalid ARIA attribute, a contrast failure — gets it flagged at `pnpm lint` or by the e2e suite before merge, and can consult [docs/accessibility.md](../../docs/accessibility.md) house rules for the fix.

**Why this priority**: The gate does not itself move the compliance number much (automated ceiling ~30–40%), but it makes Cycle 1/2 gains durable. Without it, every subsequent feature erodes the audit.

**Independent Test**: Introduce a `div` with `onClick` and an `img` without `alt` into a studio component; `pnpm lint` fails. Introduce a contrast violation on a walk-spec screen; the axe e2e assertion fails.

**Acceptance Scenarios**:

1. **Given** a JSX accessibility defect of a class jsx-a11y detects, **When** `pnpm lint` runs, **Then** the build fails with the rule name and file location.
2. **Given** the four live Playwright walk specs, **When** they run, **Then** each key screen passes an axe scan with zero `serious`/`critical` violations, and the scan failure output names the violating nodes.

---

### Edge Cases

- **Glyph rendering vs. accessible names**: many characters the studio displays have no font coverage on the test machine (tofu) or are PUA. The accessible name must come from the codepoint data (existing [codepointLabel](../../packages/studio/src/survey/codepointLabel.ts)), never from the rendered glyph.
- **The character map is large**: thousands of cells. Roving tabindex / `aria-activedescendant` per the APG grid pattern, not thousands of tab stops; virtualized rows must not strand `aria-activedescendant` on an unmounted node.
- **RTL and complex-script sample text** inside an otherwise-LTR UI: text samples and autonym fields need `lang`/`dir` attributes (3.1.2) so screen readers switch synthesizers correctly.
- **axe false positives on intentionally exotic content**: sample-text panels may trip color-contrast heuristics on decorative script previews; exclusions must be per-rule, per-node, and commented in the spec file — never a blanket disable.
- **N/A drift**: a future feature adding audio (e.g. keypress sounds) re-enters 1.4.2 into the denominator; the tracker's n/a justifications state their invalidating condition.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST carry a per-criterion WCAG 2.2 A+AA conformance tracker ([wcag-2.2-aa-tracker.md](wcag-2.2-aa-tracker.md)) recording status (`unknown`/`pass`/`fail`/`n/a`), evidence, and date per criterion, with the compliance percentage computed as verified-pass over applicable. *(Lands with this spec.)*
- **FR-002**: `pnpm lint` MUST statically check studio JSX for accessibility defects (labels, ARIA validity, keyboard handlers on interactive elements) via `eslint-plugin-jsx-a11y` with its recommended ruleset at error severity; any rule demoted or disabled MUST carry an inline justification.
- **FR-003**: Each live Playwright walk spec MUST assert zero serious/critical axe violations on the screens it visits, via `@axe-core/playwright`; per-node exclusions require an inline comment naming the criterion and reason.
- **FR-004**: The Cycle 1 baseline audit MUST resolve every tracker row out of `unknown` — to `pass` (with evidence), `fail` (with a filed `bug(studio)` issue), or `n/a` (with justification) — establishing the honest denominator.
- **FR-005**: All interactive elements on the Track 1 and Track 2 walks MUST be operable keyboard-only, with visible focus at every stop, no traps, and composite widgets conforming to their ARIA APG keyboard pattern.
- **FR-006**: Custom widgets MUST expose accessible name, role, and current state programmatically, and keep exposed state in sync with visual state.
- **FR-007**: Character and codepoint displays (key caps, character-map cells, current-char chips) MUST expose text alternatives derived from codepoint data, including for PUA codepoints.
- **FR-008**: Asynchronous outcomes (validation diagnostics, autosave/cloud-sync state) MUST be announced via `aria-live` regions that ride existing cycles — the D3 300 ms validation debounce for diagnostics; no new validation-adjacent timers (constitution/D3 constraint).
- **FR-009**: Text contrast MUST meet 4.5:1 (3:1 large text) and non-text UI indicators 3:1, enforced through shared style tokens rather than per-component values.
- **FR-010**: Every accessible name or screen-reader-only string added under this spec MUST go through the lingui i18n pipeline (spec 046 catalog rules).
- **FR-011**: [docs/accessibility.md](../../docs/accessibility.md) house rules MUST be referenced from CLAUDE.md so AI-assisted contributions inherit them by default. *(Lands with this spec.)*
- **FR-012**: Each cycle MUST include at least one manual audit pass (keyboard-only walk in Cycle 1; screen-reader pass in Cycle 2) with dated findings recorded in the tracker — automated evidence alone cannot flip the criteria those passes cover.

### Key Entities

- **Tracker row**: one WCAG success criterion — id, name, level (A/AA), applicability, status, evidence pointer, date. The unit of compliance accounting.
- **Audit finding**: a dated defect discovered by a manual or automated pass — criterion id, location, severity; filed as `bug(studio)` and linked from its tracker row until fixed.
- **Exclusion**: a per-node, per-rule automated-scan suppression with an inline justification; enumerable by grep so exclusions can be re-audited.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After Cycle 1, zero tracker rows remain `unknown`, and the automated gates (FR-002, FR-003) are live in CI — measured by tracker inspection and a deliberately-broken canary failing lint and e2e.
- **SC-002**: After Cycle 1, ≥ 35% of applicable criteria are verified `pass` (~17 of ~49) — the honest ceiling of automated checks plus structural fixes plus one keyboard-only pass.
- **SC-003**: After Cycle 2, **≥ 60% of applicable criteria are verified `pass` (≥ 30 of ~49)**, the delta coming from keyboard operability, focus management, name/role/value sync, and status announcements verified by a screen-reader pass.
- **SC-004**: A keyboard-only user completes the full Track 1 walk with zero pointer events — verified by an E2E variant driving only key events.
- **SC-005**: Every `fail` row at the end of each cycle has a filed issue; no silent failures — measured by tracker/issue cross-check at cycle close.
- **SC-006**: Compliance percentage never decreases between cycle closes (the gates hold the floor).

## Cycle roadmap (the plan)

Executed as km-lead cycles (branch convention `km/<slug>`), one PR-set per cycle. This spec + resources + tracker constitute **Cycle 0** (this branch).

**Cycle 1 — "Measure and gate" (target: ≥ 35% verified)**
1. Baseline audit: run axe against the four walk specs' screens; one keyboard-only walk of Track 1; resolve all 55 tracker rows (FR-004). Confirm the proposed n/a set.
2. Land the lint gate (FR-002) — fix or justify every hit; land axe assertions in walk specs (FR-003) — fix all serious/critical findings.
3. Structural fixes with automated evidence: page title, `lang`, landmarks, heading hierarchy, form labels, contrast tokens (FR-009), image/glyph alt coverage (FR-007 for static cases).
4. Expected verified-pass cluster: 1.1.1, 1.3.1 (partial→pass where scannable), 1.4.1, 1.4.3, 1.4.11, 2.4.2, 3.1.1, 3.2.1, 3.2.2, 3.3.2, 4.1.2 (widget subset), plus confirmed trivial passes (2.2.x timing, 2.3.1, 2.5.x pointer subset) — ~17–20 rows.

**Cycle 2 — "Operate and announce" (target: ≥ 60% verified — the promise)**
1. Keyboard operability sweep of both tracks (FR-005): composite widgets to APG patterns, focus management on open/close, no traps, `:focus-visible` styling, focus-not-obscured.
2. Name/role/value and state-sync audit of all custom widgets (FR-006); codepoint accessible names everywhere glyphs render (FR-007 dynamic cases).
3. `aria-live` announcements for diagnostics and autosave riding existing cycles (FR-008); error identification/suggestion text (3.3.1, 3.3.3).
4. Manual NVDA or VoiceOver pass over the P2 scenario set (FR-012); reflow/zoom/text-spacing checks (1.4.4, 1.4.10, 1.4.12).
5. Expected additional verified-pass cluster: 2.1.1, 2.1.2, 2.4.3, 2.4.6, 2.4.7, 2.4.11, 1.3.2, 1.4.4, 1.4.10, 1.4.12, 1.4.13, 3.1.2, 3.3.1, 3.3.3, 4.1.2 (full), 4.1.3 — cumulative ≥ 30 rows.

**Cycle 3+ — "Finish AA" (out of the 60% promise, in scope for the spec)**
Remaining long-tail: 2.5.7 dragging alternatives and 2.5.8 target size (character-map and layout-editor interactions), 3.2.3/3.2.4 consistency, 3.2.6 consistent help, 3.3.7 redundant entry, 3.3.4 error prevention at output/PR submission, 3.3.8 accessible authentication (GitHub OAuth path), 1.3.4/1.3.5, 2.4.5. Target: full WCAG 2.2 AA.

## Assumptions

- The studio ships no prerecorded or live audio/video today, so the 1.2.x media criteria and 1.4.2 are expected `n/a` (~49 applicable criteria); Cycle 1 baseline confirms, and the tracker records the invalidating condition for each.
- "Compliance" scope is the studio SPA (`packages/studio`) as served by its own build — not generated keyboard artifacts (`welcome.htm` etc., spec §16 out-of-scope) and not third-party surfaces (GitHub's own OAuth pages; only our side of the flow is in scope).
- WCAG 2.2 AA is the target standard; no separate 2.1-only track is maintained (2.2 conformance implies the regulatorily-cited 2.1 AA except the removed 4.1.1, which no longer fails anyone).
- Manual passes use NVDA (Windows) or VoiceOver (macOS), whichever the auditing contributor has; both before Cycle 3 is a nice-to-have, not a gate.
- No Pattern/Criterion contract changes are needed — this is studio + tooling work entirely inside the engine team's boundary (spec §12); no joint session required.
