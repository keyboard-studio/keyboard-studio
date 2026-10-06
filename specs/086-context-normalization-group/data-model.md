# Phase 1 Data Model: Context normalization group

Entities from [spec.md § Key Entities](spec.md#key-entities), with their fields, the rules each must satisfy, and their lifecycle. "Cluster" means one base character followed by zero or more combining marks, as a code-point sequence.

## OutputRepertoire

What the keyboard can produce. Derived from `KeyboardIR` alone ([research R1](research.md#r1-where-the-steps-input-comes-from-a-static-output-repertoire)).

| Field | Type | Notes |
|---|---|---|
| `clusters` | `ReadonlySet<string>` | Exact produced forms after the closure; a superset of what the keyboard really produces |
| `marks` | `readonly string[]` | Combining marks appearing in any atom, sorted by code point |
| `bases` | `readonly string[]` | Non-mark atom starts, including base-layout fallback characters |
| `stackDepth` | `1 \| 2 \| 3` | Maximum marks per cluster used for the closure |
| `unresolved` | `readonly { storeName: string; reason: string }[]` | Output-referenced stores that neither the IR nor a `storeSketch` resolves |

**Rules.**
- If `unresolved` is non-empty, the step is refused (`opaque-output-store`).
- Deterministic: iteration order never affects the content.

## Alternate and NormalizationMap

| Field | Type | Notes |
|---|---|---|
| `from` | `string` | NFC or NFD form of a cluster, ≠ the cluster |
| `to` | `string` | The produced cluster (FR-002) |
| `ambiguous` | `readonly string[]?` | Other produced clusters with the same NFC form (FR-004) |

**Rules.**
- `from ∉ clusters` (FR-005).
- `to ∈ clusters`.
- When several clusters share `from`, `to` is the one whose code-point sequence sorts first.
- `NFC(from) === NFC(to)` always.

## NormalizationStep

The generated block, held in IR form.

| Field | Type | Notes |
|---|---|---|
| `groupName` | `"generated_context_normalize"` | Fixed marker; identifies the generated step |
| `originalEntry` | `string` | `entryPoints.main` before insertion; also encoded as the group's `nomatch > use(X)` target |
| `stores` | `IRStore[]` | Names prefixed `generated_cn_` |
| `rules` | `IRRule[]` | Packed rules (shapes P0, T, H, P, P2), then `match > use(originalEntry)`, `nomatch > use(originalEntry)` |
| `ruleCount` | `number` | Packed rules, excluding the two `use` lines |
| `examples` | `{ pasted: string; result: string }[]` | Up to 5, chosen deterministically, for the author preview (FR-020) |

**Rules.**
- The group is non-keys (`usingKeys: false`, FR-006).
- No rule contains `if()` or `[K_BKSP]` (FR-009).
- Rule shapes pass the safety check ([research R5](research.md#r5-rule-packing)).

## NormalizationStepResult

```text
| { kind: "step"; step: NormalizationStep; cacheKey: string; maps: NormalizationMap[] }
| { kind: "refused"; reason: "no-unicode-entry" | "opaque-entry" | "opaque-output-store" | "time-bound" | "no-alternates"; detail?: string }
```

`no-alternates` means nothing to normalize: the keyboard produces no cluster whose NFC and NFD forms differ. The studio then offers neither the step nor the 062 fallback.

## StoredStep (authoring cache)

| Field | Type | Notes |
|---|---|---|
| `cacheKey` | `string` | `sha256(emitted source with generated step removed) + "\|" + NORMALIZATION_STEP_GENERATOR_VERSION` |
| `result` | `NormalizationStepResult` | Exactly what the generator returned |

It lives in memory per session, and in the working-copy snapshot as the optional field `contextNormalizationStep`.

**Rules.** A stored entry is used only when its `cacheKey` equals the key computed for the current source (FR-016).

## VerificationRecord (harness, committed)

The file is `docs/context-normalization-verification.json`, format `context-normalization-verification/1`.

| Field | Type | Notes |
|---|---|---|
| `manifest.corpusCommit` | `string` | The `keyboard-studio/keyboards` SHA the run used |
| `manifest.generatorVersion` | `string` | `NORMALIZATION_STEP_GENERATOR_VERSION` |
| `keyboards[id].sourceHash` | `string` | sha256 of the `.kmn` (plus the touch layout if present) |
| `keyboards[id].outcome` | `"verified" \| "regressed" \| "refused" \| "harness-error"` | `regressed` = any typed-output difference |
| `keyboards[id].ruleCount` | `number?` | For `verified` and `regressed` |
| `keyboards[id].typed` | `{ sequences: number; differ: number }` | |
| `keyboards[id].pasted` | `{ probes: number; exact: number; nfcEqual: number; fail: number }` | |
| `keyboards[id].compileDiagnostics` | `{ before: number; after: number }` | FR-010: must be equal |

**Rules.**
- A record is fresh when its `sourceHash` and `generatorVersion` match the current source and generator.
- `--check` fails on any stale record.
- The studio does not propose a step for a keyboard whose fresh record is `regressed` ([research R10](research.md#r10-risks)).

## Overlay batch (studio replay)

`context-tolerance-overlay.ts` gains a variant:

```text
{ kind: "normalization-step"; groupName; originalEntry; stores: IRStore[]; rules: IRRule[] }
```

- **Replay** in the projection appends the group and sets `entryPoints.main`.
- **Removal** restores `entryPoints.main = originalEntry` and deletes the group and its stores.

## Lifecycle

```text
source changes ──> cacheKey changes ──> generate (static) ──> StoredStep
                                              │
                         refused ──> 062 fallback proposal (FR-019) or nothing
                                              │
                         step ──> author preview (count + examples) ──> accept ──> overlay batch ──> projected .kmn
                                                                    └─> decline ──> no change
regenerate = remove existing step, then generate   (idempotent, FR-011)
CI: harness ──> VerificationRecord (once per sourceHash × generatorVersion)
```
