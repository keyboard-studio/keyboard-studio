# Contract: Architecture Boundaries (`.dependency-cruiser.cjs`)

**Feature**: 012-step-model-manifest | **Phase**: P4a (editors edges) + P4b (steps/dashboard edges)

dependency-cruiser rules are architectural contracts ("fitness functions") in this repo. Phase 4 adds the first intra-`studio/src` layering beyond the P1 `ui/` leaf. All rules are net-new (§8) — the audit confirmed only `ui-is-a-leaf` exists today.

## Rules to add

| Rule name | from | forbidden to (severity error) | Rationale |
|---|---|---|---|
| `ui-is-a-leaf` *(exists, P1 — keep green)* | `studio/src/ui/` | `studio/src/(survey\|steps\|stores)/` | P1 leaf. |
| `editors-allowed-edges` | `studio/src/editors/` | *(none forbidden for `stores/` + `lib/`)* | **Explicitly ALLOW** `editors/ → stores/` and `editors/ → lib/` (galleries bind `workingCopyStore`, `irToCarveNodes`, `buildTouchLayoutJson`). Forbid only edges to `dashboard/`. |
| `steps-layer` | `studio/src/steps/` | edges other than `survey/` (registry), `editors/`, `contracts`, `ui/` | `steps/` orchestrates; it may read the registry + editor components. |
| `dashboard-layer` | `studio/src/dashboard/` | edges other than `steps/`, `contracts`, `ui/` | Dashboard reads the manifest + survey/IR types + chrome (§8 correction: contracts + ui, not steps alone). |

## Guarantees (testable — `pnpm depcruise`)

- **B1 — `editors/ → stores/` and `editors/ → lib/` pass** (allowed edges; FR-007).
- **B2 — `ui/` leaf still green** — no `ui/` import from `survey/`/`steps/`/`stores/` (P1 unchanged; FR-007).
- **B3 — probe import fails.** A probe edge that violates a new rule (e.g. `dashboard/ → editors/`, or `editors/ → dashboard/`) fails `pnpm depcruise`. *(Test: add probe, confirm red; remove, confirm green.)*
- **B4 — no new forbidden cross-layer edge** is introduced by the moves (the move of galleries/panels into `editors/` and `flowmap/`→`dashboard/` stays within allowed edges).

## Constraint

All moves must preserve explicit `.ts`/`.tsx` import extensions (Bundler resolution; §8). Folder-per-question `<id>/index.ts` imported as `…/<id>/index.ts`. Codemods must not strip extensions.
