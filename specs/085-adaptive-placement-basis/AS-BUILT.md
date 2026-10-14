# Spec 085 Adaptive placement basis: as built

**Status:** Retired 2026-10-14 by maintainer ruling, as superseded.
**Full docs:** [specs/_archive/085-adaptive-placement-basis/](../_archive/085-adaptive-placement-basis/) (spec). Not read by default.

## What shipped instead
- The "decision as the only unit" direction this spec argued for was built as the 088–093 modular-decisions series (decision set, apply, gallery modules, derived steps, extraction, recalculation).

## What did not ship
- Part B (the adaptive placement basis mechanism itself) was never built.
- Part A — the one-character suggestion-gate fix (`candidate.confidence >= threshold` → strict `>` at threshold 0.5 in `getRankedSuggestionsForChar`, packages/studio/src/survey/placementSeeds.ts, so an n=1 single-source candidate no longer qualifies) — is **still unlanded** and is tracked as a standalone issue filed with this retirement, so the defect outlives the spec.
