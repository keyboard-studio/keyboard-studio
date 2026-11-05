# Implementation Plan: Layout tab — a visual desktop-layout editor

**Branch**: `km/113-layout-studio` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/113-layout-studio/spec.md`

## Summary

A third Mechanical Gallery tab (Assign | Code | Layout) that shows the desktop layout one modifier
layer at a time, every key labelled with what the compiled keyboard really produces and where that
comes from, and lets the author change it: text, nothing, deadkeys with their tables, and — last —
literal contextual rows through the "after …" view.

Technical approach, from [research.md](research.md):
- **Read:** a pure engine attribution pass over the IR classifies each key's behaviours, then the
  studio verifies them by simulating against the single D3 compile artifact (no new compile or
  timer). One rule that cannot be edited never locks the key's other behaviours.
- **Write:** a new append-only **layout op log**, modelled on spec 083's deadkey op log. Each
  confirmed edit is one `LayoutOperation`, applied live through `applyMutatePatch`, replayed into
  the artifact after assignments and deadkey ops, saved in the draft, and snapshotted into the
  `physical-layout` decision. Deadkey definition and fan-out pair edits reuse spec 083's lifecycle.
  This is needed because a working-IR write alone never reaches the built keyboard (R1).
- **Ship order (product owner, 2026-11-04):** US1–US3 first (phases A–D), then US5–US6 (E), then
  US4 (F). US7 stays gated.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node ≥ 22.19.0, pnpm 9

**Primary Dependencies**: React + Vite (studio), Zustand (`workingCopyStore`), Lingui (i18n), Monaco
(Code tab, already lazy-loaded), zod (contracts schemas), the vendored Keyman web engine (simulator),
kmcmplib WASM (the existing D3 compile)

**Storage**: In-memory working copy + draft envelope (`persistWorkingCopy.ts`); VirtualFS projection
at output. No new server-side store.

**Testing**: Vitest per package (contracts, engine, studio), engine corpus tests against
`../keyboards`, Playwright E2E in studio

**Target Platform**: Browser SPA (desktop browsers); engine also runs in Node for tests

**Project Type**: Web application inside a pnpm monorepo (contracts → engine → studio)

**Performance Goals**: Full-grid verification (`simulateEach`, ≤ 8 layers × ~50 keys) under 200 ms
in the Node harness; the grid re-renders within the existing 300 ms validation cycle of an edit
(SC-003)

**Constraints**: D3 — no second compile or debounce timer; Art II — every write is an IR op, no
`kmnFragment` or `.kmn` text path; Art X — partner rows, space rows, and base fallback are
proposals; spec 105 FR-010 — the new write surface is registered in the same change

**Scale/Scope**: ~12,400 lines for v1 (~7,000 production, ~5,400 tests); US1–US3 ≈ 8,900
([research.md](research.md) R11). Corpus harness ≥ 20 keyboards.

## Constitution Check

*GATE: checked before Phase 0, re-checked after Phase 1 design. Result: **PASS**, no violations.*

| Article | Check | Result |
|---|---|---|
| I. Pattern schema locked | No `Pattern` field touched. New contracts are additive: `LayoutOperation` (+ zod + drift guard) and an optional `IRRule.layoutTabOwned` (beside the existing `rulesStepAdded`). | PASS |
| II. KeyboardIR spine | Every edit is `applyLayoutOp` on the IR; projection replays on parsed IR. Opaque fragments and `readonly` groups are refused, never rewritten or dropped. | PASS |
| III. One working copy; decisions live; draft envelope | Live edits go into the one working copy; the op log is a replayable overlay saved in the draft and snapshotted into `physical-layout`. That decision stays record-only (spec 105 phase 4); the plan claims no replay fold. | PASS |
| IV. Validator layering / D3 | The tab reads `rulesDemoArtifactStore` (the D3 artifact), as `DemoPane` does. No compile, no timer. | PASS |
| V. VirtualFS only | No host-disk writes; projection-time replay only. | PASS |
| VI. Team boundaries | Engine team owns all code. Content team owns cell-class labels, read-only reasons, and proposal copy (FR-041). | PASS |
| VII. Out of scope | No CJK/Ethiopic reorder, no touch-first authoring, no LDML emission. | PASS |
| VIII. Conventions | `<prefix>(<area>)` commits; no issue numbers in code; Windows-safe console output. | PASS |
| IX. No survey surface outside the registry; writes via the seam | No new step, question, or decision id (FR-001). Writes use `applyMutatePatch` with a declared `LAYOUT_WRITES` set, the `DEADKEY_WRITES` precedent. | PASS |
| X. Defaults are proposals | Case partners (FR-020a), the deadkey space row (FR-028), and base fallback (FR-014) are shown and confirmed, never applied silently. | PASS |
| XI. Done means integrated | Each phase ends mounted in the gallery and reachable. US7 and the store-based next frontier carry owner + trigger in the spec. The Code-tab side finding (R1) carries owner + trigger. | PASS |
| XII. Personal data | See below. | PASS |

**Post-design re-check (after Phase 1):** unchanged — PASS. The contracts additions are additive,
and the one spec amendment (R3: spec 083 fan-out tables are editable deadkey tables) widens
editing without touching a gate.

## Personal Data Check (Constitution Article XII, spec 100)

*Personal data: none — no new store, recipient, category, or telemetry.*

## Phases and ship order

Each phase is one commit (or a short series) on `km/113-layout-studio`, pushed when its gates are
green. **PR 1 = phases A–D (US1–US3).** Later phases go on a follow-up branch cut from `main`
after PR 1 merges.

| Phase | Stories | Delivers | Gate to close |
|---|---|---|---|
| **A. Foundation** | — | ISO-aware desktop geometry export (`K_oE2`, space row, frame flag); `layout-attribution` engine module (static pass, R3 exemption); `simulateEach`; `emitKmn` line map; `LayoutOperation` contract + `applyLayoutOp`; test proving or disproving the Code-tab side finding (R1) | Engine + contracts unit tests; corpus harness skeleton runs |
| **B. See every key** | US1 | `DesktopKeyGrid` / `DesktopKeyCell` / `desktopGridViewModel` on `useGridNav` (type loosened) and `LayerSelector`; detail panel; base-fallback join; third tab with TouchGallery-grade tab accessibility; stale/not-compiled states; mnemonic read-only | US1 acceptance; SC-001 and SC-002 on corpus; a11y tests |
| **C. Change keys** | US2 | Edit panel; case-partner proposal (FR-020a); key-first displacement (R9); `layoutOps` slice + persistence + projection replay + decision field; registry entry; undo `l`/`lb`; Assign tab shows layout-owned keys | US2 acceptance; SC-003, SC-004, SC-005; `derivedEquivalence` census; artifact contains the edit |
| **D. Deadkeys** | US3 | Deadkey on key via the spec 083 lifecycle; display character; tables of both shapes (fan-out and keystroke-keyed); "after this deadkey" view; chains followed; space-row proposal; undo `ld` | US3 acceptance; SC-007 (deadkey half), SC-008 |
| *PR 1 opens here* | | | |
| **E. Honesty extras** | US5, US6 | Read-only detail and "view in code" (`revealNodeId`); provisional counts per layer; fallback-policy link | US5, US6 acceptance; SC-006 |
| **F. Contextual rows** | US4 | Context list; "after …" for literal contexts; "becomes" editor; never-fires detection; `set-row` / `remove-row` | US4 acceptance; SC-007 (context half), SC-009 |
| G. Tray | US7 | Gated (spec Assumptions) — not planned | — |

## Project Structure

### Documentation (this feature)

```text
specs/113-layout-studio/
├── plan.md              # This file
├── research.md          # Phase 0 (R1–R11)
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── layout-ops.md    # LayoutOperation + applyLayoutOp + seams
│   └── attribution.md   # attribution API, simulateEach, verification, base join
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
packages/contracts/src/
├── layoutOps.ts                         # NEW  LayoutOperation, LayoutOutput, LayoutContext types
├── schemas.ts                           # +    LayoutOperationSchema + drift guard
└── keyboard-ir.ts                       # +    IRRule.layoutTabOwned?

packages/engine/src/
├── layout-attribution/                  # NEW  attributeLayer, listLayers, listContexts, isMnemonic (+ corpus test)
├── layout-ops/applyLayoutOp.ts          # NEW  pure IR op (uses pattern-apply/ir-insert helpers)
├── layout-chart/geometry.ts             # +    ISO-aware desktop geometry, frame flag (ANSI view kept)
├── simulator/index.ts                   # +    simulateEach
└── codec/emit.ts                        # +    optional line map (lineByNodeId)

packages/studio/src/
├── editors/adapters/addPhysicalAdapter.tsx      # +  third tab, accessible tab bar
├── editors/layout/                              # NEW
│   ├── LayoutPane.tsx                           #    tab body (lazy-loaded)
│   ├── DesktopKeyGrid.tsx / DesktopKeyCell.tsx
│   ├── desktopGridViewModel.ts
│   ├── KeyDetailPanel.tsx / KeyEditPanel.tsx
│   ├── DeadkeyTablePanel.tsx                    #    US3
│   ├── AfterContextView.tsx                     #    US3 (deadkeys) + US4 (literal contexts)
│   ├── useLayoutAttribution.ts                  #    verification against rulesDemoArtifactStore
│   ├── baseFallbackCells.ts                     #    spec 109 enumerator × reference bases
│   └── keyFirstDisplacement.ts                  #    R9
├── editors/assignLoop/keyGrid/useGridNav.ts     # ~  structural input type
├── editors/assignLoop/KmnCodePane.tsx           # +  revealNodeId
├── steps/editorMutate.ts                        # +  LAYOUT_WRITES
├── stores/workingCopyStore.ts                   # +  layoutOps slice, commitLayoutOp, undo kinds l/lb/ld
├── lib/persistWorkingCopy.ts                    # +  save/restore layoutOps
├── lib/projectWorkingCopyVfs.ts                 # +  replay layoutOps after assignments + deadkey ops
├── lib/mechanismStepCompletion.ts               # +  snapshot layoutOps into the decision
├── survey/assignLoop/physicalLayoutValue.ts     # +  layoutOps?
└── decisions/derivedSurfaceRegistry.ts          # +  layout-tab surface, member classification

packages/studio/e2e/layout-tab.spec.ts           # NEW  Playwright (quickstart table)
```

**Structure Decision**: The existing three-package spine. Engine owns everything pure (attribution,
the op, geometry, simulator, emit); studio owns state, persistence, projection, and UI under a new
`editors/layout/` folder, matching `editors/deadkey/` and `editors/assignLoop/`.

## Risks

| Risk | Mitigation |
|---|---|
| Replay order: a layout op and an Assign-tab assignment on the same key | Layout ops replay last and win; the Layout tab warns before overriding an Assign-tab assignment (FR-022), and the Assign tab labels the key "set in the Layout tab". |
| Rebuild-on-undo cost | Undo rebuilds from `startIr` + overlays through the existing rebuild path; measure in phase C and fall back to replaying only the tail if needed. |
| `simulateEach` relies on resetting the vendored engine's context between keystrokes | Phase A proves parity with `simulate()` per key on the corpus before anything depends on it. |
| Spec 083 has no display-character field | Phase A checks; if missing, add it as a lifecycle field (`set-display` op), not a layout op. |
| Size (~12k lines) | Ship PR 1 at US3; phases E–F follow on a fresh branch. |

## Spec amendments made with this plan

- **FR-013 / FR-028** (from R3): the spec 083 fan-out shape is an editable deadkey table, keyed by
  base character; other store use stays read-only.

## Complexity Tracking

No constitution violations to justify.
