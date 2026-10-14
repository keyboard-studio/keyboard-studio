# Spec 031 Spec-ref / trace join: as built

**Status:** Retired 2026-10-14. Shipped as a utility; see Divergences for the part that never landed end-to-end.
**Full docs:** [specs/_archive/031-specref-trace-join/](../_archive/031-specref-trace-join/) (spec, plan, tasks, research). Not read by default.

## What shipped
- `utilities/spec-trace`: spec corpus hashing/drift detection over spec.md + docs + extracted specs, a `spec-trace.json` join of code/trace data, and `spec-search` (BM25 over specs/+docs/), which is the half in daily use.

## Divergences from the spec
- The CI trace step runs `continue-on-error`: the join can rot without blocking anything, and the spec's one manual end-to-end verification task was never checked off. Treat trace-join output as advisory; `spec-search` results are trustworthy.
- Whether the trace join earns its keep is an open pruning question (constitution conflict-map register, Tier 3) — this retirement does not decide it; the utility stays in the tree either way.
