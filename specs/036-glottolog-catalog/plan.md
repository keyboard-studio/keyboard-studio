# Implementation Plan: Glottolog classification catalog + related-keyboard-base bridge

**Branch**: `036-glottolog-catalog` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/036-glottolog-catalog/spec.md`

## Summary

Add a new standalone workspace package **`@keyboard-studio/glottolog`** that provides a local, offline, pinned copy of Glottolog's language classification tree plus the queries that turn "language X has no keyboard" into "here are keyboards for close relatives of X, ranked by closeness." Data is a pinned `glottolog/glottolog-cldf` release, fetched + SHA-256-verified and codegen'd into a slim checked-in index — the exact pin-and-regen discipline already used for langtags. The package builds only to `@keyboard-studio/contracts`; the keyboard-base **bridge** is parameterised by injected lookups (langtags resolver + phonebook map) so the package needs no engine dependency, mirroring how [`suggestBases`](../../packages/studio/src/lib/suggestBases.ts) already takes a `languagesById` map. The bridge contributes a **genealogical tier** that composes with the existing `suggestBases` script-based fallback rather than replacing it.

## Technical Context

**Language/Version**: TypeScript ^6.0.3 (ESM, `"type": "module"`), Node ≥ 20

**Primary Dependencies**: `@keyboard-studio/contracts` (workspace, dependency root) only for the shipped package. Build-time only: plain-node fetch/codegen scripts (no runtime deps). Bridge consumers inject langtags (`@keyboard-studio/engine/langtags`) and the base-browser phonebook — those deps live in the *caller* (studio), not in this package.

**Storage**: Checked-in generated TS index (`src/generated/`) derived from a gitignored vendored CLDF file (`data/glottolog/`). No runtime storage, no host-disk writes.

**Testing**: vitest ^4.1.6 (`vitest run`), plus a codegen-determinism test (mirrors [`langtags/codegen-determinism.test.ts`](../../packages/engine/src/langtags/codegen-determinism.test.ts)).

**Target Platform**: Runs in Node (engine/tests) and in the browser (studio SPA) — pure synchronous lookups over a checked-in module, no I/O either place.

**Project Type**: Library (workspace package) + two build scripts wired into the root `prebuild`.

**Performance Goals**: Synchronous O(1) glottocode/ISO lookup; ancestry O(depth); relatedness O(family size) with results ranked. No perceptible delay in the SPA (FR-006, SC-003).

**Constraints**: Offline — zero runtime network, zero host-disk writes (Article V). Deterministic codegen — identical pinned source → byte-identical index (FR-003, SC-005). SHA-256-verified, version-pinned source (FR-001/FR-002).

**Scale/Scope**: Glottolog ≈ 26k languoids across ≈ 8.6k languages; largest families have hundreds of members. Slim index is a few MB of generated TS (comparable to the langtags generated index).

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1.*

| Article | Verdict | Notes |
|---------|---------|-------|
| I — Pattern schema locked | **PASS** | Feature does not touch `Pattern`/`Criterion` or their zod schemas. New Glottolog types live in the new package, not in the locked contracts surface. |
| II — KeyboardIR spine | **PASS (N/A)** | No `.kmn`, no codec, no IR. Operates purely on classification data + BCP47/ISO identity. |
| III — Single working copy | **PASS (N/A)** | No authoring mutation; read-only catalog + suggestion. |
| IV — Validator layering / one debounce | **PASS (N/A)** | No validator changes, no new debounce timer. |
| V — VirtualFS only during authoring | **PASS** | All data access is synchronous over a checked-in module; fetch/codegen are build-time (`prebuild`), never runtime. No host-disk writes at runtime. |
| VI — Team boundaries | **PASS** | **Engine team** owns this change: it sits alongside langtags/base-browser (engine-owned data + suggestion infrastructure). No content-team surfaces (pattern library, survey text, gallery ordering, criteria) are touched. |
| VII — Out of scope for v1 | **PASS** | Implements none of the forbidden items (CJK/Ethiopic reorder, LDML, mobile, hosting, multi-source merge, opaque-fragment editing, byte-identical round-trip). |
| VIII — House conventions | **PASS** | Scripts emit `[OK]`/`[ERROR]` (no emoji); docs use markdown links; commits use `feat(engine\|tools\|deps): …`; no GitHub issue numbers in shipped code. |

**Result: PASS — no violations.** Complexity Tracking table intentionally omitted (nothing to justify).

## Project Structure

### Documentation (this feature)

```text
specs/036-glottolog-catalog/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1..D12
├── data-model.md        # Phase 1 — entities + generated-index shape
├── quickstart.md        # Phase 1 — build + validation walkthrough
├── contracts/
│   ├── glottolog-catalog-api.md    # catalog + relatedness surface
│   └── keyboard-base-bridge-api.md # the injected bridge surface
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
packages/glottolog/                      # NEW standalone package (FR-018)
├── package.json                         # @keyboard-studio/glottolog — deps: contracts only
├── tsconfig.json                        # extends ../../tsconfig.base.json, composite
├── vitest.config.ts
├── data/
│   └── glottolog/                       # gitignored vendored CLDF + SOURCES.json (FR-002)
│       ├── languages.csv                #   (fetched, not committed)
│       └── SOURCES.json                 #   provenance manifest
└── src/
    ├── index.ts                         # public catalog API (FR-007..FR-011a)
    ├── relatedness.ts                   # NCA / shared-subgroup-depth ranking (FR-011)
    ├── bridge.ts                        # findKeyboardBaseCandidates — injected deps (FR-014..FR-017c)
    ├── pseudo-families.ts               # curated pinned glottocode set (FR-012)
    ├── types.ts                         # Languoid, RelatednessResult, KeyboardBaseCandidate
    ├── generated/
    │   └── index.ts                     # slim index — CODEGEN OUTPUT, checked in (FR-003)
    ├── index.test.ts
    ├── relatedness.test.ts
    ├── bridge.test.ts
    └── codegen-determinism.test.ts

scripts/                                 # wired into root prebuild (FR-004)
├── glottolog-version.json               # pin: release tag + SHA-256 + license/notice (FR-001)
├── fetch-glottolog.mjs                  # download + SHA-256-verify + SOURCES.json (FR-002)
└── codegen-glottolog.mjs                # CLDF → slim generated/index.ts (FR-003)
```

**Structure Decision**: New package `packages/glottolog/` (auto-included by `pnpm-workspace.yaml`'s `packages/*`). It is a leaf just above `@keyboard-studio/contracts` in the dependency graph — it imports **only** contracts, satisfying the `contracts-is-the-dependency-root` dependency-cruiser rule and avoiding any `glottolog ↔ engine` cycle. The catalog + relatedness live in the package; the keyboard-base **bridge** is a pure function in the same package that takes injected `resolveLanguage` (langtags-backed) and `languagesById` (phonebook) callbacks — the caller (studio's base-resolution) supplies them, so engine/base-browser stay out of this package's dependency set. Fetch/codegen scripts live in the shared `scripts/` dir alongside the langtags/kmcmplib scripts and append to the existing `prebuild` chain.

## Phase 0 — Research

See [research.md](research.md). Decisions D1–D12 resolve the data source and CLDF columns, tree reconstruction, the (already-clarified) relatedness metric / permissive-ISO / glottocode-internal / pseudo-family / dedup / no-cap rules, the packaging + dependency-injection architecture, and the last open soft spot — **ancestry ordering → root-first (family → … → parent)**. No `NEEDS CLARIFICATION` remain.

## Phase 1 — Design & Contracts

- **[data-model.md](data-model.md)** — `Languoid` and the generated-index shape (`languoids` record, permissive `byIso` map of ISO → glottocode[]), `RelatednessResult`, `KeyboardBaseCandidate`, the version pin / source manifest, and the curated pseudo-family set.
- **[contracts/glottolog-catalog-api.md](contracts/glottolog-catalog-api.md)** — `getLanguoid`, `byIso639p3` (→ Languoid[]), `ancestors` (root-first), `relatedLanguages`, `relatedIsoCodes`.
- **[contracts/keyboard-base-bridge-api.md](contracts/keyboard-base-bridge-api.md)** — `findKeyboardBaseCandidates(target, deps)` with injected `resolveLanguage` + `languagesById`, the two-tier (genealogical ∩ script → existing script fallback) composition, per-keyboard dedup, and closest-first ordering.
- **[quickstart.md](quickstart.md)** — prebuild wiring, determinism check, and an end-to-end "find a base for an unsupported language" walkthrough.

**Agent context update**: `CLAUDE.md` has no `<!-- SPECKIT … -->` managed block, so there is nothing to rewrite between markers. The contributor-doc package-inventory row (FR-019) is tracked as an implementation task in Phase 2, not an agent-context edit here. The optional `after_plan` agent-context hook is surfaced at the end of this command.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1: still **PASS**. The dependency-injection design keeps the package contracts-only (Article VI team boundary + `contracts-is-the-dependency-root` both hold); no runtime I/O was introduced by the contracts (Article V holds); nothing touches the locked schema, IR, validator, or working-copy spine.
