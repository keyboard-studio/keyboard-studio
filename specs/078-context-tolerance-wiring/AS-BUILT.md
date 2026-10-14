# Spec 078 Context tolerance wiring: as built

**Status:** Retired 2026-10-14. Shipped; the live mechanism's centre of gravity has since moved to spec 086 (see Divergences).
**Full docs:** [specs/_archive/078-context-tolerance-wiring/](../_archive/078-context-tolerance-wiring/) (spec, plan, tasks, research, data-model, contracts, checklists, quickstart). Not read by default.

## What shipped
- The context-tolerance station in the marks step, the compile-gated analysis (`useContextToleranceAnalysis` family), IRPath writes through the manifest-declared `CONTEXT_TOLERANCE_WRITES`, and the persisted artifact overlay replayed by `projectWorkingCopyVfs` (async compute, synchronous write).

## Divergences from the spec
- The author path this spec wired ran through spec 062's per-rule variant generator; spec 086's group mechanism is now proposed first, with 062 demoted to fallback (086 FR-019). The retirement criteria for the 062 path live in 086's engine contract, not here.
