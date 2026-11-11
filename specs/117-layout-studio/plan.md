# Implementation Plan: Layout tab — a visual desktop-layout editor

**Branch**: `km/117-layout-studio` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/117-layout-studio/spec.md`

## Summary

A third Mechanical Gallery tab (Assign | Code | Layout) that shows the desktop layout one modifier
layer at a time, every key labelled with what the compiled keyboard really produces and where that
comes from, and lets the author change it: text, nothing, deadkeys with their tables, and — last —
literal contextual rows through the "after …" view.

Technical approach, from [research.md](research.md):
- **Read:** a pure engine attribution pass over the IR classifies each key's behaviours, then the
  studio verifies them by simulating against the single D3 compile artifact (no new compile or
  timer). One rule that cannot be edited never locks the key's other behaviours.
- **Write (revised 2026-11-05, rulings 6 and 7):** edits to the KMN are one bundled decision,
  **`kmn-edits`**, recorded at each confirm, modelled on `deadkeys-defined` (an op list whose
  `apply()` replays it). Each Layout-tab edit is one `LayoutOperation`, applied live through
  `applyMutatePatch` and replayed into the artifact after assignments and deadkey ops (R1, R12).
  Deadkey definition and fan-out pair edits reuse spec 083's lifecycle and `deadkeys-defined`.
  This is needed because a working-IR write alone never reaches the built keyboard (R1).
- **Code tab (ruling 7):** Apply imports the edited text as a structural diff of the IR, stored
  in `kmn-edits` by content, not node id. Errors block; overrides of other editors' nodes, replay
  misses, and shadowed rules are flagged for review (R13, User Story 8).
- **Ship order (product owner, 2026-11-04, amended 2026-11-05):** US1–US3 first (phases A–D,
  PR 1), then US8 (E), then US5–US6 (F), then US4 (G). US7 stays gated (H).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node ≥ 22.19.0, pnpm 9

**Primary Dependencies**: React + Vite (studio), Zustand (`workingCopyStore`), Lingui (i18n), Monaco
(Code tab, already lazy-loaded), zod (contracts schemas), the vendored Keyman web engine (simulator),
kmcmplib WASM (the existing D3 compile)

**Storage**: The decision set (one new decision, `kmn-edits`) in the existing draft envelope; the
in-memory working copy as today; VirtualFS projection at output. No new store slice, no new
server-side store.

**Testing**: Vitest per package (contracts, engine, studio), engine corpus tests against
`../keyboards`, Playwright E2E in studio

**Target Platform**: Browser SPA (desktop browsers); engine also runs in Node for tests

**Project Type**: Web application inside a pnpm monorepo (contracts → engine → studio)

**Performance Goals**: Full-grid verification (`simulateEach`, ≤ 8 layers × ~50 keys) under 200 ms
in the Node harness; the grid re-renders within the existing 300 ms validation cycle of an edit
(SC-003)

**Constraints**: D3 — no second compile or debounce timer (the Code-tab Apply's one-shot candidate
compile is an explicit author action, like download — km-validator review before phase E); Art II
— every write is an IR op, no `kmnFragment` or `.kmn` text path (the Code tab parses once at
Apply and stores IR changes); Art X — partner rows, space rows, and base fallback are
proposals; spec 105 FR-010 — the new write surface is registered in the same change

**Scale/Scope**: ~14,850 lines for v1 (~8,300 production, ~6,550 tests); US1–US3 ≈ 9,100;
US8 ≈ 2,200 ([research.md](research.md) R11). Corpus harness ≥ 20 keyboards.

## Constitution Check

*GATE: checked before Phase 0, re-checked after Phase 1 design. Result: **PASS**, no violations.*

| Article | Check | Result |
|---|---|---|
| I. Pattern schema locked | No `Pattern` field touched. New contracts are additive: `LayoutOperation`, `KmnEditsValue`, `CodeEdit` (+ zod + drift guards) and an optional `IRRule.authorEdit` (beside the existing `rulesStepAdded`). | PASS |
| II. KeyboardIR spine | Every edit is an IR op (`applyLayoutOp`, `applyIRChanges`); projection replays on parsed IR. The Layout tab refuses opaque fragments and `readonly` groups; the Code tab may change an opaque fragment's text, which stays opaque — never dropped. | PASS |
| III. One working copy; decisions live; draft envelope | Every edit is recorded as the `kmn-edits` decision at the confirm (ruling 6) — decisions are the live truth; no new working-copy field. `apply()` reproduces the edits, so the surface is equivalence-proven (spec 105 Option A). `physical-layout` is untouched. | PASS |
| IV. Validator layering / D3 | The tab reads `rulesDemoArtifactStore` (the D3 artifact), as `DemoPane` does. No timer anywhere. The Code-tab Apply runs one candidate compile on the author's click (FR-061/FR-067), as download does — flagged for km-validator review against D3 before phase E. | PASS (review pending for E) |
| V. VirtualFS only | No host-disk writes; projection-time replay only. | PASS |
| VI. Team boundaries | Engine team owns all code. Content team owns cell-class labels, read-only reasons, and proposal copy (FR-041). | PASS |
| VII. Out of scope | No CJK/Ethiopic reorder, no touch-first authoring, no LDML emission. | PASS |
| VIII. Conventions | `<prefix>(<area>)` commits; no issue numbers in code; Windows-safe console output. | PASS |
| IX. No survey surface outside the registry; writes via the seam | No new step or question. One new decision id, `kmn-edits` (ruling 6), declared as a gallery module in the module registry (the `deadkeysDefined` precedent). Writes use `applyMutatePatch` with declared `LAYOUT_WRITES` / `CODE_WRITES` sets, the `DEADKEY_WRITES` precedent. | PASS |
| X. Defaults are proposals | Case partners (FR-020a), the deadkey space row (FR-028), and base fallback (FR-014) are shown and confirmed, never applied silently. | PASS |
| XI. Done means integrated | Each phase ends mounted in the gallery and reachable. US7 and the store-based next frontier carry owner + trigger in the spec. The Code-tab side finding (R1) is now in scope as US8. | PASS |
| XII. Personal data | See below. | PASS |

**Post-design re-check (after Phase 1 and the advisor review):** unchanged — PASS. The contracts additions are additive,
and the one spec amendment (R3: spec 083 fan-out tables are editable deadkey tables) widens
editing without touching a gate.

**Re-check after rulings 6 and 7 (2026-11-05):** PASS. Art III is strengthened (decisions, not a
store slice). Art IX gains one decision id through the module registry. Art IV carries one review
item for phase E (the candidate compile on Apply).

## Personal Data Check (Constitution Article XII, spec 100)

*Personal data: none — no new store, recipient, category, or telemetry.*

## Phases and ship order

Each phase is one commit (or a short series) on `km/117-layout-studio`, pushed when its gates are
green. **PR 1 = phases A–D (US1–US3).** Later phases go on a follow-up branch cut from `main`
after PR 1 merges.

| Phase | Stories | Delivers | Gate to close |
|---|---|---|---|
| **A. Foundation** | — | ISO-aware desktop geometry export (`K_oE2`, space row, frame flag); `layout-attribution` engine module (static pass, R3 exemption, `findShadowedRules`); `simulateEach`; `emitKmn` line map; `ModifierToken` moved to contracts; `LayoutOperation` + `KmnEditsValue` contracts; `applyLayoutOp` (returns its `KmnEditEffect`) and `replayKmnEdits` | Engine + contracts unit tests; corpus harness skeleton runs |
| **B. See every key** | US1 | `DesktopKeyGrid` / `DesktopKeyCell` / `desktopGridViewModel` on `useGridNav` (type loosened) and `LayerSelector`; basic detail panel; read-only reasons + **"view in code"** (`KmnCodePane` `revealNodeId`, using A's line map — US1 s3/s6, US2 s5, US3 s5, FR-015 need it before PR 1); base-fallback join; third tab with TouchGallery-grade tab accessibility; stale/not-compiled states; mnemonic read-only | US1 acceptance; SC-001 and SC-002 on corpus; a11y tests |
| **C. Change keys** | US2 | Edit panel; case-partner proposal (FR-020a); key-first displacement (R9); **`kmn-edits` decision** (id, gallery module with replaying `apply()`, edit-time recording via `commitKmnEdit`), projection step 2.2 (non-empty list only) + tolerance-variant skip; registry entry `kmn-edits`, equivalence-proven; local undo `l`/`lb` (R6); Assign tab shows layout-owned keys | US2 acceptance; SC-003, SC-004, SC-005, SC-011; `derivedEquivalence` gate (census, replay, draft-load); artifact contains the edit |
| **D. Deadkeys** | US3 | Deadkey on key via the spec 083 lifecycle; display character; tables of both shapes (fan-out and keystroke-keyed); "after this deadkey" view; chains followed; space-row proposal; undo `ld` | US3 acceptance; SC-007 (deadkey half), SC-008 |
| *PR 1 opens here* | | | |
| **E. Code-tab edits** | US8 | `kmn-diff` engine module (`diffIR`, `applyIRChanges`, `findOwners`, `invertChanges`); `CodeEdit` / `ReviewKept` contracts; Apply rewired: error gate (parse, Layer A, candidate compile), diff, owner confirm, `commitKmnEdit`; review list + tab count + trail rendering; undo `c` | US8 acceptance; SC-010; km-validator D3 review of the candidate compile |
| **F. Honesty extras** | US5, US6 | Richer read-only detail (all matching rules, counts, replaced values); provisional counts per layer; fallback-policy link | US5, US6 acceptance; SC-006 |
| **G. Contextual rows** | US4 | Context list; "after …" for literal contexts; "becomes" editor; never-fires display (A's `findShadowedRules`); `set-row` / `remove-row` | US4 acceptance; SC-007 (context half), SC-009 |
| H. Tray | US7 | Gated (spec Assumptions) — not planned | — |

## Project Structure

### Documentation (this feature)

```text
specs/117-layout-studio/
├── plan.md              # This file
├── research.md          # Phase 0 (R1–R14)
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── layout-ops.md    # kmn-edits value, LayoutOperation + applyLayoutOp + seams
│   ├── code-edits.md    # CodeEdit, IRChange, diffIR / applyIRChanges, review flags (US8)
│   └── attribution.md   # attribution API, simulateEach, verification, base join
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
├── layoutOps.ts                         # NEW  LayoutOperation, LayoutOutput, LayoutContext, LayerCombo, ModifierToken
├── kmnEdits.ts                          # NEW  KmnEditsValue, KmnEdit; CodeEdit, IRChange, ReviewKept (phase E)
├── schemas.ts                           # +    LayoutOperationSchema, KmnEditsValueSchema (+ CodeEdit arm) + drift guards
└── keyboard-ir.ts                       # +    IRRule.authorEdit?

packages/engine/src/
├── layout-attribution/                  # NEW  attributeLayer, listLayers, listContexts, isMnemonic, findShadowedRules, verifyCells (+ corpus test)
├── layout-ops/                          # NEW  applyLayoutOp, replayKmnEdits, invertEffect (pure)
├── kmn-diff/                            # NEW  diffIR, applyIRChanges, findOwners, invertChanges (phase E)
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
├── editors/assignLoop/KmnCodePane.tsx           # +  revealNodeId (B); Apply → error gate, diff, commitKmnEdit (E)
├── editors/assignLoop/CodeReviewList.tsx        # NEW  review flags list (E)
├── steps/editorMutate.ts                        # +  LAYOUT_WRITES (C), CODE_WRITES (E)
├── stores/workingCopyStore.ts                   # +  commitKmnEdit, undoKmnEdit, undo kinds l/lb/ld/c (no new field)
├── decisions/decisionTypes.ts                   # +  "kmn-edits" id + IR paths
├── survey/questions/gallery/kmnEdits.ts         # NEW  gallery module: apply() replays entries; trail renderer
├── lib/projectionInput.ts                       # +  pass the kmn-edits value to the projection
├── lib/projectWorkingCopyVfs.ts                 # +  step 2.2: replay kmn-edits after assignments + deadkey ops
└── decisions/derivedSurfaceRegistry.ts          # +  kmn-edits surface, equivalence-proven

packages/studio/e2e/layout-tab.spec.ts           # NEW  Playwright (quickstart table)
```

**Structure Decision**: The existing three-package spine. Engine owns everything pure (attribution,
the op, geometry, simulator, emit); studio owns state, persistence, projection, and UI under a new
`editors/layout/` folder, matching `editors/deadkey/` and `editors/assignLoop/`.

## Risks

| Risk | Mitigation |
|---|---|
| Replay order: a layout op and an Assign-tab assignment on the same key | Layout ops replay last and win; the Layout tab warns before overriding an Assign-tab assignment (FR-022), and the Assign tab labels the key "set in the Layout tab". |
| Undo losing unrelated live edits | Undo is a local inverse (R6), never a rebuild from `startIr` + overlays, which would drop live-IR edits that live in no overlay. |
| Re-emitting the artifact changes keyboards that have no edits | Projection step 2.2 runs only when `kmn-edits` has entries (R1). |
| `kmn-edits` recorded at edit time, before `physical-layout` is recorded at completion | Confirm how `orderByDependencies` / `replayKeyboard` treat a `requires` on an unrecorded decision before declaring the ordering (R12). |
| A code entry stops fitting after an earlier decision changes | Content anchors (FR-065); misses flagged, never dropped (FR-063 b); SC-010 tests it. |
| Code-tab candidate compile vs D3 | One-shot on the author's click, no timer, the download precedent; km-validator reviews before phase E lands. |
| `simulateEach` relies on resetting the vendored engine's context between keystrokes | Phase A proves parity with `simulate()` per key on the corpus before anything depends on it. |
| Spec 083 has no display-character field | Phase A checks; if missing, add it as a lifecycle field (`set-display` op), not a layout op. |
| Size (~12k lines) | Ship PR 1 at US3; phases E–F follow on a fresh branch. |

## Spec amendments made with this plan

- **FR-013 / FR-028** (from R3): the spec 083 fan-out shape is an editable deadkey table, keyed by
  base character; other store use stays read-only.
- **Rulings 6 and 7 (2026-11-05):** `kmn-edits` decision (FR-001, FR-021, FR-024, FR-026 amended;
  SC-011); User Story 8 and FR-060–FR-067, SC-010.

## Complexity Tracking

No constitution violations to justify.
