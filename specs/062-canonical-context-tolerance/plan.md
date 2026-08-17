# Implementation Plan: Canonical-equivalence context tolerance

**Branch**: `062-canonical-context-tolerance` | **Spec**: [spec.md](spec.md) | **Governing**: [spec.md](../../spec.md) §10, §9

**Input**: [spec.md](spec.md) — see also [research.md](research.md) (the engine-side alternative, out of scope) and the "Phase 0 — Design research" section appended to it below.

## Summary

The primary requirement is that a keyboard's diacritic rules fire the same way
regardless of whether the host buffer holds the composed or decomposed form of
its context — without the keyboard's own output ever losing its single
normalization form. The technical approach is entirely source-level: a new
engine-side generator reads the already-built `nfcPostureOfInventory` per-pair
table (`packages/engine/src/marks/nfc-posture-of-inventory.ts`, shipped by spec
071) and, for each rule the codec can model, synthesizes the canonically-
equivalent context variant as an additional IR rule or store member — following
the existing idempotent-generator pattern in `mark-guards.ts` and the store-
pairing safety check already built for a different purpose in
`applyStoreSlotRemovals.ts`. Diagnosing *which* rules need a variant requires
running the keyboard through the simulator on both forms and comparing outputs
(FR-002), which in turn requires the simulator to accept a seeded starting
buffer — a capability it does not have today and which is this plan's first
task. The diagnostic itself surfaces through Layer C (`keyboard-lint`) as a
precomputed report rather than a live simulator call, preserving the
dependency-cruiser boundary that forbids Layer C from importing the engine
(see Constitution Check, Article IV). Everything a keyboard did not previously
type is proposed, previewed and confirmed through the existing facet-transform
propose/preview/confirm pipeline, never applied silently to the IR.

## Project Structure

```
packages/contracts/src/
  simulation.ts                  # + SimulatorContextSeed (seed shape, reuses DeadkeySnapshot)
  toleranceReport.ts              # NEW: ToleranceReport, RuleToleranceFinding, WriteBackPolicy
  lintFinding.ts                  # + 2 new LintCode entries (not-tolerant / not-analysed)
  axes.ts                          # + contextToleranceWriteBack? on DiscoveryAxisVector

packages/engine/src/
  simulator/index.ts               # simulate(compiled, keys, initialContext?) — seeding
  simulator/simulate.test.ts       # + seeding tests
  marks/nfc-posture-of-inventory.ts # (existing, reused as-is — no changes)
  validator/context-tolerance.ts   # NEW: runs simulator both-forms comparison -> ToleranceReport
  validator/context-tolerance.test.ts # NEW
  pattern-apply/context-variants.ts    # NEW: IR generator (rules/store members), idempotent
  pattern-apply/context-variants.test.ts # NEW
  pattern-apply/applyStoreSlotRemovals.ts # (existing) analyzeStores/pairSets reused, not changed
  pattern-apply/ir-insert.ts       # (existing) entryGroupOf/insertBeforeTerminalRules reused
  pattern-apply/mark-guards.ts     # (existing pattern to follow, not changed)
  facet-transform/                 # (existing propose/verify/types — reused pipeline)

packages/keyboard-lint/src/checks/
  check-19-x-context-tolerance.ts  # NEW: classifies a precomputed ToleranceReport into findings
  check-19-x-context-tolerance.test.ts

packages/studio/src/
  stores/workingCopyStore.ts       # + contextToleranceWriteBack field on irAxes (via existing vector)
  lib/draftPersistence.ts          # (existing generic snapshot — no changes needed)
  components/facet-transform/      # (existing panel, extended with a context-tolerance preview kind)
  lint/                             # (existing LintSummary/LintChip — new findings render via existing shell)
```

**Structure Decision**: This is a single-package-spanning feature with no new
package. It follows the existing five-stage shape the codebase already uses
for IR-level author-facing transforms (spec 071's mark work, and the
facet-transform pipeline): detect (simulator + posture table) → generate
(pattern-apply) → propose/preview (facet-transform seam) → confirm (studio
store commit) → report (keyboard-lint + studio lint UI). No new top-level
directory is created; every file lands beside its closest existing sibling.

## Constitution Check

| Article | Assessment |
|---|---|
| I. Pattern schema locked | PASS — no `Pattern` field is touched. New types (`ToleranceReport`, `SimulatorContextSeed`) are additive contracts, not `Pattern` changes. |
| II. KeyboardIR is the spine | PASS — context variants are generated as IR mutations (new `IRRule`/store members) via the existing `pattern-apply` mutation pattern, never as raw `.kmn` text edits. Opaque `RawKmnFragment` rules are detected and reported not-analysed, never rewritten (FR-010). |
| III. Single working copy | PASS — the generator produces a proposal against the one working copy; commit follows the existing facet-transform seam (`useFacetTransform.ts`), which writes back only on explicit confirm. No second working copy, no intermediate serialization. |
| IV. Validator layering fixed | **See Complexity Tracking below** — justified, non-violating resolution. |
| V. VirtualFS only during authoring | PASS — nothing in this feature touches host disk or introduces a second serialization point. |
| VI. Team boundaries | PASS — this is entirely Engine-owned (scaffolder/validator/simulator/output paths); it introduces no pattern-library, survey-text, gallery-ordering, or LLM-prompt changes. |
| VII. Out of scope v1 | PASS — no CJK/Ethiopic, no LDML, no touch-first authoring, no multi-source merge, no engine/compiler change (the engine-side alternative stays in [research.md](research.md) §6, unshipped). |
| VIII. House conventions | PASS — commit/issue titles will use `feat(engine)` / `feat(studio)` per area; no emoji; markdown links for file references. |

### Complexity Tracking

| Violation | Why needed | Simpler alternative rejected |
|---|---|---|
| Article IV names Layer C (`keyboard-lint`) as the home for "the hygiene layer alongside the existing IR-consuming checks," but FR-002 requires the diagnostic to observe actual simulator behaviour, and `keyboard-lint` is dependency-cruiser-forbidden (`lint-not-to-engine`, severity `error`) from importing `packages/engine` where the simulator lives. | The comparison must be behavioural, not textual (FR-002 is explicit that inspecting rule text for composed-looking characters is insufficient). The simulator is engine-only by design. | **Rejected: relax `lint-not-to-engine` for this one check.** Would breach the dependency-cruiser boundary itself (a structural rule, not a style preference) and reopen a decision the spec's own "two existing checks that touch the question" (`check-18-6-touch-coverage.ts`, `layer-a-prime.ts`) both flag as needing explicit sign-off — not something this plan may decide informally. **Rejected: put the whole diagnostic in Layer B (`engine/src/validator`).** Contradicts the spec's own Dependencies text ("must not be introduced as the first check of the style layer, which is unimplemented"). **Chosen instead:** split the work at the existing seam the codebase already uses for Layer C — a Layer C check is a pure function over *precomputed* inputs gated by what's available (`inventory`, `touchLayout`, etc.; `lintContext.ts`). The simulator-driven comparison runs in a new engine module (`validator/context-tolerance.ts`), producing a plain `ToleranceReport` (contracts-only data, no engine types leak). `keyboard-lint`'s new check takes that report as a new precomputed input and only classifies/formats it into `LintFinding[]` — identical in shape to how `inventory`/`touchLayout` are already threaded in. `keyboard-lint` therefore never imports `packages/engine`, the dependency-cruiser rule is untouched, and Layer C keeps its "zero error-severity codes" invariant (new codes are warning/hint only, per `check-18-6`'s and `layer-a-prime.ts`'s stated norm). This is not a boundary breach; it is the existing precomputed-input pattern applied to a new input. |

## Phase 0: Research

See the **"Phase 0 — Design research"** section appended to [research.md](research.md) — the file already exists as the campaign-facing analysis of the (out-of-scope) engine-side alternative, so the source-level design decisions for *this* plan are appended there as a clearly separated section rather than creating a second, confusingly-named file.

## Phase 1: Design & Contracts

See [data-model.md](data-model.md) and [contracts/](contracts/).
