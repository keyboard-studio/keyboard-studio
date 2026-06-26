# Quickstart / Validation Guide: IRPath + declared `inputs`/`writes`

Runnable scenarios that prove P2 works end-to-end. Run from the repo root.
Details live in [contracts/irpath-contract.md](contracts/irpath-contract.md) and
[data-model.md](data-model.md); this is the validation/run guide.

## Prerequisites

```bash
pnpm install
pnpm prebuild        # fetch-kmcmplib + compile-recognizer-rules (clean-checkout requirement)
```

## Scenario 1 — `IRPath` enforces valid paths at compile time (G1, Design AC)

**Goal**: a valid path compiles; an invalid one is a compile error.

```bash
pnpm --filter @keyboard-studio/contracts test src/ir-path.test.ts
pnpm typecheck
```

**Expected**: `ir-path.test.ts` passes — positive cases (a physical
`groups[].rules[].output` path and the deep touch
`touchLayout.platforms[].layers[].rows[].keys[]` path) are assignable to
`IRPath`; negative cases marked `// @ts-expect-error` are rejected. `pnpm
typecheck` is green. Deleting an `@ts-expect-error` over a genuinely-invalid path
makes typecheck fail (the expectation is now unused) — proving the compile-error
guarantee is live.

## Scenario 2 — A stale `writes` path fails typecheck (G2, Drift AC)

**Goal**: a `writes` path that no longer exists in `keyboard-ir.ts` breaks the build.

1. Temporarily rename a field in `packages/contracts/src/keyboard-ir.ts` (e.g.
   `IRRule.output` → `IRRule.outputXX`).
2. Run `pnpm typecheck`.

**Expected**: typecheck **fails** at every module/test declaring an `IRPath` that
named `…rules[].output`. Revert the rename; typecheck returns green. (This is the
drift guard — no codegen to re-run.)

## Scenario 3 — Every module carries `inputs`/`writes` (FR-006, coverage)

```bash
pnpm --filter @keyboard-studio/studio test -t "coverage"
```

**Expected**: the coverage spec confirms all **93** modules (A 30 / B 55 / F 8)
have **present** `inputs` and `writes` fields. Removing a field from any module
(or leaving one off a new module) fails this gate; declaring `inputs: []` /
`writes: []` on a read-/write-nothing question passes (presence, not non-empty).

## Scenario 4 — No orphan inputs in flow manifests (FR-007, manifest-scoped)

```bash
pnpm --filter @keyboard-studio/studio test -t "orphan"
```

**Expected**: for every question a flow manifest references, each declared
`input` is produced by some upstream step's `writes`. Introducing a question
whose `input` has no upstream `write` fails the lint, naming the orphan. Library/
reserve questions (referenced by no manifest) are **not** checked.

## Scenario 5 — Declared `writes` match the strategy write surface (FR-008, conditional)

```bash
pnpm --filter @keyboard-studio/studio test -t "write-surface"
```

**Expected**: for each strategy-bearing question whose §7.7 assignment-map write
surface is available, declared `writes` exactly match that surface. Questions
whose surface is not yet exposed by §7.7 are skipped (conditional gate) — the
test passes for the available portion and does not block on full §7.7.

## Scenario 6 — Every question has a mirrored test (FR-009)

```bash
pnpm --filter @keyboard-studio/studio test -t "mirror"
```

**Expected**: the directory-diff spec maps each
`src/survey/questions/<phase>/<id>` to
`tests/survey/questions/<phase>/<id>.test.ts`. A module without its mirrored test
fails CI.

## Scenario 7 — Folder-form module resolves by `definition.id` (FR-010)

**Goal**: a companion-artifact module in `<id>/index.ts` + `extras/` is identical
to callers.

```bash
pnpm --filter @keyboard-studio/studio test src/survey/questions/registry.test.ts
```

**Expected**: the registry resolves the converted module by its `definition.id`
exactly as for a flat `<id>.ts`; no caller changes; its mirrored test still maps.

## Full gate (what CI runs)

```bash
pnpm typecheck && pnpm -r test && pnpm lint
```

**Expected**: green. `mutate()` remains a stub throughout — no IR is written in
P2 (Constitution Article II / FR-005).
