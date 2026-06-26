# Phase 1 Data Model: IRPath + declared `inputs`/`writes`

This feature adds **types and static declarations**, not stored records. The
"entities" are type-level contracts and the per-module declarations.

## Entity: `IRPath`

A typed reference to a **structural location** in the `KeyboardIR` type tree
(`packages/contracts/src/keyboard-ir.ts`). Canonical form is a readonly tuple of
path segments; a string form exists for display.

- **Canonical shape**: `readonly PathSegment[]`, where a segment is either an
  object key (`"stores"`, `"groups"`, `"rules"`, `"output"`, `"touchLayout"`,
  `"platforms"`, `"layers"`, `"rows"`, `"keys"`, …) or the **array-index
  sentinel** for `[]` traversal.
- **Derivation**: computed by recursive conditional types over `KeyboardIR`, so
  the set of valid paths == the set of real locations in the IR type.
- **Coverage (both surfaces)**:
  - Physical: `header.*`, `stores[]` (and `IRStore` fields), `groups[]` →
    `rules[]` (and `IRRule` `context`/`output`), `comments[]`, `raw[]`,
    `recognizedPatterns[]`. `raw[]` is a **terminal**: the opaque-fragment list
    is addressable (a question may declare it reads `raw[]` to warn the user),
    but sub-fields of individual `RawKmnFragment` entries (`raw[].sourceText`,
    `raw[].reason`, …) are not — opaque fragments are not survey-editable
    (out-of-scope rule; mirrors how `Pattern` is also a terminal).
  - Touch: `touchLayout.platforms[].layers[].rows[].keys[]` (bounded — see
    below).
  - Visual: `visualKeyboard.layers[].keys[]`.
- **Bound (P2)**: traversal stops at touch `keys[]`; it does **not** recurse into
  `TouchKeyIR.sk` / `flick` / `multitap` (self-recursive sub-keys). Sub-key paths
  are reserved for P5.
- **Validation rules**:
  - A tuple that is not a valid path through `KeyboardIR` is **not assignable**
    to `IRPath` → compile error (Design AC).
  - Renaming/removing a field in `keyboard-ir.ts` invalidates any tuple naming it
    → typecheck failure (Drift AC).
- **Helpers**:
  - `irPath(...segments)` — ergonomic builder returning a typed `IRPath`.
  - `formatIRPath(path): string` — stable display string (e.g.
    `groups[].rules[].output`) for the dashboard.
- **Home / export**: `packages/contracts/src/ir-path.ts`, re-exported from
  `packages/contracts/src/index.ts`. This export **is** the named contract the
  P0 dashboard consumes (FR-012).

## Entity: extended `QuestionModule`

Existing interface in `packages/studio/src/survey/types.ts`, gaining two optional
fields. No existing field changes; `mutate` stays the commented stub.

| Field | Type | Required | Notes |
|---|---|---|---|
| `definition` | `FlowQuestion` | yes | unchanged |
| `validate?` | `(value) => ValidationResult` | no | unchanged |
| `fixtures` | `{ valid[], invalid[] }` | yes | unchanged |
| **`inputs?`** | `readonly IRPath[]` | no (field) | IR locations this question **reads**; same address space as `writes` |
| **`writes?`** | `readonly IRPath[]` | no (field) | IR locations this question will **populate** |
| `mutate` | — | — | stays commented-out stub (P5; #5b/#232) |

- **Address-space rule (clarification Q1)**: `inputs` and `writes` are **both**
  `readonly IRPath[]` over the same `KeyboardIR` space — a survey-answer
  dependency is expressed as the IR location that answer ultimately populates.
  No separate answer-key space, so `inputs` and `writes` are directly comparable.
- **Coverage rule (clarification Q2 / FR-006)**: every shipped module declares
  **present** `inputs`/`writes` fields; a read-/write-nothing question declares
  an explicit empty array (`inputs: []` / `writes: []`). "Carries" = field
  present (possibly empty). CI fails only on an **absent** field.
- **Type-level optionality vs CI-required presence**: the fields stay `?:`
  optional on the interface (so a revert leaves modules structurally valid and a
  library author isn't blocked by the type), while the **coverage CI gate**
  enforces presence on all shipped modules. The two are intentionally distinct.

## Entity: per-question declaration set (populated across 93 modules)

- **Population**: Phase A = 30, Phase B = 55, Phase F = 8 → **93** total.
- **Module form**: flat `<id>.ts` by default; `<id>/index.ts` + `extras/` when a
  module carries companion artifacts. Registry resolves by `definition.id` in
  both forms (invariant).
- **Library/reserve modules (§3.8)**: still declare `inputs`/`writes`, still
  compile, still have a mirrored test; **never deleted**; exempt from
  flow-integration/E2E and from the manifest-scoped orphan-input lint while
  unreferenced.

## Relationships & invariants (checked, not stored)

- **Orphan-input invariant (FR-007, manifest-scoped)**: for every question a flow
  manifest references, each `input ∈ question.inputs` is produced by some
  **upstream** step's `writes` in that manifest's order. Violations are named and
  fail CI. Library/reserve questions exempt while unreferenced.
- **Write-surface invariant (FR-008, conditional)**: for every strategy-bearing
  question (has `Pattern.strategyId`), `question.writes` equals the strategy's
  §7.7 assignment-map write surface — checked for whatever portion of that
  surface is available at P2 close.
- **Mirror invariant (FR-009)**: every `src/survey/questions/<phase>/<id>` has a
  `tests/survey/questions/<phase>/<id>.test.ts`; mirror path derived from source
  path; a missing test fails CI.
- **No-mutation invariant (Constitution II / FR-005)**: declaring `writes` writes
  nothing — `mutate()` stays a stub; no IR is mutated in P2.

## State transitions

None. All declarations are static data; no lifecycle/state machine. (Staleness
state — §3.5's `staleness` store slice — is explicitly a later phase, not P2.)
