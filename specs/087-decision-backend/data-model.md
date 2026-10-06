# Data Model: Decisions Backend (specs/087-decision-backend)

## Decision

| Field | Type | Notes |
|---|---|---|
| `id` | `DecisionId` | closed-vocabulary member |
| `value` | `unknown` (typed per decision at use sites) | the fact's value |
| `provenance` | `"asked"` \| `"extracted"` \| `"default"` | FR-003; every decision carries one |
| `source` | `string?` | present when extracted: the base keyboard's identity |

## DecisionId

Closed string union. Governance: grows only via corpus mining (US5); never ad-hoc. The duplicate-provider rule (FR-002) applies **per decision**: two modules must not provide the same id.

## QuestionModule (extended)

| Field | Type | Notes |
|---|---|---|
| `provides` | `DecisionId[]` | one or more (Q4 — widened from singular as a plan consequence) |
| `requires` | `DecisionId[]` | must resolve first; drives the topological order (FR-001) |
| `gatedBy` | `((d: DecisionSet) => boolean)?` | derived via `gatedByFromNext` unless hand-overridden (FR-005) |
| `extract` | `(ctx: ExtractContext) => unknown` | reads the import bundle; result runs through `validate()` (FR-004) |
| `renderer` | `ComponentType<DecisionRendererProps<unknown>>?` | single typed props contract (FR-011) |

Unchanged: `definition`, `validate`, `inputs`/`writes` (`IRPath`), `fixtures`.

## ExtractContext (Q1)

| Field | Type | Notes |
|---|---|---|
| `ir` | `KeyboardIR \| null` | parsed base keyboard; null on parse failure → extracts absent |
| `catalog` | `BaseKeyboard \| null` | `id`, `script`, `languages[]`, `displayName`, `version` — where language identity lives |

Source: the existing `workingCopyStore` slots (`baseIr`, `baseKeyboard`) — no new store.

## DecisionSet

`Partial<Record<DecisionId, Decision>>` — an absent key means unresolved: not yet asked, gated out, or missing.

## DecisionDiff

| Field | Type | Notes |
|---|---|---|
| `id` | `DecisionId` | |
| `status` | `"confirmed"` \| `"changed"` \| `"missing"` | confirmed = extracted and never overridden (or overridden with an equal value, deep-equal) |
| `provenance` | `Provenance` | of the winning value |

## DraftMigration (Q5)

Static, registry-versioned table `oldAnswerKey → DecisionId`. At load: map answers onto decisions; unmappable answers surface visibly for re-answer — never silently dropped.

## Relationships

- Module **1..n** Decisions (`provides`); Decision **exactly 1** provider (load-time enforced).
- `requires` edges form a DAG; unresolved ids, duplicate providers, and cycles are named load-time errors (FR-002).
- DecisionId ↔ IRPath: the declared `decisionIRPaths` relation; the consistency lint keeps the ordering DAG and the data-flow DAG from diverging.
- **Influence** (Q4): answering one decision may change others' visibility or defaults — expressed only through `gatedBy` and derived ordering, never through module size.

## Validation rules (from the FRs)

- FR-002: unresolved / duplicate / cycle → named errors, fail fast at load.
- FR-004: extract results pass through the module's `validate()`; failures → treated as absent (question asked).
- FR-007: mutate patches contained in declared `writes`; violations → whole-patch rejection, working copy untouched.
- FR-009: the management UI renders only under `import.meta.env.DEV` (already landed on the demo).
