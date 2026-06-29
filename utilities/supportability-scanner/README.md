# supportability-scanner

Standalone CLI that runs the **KeyboardIR codec** ([packages/engine/src/codec/](../../packages/engine/src/codec/index.ts), issue #233) over every keyboard in a `keymanapp/keyboards` `release/` tree and emits a supportability summary:

- [docs/import-corpus.json](../../docs/import-corpus.json) — machine-readable; consumed by the source-selection browser (spec §4, §8 step 1) to filter the keyboards it advertises as **import-ready**.
- [docs/import-corpus.md](../../docs/import-corpus.md) — the human-readable table.

A keyboard is **import-ready** when the codec produces `ImportStatus.Clean` or `ImportStatus.CleanWithOpaque` (no parse failure) and the I2 round-trip passes. The corpus-wide opaque-feature inventory in the report is the complete `RawKmnFragment` boundary list — the input to #232 open question 4.

Like [utilities/kbgen](../kbgen/), this is a **standalone tool**, not a `packages/*` workspace member — it is kept out of `pnpm -r`. Unlike kbgen it is ESM/TypeScript, because it imports the codec source directly.

## Scope: codec + Layer A' I1/I3/I4 wired; I2-functional and I5 deferred

Layer A' (#236) landed, and the checks runnable over a `release/` corpus are now invoked per keyboard from [packages/engine/src/validator/layer-a-prime.ts](../../packages/engine/src/validator/layer-a-prime.ts):

| Column / field | Source | Layer A' check |
| --- | --- | --- |
| `ImportStatus` | `Clean` / `CleanWithOpaque` / `ParseFailure` are exact from `parse()`. `RoundTripDivergence` is derived from a **structural** round-trip. | — |
| `I2 (structural)` | `parse → emit → parse`, deep-equal of the normalised IR (mirrors the codec's `roundtrip.test.ts`). | proxy for **I2** |
| `layerAPrime.i1ParseComplete` | `checkParseCompleteness` — `false` if ≥1 source token has no IR node. | **I1** |
| `layerAPrime.i3HeaderMissing` | `checkHeaderPreservation` — name / copyright / version fields absent/empty in the emitted `.kmn` (short labels recovered via layer-a-prime's lock-tested `headerFieldLabel` extractor). The check's **bcp47** dimension is excluded in this scan: language tags live in the `.kps` / `.keyboard_info`, not the `.kmn`, so it would false-positive on every keyboard. (bcp47 stays in scope on the import path, where package metadata populates it.) | **I3** |
| opaque inventory | the codec's `opaqueFeatures`; also the documented surface of `checkOpaqueFeatureInventory`. | **I4** |
| `recognizedRatio` | the pattern recognizer ([#234](../../packages/engine/src/recognizer/index.ts)). | — |

`layerAPrime` is **`null`** for a `ParseFailure` keyboard (the checks never ran) — distinct from `{ i1ParseComplete: true }` (ran and passed). The Markdown table renders `n/a` for those rows, and the I1/I3 summary counts are denominated over parsed keyboards only, so a parse-failure is never miscounted as I1-clean.

**Why I2-functional and I5 are not wired.** The formal I2 (`checkRoundTrip`) is a **deferred stub**: it needs the Keyman Core keystroke runtime (this build ships kmcmplib, a *compiler*, not Core, a *runtime*), so it only generates a corpus and returns a "deferred" hint. The **structural** round-trip proxy therefore remains the only real `RoundTripDivergence` signal. I5 (`checkSidecarHash`) verifies a per-keyboard `.kmn.imported.sha256` sidecar that the studio writes **at import time** — upstream `release/` keyboards have none, so I5 is N/A for a corpus scan.

The **structural** round-trip is conservative: it flags any case where re-emitting and re-parsing changes the IR — including emit-fidelity gaps in the codec itself (e.g. SMP-literal rules that survive the first parse as typed rules but are re-emitted into a form the parser then treats as opaque). These are real codec round-trip gaps, distinct from the *functional* equivalence the contract's `RoundTripDivergence` is ultimately defined by. The `i2` field in the JSON records which kind ran (`structural-pass` / `structural-divergence`).

The JSON shape (`schema: import-corpus/v2`) is a superset of the contract `ImportReport`, so consumers do not need to change.

## Prerequisites

- The sibling `keymanapp/keyboards` checkout at `../keyboards` (see [docs/keyboard-index.md](../../docs/keyboard-index.md)). Only the `release/` tree is read.
- Node 22+. `tsx` is fetched on demand by `pnpm dlx` (no install required), or installed locally via `pnpm install` in this directory.

## Usage

From this directory:

```sh
# zero-install (fetches tsx on demand):
pnpm dlx tsx scan.ts

# or, after `pnpm install` here:
pnpm scan
```

From the repo root, point tsx at this directory's tsconfig (it carries the
`@keyboard-studio/contracts` paths mapping the codec source needs):

```sh
TSX_TSCONFIG_PATH=utilities/supportability-scanner/tsconfig.json \
  pnpm dlx tsx utilities/supportability-scanner/scan.ts
```

Options:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--release-dir <path>` | `../keyboards/release` (relative to repo root) | `release/` tree to scan. |
| `--out <dir>` | `<repo>/docs` | output directory for the two artifacts. |
| `--limit <n>` | — | scan only the first *n* keyboards (dev). |
| `--check` | off | regenerate in memory and **exit 1 if the committed `import-corpus.json` is stale** (CI mode). Writes nothing. |
| `--quiet` | off | suppress per-keyboard progress. |

Full-corpus run time is well under the 5-minute budget (≈40 s for ~925 keyboards on a developer machine; the structural round-trip's second parse is the dominant cost).

## Interpreting the output

- **Import-ready** = `clean` + `clean-with-opaque`. These are safe for the source-selection browser to advertise.
- **`round-trip-divergence`** — the codec parsed the file but the IR did not survive a structural round-trip. Today this includes codec emit-fidelity gaps; treat the count as an upper bound on functional divergence until #236 wires in the WASM oracle.
- **`parse-failure`** — the codec hit a syntax it could not turn into a usable IR. `parseErrors` in the JSON has the message.
- **`recognizedRatio`** — fraction of typed IR rules owned by a recognized `Pattern`. Currently low corpus-wide because only S-01/S-02 recognizers exist (#234).
- **opaque inventory** — per-keyboard and corpus-wide `RawKmnFragment` reasons (`if-option-store`, `named-deadkey`, `smp-literal`, …). The corpus-wide table answers #232 open question 4.

## Determinism / CI

`import-corpus.json` is **deterministic**: reports are sorted (by status, then keyboard ID), opaque inventories are sorted, and the payload carries **no wall-clock timestamp**. This lets `--check` diff it byte-for-byte. The CI workflow ([.github/workflows/supportability-scan.yml](../../.github/workflows/supportability-scan.yml)) runs `--check` on any change to the codec or the Layer A' check module and fails if the committed corpus is stale.

## Not yet implemented

- **Functional I2 (Keyman Core keystroke runtime)** — `checkRoundTrip` is a deferred stub; until Core integration lands, the structural proxy stands in for `RoundTripDivergence`. Tracked as the I2 follow-up.
- **I5 (sidecar hash)** — not applicable to a `release/` corpus scan (no per-keyboard import sidecar exists); it runs only on studio-imported keyboards.
