# corpus-eval

Standalone CLI that automates the spec §7.5 validation round-trip at corpus
scale (specs/007-strategy-selection §7.5.1, issue #297): for every
`release/` keyboard that passes Layer A′ import fidelity, it parses the
`.kmn` to IR with the KeyboardIR codec, runs the pattern recognizer,
derives the §7.1 axis vector from the lifted patterns and IR structure,
runs the §7.2 decision tree, and compares the tree-selected primary
against the dominant `strategyId` among the recognized patterns.
Disagreements are emitted as `StrategyDivergence` records (the contracts
type in `packages/contracts/src/strategyDivergence.ts`), grouped into
clusters — the tree-rule discovery mechanism of §7.5.1.

Like [utilities/supportability-scanner](../supportability-scanner/), this
is a **standalone tool**, not a `packages/*` workspace member — it is kept
out of `pnpm -r`, imports engine + contracts SOURCE directly (relative
paths + the shared `../tsconfig.contracts-paths.json` mappings), and runs
under `tsx`. It never runs inside the author's survey walk.

## What it reuses (no reimplementation drift)

| Piece | Source |
|---|---|
| Parse to IR | engine codec `parse()` |
| Layer A′ gate | import status from the parse (Clean / CleanWithOpaque run; parse failures are counted, never evaluated) |
| Recognizer | engine `recognizePatterns()` (#234) |
| §7.2 decision tree | engine `selectStrategy()` over the rules tables — firing order primary 1–8 → 11 → 12, then add-ons 9–10, exactly as shipped |
| Axis default-fill | engine `defaultFillAxes()` (script-class prior, §7.2) |
| A3a postfix detection | engine `detectMarkInputOrderFromImport()` |
| A7 key budget | contracts `measureKeyBudget()` + its A7 projection (spec 052 FR-016 — never re-derived) |
| A1 added-char count | `buildProducedSet()` minus the pinned stock `kbdus` set — the same measurement the facet-index added-char-count classifier reports |

## Axis derivation (axes.ts)

Derived from IR structure, per the issue: **A1** from the new-character
count (bands per §7.1, contiguous at 300 — the facet-index closure of the
§7.1 300–1000 gap); **A2** from the dominant produced script (attestation
tally over the engine's UCD `scriptOf`, ISO 15924 → §7.1 class);
**A4** from deadkey families (0 → none, 1 → stacking-combining, ≥2 →
multi-family, the marks-station family counting) with a replacing-cycling
detector for the Vietnamese shape (same key re-marking a precomposed
marked letter — bare-mark pickers and punctuation-doubling rules are
deliberately excluded, see the detector's comment); **A7** from the
canonical key-budget measurement; **A7a** from base-plane stock-key
reassignment share. **A2a** reads context-carrying rules. **A3** is a
named heuristic (Latin content or a declared `&MNEMONICLAYOUT` → strong).
Everything not derived — A5, and any axis whose derivation found no
evidence — is filled by the script-class prior, and the fills are recorded
on each divergence record (`axisFills`) so "measured" is never confused
with "assumed".

**Agreement** (§7.5's own convention): the recognizer-dominant strategy
equals the tree's primary OR one of its secondaries (the Yoruba S-11 wrap
case). The recognizer currently lifts S-01/S-02/S-03 shapes; keyboards it
lifts nothing from are reported **unevaluable** and counted, not forced.

## Usage

From this directory, with `tsx` available (repo root `node_modules/.bin`
after a workspace install):

```sh
TSX_TSCONFIG_PATH=$PWD/tsconfig.json ../../node_modules/.bin/tsx cli.ts \
  --corpus-root <dir-containing-release/> [--vendor sil] [--limit 50] \
  [--only sil_ipa,sil_euro_latin] [--out <dir>] [--quiet]
```

- `--corpus-root` — the corpus location is a parameter; the default is
  the sibling `keyboards` checkout next to this repo (the supportability
  scanner's convention). Nothing else assumes a corpus path.
- `--out <dir>` — writes `corpus-eval.json` (schema `corpus-eval/v1`:
  summary, per-keyboard evaluations, full divergence records, clusters)
  and `corpus-eval.md` (the human-readable rendering).

## Regression gate

`seed.test.ts` encodes the 13-row §7.5 hand table (`seed-fixtures.ts`) as
the seed fixture set: every row's documented tree pick AND documented
agreement verdict must reproduce, including the one remaining intentional
EuroLatin mismatch. `corpus.integration.test.ts` runs the round-trip over
a real corpus family when a checkout is present (skips cleanly otherwise)
and pins sil_ipa's from-source agreement (rule 3a, S-03).

Run tests from this directory:

```sh
../../node_modules/.bin/vitest run --config vitest.config.ts
```
