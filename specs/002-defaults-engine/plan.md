# Implementation Plan: Defaults engine (propose-then-confirm proposers)

**Branch**: `002-defaults-engine` | **Date**: 2026-06-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-defaults-engine/spec.md`

**Governing spec**: `spec.md` §3a/§3c ("Defaults are the product"), §8 Phases A/B/C′/E/F (extracted to [specs/008-data-flow/spec.md](../008-data-flow/spec.md)), §5 "Base-derived pre-fill". This plan **cites** that scope; it does not re-derive it.

## Summary

Add a **proposer layer** so every identity, paperwork, advisory, technical-default, and help-documentation decision point in §8 Phases A/B/C′/E/F arrives as a provenance-labeled, editable proposal — never a blank field — that the author confirms or overrides in place (FR-001, FR-010). The layer is a set of **pure, deterministic engine functions** (one proposer per decision-point family) that read the already-instantiated working copy (IR, identity, resolved BCP47, `producedGlyphs`, the §7.7 assignment map, the §7.1 axis vector, and the optional authenticated identity) and emit `DefaultProposal[]`. The studio surfaces each proposal through the **existing** `SurveyRunner.getSeedValue` seed channel plus a new parallel provenance channel rendered with the existing `LintChip` visual vocabulary. A cross-cutting `axisFills` provenance record (FR-011) and a phase-exit **defaults-audit** check (FR-013) make the §3a guarantee auditable and enforceable.

The work reuses, rather than re-architects, the survey: `deriveScriptPrefill()` (Phase C′ reorder), the CLDR exemplar loader, `MechanismAssignment.source: "discus-suggested"`, `mergePhaseResults()`, and the scaffolder's provisional display name all already exist. The two genuinely new substrate pieces are a **pinned langtags.json loader** (the spec assumes it is loaded for the autonym; it is not — only a declarative `@langtags_iso639` reference exists today) and the additive `axisFills` / `DefaultProposal` contract types.

## Technical Context

**Language/Version**: TypeScript 5.x, Node ≥ 20, ESM. React 18 + Vite for the studio SPA.

**Primary Dependencies**: pnpm 9 workspace; `@keyboard-studio/contracts` (dependency root), `@keyboard-studio/engine`, `@keyboard-studio/studio`, `@keyboard-studio/llm` (optional, narrative only), zod (runtime schemas), zustand (working-copy store), vitest, dependency-cruiser.

**Storage**: In-memory VirtualFS during authoring (Article V); pinned reference data fetched at `prebuild` (CLDR v46.1.0 pattern) — langtags.json gets the same pinned-fetch treatment. No host-disk writes during authoring.

**Testing**: vitest per package (`pnpm --filter <pkg> test`); proposers are pure → unit-testable in isolation against fixtures; Playwright E2E specs remain `.skip` (not wired up).

**Target Platform**: Browser SPA (engine compiled to ESM, consumed by Vite); engine functions also run under Node for tests.

**Project Type**: Web application — engine library (`packages/engine`) + React SPA (`packages/studio`) over a shared contracts package.

**Performance Goals**: Proposers run synchronously within a phase transition (well under the single 300 ms debounce cycle, Article IV — they do **not** introduce a second timer); langtags/CLDR lookups are async fetches cached per session. No per-keystroke proposer work.

**Constraints**: Pattern schema is immutable (Article I — `PatternQuestion` is explicitly **out of scope**, per the spec's Out of Scope); single working copy (Article III); VirtualFS-only authoring (Article V); deterministic skeleton must stand alone with no LLM backend (FR-009); keystroke instructions MUST NOT be model-generated.

**Scale/Scope**: ~6 proposer families (copyright, autonym, display-name, advisory, reorder, touch-layer, help-skeleton) covering the 8 §8 defaults-audit flags (#1–#8); one new langtags loader; ~4 additive contract types + their zod mirrors; studio provenance affordance over the existing `SurveyRunner`.

## Constitution Check

*GATE: evaluated against Articles I–VIII. Re-checked after Phase 1 design — still passing.*

| Article | Gate | Verdict |
|---|---|---|
| I. Pattern schema locked | No rename/type-change/removal of `Pattern`/`PatternQuestion`. | **PASS.** The typed `defaultSource` discriminator on `PatternQuestion` is **explicitly out of scope** (spec Out of Scope; reserved for the #5/#5b joint session). Provenance lives at the *proposal* level in new types, not on the locked schema. |
| II. KeyboardIR spine | Mutations operate on IR, not raw `.kmn`. | **PASS.** Proposers *read* IR + derived state and emit proposals; the only mutation path remains the scaffolder/`resetIdentity` already in place. |
| III. Single working copy | No second working copy / intermediate serialization. | **PASS.** Proposers read the one working copy held in the zustand store; nothing new is instantiated or serialized early. |
| IV. Validator layering / one 300 ms debounce | No second debounce timer or parallel validation path. | **PASS.** The defaults-audit (FR-013) is a **phase-exit** check that emits findings in the existing `LintFinding` vocabulary surfaced by `LintChip`; it is not a debounce-cycle validator and adds no timer. |
| V. VirtualFS only | No host-disk writes during authoring. | **PASS.** langtags.json is a pinned prebuild fetch (mirrors CLDR) into bundled reference data; no authoring-time disk writes. |
| VI. Team boundaries | Declare owning team, stay in boundary. | **PASS (split, declared).** **Engine team** owns the proposer functions, langtags loader, `axisFills`/`DefaultProposal` contracts, the defaults-audit check, and the studio wiring (SPA is engine-owned). **Content team** owns the welcome.htm narrative *prompt* (FR-009) and any survey question copy changes. The split is called out per-task. |
| VII. Out of scope v1 | No CJK/Ethiopic reorder, etc. | **PASS.** Phase C′ proposals cover only in-scope Non-Roman families; CJK/Ethiopic/Hangul reorder excluded (spec Out of Scope reaffirms §16). No browser/OS layout detection (FR-005). |
| VIII. House conventions | `[OK]`/`[WARN]` console, markdown links, no issue numbers in code, commit-title vocabulary. | **PASS.** Enforced at implementation; this plan uses markdown links and no in-code issue numbers. |

**Additive-contract note (tracked in Complexity Tracking).** `axisFills` and the new proposal/provenance types are **additive, optional** fields/types in `@keyboard-studio/contracts`. They do **not** touch `Pattern`/`Criterion`, so Article I's locked-schema gate (which names the `Pattern` family specifically) does not fire. Per the contract source-of-truth chain, each new type lands with its zod mirror in `schemas.ts` in the **same commit** (compile-time drift guard), and the count-enforcing tests are unaffected (those count `Criterion` rows, not survey types). No major version bump is required for purely additive optional fields, but the change is flagged for content+engine awareness because it extends the survey-result surface.

## Project Structure

### Documentation (this feature)

```text
specs/002-defaults-engine/
├── plan.md              # This file
├── research.md          # Phase 0 — langtags loading, axisFills placement, provenance vocabulary, FR-013 band
├── data-model.md        # Phase 1 — DefaultProposal, ProvenanceLabel, AxisFill, NoDefaultDecision + merge points
├── quickstart.md        # Phase 1 — runnable validation scenarios (US1–US5)
├── contracts/
│   └── proposers.md      # Phase 1 — Proposer function contract + per-phase proposer signatures
├── checklists/          # (pre-existing)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
packages/contracts/src/
├── defaultProposal.ts        # NEW — DefaultProposal, ProvenanceLabel, NoDefaultDecision (additive)
├── axisFills.ts              # NEW — AxisFill record type (additive)
├── surveyPhaseResult.ts      # EDIT — add optional `axisFills?` (additive, non-breaking)
├── schemas.ts                # EDIT — zod mirrors for the new types (same-commit drift guard)
└── index.ts                  # EDIT — re-export new types

packages/engine/src/
├── proposers/                # NEW subsystem — pure, deterministic proposer functions
│   ├── index.ts              #   propose(phase, ctx) dispatcher → DefaultProposal[]
│   ├── context.ts            #   ProposerContext assembled from the working copy
│   ├── identity/             #   copyright (you/org), autonym (langtags→CLDR→hint), display-name
│   ├── advisory/             #   coexisting-keyboards (region+Q1), primary-use-case (A1+region+Q1)
│   ├── reorder/              #   Phase C′ — reuses deriveScriptPrefill + §9 family routing
│   ├── touch-layers/         #   Phase E — modifier→layer-id auto-derive
│   ├── help-skeleton/        #   Phase F — deterministic title+autonym+char→keystroke table
│   └── audit.ts              #   FR-013 phase-exit defaults-audit → LintFinding[]
├── langtags/                 # NEW — pinned langtags.json loader exposing localname/localnames
│   └── index.ts
└── character-discovery/cldr.ts  # REUSE — CLDR fallback for autonym + inventory

packages/studio/src/
├── survey/
│   ├── proposals/            # NEW — provenance chip component + seed/provenance adapter
│   ├── SurveyRunner.tsx      # REUSE — getSeedValue is the proposal seed channel
│   ├── QuestionField.tsx     # EDIT — render provenance label beside the field (LintChip vocabulary)
│   ├── PhaseF.tsx            # EDIT — show the deterministic help skeleton as an editable draft
│   └── Prefill.tsx           # REUSE — read-only confirmation precedent
└── stores/workingCopyStore.ts  # REUSE — proposer context source

scripts/                       # EDIT — pin + fetch langtags.json at prebuild (CLDR pattern)
```

**Structure Decision**: Web-application layout. The proposer layer is a **new engine subsystem** (`packages/engine/src/proposers/`) so the logic is pure, deterministic, and unit-testable without the SPA; the studio consumes its output through the existing `SurveyRunner.getSeedValue` channel and a new provenance affordance. New shared types live in `@keyboard-studio/contracts` (the dependency root) so engine and studio share one definition. This respects the codec/working-copy spine (proposers read, scaffolder mutates) and the team split (engine owns proposers + SPA wiring; content owns narrative prompt + survey copy).

## Complexity Tracking

| Violation / Risk | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Additive contract types (`DefaultProposal`, `AxisFill`, `axisFills?` on `SurveyPhaseResult`) | FR-010/FR-011 require a provenance label on every proposal and a recoverable origin per axis fill; no existing type carries proposal-level provenance. | Reusing `PlacementCandidate.priorSource` alone was rejected: it covers per-character placement only, not identity/paperwork/help proposals, and is not attached to survey answers. The new types are optional and additive, so no `Pattern` schema break and no major version bump. |
| New pinned langtags.json loader | FR-003 autonym proposal needs `localname`/`localnames`; the spec *assumes* langtags is loaded but only a declarative `@langtags_iso639` reference exists today. | Deriving the autonym from CLDR alone was rejected — langtags covers minority languages CLDR omits (the spec's stated reason for preferring it). Reuses the existing CLDR pinned-fetch pattern, so no new infrastructure shape. |
