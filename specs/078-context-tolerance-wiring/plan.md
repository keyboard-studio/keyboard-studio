# Implementation Plan: Context tolerance reaches the author

**Branch**: `078-context-tolerance-wiring` | **Date**: 2026-09-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/078-context-tolerance-wiring/spec.md`

## Summary

Spec 062 built a context-tolerance diagnostic (`computeContextTolerance`), a rule
generator (`proposeContextVariants`), a Layer C check (`KM_WARN_CONTEXT_NOT_TOLERANT`
/ `KM_HINT_CONTEXT_NOT_ANALYSED`), and a facet-transform migration factory. None of
these has a production caller. This plan gives them one path to the author:

1. **Make the analysis runnable in the browser.** Today the simulator imports
   `node:vm` and resolves vendored Keyman code only through tsconfig/vitest
   aliases. This is the real blocker: a barrel export alone does not fix it.
   The plan adds an injectable browser keyboard loader, rewrites the vendored
   bare specifiers to relative paths, and adds a new engine subpath
   `@keyboard-studio/engine/context-tolerance` that the studio lazy-imports
   ([research.md §10](research.md#10-plan-time-decisions-2026-09-24), D1–D2).
2. **Run it on the compile gate, never on the critical path.** After
   `useKeyboardArtifact` reaches `ready`, a follow-on task gated by `runId` runs
   the analysis. It never joins the `Promise.all` and never touches the D3
   debounce. The report goes to a new `workingCopyStore` slice.
3. **Report it where findings already appear.** The report feeds the 19.x lint
   check, which becomes Layer C's first production caller through a narrow
   entry. The studio then renders a localized notice next to `LintSummary`.
   Characters are shown by codepoint and Unicode name, and a separate
   "could not be checked" notice covers the rest (US1).
4. **Propose, then confirm, in the marks series.** A new station,
   `marks_context_tolerance`, is added to `MarksSeriesStep`. It is pre-filled
   with every fixable site ticked and previews the change in the spec 039
   `FacetTransformPanel`, mounted here for the first time. The step's only
   write is the **decision**: a `SurveyPhaseResult.marksContextTolerance` field
   plus a survey-answer trail entry (FR-005a first half).
5. **Apply the decision as a separate effect.** A hook keyed off the recorded
   decision recomputes the proposal against the current IR and keeps only the
   accepted sites whose rules still match the fingerprint. It verifies the
   result with `applyFacetTransform` (using `ruleOverride`), then writes the IR
   synchronously through `applyMutatePatch` with **declared writes** (FR-005a
   second half; see Constitution Check IX).

Story 4 (own-form write-back) is **removed**: the owner resolved it echo-only on
2026-09-24 (see [spec.md Clarifications](spec.md#clarifications)). Author
exposure is behind a flag until the corpus harness gate is green (FR-011/FR-012).

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), Node ≥ 22.19.0 for tooling; React 18 + Vite for the studio

**Primary Dependencies**:
- `@keyboard-studio/engine`: validator/context-tolerance, pattern-apply/context-variants, facet-transform, simulator, compiler (kmc-kmn WASM).
- `@keyboard-studio/contracts`: `ToleranceReport`, `SurveyPhaseResult`, `DecisionRecord`.
- `@keymanapp/keyboard-lint`: check 19.x.
- Lingui for i18n; Zustand (`workingCopyStore`).

**Storage**: In-memory working copy. Durable draft (`ks.draft.<key>.v1`) holds new optional fields through tolerant reads, with no `DRAFT_VERSION` bump (precedent: `marksOutputForm`, `decisionRecord`).

**Testing**:
- vitest per package (engine, contracts, keyboard-lint, studio).
- Playwright e2e for the studio walk.
- `utilities/nfd-tolerance-corpus` (PR #1757) as the FR-012 corpus gate.

**Target Platform**: Evergreen browsers (studio SPA); Node for engine tests and the corpus harness

**Project Type**: pnpm monorepo: library packages plus a web SPA

**Performance Goals**:
- Preview time-to-ready is unchanged (the analysis runs after `ready`).
- The finding should arrive within one further compile-plus-simulate cycle for corpus-sized keyboards (spec assumption). If it does not, it arrives late; the preview never does.

**Constraints**:
- No second debounce timer (D3).
- No host-disk writes (spec §11).
- Nothing Node-only in the studio bundle.
- The root engine entry must not pull in the simulator (engine `index.ts:105-110`).
- Advisory only: the finding never blocks preview, download or submission.

**Scale/Scope**:
- Pinned corpus: 1,044 keyboards.
- `sil_yoruba8` is the canary.
- Rule shapes that FR-010 refuses (multi-key `any()` with key-position `index()` output) occur in 2,461 rules across 28 keyboards.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Verdict | Evidence |
|---|---|---|
| I. Pattern schema locked | **PASS** | No `Pattern` field touched. Contract additions are additive and optional, and outside `pattern.ts`: `SurveyPhaseResult.marksContextTolerance`, `DecisionProposalSource` member `"analysis"`, and optional `DecisionProvenance.proposed`. Each is mirrored in `schemas.ts` in the same change (drift guards). See [data-model.md](data-model.md). |
| II. KeyboardIR spine | **PASS** | Analysis and generation operate on `KeyboardIR`. Opaque `RawKmnFragment` rules are reported `not-analysed` and never modified (FR-010). |
| III. Single working copy | **PASS** | The analysis compiles a *derived* VFS (`buildToleranceCompileVfs`), which is a throwaway staging copy like the preview compile, not a second working copy. The apply effect mutates the one working copy. |
| IV. Validator layering / D3 | **PASS** | The tolerance report rides the non-debounced **compile gate** in `useKeyboardArtifact`, not `useValidator`'s 300 ms cycle. No new timer. Layer C stays in keyboard-lint; the studio calls it with a precomputed report, so keyboard-lint still never imports the engine (depcruise rule unchanged). |
| V. VirtualFS only | **PASS** | Everything is in memory. The browser keyboard loader evaluates compiled JS with `new Function`, which the CSP allows (`vercel.json`: `frame-ancestors` only). |
| VI. Team boundaries | **PASS** | **Engine** owns all code here: SPA, validator, compiler service. **Content** owns the survey wording: the station prompt, the finding text, and FR-013's glosses. Those strings are drafted here and routed to content for sign-off (task in Phase 5). |
| VII. v1 out of scope | **PASS** | Not touch-first, not CJK/Ethiopic reorder, not byte-identical round-trip (SC-008 disclaims it explicitly). |
| VIII. House conventions | **PASS** | Generated rule names describe behaviour (FR-015). No issue numbers in code. i18n ids follow `area.segment` (e.g. `marks.contextTolerance.station.heading`). |
| IX. Manifest / mutate seam | **PASS, with a recorded justification** | **The station** lives inside the existing `marks` manifest step (`manifest.ts:129-138`). No new top-level survey surface. The manifest entry's `writes` gains the declared IR paths the apply effect may touch (FR-005). **The decision write** rides the ordinary `SurveyPhaseResult` completion path, like `marksOutputForm` (FR-005a, first half). **The IR write** is computed asynchronously but *committed synchronously through `applyMutatePatch(base, patch, CONTEXT_TOLERANCE_WRITES)`*, so containment is enforced by the seam's own check (FR-005a, second half). The only thing outside `mutate()` is the async *computation*, which Article IX does not govern. See Complexity Tracking row 1. |

**Gate result: PASS.** No unresolved NEEDS CLARIFICATION remain: Story 4 is resolved, and the research-deferred unknowns are resolved in [research.md §10](research.md#10-plan-time-decisions-2026-09-24).

**Post-design re-check (after Phase 1): PASS.** The data model adds no locked-schema field, and the contracts in [contracts/](contracts/) keep keyboard-lint engine-free. The apply effect's write list is declared in the manifest.

## Project Structure

### Documentation (this feature)

```text
specs/078-context-tolerance-wiring/
├── spec.md              # Feature spec (Story 4 resolved echo-only)
├── research.md          # Spec-time audit §1–9 + plan-time decisions §10
├── plan.md              # This file
├── data-model.md        # Phase 1: entities, new fields, state transitions
├── quickstart.md        # Phase 1: validation walk
├── contracts/
│   ├── engine-context-tolerance-entry.md   # new engine subpath + browser loader
│   ├── studio-tolerance-state.md           # store slice, effect, fingerprint
│   └── marks-context-tolerance-station.md  # station props, result, trail entry
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/engine/
├── package.json                                  # + "./context-tolerance" export
└── src/
    ├── context-tolerance/index.ts                # NEW browser-safe subpath barrel
    ├── simulator/
    │   ├── keyboardLoader.ts                     # NEW loader interface + injection
    │   ├── browserKeyboardLoader.ts              # NEW new Function()-based loader
    │   ├── nodeKeyboardLoader.ts                 # conforms to interface (unchanged behaviour)
    │   └── vendor/**                             # bare specifiers → relative paths
    ├── validator/context-tolerance.ts            # + classifyToleranceFinding(), + shadow listing hook
    ├── pattern-apply/context-variants.ts         # + non-fallback shadow detection (FR-006)
    ├── pattern-apply/tolerance-fingerprint.ts    # NEW stable digest of affected rules
    └── character-discovery/charNames.ts          # exported via the subpath (lazy, 1.4 MB JSON)

packages/contracts/src/
├── surveyPhaseResult.ts                          # + marksContextTolerance?
├── decisionRecord.ts                             # + "analysis" source, + provenance.proposed?
└── schemas.ts                                    # zod mirrors + drift guards

packages/keyboard-lint/src/
└── index.ts                                      # export lintContextTolerance() narrow entry

packages/studio/src/
├── flags/contextToleranceFlag.ts                 # NEW VITE_KM_CONTEXT_TOLERANCE
├── lib/contextToleranceEngine.ts                 # NEW memoised import() of the subpath
├── hooks/useKeyboardArtifact.ts                  # post-ready tolerance task, runId-gated
├── hooks/useContextToleranceApply.ts             # NEW decision → verified patch → mutate seam
├── hooks/useFacetTransform.ts                    # commit() accepts ruleOverride
├── stores/workingCopyStore.ts                    # + contextTolerance slice
├── lint/ContextToleranceNotice.tsx               # NEW finding + could-not-check notices
├── survey/marks/ContextToleranceStation.tsx      # NEW station (mounts FacetTransformPanel)
├── survey/marks/MarksSeriesStep.tsx              # + station id, visibility, result field
├── steps/manifest.ts                             # marks.writes += CONTEXT_TOLERANCE_WRITES
├── decisions/createStudioDecisionRecorder.ts     # resolveProposal knows marks.context_tolerance
├── decisions/lookupQuestionLabel.ts              # label source for the new question id
└── StudioShell.tsx                               # mount notice + apply hook

utilities/nfd-tolerance-corpus/                   # from PR #1757 (dependency) — CI step
```

**Structure decision**: No new packages. Engine changes stay behind a new subpath so
the root entry stays simulator-free. Studio changes follow the existing marks-station,
store-slice and lazy-engine-import patterns.

## Phasing (maps to user stories)

- **Phase 1: Setup.** Create the flag. Land or rebase onto PR #1757 (harness).
  Add the CI step for the harness on the pinned corpus (FR-012).
- **Phase 2: Foundational** (blocks everything):
  - Browser-safe simulator: loader injection and relative vendor specifiers.
  - The `./context-tolerance` subpath.
  - A bundle-safety test that the studio's production build contains no `node:vm`.
  - A browser-environment test of `computeContextTolerance` against `sil_yoruba8`.
- **Phase 3: US1 (P1) diagnose.**
  - Post-ready tolerance task and store slice.
  - `lintContextTolerance` entry.
  - `ContextToleranceNotice` with Unicode names, the could-not-check notice, and the live-region announcement.
  - i18n ids.
  - FR-004: a failed analysis compile renders as could-not-check.
- **Phase 4: US2 (P2) accept / partial.**
  - Fingerprint.
  - Shadow listing (FR-006), including the mnemonic-backspace disclosure and the two-class stack order.
  - Station plus `FacetTransformPanel` mount.
  - `SurveyPhaseResult` field and trail entry.
  - Apply effect through `applyMutatePatch`.
  - Idempotence and composed-byte-identity tests (FR-008, SC-003).
- **Phase 5: US3 (P3) decline.**
  - Decline outcome with `provenance.proposed`.
  - Re-raise suppression by fingerprint (FR-009).
  - SC-008 output identity.
  - Content sign-off on strings.
- **Phase 6: Polish.**
  - Accessibility tracker rows (FR-014).
  - Flag removal once the harness reports zero `regressed` (FR-011).
  - The docs correction for the wrong upstream issue citation (research §2 item 2) is **out of scope**. It is listed as a follow-up.

Story 1 may ship before Story 2 (spec assumption). Both of its preconditions are met or
tracked: the compile-asset fix merged in #1774 (2026-09-24), and the harness gate is Phase 1.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Async computation feeding a synchronous mutate-seam write (Art. IX) | The generator compiles and simulates, so it cannot run inside a pure synchronous `mutate()` | Calling `commitFacetTransform` directly would be a second, undeclared IR write path invisible to the manifest. That is the gap research §3 names. The existing marks-reducer `applyMarkGuards` write with `writes: []` is a precedent we deliberately do **not** follow. |
| Browser keyboard loader + vendor specifier rewrite | The analysis must simulate in the browser, and the simulator is Node-`vm`-only | A Web Worker still needs the same loader and specifier fixes, and would add WASM/VFS re-initialisation with no precedent. A server endpoint would violate "no hosting" (spec §16). Deferred: move to a worker only if measurement shows main-thread jank. |
| Additive optional `DecisionProvenance.proposed` | FR-007 and US3 need the tool's proposal attached to a *declined* outcome, and today an override drops the proposal | Encoding the proposal in the answer value would conflate decision and proposal and break `headline.ts` rendering. The field is shaped so spec 077's FR-025 ("accepted proposals keep their real source") can reuse it. See coordination below. |

## Coordination with spec 077

Spec 077 has only a `spec.md`: no plan and no branch. So 078 is first to mount the
propose-then-confirm pattern, and it establishes the shared shapes:

- `DecisionProposalSource: "analysis"`.
- `DecisionProvenance.proposed?`.
- `FacetTransformPanel` mounted inside a marks station, not as a standalone surface.

077's plan should cite [data-model.md](data-model.md) rather than define parallel
shapes. 077 FR-009 also places its diacritic-mechanism decision in the marks
questions, so the two stations will sit side by side in `MarksSeriesStep`.
