# Contract: harness normalization-step mode and verification record

**Owner:** Engine (standalone utility). **Tool:** `utilities/nfd-tolerance-corpus`, which is outside `pnpm -r`.

## CLI

```text
node utilities/nfd-tolerance-corpus/run.mjs --mode normalization-step
     [--keyboard <id>] [--limit N] [--jobs N] [--incremental] [--check] [--fail-on-regressed]
     [--budget-minutes N] [--record docs/context-normalization-verification.json]
```

| Flag | Behaviour |
|---|---|
| `--mode normalization-step` | Verify spec 086 steps. The default mode stays the 062 transform harness, unchanged |
| `--incremental` | Re-simulate only keyboards whose `sourceHash` or the generator version changed; carry other records forward byte-for-byte |
| `--jobs N` | Run N keyboards in parallel worker processes (first full record) |
| `--check` | Exit 1 if any record is stale or missing for a corpus keyboard; no simulation |
| `--fail-on-regressed` | Exit 1 if any keyboard's outcome is `regressed` |
| `--budget-minutes N` | Per-keyboard wall-clock cap (default 10). A keyboard that exceeds it is recorded `harness-error` |

## Per-keyboard procedure

1. Parse, then call `proposeNormalizationStep`. A refusal (including `no-alternates`) records `refused` with its reason and skips compilation.
2. Compile the baseline and the version with the step applied. Both may report errors: simulation proceeds if both emit KeymanWeb JS; a build that emits no JS records `harness-error`. Record both diagnostic counts; they must be equal (FR-010).
3. **Typed check.** Every single key over 47 keys × {none, shift, ralt, shift+ralt}, plus every pair whose second key is bound by some rule ([research R8](../research.md#r8-verification-the-corpus-harness-once-per-keyboard-version)). Any byte difference means `regressed`.
4. **Pasted check.** For each repertoire cluster *c* and each alternate *a*, take the keys that act on *c* in the baseline, plus backspace and one control key. Seed *a* in the stepped build and compare with the baseline seeded with *c*. A probe passes if the result equals the baseline result for *c*, or for any `ambiguous` sibling of *c* (FR-004). A probe whose result is only NFC-equal to the baseline result (not byte-equal), or equal to an ambiguous sibling's, is counted `nfcEqual`, reported, and does not fail the keyboard; only probes counted `fail` do.
5. Write the record ([data-model § VerificationRecord](../data-model.md#verificationrecord-harness-committed)).

## Record format

`context-normalization-verification/1`: a JSON object `{ manifest, keyboards }`.

- **Key order is sorted**, so the file is deterministic.
- **`manifest`** is `{ format, corpusCommit, generatorVersion, generatedAt }`.
- **`generatedAt` is excluded from `--check` comparison.**

## CI

The `build` job in `.github/workflows/ci.yml` adds a step after the existing corpus gate:

```text
node utilities/nfd-tolerance-corpus/run.mjs --mode normalization-step --check
```

A PR that changes the generator version must regenerate the record (`--incremental`) in the same PR.
