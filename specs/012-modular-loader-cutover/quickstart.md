# Quickstart / Validation Guide: Modular-loader cutover + legacy YAML retirement

How to validate the feature end-to-end. Implementation details live in `tasks.md`; this is the run/verify guide.

## Prerequisites

```bash
pnpm install
```

Working from repo root. Studio package is `@keyboard-studio/studio`.

## Part (a) — cutover validation

### 1. New modules + manifest resolve

```bash
# Registry count gate now expects 98 (was 93)
pnpm --filter @keyboard-studio/studio test tests/survey/inputs-writes-coverage.test.ts
# Every src question module has a mirrored test
pnpm --filter @keyboard-studio/studio test tests/survey/mirror-coverage.test.ts
# identity_lite.modular.yaml resolves with no orphan inputs
pnpm --filter @keyboard-studio/studio test tests/survey/orphan-input-lint.test.ts
```

Expected: all green. A failure naming an unregistered `il_*` id means a module or registry entry is missing.

### 2. Flow-output parity (the core contract — see contracts/flow-output-parity.md)

```bash
pnpm --filter @keyboard-studio/studio test tests/survey/flow-parity.test.ts
```

Expected: Phase A, Phase F, and identity-lite each show **deep equality** between the legacy `parseFlow` output and the modular `loadModularFlow` output on author-visible fields. This must pass before any YAML is deleted.

### 3. No TODO(#410) markers remain

```bash
grep -rn "TODO(#410)" packages/studio/src/ && echo "FAIL: markers remain" || echo "[OK] no markers"
```

Expected: `[OK] no markers`.

### 4. Typecheck + build (import extensions intact)

```bash
pnpm --filter @keyboard-studio/studio typecheck
pnpm build
```

Expected: clean. A resolution error means a moved/edited import dropped its `.ts`/`.tsx` extension.

### 5. E2E lane 1 (copy-edit / Track 1)

Playwright is available as a global CLI (v1.61.1, on PATH — verify with `npx playwright --version`). No devDependency add is needed; create `packages/studio/playwright.config.ts` (testDir `e2e/`, `baseURL: http://localhost:5273`, a `webServer` running `pnpm dev`), ensure browsers are present (`npx playwright install` on first run), then:

```bash
cd packages/studio && npx playwright test copy-edit
```

Expected: lane 1 passes, driving identity-lite → base picker → project-name → Phase A/B → emit.

> **Lane 2 (import-improve / Track 2) caveat (see research.md R5):** lane 2 has an additional blocker — Track 2 import may not be fully live. Confirm with km-frontend before removing its inner `.skip`. If Track 2 import is not live, lane 2 stays blocked and #410 AC#3 closes only partially (`refs #410`, lane 1 green); record this rather than stubbing lane 2 green.

### 6. Manual smoke (optional)

```bash
pnpm dev
```

Open the SPA, run identity-lite and Phase A and Phase F. Confirm the questions, order, defaults, the autonym→English pre-fill, the script `select`, and the "not yet supported" stub for Ethiopic/Han/Hangul all behave as before.

## Part (b) — legacy retirement validation (separate change)

Only after Part (a) is green and merged.

### 1. Delete legacy artifacts

Remove `survey/loadFlow.ts` (+ test) and the four `content/flows/phase_*.yaml` / `identity_lite.yaml`. Retain `*.modular.yaml` and `_examples/*`.

### 2. Nothing imports the deleted loader

```bash
grep -rn "loadFlow\|parseFlow" packages/studio/src/ && echo "FAIL: legacy loader still referenced" || echo "[OK] clean"
```

Expected: `[OK] clean` (the three components now use `loadModularFlow`).

### 3. No question research lost (§3.8)

```bash
pnpm --filter @keyboard-studio/studio test
```

Expected: full suite green — every question module (including any not referenced by a manifest) still compiles and its unit test passes. No module file was deleted.

### 4. Revertability

Reverting only the Part (b) commit restores the legacy YAML and `loadFlow.ts` without touching the cut-over components — confirm the cutover (Part a) remains intact after such a revert.

## Done / acceptance mapping

| Check | Spec criterion |
|---|---|
| §2 parity green for A/F/identity-lite | FR-005, SC-002 |
| §1 gates green (98 modules, mirrors, orphan lint) | FR-003, FR-012 |
| §3 no TODO(#410) | FR-004, SC-003 |
| §5 E2E lane 1 (lane 2 conditional) | FR-007, SC-004 |
| Part (b) §2 clean, §3 full suite green | FR-008..FR-012, SC-005/006 |
| Part (b) §4 independent revert | FR-013, SC-006 |
