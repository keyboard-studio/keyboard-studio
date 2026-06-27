---
description: "Task list for Shared ui/ Primitive Library Extraction (feature 011)"
---

# Tasks: Shared `ui/` Primitive Library Extraction

**Input**: Design documents from `specs/011-ui-primitives/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-primitives.contract.md, quickstart.md

**Tests**: Per-primitive render/behavior tests ARE in scope (research Decision 5 layer 2; plan structure lists `ui/*.test.tsx`). They are included below. Pre-existing call-site tests MUST pass **unchanged** (FR-005 / SC-002) — never edit them.

**Branch**: implementation cycle opens `km/ui-primitives` (plan.md). All paths are under `packages/studio/src/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to user story (US1 / US2 / US3)
- Exact file paths are included in every task
- **Strict-TS convention**: every import uses explicit `.ts`/`.tsx` extensions (Bundler resolution) — applies to all tasks below

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the `ui/` directory and freeze the primitive set before any code lands.

- [ ] T001 Create the `packages/studio/src/ui/` directory with an empty public entry point `packages/studio/src/ui/index.ts` (placeholder `export {}` to keep typecheck green until primitives land).
- [ ] T002 Confirm the FR-007 audit set (14 primitives + 8 divergent-token rows) against the six call sites by reading `packages/studio/src/survey/QuestionField.tsx` and `packages/studio/src/components/{TrackStep,ProjectNameStep,ScaffoldForm,TrackOneIdentityPanel,BaseResolution}.tsx`; record any deviation from research.md Decision 1 / data-model.md before proceeding (no code change).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The single theme token module — every primitive consumes it, so it MUST exist first.

**⚠️ CRITICAL**: No primitive (Phase 3+) can be built until T003 is complete.

- [ ] T003 Create `packages/studio/src/ui/theme.ts` as the single token module (research Decision 2 / data-model.md theme table): typed accessors/names for the canonical `var(--app-*)` CSS custom properties already defined in `index.css`, **plus** the legacy hex constants `BG_PAGE`, `BG_CARD`, `BORDER`, `ACCENT`, `TEXT_DIM`, `TEXT_MAIN`, `FONT`, `BLUE_ACTION` (for the `galleryTheme` shim in T026), **plus** named tokens for the preserved divergent values (`error-border` `#7a2a2a`, `error-text` `#f0a0a0`, `warning` `#d29922`, `success-accent` `#7ee787`/`--sil-green`). Do NOT normalize any color (FR-005).

**Checkpoint**: Theme source exists — primitive construction can begin.

---

## Phase 3: User Story 1 - One shared form-control kit, no inline duplication (Priority: P1) 🎯 MVP

**Goal**: Collapse the inline-duplicated controls across `QuestionField` and the five wizard-step panels into one shared kit, and adopt that kit at all six call sites with zero rendered diff.

**Independent Test**: Pick a refactored component (e.g. `QuestionField.tsx`), confirm it imports its controls from `ui/`, contains no locally-defined button/input markup, and renders/behaves identically to before (its pre-existing tests pass unchanged).

### Build the primitives (each new file + its own render/behavior test)

> All primitive tasks are parallel — distinct `.tsx` + `.test.tsx` files, each consuming only `ui/theme.ts`. Each test (Testing Library) asserts the primitive renders the same element + `role` + resolved style values as the inline control it replaces (FR-005), in isolation, before any call site adopts it.

- [ ] T004 [P] [US1] `packages/studio/src/ui/Button.tsx` (+ `Button.test.tsx`): `variant: "primary" | "secondary" | "back"` (default `secondary`), extends `React.ButtonHTMLAttributes`, enabled/disabled states — replaces `NEXT_BTN_ENABLED/DISABLED`, `BACK_BTN`, submit buttons.
- [ ] T005 [P] [US1] `packages/studio/src/ui/Card.tsx` (+ `Card.test.tsx`): `selected: boolean`, clickable container — replaces `CARD_BASE`/`CARD_SELECTED`.
- [ ] T006 [P] [US1] `packages/studio/src/ui/TextField.tsx` (+ `TextField.test.tsx`): extends `React.InputHTMLAttributes`, `error?: boolean`, `mono?: boolean` — replaces `<input type=text>` + `INPUT_STYLE`.
- [ ] T007 [P] [US1] `packages/studio/src/ui/Textarea.tsx` (+ `Textarea.test.tsx`): `error?: boolean`, `rows`, `resize:vertical` — replaces `<textarea>` + `INPUT_STYLE`.
- [ ] T008 [P] [US1] `packages/studio/src/ui/Autocomplete.tsx` (+ `Autocomplete.test.tsx`): `options: string[]` rendering an `<input list>` + `<datalist>` composite — replaces the QuestionField autocomplete.
- [ ] T009 [P] [US1] `packages/studio/src/ui/Dropdown.tsx` (+ `Dropdown.test.tsx`): `options: {value,label}[]` rendering `<select>` — replaces QuestionField `<select>`.
- [ ] T010 [P] [US1] `packages/studio/src/ui/RadioGroup.tsx` (+ `RadioGroup.test.tsx`): `mode: "list" | "bool"` (default `list`), `name`, `value`, `options`, `accent?`, `onChange` — bool mode synthesizes yes/no and preserves the green accent `#3fb950`; replaces `RadioField` + `BoolField`.
- [ ] T011 [P] [US1] `packages/studio/src/ui/MultiSelect.tsx` (+ `MultiSelect.test.tsx`): `options`, `selected` checkbox-row group — replaces `MultiSelectField`.
- [ ] T012 [P] [US1] `packages/studio/src/ui/Checkbox.tsx` (+ `Checkbox.test.tsx`): standalone `checked` checkbox — replaces standalone `<input type=checkbox>`.
- [ ] T013 [P] [US1] `packages/studio/src/ui/Label.tsx` (+ `Label.test.tsx`): extends `React.LabelHTMLAttributes`, `required?: boolean` rendering the existing `#e74c3c` asterisk marker — replaces `LABEL_STYLE`/`OPTION_LABEL_STYLE`.
- [ ] T014 [P] [US1] `packages/studio/src/ui/ErrorText.tsx` (+ `ErrorText.test.tsx`): `tone: "error" | "warning" | "hint"` → `error`/`warning` render `role=alert`, `hint` renders `role=status` — replaces conditional error/warning/hint `<div>`s.
- [ ] T015 [P] [US1] `packages/studio/src/ui/Notice.tsx` (+ `Notice.test.tsx`): `tone: "info" | "warn" | "error"` read-only banner — replaces `NoticeField`.
- [ ] T016 [P] [US1] `packages/studio/src/ui/Field.tsx` (+ `Field.test.tsx`): composes `Label` + control slot + `ErrorText`/help row — replaces the implicit field-row wrappers.
- [ ] T017 [P] [US1] `packages/studio/src/ui/Badge.tsx` (+ `Badge.test.tsx`): `tone` small status tag — replaces `REASON_COLOR`/`ImportBadge` status tags.

### Wire the public surface

- [ ] T018 [US1] Populate `packages/studio/src/ui/index.ts` with the full re-export block from contracts/ui-primitives.contract.md §1 (all 14 primitives via explicit `.tsx` paths + `export * as theme from "./theme.ts"`). Depends on T004–T017.

### Adopt the kit at the six call sites (zero-diff refactor, one file each)

> Each refactor swaps inline controls for `ui/` primitives while keeping that file's pre-existing tests green **unchanged** (SC-002). Divergent call-site colors are passed through as `style`/`className` overrides, never normalized (Decision 2). Different files → parallelizable, but each must independently leave its tests untouched.

- [ ] T019 [P] [US1] Refactor `packages/studio/src/survey/QuestionField.tsx` onto `ui/` primitives (TextField, Textarea, Autocomplete, Dropdown, RadioGroup, MultiSelect, Checkbox, Label, ErrorText, Notice, Field); remove its inline `INPUT_STYLE`/`LABEL_STYLE`/control definitions. Survey/`QuestionField`-driven tests must pass unchanged.
- [ ] T020 [P] [US1] Refactor `packages/studio/src/components/TrackStep.tsx` onto `ui/` (Card, Button, Label as applicable); remove inline `CARD_BASE`/`CARD_SELECTED`/button markup.
- [ ] T021 [P] [US1] Refactor `packages/studio/src/components/ProjectNameStep.tsx` onto `ui/` (TextField, Button, Label, ErrorText); keep the slug-validation display (`#f85149`) as the documented local one-off (research Decision 1).
- [ ] T022 [P] [US1] Refactor `packages/studio/src/components/ScaffoldForm.tsx` onto `ui/` (TextField, Button, Label, ErrorText, Field); preserve the divergent `#283040`/`#9aa7b8`/`#7a2a2a`/`#f0a0a0` values exactly and keep the success-green `#238636` submit as the documented local one-off.
- [ ] T023 [P] [US1] Refactor `packages/studio/src/components/TrackOneIdentityPanel.tsx` onto `ui/` (TextField, Button, Label, ErrorText, Notice/Badge); preserve `#283040`/`#9aa7b8`/`#d29922`/`#7ee787` exactly. Its `TrackOneIdentityPanel.test.tsx` must pass unchanged.
- [ ] T024 [P] [US1] Refactor `packages/studio/src/components/BaseResolution.tsx` onto `ui/` (Badge, Button, Card as applicable); it is already CSS-var themed so adoption should be literally token-identical. Its `BaseResolution.test.tsx` must pass unchanged.

**Checkpoint**: The kit exists and is adopted everywhere; `pnpm --filter @keyboard-studio/studio test` is green with no pre-existing-test edits. SC-001 + SC-002 satisfied — MVP complete and independently testable.

---

## Phase 4: User Story 2 - A stable primitive surface and a single theme source (Priority: P2)

**Goal**: A documented, stable public surface plus exactly one theme token source — no duplicate token definitions remaining.

**Independent Test**: `ui/` exposes the agreed public exports under stable names, and form/gallery chrome tokens resolve from `ui/theme.ts` with no duplicate definitions left in the former `lib/galleryTheme.ts`.

- [ ] T025 [US2] Reduce `packages/studio/src/lib/galleryTheme.ts` to a thin re-export shim (`export { BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION } from "../ui/theme.ts";`) so there is one token definition (FR-003); leave the Form-4 galleries' `galleryTheme` imports untouched (P4 territory). Depends on T003.
- [ ] T026 [US2] Verify single theme source (SC-004): confirm no canonical hex token (`#0d1117`, `#30363d`, `#6ea8fe`, etc.) is *defined* outside `packages/studio/src/ui/theme.ts`, and that the public surface in `packages/studio/src/ui/index.ts` matches contracts/ui-primitives.contract.md §1 verbatim. Depends on T018, T025.

**Checkpoint**: One theme source; stable, documented surface. SC-004 satisfied.

---

## Phase 5: User Story 3 - An enforced architectural boundary (Priority: P3)

**Goal**: The `ui/` leaf constraint is automatically enforced, not merely documented.

**Independent Test**: A probe import from `ui/` into `survey/`/`steps/`/`stores/` fails the boundary check; the clean tree passes.

- [ ] T027 [US3] Add the `ui-is-a-leaf` forbidden rule to `.dependency-cruiser.cjs` `forbidden[]` exactly as in contracts/ui-primitives.contract.md §3 (`from: ^packages/studio/src/ui/`, `to: ^packages/studio/src/(survey|steps|stores)/`, `severity: error`) — the first intra-`studio/src` layering rule. `ui/ → lib/` stays permitted.
- [ ] T028 [US3] Prove the rule fires (SC-003): temporarily add `import { useWorkingCopy } from "../stores/workingCopyStore.ts";` to a `ui/` file, run `pnpm depcruise` and confirm it FAILS on `ui-is-a-leaf`, then revert and confirm `pnpm depcruise` PASSES. Depends on T027.

**Checkpoint**: Leaf boundary genuinely enforced. SC-003 satisfied. All user stories complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation against all Success Criteria (quickstart.md).

- [ ] T029 [P] SC-005 — run `pnpm --filter @keyboard-studio/studio typecheck` and `pnpm --filter @keyboard-studio/studio build`; confirm clean with all explicit `.ts`/`.tsx` import extensions preserved.
- [ ] T030 [P] SC-001 — run the quickstart greps over the six files to confirm zero remaining inline control style-constants (`INPUT_STYLE|NEXT_BTN_|BACK_BTN|CARD_BASE|OPTION_ROW_STYLE`) and that each imports from `ui/`.
- [ ] T031 SC-002 — run `git diff` on the pre-existing test files (`StudioShell.test.tsx`, `BaseResolution.test.tsx`, `TrackOneIdentityPanel.test.tsx`, survey/`QuestionField` tests) across the refactor and confirm it is empty (no test edited to accommodate behavior/markup).
- [ ] T032 Bundle-size spot check — confirm `pnpm --filter @keyboard-studio/studio build` output is neutral-to-smaller vs. baseline (primitives replace duplicated inline code; no material regression).
- [ ] T033 [P] Optional manual smoke (`pnpm dev`): walk the survey, Track step, Project-name step, Scaffold form, identity panel, and base-resolution picker; each looks and behaves exactly as before.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2 / T003)**: depends on Setup; **BLOCKS all primitives and the galleryTheme shim** (every primitive consumes `ui/theme.ts`).
- **US1 (Phase 3)**: depends on Foundational. The MVP.
- **US2 (Phase 4)**: depends on Foundational (T003) for the shim; T026 also depends on US1's `index.ts` (T018). Independently testable once those land.
- **US3 (Phase 5)**: depends only on the `ui/` directory existing (T001) — the depcruise rule can technically be added any time after the folder exists, but is most meaningful once primitives are present.
- **Polish (Phase 6)**: depends on all desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: core deliverable; everything else hangs off the kit existing and being adopted.
- **US2 (P2)**: the theme-fold shim needs only T003; the "stable surface" check needs US1's `index.ts`.
- **US3 (P3)**: the boundary rule is independent of US1/US2 content; the probe is most meaningful with primitives present.

### Within US1

- All primitives (T004–T017) are parallel and independent — each its own file pair, each consuming only `ui/theme.ts`.
- `index.ts` wiring (T018) depends on all primitives.
- Call-site refactors (T019–T024) depend on T018 (they import from `ui/`); they are parallel to each other (distinct files).

### Parallel Opportunities

- T004–T017 (14 primitives) run fully in parallel after T003.
- T019–T024 (6 call-site refactors) run in parallel after T018.
- US2's T025 can start as soon as T003 lands (parallel to building primitives).
- US3's T027 can land any time after T001.
- Polish T029, T030, T033 are parallel.

---

## Parallel Example: User Story 1 primitives

```bash
# After T003 (theme.ts) lands, build all 14 primitives + their tests together:
Task: "Button.tsx + Button.test.tsx in packages/studio/src/ui/"
Task: "Card.tsx + Card.test.tsx in packages/studio/src/ui/"
Task: "TextField.tsx + TextField.test.tsx in packages/studio/src/ui/"
# … through Badge.tsx

# Then, after T018 wires index.ts, refactor the 6 call sites together:
Task: "Refactor survey/QuestionField.tsx onto ui/"
Task: "Refactor components/TrackStep.tsx onto ui/"
Task: "Refactor components/ProjectNameStep.tsx onto ui/"
Task: "Refactor components/ScaffoldForm.tsx onto ui/"
Task: "Refactor components/TrackOneIdentityPanel.tsx onto ui/"
Task: "Refactor components/BaseResolution.tsx onto ui/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (`ui/theme.ts`).
2. Build the 14 primitives + tests (T004–T017), wire `index.ts` (T018).
3. Refactor the six call sites (T019–T024).
4. **STOP and VALIDATE**: `pnpm --filter @keyboard-studio/studio test` green with no pre-existing-test edits → SC-001 + SC-002. This is a shippable, revert-safe increment (additive-until-switch).

### Incremental Delivery

1. Setup + Foundational → theme source ready.
2. US1 → kit built + adopted → MVP (SC-001/SC-002).
3. US2 → galleryTheme shim + single-source verify (SC-004).
4. US3 → depcruise leaf rule + probe (SC-003).
5. Polish → typecheck/build/bundle/diff gates (SC-005 + final SC-001/SC-002 confirmation).

---

## Notes

- **FR-005 is the hard gate**: any pre-existing test that needs editing is a regression signal, not an accommodation. New tests live only under `ui/*.test.tsx`.
- **No color is normalized in P1.** Divergent call-site values are preserved exactly and flagged in data-model.md for a post-P1 normalization follow-up.
- Explicit `.ts`/`.tsx` import extensions everywhere (Bundler resolution).
- Commit style `refactor(studio): …`; no emoji; markdown-link file refs; no issue numbers in shipped code.
- Commit after each task or logical group; stop at any checkpoint to validate the story independently.
