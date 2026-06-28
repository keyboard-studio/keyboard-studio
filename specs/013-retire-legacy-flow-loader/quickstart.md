# Quickstart / Verification: Retire the legacy full-YAML survey flow loader

Run from repo root. These steps validate the feature end-to-end after the three commits land. See [plan.md](./plan.md) for the approach and [contracts/flow-graph-parity.md](./contracts/flow-graph-parity.md) for the pinned invariants.

## Prerequisites

```bash
pnpm install           # if not already
pnpm --filter @keyboard-studio/studio build   # ensures Vite ?raw assets resolve
```

## US1 — Flow map repointed (gating)

Verify no legacy source remains in `flowmap/` and the modular path drives every section:

```bash
# No legacy loader import or legacy YAML ?raw import inside flowmap/
grep -rnE "loadFlow|parseFlow|phase_a_identity\.yaml|phase_f_helpdocs\.yaml|identity_lite\.yaml|phase_b_characters\.yaml" packages/studio/src/flowmap
#   expected: no match for the legacy *.yaml (only *.modular.yaml) and no parseFlow/loadFlow

# Flow-map tests pass against the modular manifests
pnpm --filter @keyboard-studio/studio test src/flowmap/buildFlowGraph.test.ts
```

Manual check (optional): `pnpm dev`, open the **Flow Map** tab → Survey flow. Each of the four sections (Identity-lite, Phase A, Phase B, Phase F) renders with a node/edge count; no "Failed to parse" banner. Script routing (§9) tab still lists the script rows with `Ethi`/`Hani`/`Hang` gated.

**Expected**: live node set per section == its `*.modular.yaml` question set (INV-1); script-routing rows unchanged (INV-2).

## US2 — Legacy loader deleted

```bash
test ! -e packages/studio/src/survey/loadFlow.ts        && echo "[OK] loadFlow.ts gone"
test ! -e packages/studio/src/survey/loadFlow.test.ts   && echo "[OK] loadFlow.test.ts gone"

# No shipped-code reference to the legacy loader (excluding docs/specs/comments)
grep -rnE "parseFlow|loadFlow" packages/studio/src
#   expected: no match
```

## US3 — Legacy YAMLs deleted, modular + examples kept

```bash
for f in phase_a_identity phase_b_characters phase_f_helpdocs identity_lite; do
  test ! -e "content/flows/$f.yaml" && echo "[OK] $f.yaml gone"
done

ls content/flows/*.modular.yaml        # expect 4 manifests present
ls content/flows/_examples             # expect example fixtures present
```

## Whole-feature gates (after all three commits)

```bash
pnpm typecheck
pnpm lint                              # includes pnpm depcruise (boundary rules)
pnpm --filter @keyboard-studio/studio test
```

**Expected**: all green (SC-005). The Phase 3a `tests/survey/flow-parity.test.ts` remains green throughout.

## Research-content preservation (INV-4 / FR-007)

```bash
# Module count in survey/questions must be unchanged by this feature
find packages/studio/src/survey/questions -name '*.ts' ! -name '*.test.ts' | wc -l
#   compare against the pre-feature count on main — MUST be identical
```

## Rollback

Each commit reverts independently, in reverse dependency order:

```bash
git revert <US3-commit>   # restores the four YAMLs (harmless dead files)
git revert <US2-commit>   # restores loadFlow.ts + test
git revert <US1-commit>   # restores legacy flow-map wiring
```

Reverting US1 alone while US2/US3 stand would leave the map reading deleted YAMLs — always revert 3 → 2 → 1.
