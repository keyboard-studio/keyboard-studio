# Data Model: Steps derived from decisions (spec 091)

Phase 1 design for [spec.md](spec.md). Internal only — this feature exposes
no external API, so there is no `contracts/` directory; the one interface
contract (the derivation function) is stated here. All types live in
`packages/studio`; nothing in `packages/contracts` changes.

## Entities

### DecisionModule (existing, extended)

The post-090 module shape — a question module
([survey/types.ts](../../../packages/studio/src/survey/types.ts)
`QuestionModule`) or a gallery/picker module from 090 — is the derivation's
only input. Fields the derivation reads:

| field | source | use in 091 |
|---|---|---|
| `provides: DecisionId[]` | 087 | which decisions this module settles |
| `requires: DecisionId[]` | 087 | placement edges (FR-001) |
| `gatedBy` | routing-derived for questions (087); declared for custom modules (moved by 091 FR-003) | screen visibility |
| `renderer` | 090 FR-001 (`"question"` vs. component) | partition: singleton vs. merged run |
| `group?: string` | **new in 091** | key + label of a merged question screen; names the enclosing custom screen for intra-step flows (research: two-level treatment). Never affects order (US3). |
| `apply`, `extract`, `validate` | 089/090 | not read by the derivation |

Validation rules (enforced by the derivation, fail-fast, named errors —
the same style as `orderByDependencies`):

- One provider per decision (existing rule, unchanged).
- Every `requires` has a provider (existing rule, unchanged).
- A question module's `group` is required if it is to form a top-level
  screen; a question module whose `group` names a custom screen is
  intra-step and forms no top-level screen.
- Two modules providing decisions for the same screen key must agree on the
  screen's kind (a group key cannot name both a question screen and a
  custom singleton).

### DerivedScreen (new)

The wizard's unit of navigation after 091. Pure data, recomputed from the
module list; never stored.

| field | meaning |
|---|---|
| `id: string` | Derived display id: the `group` for a question screen; the module's declared screen key for a singleton (seeded with today's step names). FR-004. |
| `kind: "question" \| "custom"` | Question screens are hosted by the SurveyRunner/FlowStepHost over their member modules; custom screens host the module's renderer component. |
| `group?: string` | The label key for question screens; repeats when a run is split (US3 edge case). Display only. |
| `decisionIds: DecisionId[]` | Member decisions, in derived order. |
| `moduleIds: string[]` | Member modules, in derived order (FlowStepHost membership; Flow Map drill-down source replacing `flowRefs`). |
| `gatedBy?: (decisions: DecisionSet) => boolean` | Derived: present iff every member decision is gated; evaluates the member gates against the live `decisionStore`. Absent = always walked. |
| `spine: boolean`, `joinTarget?: string` | Derived trail structure (existing `deriveStepStructure` over screens): a gated screen is a side trail rejoining at the next ungated screen. |

State transitions: none — a screen list is a pure function of the module
list; per-session visibility is the same list filtered by each screen's
derived gate against the current DecisionSet.

### deriveScreens (the contract)

```text
deriveScreens(modules: readonly DecisionModule[]): DerivedScreen[]
```

1. Order all modules with `orderByDependencies` (the one sort; requires →
   provider edges, routing predecessors, stable tie-break on declaration
   order). A decision's slot is the earliest after every decision it
   `requires` is settled (FR-001).
2. Partition the ordered modules into maximal runs per the screen formation
   rule (research.md): component renderer → singleton screen; consecutive
   question renderers sharing a `group` → one screen; a group change or an
   intervening singleton splits the run.
3. Attach derived gates and trail structure.

Deterministic, no store access, no I/O — testable against a test registry
without the shell (US1), and drivable through the real `StepHost` when the
manifest is built from that registry (SC-001).

### LegacyStepIdMap (new, frozen data)

`Readonly<Record<string, string>>` — each of the 18 step ids on `main` at
18e63aa4 (research.md inventory) → the id of the screen that holds that
step's decisions. Frozen as data with the SC-005 test over it; most entries
are identity mappings under the seeded screen keys, and the map exists so a
rename is a data change, not a code path. `done` / `unsupported` pass
through unmapped (terminals, not screens).

### Step (existing, narrowed)

[steps/types.ts](../../../packages/studio/src/steps/types.ts) `Step` keeps
its declaration fields — `kind`, `component` / `questionId`, `inputs`,
`writes`, `persistence`, `specRef`, `lock`, `layout`, `rightPane`,
`evidence` — and loses the ordering fields `provides`, `requires`,
`gatedBy`, `flowRefs`. The manifest pool is keyed by screen id; the manifest
array is the pool arranged by the derived screen order, validated by the
M-rules (locks, unique ids) over that order. Constitution Article IX's
"unordered set of step declarations" wording is preserved.

## Relationships

- DecisionModule 1..n → 1 DerivedScreen (every live decision's module is on
  exactly one screen, or is intra-step under exactly one custom screen).
- DerivedScreen 1 → 1 manifest `Step` declaration (component host), except
  question screens, whose host is the shared FlowStepHost.
- LegacyStepIdMap n → 1 DerivedScreen (deep links and draft history resolve
  through it).
