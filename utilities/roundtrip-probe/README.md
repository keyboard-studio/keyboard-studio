# roundtrip-probe

Manual corpus probe: parse + scaffold + emit every keyboard under the given
keymanapp/keyboards roots and report emitted `.kmn` that kmcmplib would likely
reject, using a set of lexer-faithful symptom heuristics:

- `bare-arrow-rule` — a line starting with `>` whose previous line is not a
  `match`/`nomatch` rule (the output half lost its keyword)
- `double-plus` — two top-level `+` markers in one rule line
- `quote-glued-token` — a quoted literal immediately glued to an alphanumeric
  token (prematurely closed string)
- `combining-in-quote` — a combining mark inside a quoted literal

Ported from the former `packages/engine/src/codec/probe-roundtrip.test.ts`
(deleted alongside this utility's introduction). That file was a vitest test
in name only — no assertions, hardcoded `D:/Github/...` corpus paths, vacuous
pass on every other machine. The heuristics were the valuable part; this
utility keeps them and gives them a real contract:

- corpus roots are CLI arguments, never hardcoded;
- any symptom, parse error, or emit error exits **1**;
- scanning nothing (missing root, zero `.kmn` found) exits **2** — a probe
  that examined no keyboards never looks like a pass.

This is a bulk fix-target finder for round-trip work, **not** a CI gate: the
gated coverage lives in the engine codec round-trip suites
(`roundtrip.test.ts`, `roundtrip-fr004.test.ts`, the `*.corpus.test.ts`
suites under `vitest.corpus.config.ts`).

## Run

From the repo root, against a local keymanapp/keyboards clone:

```sh
TSX_TSCONFIG_PATH=utilities/roundtrip-probe/tsconfig.json \
  pnpm dlx tsx utilities/roundtrip-probe/probe.ts ../keyboards/release ../keyboards/experimental
```

Each root is scanned recursively for `*.kmn` under a `source/` directory, so
the clone root, its `release/` dir, or a single keyboard's directory all work.
Output groups failures by symptom with the first examples per symptom, to
pick fix targets in bulk.
