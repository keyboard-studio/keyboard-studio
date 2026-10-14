# Quickstart / Validation: Steps derived from decisions (spec 091)

How to prove spec 091 works end to end. Run from the repo root of the
`km/derived-steps` worktree, on top of the landed 088–090 stack. Node ≥
22.19.0, pnpm 9; run `pnpm install` and the `prebuild` once on a clean
checkout (`pnpm build` runs it automatically) before judging any failure.

## 1. Unit and parity gates (fast, no dev server)

```bash
# The rewritten parity oracle (FR-005): baseline from main@18e63aa4, every
# difference explained by a requires edge.
pnpm --filter @keyboard-studio/studio exec vitest run src/steps/stepOrder.parity.test.ts

# Derivation unit tests: partition, split runs, derived gates, US1 one-edit.
pnpm --filter @keyboard-studio/studio exec vitest run src/decisions/deriveScreens.test.ts

# Manifest contract over screens (M3 locks, M4/M4b trails, M5, M6).
pnpm --filter @keyboard-studio/studio exec vitest run src/steps/manifest.test.ts

# Question-level parity must be untouched and green.
pnpm --filter @keyboard-studio/studio exec vitest run src/decisions/orderParity.test.ts src/decisions/gateWalkParity.test.ts

# SC-005: every step id on main at 18e63aa4 resolves to a screen.
pnpm --filter @keyboard-studio/studio exec vitest run src/lib/resolveLocation.test.ts

# SC-004: the file is gone and nothing references it.
test ! -e packages/studio/src/steps/stepDependencies.ts
grep -rn "stepDependencies" packages/studio/src --include="*.ts" --include="*.tsx" | grep -v "spec 091" # expect no live references
```

Expected: all green; the parity test names any baseline difference as a
requires-edge explanation or fails.

## 2. US1 — the one-edit test (SC-001)

In a test registry, add `requires: ["base-keyboard"]` to `il_language_autonym`
— one line, nothing else. The derived screens show the autonym question after
the `choose_base` screen, in a second screen labelled `identity` (the split-
run case). Covered automatically by `deriveScreens.test.ts` and by the
store-level test that drives the real `StepHost` with that registry; revert
the edit and the screens equal the baseline again.

## 3. Live walk — same wizard as `main` (SC-002)

```bash
pnpm dev
```

Walk both tracks from the first question to the output screen and compare
against `main`: same screens in the same order — identity, layout,
choose_base, track, project_name (copy track only), characters, marks,
punctuation, invisibles, convenience, carve, deadkeys, rules, mechanisms,
touch_seed_source (first time only), touch, help, package — with the same
questions on each survey screen. Then:

- Open a pre-091 deep link (e.g. `#/survey/carve`) and a draft saved before
  this change: both land on the screen holding that step's decisions
  (SC-005), with all answers present (they are keyed by decision id since
  088).
- Use the footer progress dots / jump navigation (spec 081) across a split
  or gated screen: gated-off screens are skipped, side trails rejoin as
  before.

## 4. Golden walk (SC-003)

Run the golden-walk script added by 089 (copy track from `basic_kbdfr`,
fixed answers) and compare the produced source zip with the baseline
captured from `main`: byte-identical.

## 5. Full gates before the PR

```bash
pnpm --filter @keyboard-studio/studio exec tsc --noEmit   # or the repo typecheck script
pnpm lint        # includes depcruise — the decisions/ boundary must stay cycle-free
```

Never run bare `vitest` at the repo root (empty include by design); run
suites through the studio package as above.
