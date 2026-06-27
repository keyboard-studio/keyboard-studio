# Implementation Plan: Shared `ui/` Primitive Library Extraction

**Branch**: `011-ui-primitives` (impl cycle opens `km/ui-primitives`) | **Date**: 2026-06-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-ui-primitives/spec.md`

## Summary

Extract the form/UI controls that are currently inline-duplicated across `QuestionField.tsx` and five wizard-step panels into a single shared `ui/` primitive library, and establish that library as an enforced dependency **leaf** (no imports from `survey/`/`steps/`/`stores/`). This is P1 of [docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md).

The technical approach, grounded in a read-only audit of the six affected files:

- The primitive set is **audit-determined** (FR-007). Baseline seven (`Button`, `Dropdown`, `TextField`, `RadioGroup`, `MultiSelect`, `Notice`, `Card`) plus the additional recurring controls the audit surfaced: `Checkbox`, `Textarea`, `Label`, `ErrorText`, `Field` (label+control+help row), `Badge`, `Autocomplete`.
- The library unifies **structure and behavior with zero rendered diff** (FR-005). Theme-token unification is performed only where values are provably identical; genuinely divergent one-off colors are preserved exactly (as overrides or distinct tokens) and **never normalized in P1**, because normalizing would change pixels and break the zero-diff invariant.
- `ui/theme.ts` becomes the single token module (superset of `lib/galleryTheme.ts` + the shared form tokens). `lib/galleryTheme.ts` is reduced to a thin re-export so the Form-4 galleries (P4 territory) are not refactored here.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), React 18.3, JSX via `@vitejs/plugin-react`

**Primary Dependencies**: react / react-dom 18.3; zustand 5 (state — untouched here); no new runtime deps

**Storage**: N/A (in-memory SPA; no persistence change)

**Testing**: vitest 4 + @testing-library/react 16 (jsdom 26); `pnpm --filter @keyboard-studio/studio test`. Architecture boundary via `pnpm depcruise` (dependency-cruiser)

**Target Platform**: Browser SPA (Vite 7 build)

**Project Type**: Web frontend — single package `packages/studio` within the pnpm monorepo

**Performance Goals**: N/A — pure refactor; no runtime-perf target. Bundle size must not regress materially (primitives replace duplicated inline code, expected neutral-to-smaller)

**Constraints**: **Zero behavioral/visual diff** (FR-005) is the hard constraint. Strict-TS **explicit `.ts`/`.tsx` import extensions** must be preserved (Bundler resolution). `ui/` must be a dependency leaf (FR-004)

**Scale/Scope**: 6 components refactored; ~14 primitives created; 1 theme module; 1 new depcruise rule. No contract, engine, or content changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS** | No `Pattern`/`packages/contracts` change. P1 touches only SPA presentation. |
| II. KeyboardIR is the engine spine | **PASS** | No IR read/write/mutation. Controls are presentational. |
| III. Single persistent working copy | **PASS** | `stores/workingCopyStore.ts` untouched; `ui/` is forbidden from importing `stores/` (FR-004). |
| IV. Validator layering / single 300 ms debounce | **PASS** | No validator or debounce code touched; no second timer introduced. |
| V. VirtualFS only during authoring | **PASS** | No FS/output code touched. |
| VI. Team boundaries (§12/§13) | **PASS** | **Engine team** owns the SPA, including these presentation components. P1 does **not** touch Content-owned material: no survey question *text/content*, no gallery *ordering*, no pattern library, no LLM prompts, no criteria. `QuestionField.tsx` renders content but is itself Engine presentation. |
| VII. Out of scope for v1 | **PASS** | Implements none of the §16 forbidden items. |
| VIII. House conventions | **PASS** | New depcruise rule extends the existing fitness-function convention. Commit style `refactor(studio): …`; no emoji; markdown-link file refs; no issue numbers in code. |

**Result: PASS, no violations.** Complexity Tracking is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/011-ui-primitives/
├── plan.md              # This file
├── research.md          # Phase 0 — theme mechanism, galleryTheme fold, primitive set, zero-diff test strategy
├── data-model.md        # Phase 1 — the primitive surface (props/variants) + theme token model
├── contracts/
│   └── ui-primitives.contract.md   # Public API of ui/ + the depcruise leaf-rule contract
├── quickstart.md        # Phase 1 — how to validate the refactor (zero-diff + boundary)
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
packages/studio/src/
├── ui/                          # (NEW) shared primitive library — dependency LEAF
│   ├── index.ts                 # public entry point (re-exports all primitives + theme)
│   ├── theme.ts                 # single token module (superset of lib/galleryTheme.ts + form tokens)
│   ├── Button.tsx               # primary | secondary | back variants; enabled/disabled
│   ├── TextField.tsx            # text input; error-state variant
│   ├── Textarea.tsx             # multiline variant
│   ├── Autocomplete.tsx         # <input list> + <datalist> composite
│   ├── Dropdown.tsx             # <select> + options
│   ├── RadioGroup.tsx           # multi-option + bool(yes/no) modes
│   ├── MultiSelect.tsx          # checkbox-row group
│   ├── Checkbox.tsx             # standalone checkbox
│   ├── Label.tsx                # field label (+ required marker)
│   ├── ErrorText.tsx            # error | warning | hint roles (alert/status)
│   ├── Notice.tsx               # read-only info/warn/error banner
│   ├── Card.tsx                 # clickable selectable card container
│   ├── Field.tsx                # label + control + help/error row wrapper (was "FieldRow")
│   ├── Badge.tsx                # small status tag
│   └── *.test.tsx               # per-primitive render/behavior tests
│
├── survey/QuestionField.tsx     # REFACTOR onto ui/ (was the de-facto form kit)
├── components/
│   ├── TrackStep.tsx            # REFACTOR onto ui/
│   ├── ProjectNameStep.tsx      # REFACTOR onto ui/
│   ├── ScaffoldForm.tsx         # REFACTOR onto ui/
│   ├── TrackOneIdentityPanel.tsx# REFACTOR onto ui/
│   └── BaseResolution.tsx       # REFACTOR onto ui/ (already CSS-var themed)
└── lib/galleryTheme.ts          # REDUCED to a re-export shim from ui/theme (galleries untouched → P4)
```

**Structure Decision**: Single-package frontend change under `packages/studio/src`. The new `ui/` directory is a sibling leaf; the six refactor targets keep their current homes (per the spec, no `editors/`/`steps/` moves — those are P4). `lib/galleryTheme.ts` stays in place as a shim to keep the P1 blast radius off the Form-4 galleries.

## Phased work (within P1)

1. **Audit freeze + theme decision** (research.md) — finalize the primitive set and the theme-token mechanism.
2. **`ui/theme.ts` + depcruise leaf rule** — token module first (so primitives consume it), boundary rule added and proven by a probe import.
3. **Primitives + per-primitive tests** — built additively; nothing imports them yet.
4. **Refactor the 6 call sites** one at a time, each keeping its existing tests green unchanged (FR-005). Divergent colors preserved exactly.
5. **`galleryTheme.ts` → shim**, verify galleries unaffected.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
