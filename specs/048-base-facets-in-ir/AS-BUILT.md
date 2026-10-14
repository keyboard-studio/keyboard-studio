# Spec 048 Base facets in IR: as built

**Status:** Retired 2026-10-14. Partially built; superseded as the live path by spec 092.
**Full docs:** [specs/_archive/048-base-facets-in-ir/](../_archive/048-base-facets-in-ir/) (spec, plan, tasks, research, data-model, contracts). Not read by default.

## What shipped
- The contracts layer: a `facets` field on the IR types in packages/contracts, so a base keyboard's mined facets can ride in the IR.

## What did not ship / divergences
- The spec's consumer story (spec 049 repointing its consumers to the IR field) never happened: consumers still read the facet index directly, and `evidence.ts` in the adaptation module remains a mock seam.
- The shipped "learn from the base" mechanism is spec 092's live extraction into offered decisions, not facet-in-IR transport. This spec is retained in archive as the record of the contracts change only.
