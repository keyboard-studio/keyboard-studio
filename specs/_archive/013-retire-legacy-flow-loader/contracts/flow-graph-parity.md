# Contract: Flow-graph parity & `buildModularFlowGraph` signature

The only externally-observable interfaces this feature changes are (a) the internal `flowmap/` build API and (b) the developer-facing Flow Map output. This contract pins both so tasks and verification have a fixed target.

## C1 — `buildModularFlowGraph` API

```ts
// packages/studio/src/flowmap/buildFlowGraph.ts
export function buildModularFlowGraph(
  raw: string,                                       // *.modular.yaml ?raw source
  title: string,                                     // section title for the map
  registry: Readonly<Record<string, QuestionModule>>, // registry to compute reserve nodes against
): FlowGraph;
```

- MUST resolve questions via `loadModularFlow(raw)` (unchanged loader).
- MUST compute reserve nodes via `computeReserveNodes(flow, registry)` using the **supplied** registry (no hardwired `phaseBRegistry`).
- MUST throw (propagate `loadModularFlow`'s error) on empty/unparseable/unknown-id manifests — callers surface the error; never fall back to a legacy YAML.
- The legacy `buildFlowGraph(raw, title)` function and the `parseFlow` import MUST be removed; no symbol in `flowmap/` may import from `../survey/loadFlow.ts`.

**Call sites (in `FlowMapView.tsx`)**:

| Section | manifest | registry |
|---------|----------|----------|
| Identity-lite (Phase A head) | `identity_lite.modular.yaml` | `phaseARegistry` |
| Phase A — identity | `phase_a_identity.modular.yaml` | `phaseARegistry` |
| Phase B — character discovery | `phase_b_characters.modular.yaml` | `phaseBRegistry` |
| Phase F — help docs | `phase_f_helpdocs.modular.yaml` | `phaseFRegistry` |

## C2 — `buildScriptRouting` API (unchanged signature, changed loader)

```ts
export function buildScriptRouting(raw: string): ScriptRoutingRow[];
```

- Signature unchanged. MUST internally use `loadModularFlow(raw)` instead of `parseFlow(raw)`.
- Fed `identity_lite.modular.yaml?raw` by `FlowMapView`.
- Output rows MUST be element-wise equal to the pre-change output from `identity_lite.yaml` (INV-2): same `value`, `label`, `script`, `variant?`, `scriptClass`, `routingGroup`, `gated` for every `il_target_script` option; `Ethi`/`Hani`/`Hang` rows `gated: true`.

## C3 — Flow Map rendered output

- **Live nodes**: per section, the `kind: "live"` node set equals the manifest's question ids (INV-1) and equals the live survey runtime for that phase (SC-002).
- **Reserve nodes**: A/F/identity-lite sections MAY now show `kind: "library-not-in-flow"` nodes (D3) — this is expected and consistent with Phase B; it is additive and does not affect the live set.
- **Edges**: derived from each question's `next` exactly as today via `buildGraphFromQuestions` (linear string → one edge; `FlowGotoRule[]` → one edge per rule; `null`/absent → terminal). Dangling targets continue to be flagged, not dropped.
- **Error handling**: a failed modular build renders the section's error banner; never falls back to a legacy source.

## C4 — Test contract

- `buildFlowGraph.test.ts` MUST NOT import any legacy `*.yaml`; it asserts INV-1 and INV-2 against the modular manifests.
- `loadFlow.test.ts` is deleted with `loadFlow.ts`.
- `tests/survey/flow-parity.test.ts` (Phase 3a) MUST remain green throughout (it does not import the legacy loader).
- After all commits: `pnpm typecheck`, `pnpm lint` (incl. `pnpm depcruise`), `pnpm --filter @keyboard-studio/studio test` all pass (SC-005).
