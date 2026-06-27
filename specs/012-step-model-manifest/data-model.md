# Phase 1 Data Model: Unified Step Model + Manifest-Driven Survey Ordering

**Feature**: 012-step-model-manifest | **Date**: 2026-06-27

Entities are the in-memory TypeScript shapes introduced by Phase 4. None of these are `packages/contracts` types — they live in the studio package (`steps/`, `editors/`, `dashboard/`, `stores/`). They reference, but do not modify, the locked `KeyboardIR` / `IRPath` / `FlowQuestion` / `QuestionModule` contracts.

---

## Step (abstract) — `steps/types.ts`

The common unit that advances the survey. Two concrete kinds discriminated by `kind`.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | **Unique across the whole flow.** The reducer and completeness graph key on this. |
| `kind` | `"question-step" \| "editor-step"` | Discriminant. |
| `title` | `string` | Human label (dashboard + chrome). |
| `spine` | `boolean` | `true` = on the main story; `false` = side trail (must carry `joinTarget`). |
| `lock` | `"physical" \| "touch" \| undefined` | Lock gate placed *after* this step completes. Only two locks exist (§3.5). |
| `joinTarget` | `string \| undefined` | **Required when `spine: false`.** The spine step id this side trail rejoins. |
| `inputs` | `readonly IRPath[]` | IR/answer state the step reads. Reused from the P2 `QuestionModule` contract. |
| `writes` | `readonly IRPath[]` | IR paths the step will populate (declared, not executed). |

**Validation rules**:
- `id` unique (manifest-level invariant; `manifest.test.ts`).
- `spine: false` ⇒ `joinTarget` present and resolves to an existing `spine: true` step id (FR-016).
- `lock` only on a `spine: true` step.
- `inputs`/`writes` entries must be valid `IRPath`s (compile-enforced by P2).

### QuestionStep extends Step

| Field | Type | Notes |
|---|---|---|
| `kind` | `"question-step"` | |
| `questionId` | `string` | Resolves to a `QuestionModule` via the existing registry by `definition.id` (never by file path). |

`inputs`/`writes` for a question-step are sourced from its resolved `QuestionModule` (already declared in P2); the manifest entry may omit them and let the register adapter copy them, or restate them — see contracts/.

### EditorStep extends Step

| Field | Type | Notes |
|---|---|---|
| `kind` | `"editor-step"` | |
| `component` | `React.ComponentType<EditorStepProps>` | A gallery or panel adapter; renders a rich editor, advances via `onComplete`. |
| `surface` | `"physical" \| "touch" \| undefined` | For the carve/add editors (§3.6). |

---

## EditorStepProps — `steps/types.ts`

The one prop contract every editor adapter satisfies (superset of all current editor needs).

| Field | Type | Notes |
|---|---|---|
| `onComplete` | `(result: unknown) => void` | Hands the result to the manifest reducer. **Editors perform no side effects** (FR-003). |
| `onBack` | `() => void` | |
| `ctx` | `SurveyContext` | Shared survey/identity context (existing shape). |

Per-editor extras (e.g. `baseKeyboard`, `placementMap`, `surface`) are narrowed by the individual adapters in `editors/adapters/`, not added to this base type.

---

## StepManifest — `steps/manifest.ts`

| Field | Type | Notes |
|---|---|---|
| (module export) | `readonly Step[]` | The single ordered list. Order in the array = survey order. |

**Spine order** (FR-012; functional labels, A–G vocabulary retired):
`Identity → choose base → Characters → Carve → Mechanisms → [lock: physical] → touch carve+add → [lock: touch] → Help → Package(reserved)`, with a `touch_seed_source` **`spine: false`** fork at the touch-phase entry whose `joinTarget` is the touch carve/add spine step.

**Validation rules** (enforced by `completeness.ts` / `manifest.test.ts`):
- All `id`s unique.
- Exactly two `lock` steps (`physical`, `touch`) in spine order.
- Every `spine: false` chain rejoins a `spine: true` step (FR-016).
- The `writes → inputs` graph is acyclic (FR-015).
- No orphan inputs (FR-018).

---

## StepGraph — `dashboard/buildStepGraph.ts`

Derived structure (not stored). Nodes = steps; edges = `next`/branch routing **and** the `writes → inputs` dependency relation.

| Field | Type | Notes |
|---|---|---|
| `nodes` | `StepNode[]` | One per manifest step (incl. galleries + panels — the map==runtime guarantee). |
| `orderEdges` | `Edge[]` | From `next`/spine/side-trail routing. |
| `dataEdges` | `Edge[]` | From `writes → inputs` (a producer's `writes` IRPath matched by a consumer's `inputs`). |

---

## CompletenessReport — `dashboard/completeness.ts`

Result of the five §3.5 checks.

| Field | Type | Notes |
|---|---|---|
| `stale` | `Set<string>` | Transitive closure of step ids invalidated by the re-opened set (fixpoint). |
| `cycles` | `string[][]` | Each cycle in the `writes → inputs` graph; non-empty ⇒ **hard error** (FR-015). |
| `rejoinViolations` | `{ stepId: string; reason: string }[]` | Side trails missing/dead-ending `joinTarget` (FR-016). |
| `unshippablePrefixes` | `number[]` | Spine-prefix indices whose working copy is not complete+lock-consistent (structural proxy — FR-017). |
| `orphanInputs` | `{ stepId: string; path: string }[]` | Inputs produced by no upstream `writes` (FR-018). |
| `unreachable` | `string[]` | Steps not reachable from the spine entry (edge case). |

**State transition (staleness)**: re-open a step → add it to the re-opened set → recompute `stale` as the fixpoint over `dataEdges` → store in the `staleness` slice. Clearing/re-answering a step removes it (and recomputes dependents).

---

## Staleness slice — `stores/workingCopyStore.ts` (EDIT)

Net-new slice alongside the existing `desktopLocked` / survey-results state.

| Field / Action | Type | Notes |
|---|---|---|
| `staleSteps` | `Set<string>` | Currently-stale step ids. **Default: empty ("fresh")** (FR-019). |
| `markStale(reopenedId)` | action | Recompute the closure and set `staleSteps`. |
| `clearStale(stepId)` | action | Drop a step from stale (on re-answer) and recompute dependents. |

No second working copy; this is derived UI state over the one working copy (Constitution Art. III).

---

## TouchKeyProvenance — `editors/assignLoop/provenance.ts` (NEW, reserved)

| Value | Meaning |
|---|---|
| `"base-derived"` | Came from the base touch layout. |
| `"physical-suggested"` | Proposed by `touchSuggest` from a physical decision. |
| `"hand-set"` | Manual touch edit. **Default for pre-existing keys** (never auto-overwritten) — FR-020. |

Reserved tag; no propagation logic reads it this phase (P5).

---

## TouchSuggestPolicy — `editors/touchSuggest/defaults.ts` (NEW, reserved)

Declarative, overridable adaptation policy (defaults-as-data, §3.6). Reserved; the generator that consumes it does not run propagation this phase.

| Field | Type | Notes |
|---|---|---|
| `widthBudget` | `number` | ~10–11 keys/row default. |
| `numberRowTarget` | `"symbol-layer" \| "numeric-layer"` | Number row → a layer. |
| `modifierPolicy` | enum/config | Consolidate, don't replicate (long-press demotion). |
| `deadKeyHost` | `"base"` | Dead-key output → long-press on the **base** char. |
| `defaultGesture` | `"long-press"` | Long-press default; flick opt-in only. |

Overridable per-key and policy-level (FR-021). Each produced key would carry both its provenance and the producing default — reserved shape only.

---

## Relationships

```
StepManifest ──(ordered)──> Step[] ──┬── QuestionStep ──(questionId)──> QuestionModule (registry, P2)
                                     └── EditorStep ──(component)──> EditorStepProps adapter ──> gallery|panel
StepManifest ──> buildStepGraph ──> StepGraph ──> completeness ──> CompletenessReport
reducer (keyed by Step.id) ──> workingCopyStore actions (lockDesktop / setTouchLayoutJson / instantiate*)
workingCopyStore.staleSteps <── markStale(reopened) over StepGraph.dataEdges
EditorStep(surface:"touch") ──> provenance (reserved) ── touchSuggest policy (reserved)
```
