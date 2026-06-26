# Quickstart: Verify the dashboard-honest flow map (P0)

A run/validation guide proving P0 works end-to-end. Implementation details live in the plan and `tasks.md`; this is how you *check* it.

## Prerequisites

- `pnpm install` (Node ≥ 20, pnpm 9) at repo root.
- Working on branch `010-dashboard-honest-flow-map`.

## 1. Run the verification tests (fastest signal)

```
pnpm --filter @keyboard-studio/studio test src/flowmap/buildFlowGraph.test.ts
```

Expected:
- **Derived-equality passes** — the live Phase B node-id set equals `loadModularFlow(phase_b_characters.modular.yaml)`'s resolved id set (FR-002).
- **Reserve assertion passes** — library node ids = `phaseBRegistry` keys − live ids (FR-008).
- **Stub assertion passes** — each gallery + wizard stage appears once as a `stub`/`not-yet-ordered` node (FR-005/FR-007).
- **Edge/label snapshot matches** (FR-010 Part C). On a first run, the snapshot is written; review it before committing.

### Honesty regression probe (proves "map == runtime" is real)

Temporarily remove or add one question id in `content/flows/phase_b_characters.modular.yaml`, re-run the test:
- The **derived-equality test MUST fail** (the map tracked the change, the assertion caught the divergence). Revert the manifest afterward. *(FR-005/SC-005)*

## 2. Eyeball the map in the dev SPA

```
pnpm dev
```

Open the flow-map / dashboard view and confirm:
- **Phase B**: every question shown corresponds to a live step; no ghosts, no missing (cross-check against the manifest). *(FR-002)*
- **Reserve modules**: any registered Phase B module not in the manifest appears as a visibly distinct **"library / not-in-flow"** node. *(FR-008)*
- **Stubs**: carve / mechanism / touch galleries and the five wizard steps (track, project-name, scaffold, identity panel, base resolution) appear as **stub** nodes in a separate **"not-yet-ordered"** region. *(FR-005/FR-007)*
- **A/F/identity-lite**: still rendered and intact (not blanked/broken). *(FR-004)*
- **Read-only**: no reorder/edit/promote affordance anywhere. *(FR-009)*

## 3. Fail-visible probe (FR-011)

Temporarily point the Phase B modular source at an empty or malformed manifest (or rename a manifest id so it is absent from the registry). Expected: the Phase B section shows a **visible error** and renders no Phase B nodes — it does **not** silently fall back to `phase_b_characters.yaml`. Revert afterward.

## Success = spec criteria met

- SC-001 zero ghost/missing Phase B nodes · SC-002 all galleries+wizard steps visible as stubs · SC-003 zero Phase B nodes from legacy YAML · SC-004 A/F/identity-lite intact · SC-005 runtime change reflected + divergence caught · SC-006 read-only.

## Notes

- Don't run bare `vitest` at the repo root (the root config has an empty `include`); always go through the package filter.
- Keep new/moved imports' explicit `.ts`/`.tsx` extensions.
