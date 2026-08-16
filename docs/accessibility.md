# Accessibility (ADA / WCAG 2.2 AA)

Owned jointly by the engine team (SPA implementation) and `/km-frontend` (component-level review). Governing feature spec: [specs/056-ada-accessibility/spec.md](../specs/056-ada-accessibility/spec.md). Live audit state: [specs/056-ada-accessibility/wcag-2.2-aa-tracker.md](../specs/056-ada-accessibility/wcag-2.2-aa-tracker.md).

## What "ADA compliance" means for this project

The ADA has no technical web standard of its own. In practice (DOJ guidance, settlement history, and the 2024 Title II rule that takes effect for US state/local government entities in April 2026), compliance means conforming to **WCAG Level AA**. This project targets **WCAG 2.2 Level AA** — the current version, a strict superset of the 2.1 AA benchmark regulators cite.

WCAG 2.2 A+AA is **55 success criteria** organized under four principles (POUR): Perceivable, Operable, Understandable, Robust. Our conformance is tracked per-criterion in the tracker linked above — never as a vibes-level "we're accessible" claim.

## The measurement contract (how we keep the numbers honest)

1. **Denominator**: all 55 A+AA criteria. A criterion leaves the denominator only by being marked `n/a` in the tracker **with a written justification** (e.g. the media-caption criteria, if the app ships no audio/video). N/A claims are reviewed once at baseline, not invented ad hoc.
2. **A criterion counts as passing only with named evidence**: an automated check that gates CI (lint rule, axe scan in an e2e spec), a committed test, or a dated manual-audit note in the tracker. "Should be fine" is `unknown`, not `pass`.
3. **Automated tools find roughly 30–40% of real WCAG violations.** axe + jsx-a11y alone can never take us past that; the plan therefore budgets manual keyboard and screen-reader audit passes as first-class cycle work, not follow-up.
4. **Compliance % = verified `pass` / applicable criteria.** The number reported in the tracker header is recomputed whenever a row changes.

## House rules for UI authoring (human- and AI-written code alike)

These are the rules that keep new code from re-digging holes the audit fills. They apply to every change under [packages/studio/src](../packages/studio/src). Adapted in part from [a11y-rules](https://github.com/mikemai2awesome/a11y-rules) (rules written specifically for AI coding assistants) — see the resources list below.

1. **Semantic HTML first.** Use `button`, `a`, `label`, `fieldset`/`legend`, `nav`, `main`, `h1`–`h6`, `table` for what they are. Reach for ARIA only when no native element expresses the semantics.
2. **No div-buttons.** Anything clickable is a `button` or `a` (or a documented ARIA pattern with full keyboard support). A `div` with `onClick` and no key handling is a defect.
3. **Everything operable by keyboard alone.** Every action reachable by pointer must be reachable by Tab/Shift-Tab/Enter/Space/arrows, with no traps. Composite widgets (select menus, radio groups, popovers, the touch key grid) follow the relevant [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) pattern, including its keyboard table.
4. **Focus is always visible and always managed.** Never `outline: none` without an equal-or-better `:focus-visible` replacement. Opening a popover/dialog moves focus into it; closing returns focus to the invoker.
5. **Every input has a programmatic label.** `label htmlFor`, `aria-label`, or `aria-labelledby` — placeholder text is not a label. Group related controls with `fieldset`/`legend` or `role="group"` + `aria-labelledby`.
6. **Contrast**: text ≥ 4.5:1 (3:1 for large text), non-text UI indicators (focus rings, borders of inputs, selected-state fills) ≥ 3:1. New colors go through the shared style tokens, not ad-hoc hex values.
7. **Color never carries meaning alone.** Pair color-coded state (validation severity, selection) with an icon, text, or shape change.
8. **Async results are announced.** Validation diagnostics, autosave state, and survey-step results surface through `aria-live` regions. These ride the existing 300 ms debounce cycle (decision D3) — do not add a second timer to throttle announcements.
9. **Name, role, value for custom widgets.** Custom components expose `role`, an accessible name, and current state (`aria-checked`, `aria-expanded`, `aria-selected`, `aria-activedescendant`) and keep them in sync with visual state.
10. **Characters and codepoints get accessible names.** A key cap or character-map cell showing "ɓ" or a PUA glyph must expose a text alternative (Unicode name / [codepointLabel](../packages/studio/src/survey/codepointLabel.ts) output), not just the raw glyph — screen readers cannot be assumed to speak arbitrary codepoints, and PUA glyphs are silent.
11. **All user-facing strings go through lingui** (spec 046) — including `aria-label`s and screen-reader-only text. An unlabeled control is a defect; an untranslatable label is too.
12. **Test the walk before shipping.** For flow-level changes, tab through the affected screens once with the mouse untouched. If you can't complete the step, it isn't done.

## Resources

### Standards and canonical references

- [WCAG 2.2 specification](https://www.w3.org/TR/WCAG22/) and the filterable [How to Meet WCAG (Quick Reference)](https://www.w3.org/WAI/WCAG22/quickref/) — the criterion-by-criterion source of truth the tracker rows link to.
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/) — the reference for composite-widget behavior (combobox, listbox, radio group, dialog, grid). Audited against these patterns: our hand-rolled [SelectMenu](../packages/studio/src/ui/SelectMenu.tsx), [MultiSelect](../packages/studio/src/ui/MultiSelect.tsx), [RadioGroup](../packages/studio/src/ui/RadioGroup.tsx), and — for the **grid** pattern specifically — the touch key grid ([KeyGrid.tsx](../packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx), spec 063), which implements `role="grid"`/`row`/`gridcell` with `aria-rowindex`/`aria-colindex` and a roving tabindex, and carries an axe scan in both its resting and roving states ([touch-key-grid-a11y.spec.ts](../packages/studio/e2e/touch-key-grid-a11y.spec.ts)).

  **Not** the character map. This list previously named "the character-map grid" as audited against the grid pattern; that was wrong, and the correction is recorded here rather than quietly dropped. [CharacterMapGroupSection.tsx](../packages/studio/src/survey/characterMap/CharacterMapGroupSection.tsx) is a `role="group"` flex-wrap of ordinary `<button>`s — no `role="grid"`, no row/cell roles, no arrow-key cursor, and every cell its own Tab stop. That is a defensible design for a pick-one-of-many palette (each button carries a codepoint-derived accessible name per rule 10, and it is fully keyboard-operable), but it is **not** the APG grid pattern and must not be cited as evidence for it. Until spec 063, this repo had no `role="grid"` anywhere.
- [WebAIM](https://webaim.org/articles/) — the most readable practitioner articles (contrast, forms, screen-reader behavior); their [contrast checker](https://webaim.org/resources/contrastchecker/) is the quick tool for token work.
- [The A11y Project checklist](https://www.a11yproject.com/checklist/) — plain-language WCAG checklist; good first pass for reviewers who are not accessibility specialists.
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility) — element- and attribute-level reference.

### Written for AI-assisted ("vibe coding") workflows

- [a11y-rules](https://github.com/mikemai2awesome/a11y-rules) — accessibility rules packaged to be pasted into AI-assistant rule files (Claude, Cursor, Windsurf). The house rules above adapt its core to this codebase; cite it when extending them.
- [Deque: "Vibe fixing" — validating AI-generated code for accessibility](https://www.deque.com/blog/vibe-fixing-how-to-validate-ai-generated-code-and-achieve-accessibility-at-the-speed-of-ai/) — a review workflow for keeping accessibility verification at the same speed as AI code generation. Deque maintains axe-core, the engine behind our planned automated scans.
- [Beware of Vibe Accessibility](https://cerovac.com/a11y/2025/04/beware-of-vibe-accessibility/) — short read on the characteristic failure modes of AI-generated UI: looks right, misses focus management, ARIA state sync, and keyboard operability. Those are exactly the classes our Cycle 2 manual audit targets.

### Tooling

- [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) — static JSX checks (missing labels, invalid ARIA, click-without-key). Planned as part of the `pnpm lint` gate (spec 056, FR-002).
- [@axe-core/playwright](https://www.npmjs.com/package/@axe-core/playwright) — runs the axe engine against the rendered DOM inside our existing Playwright walk specs under [packages/studio/e2e](../packages/studio/e2e/) (spec 056, FR-003).
- [WAVE browser extension](https://wave.webaim.org/extension/) — instant visual overlay of errors on a running page; useful during development, not a CI gate.
- Screen readers for manual passes: NVDA (Windows, free), VoiceOver (macOS, built in). One manual pass per cycle is budgeted in spec 056.

### Background reading on why the numbers are set where they are

- [What axe and Lighthouse miss](https://www.davidmello.com/software-testing/test-automation/playwright-accessibility-testing-axe-lighthouse-limitations) — the ~30–40% automated-coverage ceiling that shapes the measurement contract above.
- [web.dev: Accessibility auditing in React](https://web.dev/articles/accessibility-auditing-react) — pairing static (jsx-a11y) and rendered-DOM (axe) checks.

## Current state (Cycle 1 partial, 2026-08-03)

**Landed in the Cycle 1 branch (pre-baseline-audit):**

- `eslint-plugin-jsx-a11y` at error severity in [eslint.config.mjs](../eslint.config.mjs), scoped to `packages/studio/src/**/*.tsx`. Fixes the 29 defects the recommended ruleset found across 16 files; every remaining rule suppression carries an inline written justification (`grep -rn "eslint-disable-next-line jsx-a11y"` to enumerate). Real behavioral gains: assign-loop rail cards now have `role="button"` + Enter/Space keyboard activation (previously focusable but keyboard-dead); the removed-items menu grew a document-level Escape route and its trigger exposes `aria-expanded`/`aria-haspopup`; `aria-required` moved off role-mismatched buttons onto listbox roles that support it; a `<label>` that never associated with a control became a `<span>` referenced by `aria-labelledby`.
- `@axe-core/playwright` asserted on every production screen visited by [boot-smoke.spec.ts](../packages/studio/e2e/boot-smoke.spec.ts) and the four live walk specs, via [`expectNoSeriousAxeViolations`](../packages/studio/e2e/helpers/axe.ts). Gate is serious/critical-only; per-node exclusions require inline justification naming the criterion. The dev-only `/?demo=lint` route is opted out with a comment (not production UI).
- One [StudioShell.tsx](../packages/studio/src/StudioShell.tsx) contrast fix that boot-smoke's axe scan surfaced (a decorative preview glyph at 0.4 opacity → 0.6 to clear 3:1 large-text).

**What still doesn't exist:** no walk-spec axe run has actually executed against the corpus in this branch (the `../keyboards` corpus is absent from the dev container, so those scans run in the CD/manual lane), and no manual keyboard-only or screen-reader pass has run. Until those complete, tracker rows stay `unknown` — the gates are the mechanism, the audit is what turns rows into `pass`. Six media-related rows (1.2.x, 1.4.2) flipped to `n/a` on grep-verified evidence.
