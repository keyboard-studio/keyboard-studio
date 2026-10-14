# Spec 091 Derived steps: as built

**Status:** Retired 2026-10-14. Shipped (088–093 stacked series).
**Full docs:** [specs/_archive/091-derived-steps/](../_archive/091-derived-steps/) (spec, plan, tasks, research, data-model, quickstart). Not read by default.

## What shipped
- `deriveScreens`: the wizard's screens are derived from the decision registry's sort; per-screen trails derive `spine`/`joinTarget` from derived gates.
- Deleted `steps/stepDependencies.ts` and the engine that consumed it; the step manifest is an unordered pool of declarations arranged by the derived screen order (see docs/architecture.md).
