# Implementation Plan: Decisions Backend (specs/087-decision-backend)

## Summary

Unify the studio's parallel question/order machineries into the single Decision unit proven by the spike (PR #1938): every question module declares the decisions it provides and requires (one module may provide several — Q4), order is derived topologically, base-keyboard import extracts the same decisions from the IR-plus-catalog bundle (Q1) with provenance, and answers write through the mutate seam into the single working copy. The four seam fixes are landed (commits 090bc385–835b2c65); the existing base-keyboard scan is wired to `extract()` rather than reinvented. Legacy ordering artifacts are deleted (Q3) — YAML lists, spine flags, phase fan-out — with the adaptation catalog's classification folded into extraction (Q2), each retirement gated by its parity test. Draft compatibility (Q5): live survey drafts are keyed by unchanged step and question ids, so they load unchanged (pinned by a pre-change draft fixture test); there is no migration layer.

No new stack choices: TypeScript + the existing vitest suite, same packages. The `provides` field widens from singular to list as the first plan consequence of Q4.

## Project Structure

```
packages/studio/src/decisions/        # decisionTypes, orderDecisions, extract runner, adaptDiff,
                                      # decisionIRPaths lint, draft migration, dev-only demo (?demo=decisions)
packages/studio/src/survey/questions/ # module annotations: provides[]/requires/extract (per Q4)
packages/studio/src/survey/           # SurveyRunner/FlowStepHost integration of the derived flow
packages/studio/src/steps/            # derived step order (stepDependencies/stepOrder), advance.ts; spine flags deleted
                                      # classifyBaseScript deleted; folded into target-script extraction (Q2)
packages/studio/src/stores/           # workingCopyStore baseIr/baseKeyboard slots — the extract bundle source (no change)
content/flows/                        # all *.modular.yaml order lists deleted (Q3)
specs/087-decision-backend/           # spec, plan, research, data-model, contracts
```

**Structure Decision:** everything lands on the existing `km/decisions-spike` branch (PR #1938) in story-sized waves; no new top-level directories. The `decisions/` package directory — already home to the spike, the demo, and `DecisionTrailView` — is the feature's home. Engine's codec/import pipeline is consumed as-is (the scan exists); no engine changes unless the wiring map finds a gap.

## Constitution Check

| Article | Assessment |
|---|---|
| I — Pattern schema locked | PASS — no Pattern fields touched. |
| II — KeyboardIR is the engine spine | PASS — extraction reads IR + catalog metadata; opaque `RawKmnFragment` constructs are never silently dropped (VII also bars survey-editing them). |
| III — Single working copy | PASS — the write path targets the one working copy; no second copy, no intermediate serialization. |
| IV — Validator layering fixed | PASS — no new debounce timer, no parallel validation path. Extraction runs at import time, outside the 300 ms cycle. |
| V — VirtualFS only during authoring | PASS — no host-disk writes. |
| VI — Team boundaries | PASS — Engine owns the registry, ordering, extraction, and write path. Content boundary respected: question prompt/help copy stays content-owned (i18n catalogs); the adaptation catalog remains content data whose classification the engine consumes. |
| VII — Out of scope | PASS — no CJK/Ethiopic reorder, no LDML, no opaque-fragment survey editing, no byte-identical round-trip. Behavior extraction degrades gracefully on opaque constructs per Article II. |
| VIII — House conventions | PASS — commits use the locked `<prefix>(<area>)` vocabulary; no issue numbers in code; no emoji in console output. |
| IX — Single source of survey ordering | EVOLUTION, justified — the article names `steps/manifest.ts` as the single source. This plan moved that single source to the derived decision registry: the article's *intent* (exactly one ordering authority; declared inputs/writes; every survey surface declared) is preserved and strengthened — derived, not hand-maintained. US4 has landed and the constitution Article IX has been rewritten to name the registry and the derived step order (`steps/stepDependencies.ts`). |

No unjustified violations; no Complexity Tracking table needed.
