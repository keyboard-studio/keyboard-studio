# Implementation Plan: Construction Facet Classifiers

**Branch**: `041-construction-facet-classifiers` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/041-construction-facet-classifiers/spec.md](spec.md)

## Summary

Thirteen keyboard-facet definitions in [content/keyboard-facets/](../../content/keyboard-facets/) carry `derivation.classifierId: planned` and are therefore invisible in the shipped `--classified-only` [docs/keyboard-facet-index.json](../../docs/keyboard-facet-index.json). This feature implements those 13 classifiers (nine desktop `.kmn`/script facets in P1, four `.keyman-touch-layout` facets in P2) plus the derivation for the already-authored input facet [content/facets/orth/display-difficulty.yaml](../../content/facets/orth/display-difficulty.yaml) (P3), so every corpus base exposes the construction decisions baked into it.

Technical approach: extend the established spec-037 rule-structure classifier framework in [utilities/facet-index/](../../utilities/facet-index/). Each construction classifier records **dominant value + consistency + exception-site summary + per-cause-tag counts** (design brief §4), computed deterministically from the parsed `KeyboardIR` (P1) or the parsed `.keyman-touch-layout` JSON (P2). A small, guarded, extensible **cause-predicate library** assigns each exception a cause tag by predicate-fit, `gap-omission` as residue. This is **measurement only** — no value-transition logic (that is spec 039's scope, FR-042).

## Technical Context

**Language/Version**: TypeScript (ESM, NodeNext), run via `tsx`; Node ≥ 20.

**Primary Dependencies**: `@keyboard-studio/contracts` (`KeyboardIR`, `ImportStatus`), `@keyboard-studio/engine` codec (`parse`) + `recognizer` (`recognizePatterns`), the tool-local UCD lookup ([utilities/facet-index/ucd/generated/](../../utilities/facet-index/ucd/generated/)) and langtags/script-family data already used by the `script` classifier.

**Storage**: The committed index [docs/keyboard-facet-index.json](../../docs/keyboard-facet-index.json) stores the **summary** (value + consistency + cause-tag counts) per FR-005; per-site exception enumeration is recomputed at build time, never stored.

**Testing**: `vitest` in [utilities/facet-index/](../../utilities/facet-index/) (per-classifier `.test.ts` + `determinism.test.ts` + `extensibility.test.ts`), plus `pnpm run facet-index-lint` and `pnpm run facet-lint` as artifact validators.

**Target Platform**: Standalone `utilities/*` build tool (not a `packages/*` target); output consumed offline by the studio base-selection surface.

**Project Type**: Offline corpus-analysis CLI + library (the facet-index utility).

**Performance Goals**: Whole-corpus (~900 keyboards) rebuild stays within the existing build's envelope; classifiers reuse the single central `recognizePatterns` pass already run per keyboard (no re-parse, no per-classifier recognition).

**Constraints**: Deterministic — byte-identical index across runs on the same corpus commit (FR-006); no wall-clock/random ordering; must not touch the locked `Pattern`/`Criterion` contract or the codec's parse semantics (FR-043); a `planned` def with no classifier must still fail the default (non-`--classified-only`) build loud.

**Scale/Scope**: 13 keyboard-facet classifiers + 1 input-facet derivation; ~14 new modules + tests in one utility; three separable user-story phases.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS** | No `Pattern`/`Criterion` touch. Facet definitions are content-owned YAML data, not a `packages/contracts` type ([types.ts](../../utilities/facet-index/types.ts) doc). `Categorization` is a tool-local type; extending it (add `consistency`, `causeTagCounts`, not-applicable marker) is not a contract change. FR-043 restates this. |
| II. KeyboardIR spine | **PASS** | Classifiers read the parsed `KeyboardIR`, never raw `.kmn`. Codec-unparseable bases fall to the definition's fallback tier (Edge Case), matching the no-try/catch spine — the tool already routes parse failures to `fallback()`. Parse semantics untouched. |
| III. Single working copy | **N/A** | Offline analysis tool; no authoring working copy. |
| IV. Validator layering | **N/A** | No validator or debounce surface touched. |
| V. VirtualFS authoring | **N/A** | Build-time corpus read + artifact emit; no studio authoring path. |
| VI. Team boundaries | **PASS** | Content/engine ownership of the facet-index utility (FR-043). Facet YAML value sets are content data; classifier algorithms are engine-style code — both inside the utility the two teams already co-own. No SPA/scaffolder/compiler/output surface. |
| VII. Out of scope for v1 | **PASS** | No CJK/Ethiopic reorder *patterns*, LDML, mobile, hosting. Note: this feature *measures* `reordering-rules` and touch facets — it does not *implement* reorder behavior or touch-first authoring. |
| VIII. House conventions | **PASS** | `[OK]`/`[WARN]`/`[ERROR]` console; markdown-link file refs; no issue numbers in code; `feat(tools)` / `feat(engine)` commit prefix. |

**Result: PASS — no violations, Complexity Tracking empty.**

One structural decision needs recording (not a violation): the touch facets (P2) read evidence (`.keyman-touch-layout` JSON) that is **not** in the `KeyboardIR`. The `ClassifierPair.classify` signature is extended to also receive the `ScannedKeyboard` so a classifier can reach `kb.sources`; desktop/script classifiers ignore it. This keeps one registry and one per-keyboard loop (research R1).

## Project Structure

### Documentation (this feature)

```text
specs/041-construction-facet-classifiers/
├── plan.md              # This file
├── research.md          # Phase 0 — resolves R1..R5
├── data-model.md        # Phase 1 — Categorization extensions, cause-predicate, touch evidence
├── quickstart.md        # Phase 1 — how to build + validate each phase
├── contracts/
│   ├── classifier-registry.md     # ClassifierPair signature + registration contract
│   └── measurement-model.md       # dominant/consistency/exception/cause-tag summary contract
├── checklists/          # (existing)
└── tasks.md             # Phase 2 — /speckit.tasks (NOT created here)
```

### Source Code (repository root)

```text
utilities/facet-index/                      # the tool (content/engine co-owned, not packages/*)
├── build-index.ts                          # EXTEND: ClassifierPair sig + DEFAULT_CLASSIFIERS registrations
├── types.ts                                # EXTEND: Categorization (consistency, causeTagCounts, notApplicable), NotApplicable/CauseTag enums
├── outcome.ts                              # REUSE: mapImportStatus, computeAnalyzedCoverage
├── scan.ts                                 # REUSE: ScannedKeyboard.sources already carries the touch-layout sibling
├── cause-predicates.ts                     # NEW (P1): predicate library {id, guard, fits} + gap-omission residue
├── measurement.ts                          # NEW (P1): shared dominant+consistency+exception-summary assembly
├── caps-handling-classifier.ts             # NEW (P1)  + .test.ts
├── casing-classifier.ts                    # NEW (P1)  + .test.ts   (script-identity driven)
├── desktop-combo-mechanism-classifier.ts   # NEW (P1)  + .test.ts
├── encoding-classifier.ts                  # NEW (P1)  + .test.ts   (per-role sub-profiles + match-kind axis)
├── fallback-posture-classifier.ts          # NEW (P1)  + .test.ts   (&baselayout store; defaulted vs declared)
├── mnemonic-vs-positional-classifier.ts    # NEW (P1)  + .test.ts   (gate facet)
├── normalization-posture-classifier.ts     # NEW (P1)  + .test.ts   (n/a for abugida/abjad; backspace-match = consistency)
├── reordering-rules-classifier.ts          # NEW (P1)  + .test.ts   (group(reorder) convention)
├── rule-store-compaction-classifier.ts     # NEW (P1)  + .test.ts
├── touch-layout.ts                         # NEW (P2): .keyman-touch-layout JSON reader/parser
├── touch-combo-mechanism-classifier.ts     # NEW (P2)  + .test.ts
├── touch-number-row-classifier.ts          # NEW (P2)  + .test.ts
├── touch-symbol-layer-classifier.ts        # NEW (P2)  + .test.ts
├── touch-modifier-layers-classifier.ts     # NEW (P2)  + .test.ts
├── display-difficulty.ts                   # NEW (P3): per-script derivation (UCD block-age + corpus PUA override)
└── __fixtures__/corpus/release/fixture/    # EXTEND: shape fixtures per facet (reuse fx_arabic/fx_latin; add fx_touch, fx_mnemonic, ...)

content/keyboard-facets/*.yaml              # EDIT: flip classifierId planned -> real id (the 13 defs, per phase)
content/facets/orth/display-difficulty.yaml # EDIT (P3): flip sourceStatus planned -> available; real source id
```

**Structure Decision**: All work lands in the existing [utilities/facet-index/](../../utilities/facet-index/) tool, matching the spec-037 archetype (classifiers live flat, registered as `{classify, fallback}` pairs in `DEFAULT_CLASSIFIERS` keyed by facet id). No new package, no `packages/*` change. The one shared shell change is the `ClassifierPair.classify` signature (adds `ScannedKeyboard`) plus additive `Categorization` fields — both tool-local. `orth.display-difficulty` (P3) is a `content/facets/` input facet on a different schema than keyboard-facets; its derivation is a per-script function, validated by `pnpm run facet-lint`, not `facet-index-lint`.

## Complexity Tracking

> No Constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phasing note (Companion one-conversation-per-phase)

This is a multi-phase feature (three `### User Story` slices). Per the constitution's "One conversation per phase" policy, `/speckit.implement` stops after each user-story phase: **P1 (Setup + Foundational + US1 nine desktop facets)** builds first, then **P2 (four touch facets)** and **P3 (display-difficulty)** each resume in their own fresh conversation. The shared shell changes (`Categorization` extensions, `ClassifierPair` signature, `measurement.ts`, `cause-predicates.ts`) are Foundational and ride with P1.
