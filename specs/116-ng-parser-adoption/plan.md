# Implementation Plan: Adopt the Keyman next-generation KMN parser, and type the IR as a multi-format hub

**Branch**: `116-ng-parser-adoption` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/116-ng-parser-adoption/spec.md`

## Summary

Replace the codec's homegrown `.kmn` reader with the front end of Keyman's next-generation KMN
compiler: its lexer, its 81-line BNF and its recursive-descent parser. The parser is vendored at a
pinned upstream commit.

Comments are kept as strings through a side-channel the grammar never sees, so the grammar file stays
identical to upstream. A new lowering step walks the parser's syntax tree into the **unchanged**
`KeyboardIR`. Lines the grammar rejects become opaque fragments with specific reasons.

The work ships in five phases, each independently green:

1. **Rule-shape accessors** (Story 5). These are non-breaking, and they make the later contract change
   small.
2. **Reader swap behind a side-by-side comparison** (Story 1).
3. **Comment preservation** (Story 2).
4. **Additive IR members** (Story 3), which the LDML classifier then reads directly.
5. **The format-capability table and its check** (Story 4).

The breaking IR restructure (B3, then B1, then B2) is ruled out of this spec and goes to a follow-on
(spec FR-040 to FR-042).

## Technical Context

**Language/Version**: TypeScript 5.x on Node ≥ 22.19.0 (repo floor). The vendored parser is
TypeScript and needs only source-level adaptation: import specifiers and the strictness flags of our
`tsconfig`.

**Primary Dependencies**:
- No new npm dependency. Keyman's parser front end is vendored as source, from keymanapp/keyman branch
  `feat/developer/13349-kmc-kmn-next-generation-smbuilder`, commit
  `fb7afff889c26161c8233edb46192dfdb0dec8e6`, MIT licence.
- Existing: `@keyboard-studio/contracts`, plus `zod` for the runtime schema of the new IR members.

**Storage**: No new store. Saved drafts hold `startIr` (`persistWorkingCopy.ts:370`). Phases 1–5
change no IR shape, so existing drafts stay valid. The additive members only appear in IRs parsed
after this change, and older drafts simply don't contain them. A draft-envelope bump is a gate of the
follow-on spec, not this one.

**Testing**:
- vitest through each package's own config (never bare `vitest` at the root).
- Corpus suites run under `vitest.corpus.config.ts` against `../keyboards`, pinned in CI by
  `KEYBOARDS_CORPUS_SHA`.
- A new side-by-side comparison suite, plus a committed comparison report.
- keyboard-lint and the new lint rule (FR-037) run through `pnpm lint`.

**Target Platform**: The engine runs in both the browser bundle (studio) and Node (tests, utilities).
The vendored parser must run in both: it may not use Node built-ins. To be verified during vendoring
(research R3).

**Project Type**: A library change inside the monorepo: contracts, engine codec, consumers across
engine, studio and keyboard-lint.

**Performance Goals**: The new reader is no slower than the current one on the largest corpus keyboard
and over the whole corpus (assumption in spec). Measured by the corpus trial run (research R1).

**Constraints**:
- **Art II**: the syntax tree never leaves the codec.
- **No change to emitted output** in Phases 1–3. Phase 4 changes emit only for constructs that become
  typed, and they must round-trip.
- **D3**: no new timer. The reader runs where `parse()` runs today.
- **`/api` bundle safety** is unaffected, because nothing under `/api` imports the codec.

**Scale/Scope**:
- About 1,036 corpus `.kmn` files.
- Codec reader today: `parse.ts` 1,432 lines, `tokenize.ts` 192, `continuation.ts` 125.
- Vendored front end: about 2,700 lines including `kmn-analyzer.ts`. The KMX builder and analysers
  are excluded.
- Accessor migration: about 22 files filter the `+` separator, about 75 read `.context` and about 28
  read `matchKind` (km-synthesis counts). The exact per-file split is in research R5.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | PASS | No `Pattern` change. Research R5 checks that pattern data embeds no IR context arrays. |
| II. KeyboardIR spine | PASS | The reader produces `KeyboardIR` and nothing else. The parser's `ASTNode`/`NodeType` stay internal to `engine/src/codec/ng/`, enforced by a depcruise rule. A construct the codec can't model is still a `RawKmnFragment`, never dropped (FR-006/007). A hard syntax error still fails the scaffold with no try/catch around `parse()`. The opened-keyboard splice path (spec 111) reads the same IR and is unaffected. |
| II (contract policy) | PASS, additive only | The Phase 4 members are optional union additions, following the `useGroup` and spec 103 precedent. Renames, retypes and removals are ruled out of this spec (FR-040 to FR-042). Exhaustive switches turn every missed consumer into a compile error (FR-024). |
| III. State model | PASS | No change to drafts, decisions or the working-copy model. Old drafts' `startIr` stays valid because no field changes shape. |
| IV. Validator layering, one D3 cycle | PASS | No new validation path or timer. keyboard-lint moves onto the contracts accessors, which it may import. The `lint-not-to-engine` rule is untouched. |
| V. VirtualFS only | PASS | The reader is in-memory, like today's. The corpus comparison is a test or utility run outside the studio. |
| VI. Team boundaries | PASS: **engine team** | Codec, contracts and engine consumers are all engine-owned. Pattern data is untouched. The capability table is engine planning data. |
| VII. Out of scope | PASS | No new emission format. The LDML export (spec 108) changes only by reading typed members (FR-026). No other importer or exporter is built (FR-029). |
| VIII. House conventions | PASS | `[OK]`/`[WARN]`/`[ERROR]` in console output. No issue numbers in shipped code: the vendored files' provenance header names the upstream *commit and path*, not issue numbers. |
| IX. Decision registry | N/A | No survey surface. Writers that move to the rule helpers keep routing through `mutate()` where they do today. |
| X. Nothing silent | PASS | Every grammar rejection is a named-reason fragment (FR-007). Every lost or allow-listed line is in the committed comparison report (FR-030). Non-KMN importers report rather than drop (FR-029b). |
| XI. Done means integrated | PASS, with the integration point named | The new reader is reachable through the existing `parse()` call sites: Track 1 copy, Track 2 open, CLDR import's emit-then-parse, and the LDML export's re-parse. It goes live when the old reader is removed (FR-008), which is a task of this spec, not a follow-up. The capability table's consumer is the check (FR-028) plus the future importer and exporter specs. Owner: engine team. |
| XII. Personal data | PASS | See below. |

## Personal Data Check (Constitution Article XII, spec 100)

*Personal data: none — no new store, recipient, category, or telemetry.*

## Project Structure

### Documentation (this feature)

```text
specs/116-ng-parser-adoption/
├── plan.md                  # This file
├── research.md              # Phase 0: corpus trial run, vendoring, comment channel, inventories
├── data-model.md            # Phase 1: syntax tree → IR mapping, new IR members, comment channel
├── quickstart.md            # Phase 1: how to validate each phase
├── contracts/
│   ├── lowering.md          # syntax tree → KeyboardIR lowering contract and reason catalogue
│   ├── comment-channel.md   # what the front end keeps beside the token stream
│   ├── rule-shape.md        # accessor and helper API (FR-032 to FR-037)
│   ├── capability-table.md  # format-capability table schema and check (FR-027 to FR-029b)
│   └── vendoring.md         # pinned snapshot, local patches, re-sync and switch-to-npm policy
├── checklists/requirements.md
└── tasks.md                 # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/contracts/src/
├── keyboard-ir.ts             # Phase 4: additive members (layer, set, save, reset, call, return, platform, outs)
├── schemas.ts                 # Phase 4: zod mirrors of the new members, under the drift guards
├── rule-shape.ts              # Phase 1: accessors and rule helpers (one splitter; offset accessor)
└── capability/                # Phase 5: format-capability table data + its completeness check
    ├── format-capability.ts
    └── format-capability.test.ts

packages/engine/src/codec/
├── ng/                        # Phase 2: vendored Keyman front end (provenance header, MIT)
│   ├── lexer.ts  scan-recognizer.ts  token-type.ts  token-buffer.ts
│   ├── recursive-descent.ts  tree-construction.ts  ast-rebuild.ts
│   ├── node-type.ts  token-to-node.ts  kmn-analyzer.ts  kmn-file.bnf
│   └── PROVENANCE.md          # commit, path, local patches, re-sync steps
├── comment-channel.ts         # Phase 3: comments and continuations captured beside the tokens
├── lower.ts                   # Phase 2: syntax tree + comment channel → KeyboardIR
├── parse.ts                   # Phase 2: parse() routes to the new reader; old reader kept as parse-legacy.ts until FR-008
├── parse-legacy.ts            # Phase 2 only: the current reader, for the side-by-side suite; deleted at the end of Phase 3
├── opaque-reasons.ts          # Phase 2: new grammar-rejection reasons
├── reader-differential.corpus.test.ts   # Phase 2–3: old vs new IR over corpus + fixtures
└── emit.ts                    # Phase 4 only: emit the new members

packages/engine/src/ldml-export/classify/   # Phase 4: switch to typed members (FR-026)
packages/engine/src/**, packages/studio/src/**, packages/keyboard-lint/src/**
                               # Phase 1: readers and writers move onto rule-shape accessors and helpers
.dependency-cruiser.cjs        # Phase 2: codec/ng is internal to codec
eslint config                  # Phase 1: no-restricted-syntax guard on raw rule-shape access (FR-037)
specs/116-ng-parser-adoption/evidence/   # Phase 3: committed comparison report (FR-030)
```

**Structure Decision**:
- The parser is vendored inside the codec (`engine/src/codec/ng/`), not as a workspace package. It is
  a private implementation detail of the codec (Art II), and a package would invite other imports.
- Accessors live in contracts because keyboard-lint cannot import the engine.
- The capability table lives in contracts because its completeness check must see every IR kind.
- The old reader survives only as `parse-legacy.ts`, until the comparison gate passes and comments
  have been proven too.

## Phases and gates

| Phase | Stories / FRs | Gate to close (all green, then commit + push) |
|---|---|---|
| 1. Rule-shape accessors | US5, FR-032 to FR-038 | Every reader and writer migrated. Lint guard on. `pnpm lint` and `pnpm -r test` pass with **no** test expectation changed. One splitter remains. |
| 2. Reader swap (comparison) | US1, FR-001 to FR-008, FR-030/031 | Vendored parser builds in browser and Node. The comparison suite shows import status and per-reason counts not worse (allow-list committed). Emit is identical for every corpus file. The comparison runs with comments compared **as a known gap**. |
| 3. Comments | US2, FR-010 to FR-014 | Comment text and anchors identical to the old reader across corpus and fixtures. Comparison fully green. **Old reader deleted (FR-008).** The comparison report is committed under `evidence/`. |
| 4. Additive IR members | US3, FR-020 to FR-026 | New members in the contract and schema. Every exhaustive switch handles them. Round-trip passes. The LDML classifier reads them, with identical output on its fixtures. Mapping-contract rows in spec 108 updated. Corpus count of `option-store-directive`/`call-return`/`outs-expansion` fragments drops as SC-005 says. |
| 5. Capability table | US4, FR-027 to FR-029b, SC-007/010 | Table covers every IR kind and node field, with KMN export "mapped" on every row. The check is wired into the contracts tests. The importer policy is stated in the table and cross-linked from epic #2584's issues via PR body. |

Phase order follows the dependencies. Phase 1 is independent and goes first so that Phases 2–4 move
fewer files. Phase 4 needs the new reader, because the grammar is what types those constructs, so it
comes after Phase 3. Phase 5 needs Phase 4's members in order to list them.

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
|---|---|---|
| Vendored third-party source in the engine | Keyman has not published the parser (unmerged branch, milestone 20.0) | Waiting for a release blocks the LDML work and the import epic for an unknown time. Re-implementing the grammar ourselves forfeits upstream alignment, which is the point of the change. |
| Two readers alive at once (Phases 2–3) | The comparison gate (FR-030) needs the reference reader | Switching in one step makes any regression look like a codec bug with no baseline. The legacy file is deleted in Phase 3, the same phase that proves the gate. |

## Post-design Constitution re-check

Re-checked after writing [data-model.md](data-model.md) and [contracts/](contracts/). No verdict
changes:
- The lowering contract keeps every IR field the current reader produces, including `sourceLine`,
  `groupNodeId`, `storeSketch`, `producedOutput`, `trailingComment`, `IRComment` anchors and
  `targetSelector`.
- The new members are additive.
- The rule-shape API reads the IR without changing it.
- The capability table is data plus a test.

Art II's "no try/catch around `parse()`" still holds. The lowering converts a rejected *line* into a
fragment, but a rejected *file* (a lexer failure, or a structure the line loop can't resynchronise
from) still throws.
