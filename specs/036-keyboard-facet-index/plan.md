# Implementation Plan: Per-Keyboard Facet Index

**Branch**: `036-keyboard-facet-index` | **Date**: 2026-07-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/036-keyboard-facet-index/spec.md](spec.md)

## Summary

Build an offline, deterministic, committed artifact that records — for every keyboard in the sibling
corpus's `release/` subtree — its categorization along each declared **keyboard-level facet** (script
first, then extensible), with a likelihood distribution, a provenance tier, and per-keyboard freshness
stamps. The index is the substrate the wrong-script defect and the fourteen `planned` `corpus:`
derivations in [content/facets/](../../content/facets/) are waiting on. This feature owns the **artifact
shape, its extensibility, its schema validation, and its freshness/rescan model** — the classifier
algorithms that compute the values are [spec 037](../037-facet-classifiers/spec.md); the user-facing
confirmations are [spec 038](../038-adaptation-questions/spec.md); wiring the index into studio
suggestion ranking is a later feature.

**Technical approach** (grounded in existing repo precedent):
- A new standalone build tool at `utilities/facet-index/`, shaped after
  [utilities/supportability-scanner](../../utilities/supportability-scanner/) — TS run via `tsx`, imports
  engine source directly, walks `../keyboards/release/**`, emits a committed JSON artifact.
- **Facet definitions** are content-team-owned YAML under `content/keyboard-facets/`, mirroring the
  `content/facets/` catalog discipline (data, not code; not a locked contract until it survives an
  evaluation round).
- The **built index** lands at `docs/keyboard-facet-index.json` (+ a human-readable `.md` companion),
  following the `docs/placement-priors.json` / `docs/import-corpus.json` precedent, consumed by the
  studio via the existing `@docs/*` path alias — satisfying FR-007 (offline, no corpus checkout needed).
- **Reference data** (Unicode 17.0.0 UCD) is pinned with the repo's existing
  `scripts/<name>-version.json` + fetch-verify convention, but sourced from the already-present
  `lib/ucd/` tree rather than a network fetch (per the invocation's explicit instruction).
- **Schema validation** runs twice: the build fails loud on any out-of-limits value (FR-008), and a new
  `utilities/facet-index-lint/` validates the committed artifact against the definitions as part of
  `pnpm lint`.
- **Freshness** is new plumbing (no in-repo precedent): per-keyboard SHA-256 source hashes gate
  incremental rescan; manifest-level corpus-commit / UCD-version / scanner-version stamps gate full
  rescan.

## Technical Context

**Language/Version**: TypeScript (ESM), Node ≥ 20, pnpm 9. Standalone tool run via `tsx` (not a workspace
package — stays out of `pnpm -r`).

**Primary Dependencies**: `@keyboard-studio/engine` source (imported directly by relative path, per the
supportability-scanner precedent): `parseKmn` ([codec/parse.ts](../../packages/engine/src/codec/parse.ts)),
`recognizePatterns` ([recognizer/index.ts](../../packages/engine/src/recognizer/index.ts)),
`buildProducedSet` ([contracts/src/ir/producedSet.ts](../../packages/contracts/src/ir/producedSet.ts)),
`parseKmnHeaderStores` (sibling-file discovery). `yaml` (already a root devDependency) for facet
definitions. No new runtime dependency added to any shipped package.

**Storage**: Committed JSON artifact `docs/keyboard-facet-index.json` + `.md` companion. Facet-definition
YAML under `content/keyboard-facets/`. Pinned UCD slim-lookup generated into the tool's own data dir
(committed) from `lib/ucd/` (source-of-truth files pinned by SHA-256; the raw multi-MB files are already
in the repo under `lib/ucd/`).

**Testing**: vitest for the tool's pure functions (hashing, incremental-diff, schema validation, manifest
determinism); fixture-based classification tests are owned by spec 037. Determinism assertion
(byte-identical rebuild) is a tool-level test here.

**Target Platform**: Offline developer/CI machine (Node). The studio only ever *reads* the committed
artifact — never runs the build.

**Project Type**: Standalone offline build utility + committed data artifact + content-owned schema
(data-pipeline, not a service or UI).

**Performance Goals**: Full rebuild over ~1,000 keyboards completes in a single CI step (target: a few
minutes, dominated by `.kmn` parsing). Incremental rebuild after a one-keyboard change re-parses only
that keyboard.

**Constraints**: Deterministic — byte-identical output for identical inputs (FR-006); no timestamps, no
randomness, no environment-dependent iteration order (sorted keys everywhere). Offline — the studio reads
the artifact with no network and no sibling checkout (FR-007). Extensible — adding facet N+1 must not
reshape facets 1..N (FR-002/US2).

**Scale/Scope**: ~1,000 keyboards × N facets (1 at v1 landing: script; the two other archetype facets are
spec 037's classifiers populating the same shape). Corpus scope = `../keyboards/release/**` only
(Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passing.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS** | No `Pattern`/`Criterion` type touched. Facet definitions are content-owned data that deliberately does **not** graduate to `packages/contracts` until an evaluation round (spec Assumption; mirrors `content/facets/` README graduation rule). |
| II. KeyboardIR is the engine spine | **PASS** | The tool reads keyboards via `parseKmn` → `KeyboardIR` → `buildProducedSet`/`recognizePatterns`; never scrapes raw `.kmn` text. Unparseable keyboards flow to fallback tiers by design — the "unparseable fails the scaffold" rule governs *authoring*, not corpus *analysis* (spec 037 Assumption, confirmed against code). |
| III. Single persistent working copy | **N/A → PASS** | No authoring, no working copy — offline batch analysis only. |
| IV. Validator layering / one 300 ms debounce | **N/A → PASS** | No studio validation path added; no second debounce timer. The tool's schema validation is a build/lint check, not a studio validator layer. |
| V. VirtualFS only during authoring | **PASS** | The studio never writes host disk. The offline tool reads the sibling corpus checkout from disk — that is corpus input, not authoring. The studio consumes the committed artifact via `@docs/*` static import (proven by `usePlacementPriors.ts`). |
| VI. Team boundaries (§12/§13) | **PASS** | Declared split: **content team** owns `content/keyboard-facets/` definitions, their limits, and the SC-002 hand-verified judgments; **engine team** owns `utilities/facet-index/` build tooling, freshness plumbing, and schema-validation lint. |
| VII. Out of scope for v1 | **PASS** | No CJK/Ethiopic authoring feature is built. Those keyboards still receive index *records* (classification is analysis, not authoring support) — consistent with §16 and the spec's Out of Scope note. |
| VIII. House conventions | **PASS** | Tool console output uses `[OK]`/`[WARN]`/`[ERROR]`; docs use markdown links; commits follow `feat(tools)/feat(criteria)` style; no GitHub issue numbers in shipped code. |

**No violations → Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/036-keyboard-facet-index/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + rationale (generated)
├── data-model.md        # Phase 1 — entities + JSON shape (generated)
├── quickstart.md        # Phase 1 — validation scenarios (generated)
├── contracts/           # Phase 1 — the schemas (generated)
│   ├── facet-definition.schema.md
│   └── facet-index.schema.md
├── checklists/          # (from /speckit-checklist, pre-existing)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
utilities/facet-index/                 # NEW — engine-owned offline build tool (tsx, out of pnpm -r)
├── package.json                       # name, description (provenance chain), no build step
├── tsconfig.json                      # matches kbgen's own-tsconfig shape
├── cli.ts                             # entry: full + incremental (--incremental, --check, --limit)
├── scan.ts                            # walk ../keyboards/release/**, resolve id + source files + hashes
├── build-index.ts                     # orchestrate: load defs → classify → validate → emit + manifest
├── freshness.ts                       # per-keyboard SHA-256, incremental diff, version-bump full-rescan
├── ucd/                               # pinned Unicode 17.0.0 slim lookup
│   ├── codegen-ucd.mjs                # lib/ucd/*.txt → generated slim script/block lookup (committed)
│   └── generated/scriptLookup.ts      # committed generated lookup (Scripts/ScriptExtensions/aliases/blocks)
├── data/SOURCES.json                  # per-file SHA-256 + unicodeVersion (pin manifest, committed)
└── *.test.ts                          # vitest: determinism, incremental diff, schema violation

utilities/facet-index-lint/            # NEW — validates committed artifact against defs, in `pnpm lint`
└── index.js                           # CommonJS, facet-lint style (named checks + self-check)

content/keyboard-facets/               # NEW — content-owned facet DEFINITIONS (data, not contract)
└── script.yaml                        # v1 definition: id, valueType=histogram, limits=ISO15924 set, …

docs/
├── keyboard-facet-index.json          # NEW — the committed built artifact (+ manifest)
├── keyboard-facet-index.md            # NEW — human-readable companion (audit trail)
└── MANIFEST.md                        # UPDATED — add rows for the two artifacts above

scripts/ucd-version.json               # NEW — pin file (unicodeVersion 17.0.0 + per-file sha256, license)
package.json                           # UPDATED — add `facet-index` build + `facet-index-lint` to `lint`
```

**Structure Decision**: The build tool is a standalone `utilities/*` utility (not a workspace package),
matching `supportability-scanner` — it walks the sibling corpus, imports engine source directly, and
emits to `docs/`. Facet **definitions** live in `content/` (content-owned data, like `content/facets/`);
the built **index instance** lives in `docs/` (machine-generated corpus artifact, like
`placement-priors.json`), consumed by the studio via the established `@docs/*` alias. Reference-data
pinning reuses the `scripts/<name>-version.json` + `SOURCES.json` convention, sourced from `lib/ucd/`.

## Complexity Tracking

> No Constitution violations. Section intentionally empty.
