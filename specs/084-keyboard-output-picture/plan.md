# Implementation Plan: Keyboard output picture

**Branch**: `084-keyboard-output-picture` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/084-keyboard-output-picture/spec.md`

**Depends on**: PR #1854 (spec 076 carve suppression). Implementation starts after it merges; see [research D16](research.md#d16-dependency-on-pr-1854).

## Summary

The studio will show authors everything a keystroke produces on their typists' machines: your keyboard's own output where it defines a combo, and each likely base keyboard's fallback where it doesn't. From that picture it derives the **handling set**: the combos that leak on at least one likely base keyboard. Each is marked newly opened by a carve or already leaking, and the handling set drives carve defaults, the Review removed keys panel, the closed-keyboard behaviour, the test pane and the spec 040 facets.

**Technical approach:**
- Move the generated Windows base keyboard tables into a contracts subpath, adding families, physical key sets and memory-aid associations.
- Add a pure engine module that compares a defined-combo map of your keyboard (the carved IR) with the starting point, over the likely base keyboards.
- Wrap it in one memoised studio hook outside the D3 validation cycle.
- Feed the selected base keyboard to the KeymanWeb test pane through one new frame message.

## Technical Context

**Language/Version**: TypeScript (existing monorepo), Node ≥ 22.19

**Primary Dependencies**: none new. It uses the existing `@keyboard-studio/contracts`, `@keyboard-studio/engine`, React/zustand studio, lingui and the vendored KeymanWeb.

**Storage**: none new. Only the existing survey answers (`layout_family` plus one new boolean) and carve dispositions persist, plus one additive provenance value. The picture itself is derived.

**Testing**: vitest per package; @testing-library for studio components; corpus-gated engine tests (`../keyboards`); a Playwright manual walk ([quickstart.md](quickstart.md)).

**Target Platform**: the studio SPA (browser). The data describes Windows base keyboards.

**Project Type**: monorepo web app (contracts, engine, studio) plus the facet-index utility.

**Performance Goals**: the picture updates in the same interaction as the edit (SC-005). One `deriveCarvedIr` clone per carve change, and about 250 combos × up to 8 base keyboards, is negligible.

**Constraints**:
- No second debounce timer (D3).
- The engine must not import the studio.
- The data must not reach `/api` bundles (subpath export only).
- Facet-index output stays byte-identical by default.

**Scale/Scope**: five user stories; about 8 base keyboards; four modifier layers; five consumers.

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design. Both pass.*

| # | Principle | Assessment |
|---|---|---|
| I | Pattern schema is a locked contract | **PASS.** `Pattern` is untouched. The only contracts type change is an additive `CarveDispositionProvenance` member, with its zod mirror in the same change. |
| II | KeyboardIR is the engine spine | **PASS.** Every view is computed from IRs (`deriveCarvedIr`, `buildDefinedComboMap`), never from `.kmn` text. `RawKmnFragment` nodes mark combos *uncertain*; they are never dropped or assumed undefined. |
| III | Single persistent working copy | **PASS.** The starting point (`baseIr`) and the carve overlay are read; nothing forks or serializes the working copy. The target IR is a transient derivation, as `deriveDesktopModifications` already does. |
| IV | Validator layering, one D3 cycle | **PASS.** The views emit no diagnostics and run as a memo outside D3, with no timer. The FR-009 AltGr probe is a test, not a validation path. |
| V | VirtualFS only during authoring | **PASS.** No host-disk writes. The test pane gets its table by `postMessage`. |
| VI | Team boundaries | **PASS, declared.** **Engine** owns the code: contracts module, engine views, studio hook and UI, frame message, codegen and facet parameter. **Content** owns the market mapping entries and their citations, the family and memory-aid wording, and the review of new user-facing copy. The plan ships the market mapping empty so no engine task authors content data. |
| VII | Out of scope for v1 | **PASS.** Physical keyboards on touch devices (FR-016) are described with existing data; no mobile-app integration is built. CJK/Ethiopic routing is untouched. |
| VIII | House conventions | **PASS.** `[OK]/[WARN]/[ERROR]` in the codegen; no issue numbers in code or comments; commit titles use `prefix(area)`; i18n ids follow `area.segment`. |
| IX | No survey surface outside the manifest | **PASS, declared.** The new "combine QWERTY and QWERTZ" toggle renders inside the existing **carve** manifest step, beside the existing `layout_family` question, and is declared in the carve step's writes. No new step. |

No violations, so no Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/084-keyboard-output-picture/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0: decisions D1–D17
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── interfaces.md    # Phase 1: identifiers and signatures
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source code (repository root)

```text
scripts/
└── codegen-host-layouts.mjs            # OUTPUT_PATH to contracts; + Arabic basic keyboards
packages/contracts/
├── data/host-layouts.generated.json    # moved from studio/src/lib/generated/
├── src/hostLayouts.ts                  # new: types, lookup, pictureLayer, families, key sets, distance, mnemonics
├── src/hostLayouts.codegen.test.ts     # moved staleness test
├── src/carveDisposition.ts             # + "inventory-fallthrough" provenance
├── src/schemas.ts                      # zod mirror of the provenance
└── package.json                        # + "./host-layouts" subpath export
packages/engine/src/
├── pattern-apply/modifierCombos.ts     # + buildDefinedComboMap (shares helpers)
├── output-picture/                     # new: computeOutputPicture, computeHandlingSet, familySupport (+ tests)
└── simulator/index.ts                  # + optional fallback via DefaultOutputRules subclass
packages/studio/
├── src/lib/referenceHostLayouts.ts     # re-exports contracts; + MARKET_MAPPING; source "market"
├── src/lib/layoutFamily.ts             # extended likely set: keySets, pairs, families; combine toggle
├── src/hooks/useHandlingSet.ts         # new memoised hook
├── src/editors/carve/CarveGalleryV2.tsx        # family support band, notices, count from handling set
├── src/editors/carve/ReviewRemovedKeys.tsx     # newly opened / already leaking sections
├── src/editors/carve/LayoutFamilyQuestion.tsx  # + combine toggle
├── src/editors/carve/OutputPicture*.tsx        # new: grid, family support, distance/mnemonic notices
├── src/stores/workingCopyStore.ts      # prefill: inventoryAllowComboIds
├── src/components/OSKFrame.tsx         # base keyboard selector + SET_BASE_LAYOUT
├── public/osk-frame.js                 # apply the base keyboard table to unhandled keystrokes
└── src/locales/{en,fr}/messages.json   # new ids
utilities/facet-index/base-layout.ts    # leakedChars(ir, families?) with byte-identical default
specs/076-rule-behaviours/spec.md       # FR-005 / FR-023 pointer edits (D15)
```

**Structure Decision**:
- Shared reference data goes in a contracts subpath, because every layer needs it and the engine can't import the studio.
- The derived views are pure engine code, testable against the corpus.
- The studio holds only resolution (market, answers), memoisation and presentation.

## Phasing

The spec has five user stories, so implementation runs one phase per conversation (constitution: "One conversation per phase").

| Phase | Content | Stories |
|---|---|---|
| Setup + Foundational | Merge main after #1854. Move the data to the contracts subpath and add the Arabic keyboards. `pictureLayer`, families, key sets. `buildDefinedComboMap`. `computeOutputPicture` and `computeHandlingSet`. `useHandlingSet`. AltGr probe (D4). | (P1 prerequisite) |
| P1a | Output picture grid with per-base-keyboard cells, captions and likely set provenance. | US1 |
| P1b | Handling set in Review removed keys; carve defaults filtered by handling set; inventory allow (FR-001g); family support; combine toggle; distance and mnemonic notices. | US2 |
| P2a | `swallowUndefined` fed by the handling set, including every AltGr leak; spec 076 FR-005 edit. | US3 |
| P2b | Test pane `SET_BASE_LAYOUT` and selector; engine simulator fallback. | US4 |
| P3 | Facet `leakedChars(ir, families)`. | US5 |
| Polish | Market mapping mechanism documented for content; Android hardware-keyboard verification (D14); CLAUDE.md fall-through invariant (deferred item #3). | — |

## Open items carried into tasks

- **AltGr probe (D4):** check whether block rules need an `LCTRL LALT` form. It gates any change to the spec 076 suppression output.
- **KeymanWeb unmatched-AltGr behaviour, and the hook point in `osk-frame.js` (D10).**
- **Android hardware-keyboard fall-through (D14):** gates FR-016's touch-device clause.
- **`retainedConvenienceChars` in FR-001g (D9):** excluded by default. Flag it for product review.
- **Market mapping entries (D7):** content-team work, and none ship in v1.
