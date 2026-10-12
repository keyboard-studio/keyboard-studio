# Quickstart: validating spec 086

These are runnable checks that prove the feature end to end. For the API they call, see [contracts/engine-normalization-step.md](contracts/engine-normalization-step.md).

## Prerequisites

- Node ≥ 22.19.0, pnpm 9, and `pnpm install && pnpm build` (prebuild included).
- `../keyboards` checked out at the CI pin (`KEYBOARDS_CORPUS_SHA` in `.github/workflows/ci.yml`).

## 1. Generator: static, deterministic, removable (US1, US2)

```bash
pnpm --filter @keyboard-studio/engine exec vitest run src/pattern-apply/normalization-step
```

Expected:
- `proposeNormalizationStep(sil_yoruba8)` returns a step with at most 9 rules.
- No call reaches `compile` or `simulate`. The test spies on both.
- Two calls on the same IR emit byte-identical source.
- `remove(apply(ir))` emits byte-identical to `ir`.
- Applying twice yields one group.

## 2. Spike parity on the seven keyboards (SC-001 – SC-004)

```bash
pnpm --filter @keyboard-studio/engine exec vitest run src/pattern-apply/normalization-step/parity.corpus.test.ts
```

This needs `../keyboards`; it skips with a `[WARN]` if absent. For each of `el_dinka`, `fv_northern_tutchone`, `fv_tlingit`, `sil_yoruba8`, `el_pan_sahelian`, `sil_cameroon_qwerty` and `sil_tchad`:

| Check | Expected |
|---|---|
| Typed output | 35,532 two-key sequences, 0 differ |
| Pasted alternates | 100% pass |
| Rule count | ≤ the spec's SC-003 bound |
| Compile diagnostics | Equal before and after (`sil_yoruba8`: 9 and 9) |

## 3. Harness record (US4)

```bash
node utilities/nfd-tolerance-corpus/run.mjs --mode normalization-step --keyboard sil_yoruba8 --record /tmp/cnv.json
node utilities/nfd-tolerance-corpus/run.mjs --mode normalization-step --check --record /tmp/cnv.json --keyboard sil_yoruba8
```

Expected:
- The first command writes a `verified` record with `typed.differ = 0`.
- The second exits 0 without simulating.
- Touching the `.kmn` makes `--check` exit 1.

## 4. Studio (US3)

```bash
pnpm dev
```

Walk it with the Playwright CLI, per house practice:

1. Import `sil_yoruba8`, then open the marks step.
2. The context-tolerance station shows "Adds 9 rules. None of your rules change." and up to 5 examples. One row is pasted `e` + U+0323, then `]`, giving `ẹ́`.
3. Accept, then export the source zip. The `.kmn` begins with `begin Unicode > use(generated_context_normalize)` and its original rules are unchanged (diff against the import).
4. Reload the page. The step is restored from the snapshot, and no regeneration runs: the cache-hit log line appears.
5. Decline instead. The exported `.kmn` is byte-identical to the import.

## 5. Fallback (FR-019)

Use a fixture keyboard whose output store is opaque and unsketchable. The station shows the 062 per-rule proposal plus the line "The normalization step could not be generated: opaque-output-store".
