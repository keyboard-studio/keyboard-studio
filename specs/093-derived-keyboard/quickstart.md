# Quickstart / Validation Guide: Derived keyboard (spec 093)

Validation scenarios for [spec.md](spec.md). Per the series lesson (088), success criteria are
measured in the live app (`pnpm dev` Playwright walks) or in store-level tests that drive the
real `StepHost` — never in `DecisionsDemo` or `sc004Harness`. Commands run from the repo root;
tests run through each package's own vitest config (never bare `vitest` at root).

## Prerequisites

- Stacked prerequisites landed: 088 `decisionStore`, 089 pure `apply` + golden-walk baseline,
  090 decision modules with per-item provenance, 091 derived steps, 092 setup-as-a-decision
  (plan.md, "Series prerequisites" — T001 verifies).
- `pnpm install` done; prebuild artifacts present (`pnpm build` runs prebuild automatically).

## Scenario 1 — US1: changing a decision updates the keyboard (SC-001)

Playwright walk in `pnpm dev` (e2e spec added by T012):

1. Start from `basic_kbdfr` (golden-walk keyboard), complete the wizard through carve and
   mechanisms.
2. Go back and change `windows-layout`.
3. **Expect**: carve's proposals, the rules, and the suggested physical and touch keys refresh;
   the author's own removals and AltGr assignments are unchanged.

Unit-level companions (T008–T010):

```bash
pnpm --filter @keyboard-studio/studio exec vitest run src/decisions/recalculate.test.ts src/decisions/downstreamClosure.test.ts
```

covering the US1 provenance matrix: extracted re-runs, default/derived recompute, asked kept
when valid, asked kept + flagged + re-proposed when not, per-item collection behaviour
(orphaned hand-set items shown, not deleted), gated-off records kept inactive and restored.

## Scenario 2 — US2: drafts hold decisions only (SC-003)

Playwright walk in `pnpm dev` (e2e added by T016):

1. Build a keyboard partway, note the emitted source.
2. Reload.
3. **Expect**: the rebuilt source is byte-identical to before the reload, and the saved draft
   envelope contains no `workingCopy` slice — only the starting point's id and `decisions`.

Migration check (T015): load a captured v2 draft fixture; on a rebuild match the `workingCopy`
slice is dropped, on a mismatch it is logged and used once.

**Starting-point change is NOT validated here** — its behaviour is gated on owner ruling (a)
(plan.md); T017 adds its scenario once Matthew rules.

## Scenario 3 — US3: determinism and speed (SC-002, SC-004)

```bash
pnpm --filter @keyboard-studio/studio exec vitest run src/decisions/replayKeyboard.test.ts
```

- **Determinism (SC-002)**: the property test runs random decision-edit sequences and asserts
  incremental rebuild (from checkpoint) equals full replay, byte for byte.
- **Performance (SC-004)**: the measurement harness (T002/T021) reports median single-edit
  rebuild and resume times on `sil_euro_latin` into `perf-baseline.md`. The proposed budgets
  (<300 ms / <2 s) are **pending Matthew's ruling** — the harness reports numbers; it does not
  fail against unruled thresholds.

## Scenario 4 — No regressions (SC-005 + series parity)

1. Golden walk (089 SC-001 script): source zip byte-identical to the `main` baseline.
2. Full studio suite, `tsc`, `eslint`, `depcruise` green; the repropagate contract tests
   (spec 014 R1–R6 semantics) pass against the general rule before `repropagate.ts` is deleted.
3. Grep gates: zero references to `staleSteps` and `steps/repropagate.ts`; no `workingCopy`
   slice written by `draftPersistence.ts`.

```bash
pnpm --filter @keyboard-studio/studio test
pnpm --filter @keyboard-studio/studio exec tsc --noEmit
grep -rn "staleSteps" packages/studio/src   # expect: no results after T011
```
