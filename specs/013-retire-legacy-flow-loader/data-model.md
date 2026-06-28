# Phase 1 Data Model: Retire the legacy full-YAML survey flow loader

This feature has no runtime data entities (no DB, no new types). The "model" here is the **file inventory** acted on and the one small **type-shape change** to a flow-map helper. Recorded for task generation and verification.

## File inventory (the unit of work)

| File | Action | Commit (US) | Notes |
|------|--------|-------------|-------|
| `packages/studio/src/flowmap/FlowMapView.tsx` | EDIT | US1 | Remove 3 legacy `*.yaml?raw` imports (`phase_a_identity`, `phase_f_helpdocs`, `identity_lite`); import the 3 `*.modular.yaml?raw` instead. `FLOW_SOURCES` entries all become `loader: "modular"` (or the discriminated union collapses to one shape). Each entry carries its phase registry. `ScriptRoutingView` is fed `identityLiteModularRaw`. |
| `packages/studio/src/flowmap/buildFlowGraph.ts` | EDIT | US1 | Add `registry` param to `buildModularFlowGraph`; remove the legacy `buildFlowGraph()` function and the `import { parseFlow }`. Keep `buildGraphFromQuestions`, `computeReserveNodes` unchanged. |
| `packages/studio/src/flowmap/buildScriptRouting.ts` | EDIT | US1 | `import { parseFlow }` → `import { loadModularFlow }`; `parseFlow(raw)` → `loadModularFlow(raw)`. No other change. |
| `packages/studio/src/flowmap/buildFlowGraph.test.ts` | EDIT | US1 | Retarget legacy-YAML `?raw` fixtures to `*.modular.yaml`; update reserve-node expectations (D3); assert live node set == manifest per phase. |
| `packages/studio/src/flowmap/ScriptRoutingView.tsx` | (likely no change) | US1 | Keeps `identityLiteRaw: string` prop; only the string it receives changes upstream. Confirm no legacy reference. |
| `packages/studio/src/survey/loadFlow.ts` | DELETE | US2 | The legacy `parseFlow` parser. |
| `packages/studio/src/survey/loadFlow.test.ts` | DELETE | US2 | Its test. |
| `content/flows/phase_a_identity.yaml` | DELETE | US3 | Legacy full flow. |
| `content/flows/phase_b_characters.yaml` | DELETE | US3 | Legacy full flow. |
| `content/flows/phase_f_helpdocs.yaml` | DELETE | US3 | Legacy full flow. |
| `content/flows/identity_lite.yaml` | DELETE | US3 | Legacy full flow. |
| `content/flows/*.modular.yaml` (×4) | KEEP | — | Surviving thin manifests. |
| `content/flows/_examples/*` | KEEP | — | Example fixtures. |
| `packages/studio/src/survey/questions/**` | KEEP (untouched) | — | Research content — must not change (FR-007). |

## Type-shape change

### `buildModularFlowGraph`

```text
BEFORE: buildModularFlowGraph(raw: string, title: string): FlowGraph
          // reserve nodes hardwired to phaseBRegistry

AFTER:  buildModularFlowGraph(
          raw: string,
          title: string,
          registry: Readonly<Record<string, QuestionModule>>,
        ): FlowGraph
          // reserve nodes computed against the supplied registry
```

The legacy `buildFlowGraph(raw, title): FlowGraph` is **removed** (no remaining caller after US1).

### `FlowSourceEntry` (in `FlowMapView.tsx`)

The current discriminated union `{ …, loader: "legacy" } | { …, loader: "modular" }` collapses: every section is now `"modular"`. Either drop the `loader` discriminant entirely and add a `registry` field, or keep a single-variant record carrying `{ raw, title, registry }`. The `safeBuild` branch on `loader === "modular"` simplifies to a single call.

## Invariants to preserve (assertable)

- **INV-1 (live node parity)**: for each phase, the set of `kind: "live"` graph nodes equals the set of question ids in that phase's `*.modular.yaml` manifest (and equals what `loadModularFlow` resolves at runtime).
- **INV-2 (script routing equivalence)**: the rows from `buildScriptRouting(identity_lite.modular.yaml)` equal the rows previously produced from `identity_lite.yaml` — same `value`/`label`/`script`/`scriptClass`/`routingGroup`/`gated` per option, and the `Ethi`/`Hani`/`Hang` rows are `gated: true`.
- **INV-3 (no legacy reference)**: post-US3, a search over `packages/studio/src` + `content/flows` (excluding `_examples/` and historical comments) finds no `parseFlow`, `loadFlow`, or legacy-YAML filename.
- **INV-4 (research preserved)**: `survey/questions/**` module count and contents unchanged across the whole feature.
