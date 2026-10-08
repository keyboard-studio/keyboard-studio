# Implementation Plan: Context normalization group

**Branch**: `086-context-normalization-group` | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/086-context-normalization-group/spec.md`

## Summary

Make a keyboard behave the same over pasted composed and decomposed text by adding **one generated, context-only group** in front of its entry group. The keyboard's own rules are never touched. The group rewrites the end of the existing text from any NFC/NFD alternate into the exact form the keyboard itself produces, then hands the keystroke to the original entry group unchanged.

Spec 062's per-rule variant generator remains only as a fallback, for keyboards the step refuses.

The pieces:

- **Static repertoire.** A pure `buildOutputRepertoire` closure over rule outputs, opaque-rule sketches, touch keys and a new US base-layout table ([R1](research.md#r1-where-the-steps-input-comes-from-a-static-output-repertoire), [R4](research.md#r4-base-layout-fallback-table)), with a small additive parser extension so opaque stores resolve ([R2](research.md#r2-opaque-stores-block-the-repertoire-codec-extension)).
- **Generator.** Maps go to produced forms ([R3](research.md#r3-target-form-ambiguity-conflicts)) and are packed into five rule shapes by safe greedy set cover ([R5](research.md#r5-rule-packing)). The group is inserted by redirecting `entryPoints.main` ([R6](research.md#r6-inserting-and-removing-the-step)).
- **Cache.** Results are keyed by source sha256 and the generator version, held in memory and in the working-copy snapshot ([R7](research.md#r7-authoring-path-and-caching)).
- **Harness verification.** A new harness mode simulates each step once per keyboard version and writes a committed, freshness-checked record ([R8](research.md#r8-verification-the-corpus-harness-once-per-keyboard-version)).
- **Studio surface.** The spec 078 station shows the rule count and examples behind a single confirm ([R9](research.md#r9-studio-surface-fr-020)).

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), Node ≥ 22.19.0 for tooling; the studio runs in the browser.

**Primary Dependencies**:
- `packages/contracts`: `KeyboardIR` and the IR helpers.
- `packages/engine`: the codec, pattern-apply, the facet-transform gate, and the vendored KeymanWeb simulator (harness only).
- `packages/studio`: React SPA.
- `@keymanapp/kmc-kmn` for compiling (harness only).
- Web Crypto `computeSha256Hex` (`engine/src/codec/hash.ts`).

**Storage**:
- *In memory, per session:* the step cache.
- *Working-copy snapshot:* an optional `contextNormalizationStep` field, plus the overlay batch.
- *Committed JSON:* `docs/context-normalization-verification.json`, written by the harness.
- There are no host-disk writes during authoring.

**Testing**:
- Vitest per package: engine unit and corpus-gated parity tests; contracts unit tests for the repertoire and the US table.
- The harness's own vitest plus the CLI.
- Playwright CLI for the studio walk.

**Target Platform**: Browser (studio), Node (harness and CI). The generated `.kmn` targets every Keyman engine; only KeymanWeb is verified in CI ([R10](research.md#r10-risks)).

**Project Type**: Monorepo (pnpm workspace) plus a standalone utility.

**Performance Goals**:
- Generation in under 5 s for 95% of the corpus.
- A cache hit in under 1 s with no simulation (SC-005).
- Harness incremental runs re-simulate only changed keyboards.

**Constraints**:
- No simulation or compile in the step's authoring path (FR-017).
- No new timer (D3).
- No edit to existing rules (FR-007).
- Deterministic output (FR-015).

**Scale/Scope**:
- Spike set: 7 keyboards (1–49 added rules each).
- Corpus: over 700 keyboards, most expected to refuse cheaply with `no-alternates`.

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Verdict | Evidence |
|---|---|---|
| I. Pattern schema locked | PASS | No `Pattern` change. New types are additive in `toleranceReport.ts`. The IR gains an optional `RawKmnFragment.storeSketch` (an IR type, not the Pattern contract). |
| II. KeyboardIR spine | PASS | The step is built as an IR group plus stores, and emitted by the codec. Opaque fragments are preserved; a keyboard with an opaque entry is refused, never partially handled ([R6](research.md#r6-inserting-and-removing-the-step)). |
| III. Single working copy | PASS | The step lives only in the overlay batch the projection replays; the working IR is never mutated with it. No second copy. |
| IV. Validator layering, one 300 ms cycle | PASS | No new timer. The generator runs inside the existing unawaited `launchContextTolerance` launch, behind a cache. No new validator layer. |
| V. VirtualFS only | PASS | The cache lives in memory and the snapshot. The committed verification file is written by the CI harness, not by the studio. |
| VI. Team boundaries | PASS | **Engine** owns the whole change: engine, studio, utility and CI. No content-team artifact (patterns, survey text, prompts) changes. The new UI strings are engine-owned studio chrome under `marks.context_tolerance.step.*`. |
| VII. Out of scope (v1) | PASS | Nothing in the §16 list. No byte-identical round-trip claim beyond G3 (remove after apply), which concerns the step only. |
| VIII. House conventions | PASS | Console output uses `[OK]`/`[WARN]`/`[ERROR]`. No issue numbers in code. Commit style `feat(engine)` / `feat(studio)` / `chore(tools)`. |
| IX. Survey manifest | PASS | No new survey surface. The 078 station is already a manifest step, and only its content changes. |

**Post-design re-check (after Phase 1)**: PASS, unchanged. The design adds no timer, no host write, no schema change and no new survey step.

## Project Structure

### Documentation (this feature)

```text
specs/086-context-normalization-group/
├── plan.md              # this file
├── research.md          # Phase 0: R1-R10
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── engine-normalization-step.md
│   ├── studio-normalization-proposal.md
│   └── harness-verification-record.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/contracts/src/
├── ir/outputRepertoire.ts            # NEW  buildOutputRepertoire (pure, browser-safe)
├── ir/usBaseLayout.ts                # NEW  US_BASE_LAYOUT (absorbs private US_TRIGGER_CHAR)
├── ir/deadkeys.ts                    # EDIT import US table instead of private copy
├── keyboard-ir.ts                    # EDIT RawKmnFragment.storeSketch?: StoreItem[] (optional)
└── toleranceReport.ts                # EDIT NormalizationStep / Result / Map types (additive)

packages/engine/src/
├── codec/parse.ts                    # EDIT lenient storeSketch for store-level opaque fragments
├── pattern-apply/normalization-step/ # NEW
│   ├── index.ts                      #   propose / apply / remove / cacheKey
│   ├── constants.ts                  #   group name, generator version
│   ├── maps.ts                       #   repertoire -> NormalizationMap[] (R3)
│   ├── pack.ts                       #   greedy safe set cover, shapes P0/T/H/P/P2 (R5)
│   ├── insert.ts                     #   group + stores + entryPoints.main redirect (R6)
│   ├── *.test.ts                     #   unit: determinism, idempotence, no-simulation spy
│   └── parity.corpus.test.ts         #   SC-001..SC-004 on the seven spike keyboards
├── pattern-apply/context-tolerance-overlay.ts  # EDIT kind:"normalization-step" batch
└── context-tolerance/index.ts        # EDIT re-export the new API on the browser subpath

packages/studio/src/
├── lib/contextToleranceAnalysis.ts   # EDIT cache lookup -> step -> 062 fallback
├── lib/normalizationStepCache.ts     # NEW  in-memory cache keyed by cacheKey
├── lib/normalizationVerification.ts  # NEW  regressed lookup by keyboard id
├── lib/contextToleranceApply.ts      # EDIT single-site apply for the step
├── lib/persistWorkingCopy.ts         # EDIT optional contextNormalizationStep field
├── survey/marks/ContextToleranceStation.tsx    # EDIT step intro, examples, single confirm
├── survey/marks/NormalizationExamples.tsx      # NEW
└── locales/*                         # EDIT marks.context_tolerance.step.* ids

utilities/nfd-tolerance-corpus/
├── normalization-step.ts             # NEW  mode: typed + pasted checks, record writer
├── cli.ts                            # EDIT --mode, --jobs, --incremental, --check
└── analyze.ts                        # EDIT simulate builds that emit JS despite errors

scripts/codegen-normalization-regressed.mjs     # NEW  prebuild: regressed ids for the studio

docs/context-normalization-verification.json    # NEW (generated, committed)
.github/workflows/ci.yml              # EDIT add --check step; drop duplicate harness test step
```

**Structure Decision**:
- The repertoire lives in `contracts`. It is pure IR analysis like `buildProducedSet`, and both the engine and the harness need it.
- The generator lives in `engine/pattern-apply`, next to `context-variants.ts`, the code it replaces as the default.
- Verification extends the existing harness rather than adding a utility.

## Phasing (maps to user stories)

1. **US1 (P1), engine step.**
   - The repertoire, US table and parser sketch.
   - The maps, packer and insert/remove.
   - Unit tests plus the spike-parity corpus test. Gates are SC-001 to SC-004.
2. **US2 (P1), compute once.**
   - The cache key and in-memory cache.
   - The snapshot field and the no-simulation guarantee test. Gate is SC-005.
3. **US3 (P2), studio.**
   - Analysis wiring with the fallback, the overlay batch, and the station UI.
   - i18n ids and the Playwright walk.
4. **US4 (P2), harness.**
   - The new mode, the record, `--incremental`/`--check`/`--jobs`, and CI.
   - The first committed record. Gate is SC-006.

Per the constitution, each phase is implemented in its own conversation and committed and pushed as its gates go green.

## Complexity Tracking

No constitution violations to justify.
