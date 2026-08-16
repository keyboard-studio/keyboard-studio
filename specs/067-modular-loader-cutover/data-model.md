# Phase 1 Data Model: Modular-loader cutover + legacy YAML retirement

This feature adds no new runtime types and changes no contract. The "entities" are the survey flow-data artifacts and the five new question modules. Shapes below reference existing types (`QuestionModule`, `FlowDef`, `FlowQuestion`) in `packages/studio/src/survey/types.ts`.

## Entity: identity-lite thin modular manifest (NEW)

**File**: `content/flows/identity_lite.modular.yaml`

Conforms to `ThinFlowYaml` ([loadModularFlow.ts:29](../../packages/studio/src/survey/loadModularFlow.ts#L29)):

| Field | Value |
|---|---|
| `flow_id` | `identity_lite` |
| `phase` | `"A"` |
| `questions` | `[il_language_autonym, il_language_english, il_language_code, il_target_script, il_script_not_supported]` (legacy order) |
| `provenance_questions` | omitted (identity-lite has none) |

**Validation**: every id MUST resolve in `questionRegistry` (loader throws otherwise); order MUST match `identity_lite.yaml`.

## Entity: 5 new `il_*` QuestionModules (NEW)

**Files**: `packages/studio/src/survey/questions/a/<id>.ts`, each `export default` a `QuestionModule`. Registered in `registry.a.ts` (key === `definition.id`).

Each module's `definition` (a `FlowQuestion`) is ported **verbatim** from `identity_lite.yaml` — prompt, help_text, type, options, required, and `next` preserved exactly. Declared `inputs: []` and `writes: []` (no IR write; `mutate` omitted/stub).

| Module | `definition.type` | `definition.next` | Notes |
|---|---|---|---|
| `il_language_autonym` | `text` (required) | `"il_language_english"` | — |
| `il_language_english` | `text` (required) | `"il_language_code"` | autonym→English seed is external (`IdentityLite.tsx` `getSeedValue`), NOT in the module |
| `il_language_code` | `text` (optional) | `"il_target_script"` | ISO 639 subtag only |
| `il_target_script` | `select` (required) | `FlowGotoRule[]`: `Ethi\|Hani\|Hang → il_script_not_supported`; else `default: null` | options list ported verbatim (14 values incl. `other`) |
| `il_script_not_supported` | `notice` (optional) | `null` | preserves Article VII honest stub |

**State transition (flow routing)** — unchanged from legacy:

```
il_language_autonym → il_language_english → il_language_code → il_target_script
  ├─ value ∈ {Ethi, Hani, Hang} → il_script_not_supported → (end)
  └─ otherwise                   → (end / null)
```

## Entity: per-question mirrored tests (NEW)

**Files**: `packages/studio/tests/survey/questions/a/<id>.test.ts` (one per new module, mirror path derived from source path).

Assert: `validate` accepts each `fixtures` entry and rejects malformed answers; declared `inputs`/`writes` parse under `IRPath` (here, empty). Keeps `mirror-coverage.test.ts` green.

## Entity: CI gate counts (EDIT)

| Gate file | Change |
|---|---|
| `tests/survey/inputs-writes-coverage.test.ts` | module-count floor `93` → `98` |
| `tests/survey/mirror-coverage.test.ts` | no edit — auto-covers new modules once mirrors exist |
| `tests/survey/orphan-input-lint.test.ts` | no edit — now also scans `identity_lite.modular.yaml`; passes because `il_*` declare empty `inputs` |

## Entity: legacy artifacts (DELETE in part b)

| File | Disposition |
|---|---|
| `packages/studio/src/survey/loadFlow.ts` (+ `loadFlow.test.ts`) | delete |
| `content/flows/phase_a_identity.yaml` | delete |
| `content/flows/phase_b_characters.yaml` | delete |
| `content/flows/phase_f_helpdocs.yaml` | delete |
| `content/flows/identity_lite.yaml` | delete |
| `content/flows/*.modular.yaml`, `content/flows/_examples/*` | **retain** |
| any question module | **retain** (no-delete, §3.8) |

## Entity: cut-over phase components (EDIT)

| Component | Edit |
|---|---|
| `PhaseA.tsx` | import `loadModularFlow` not `parseFlow`; `?raw` import → `phase_a_identity.modular.yaml`; `useMemo(() => loadModularFlow(raw))`; remove `TODO(#410)` |
| `PhaseF.tsx` | same against `phase_f_helpdocs.modular.yaml`; remove `TODO(#410)` |
| `IdentityLite.tsx` | same against `identity_lite.modular.yaml`; remove `TODO(#410)`; **keep** `getSeedValue`/`autonymRef` autonym→English seam unchanged |

All edits MUST keep explicit `.ts`/`.tsx` import extensions.
