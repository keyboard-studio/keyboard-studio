# Spec 092 Live extraction: as built

**Status:** Retired 2026-10-14. Shipped (088–093 stacked series).
**Full docs:** [specs/_archive/092-live-extraction/](../_archive/092-live-extraction/) (spec, plan, tasks, research, data-model, contracts, quickstart, followups). Not read by default.

## What shipped
- Extraction passes over the starting point (identity, script/keys, behaviours, conventions) producing **offered** decisions with base-derived provenance, at project open and on starting-point change.
- Author disposition (accept / edit / reject) on the Decisions page; extraction never overwrites an author-made decision, and on a base switch, decisions whose inputs vanish are re-marked offered rather than dropped (spec 093 recalculation).
- This replaced spec 055's base-contribution-record mechanism as the live "learn from the base" path; 055's record remains recoverable history (decisions/baseContributionFromDecisions.ts), not a live mechanism.
