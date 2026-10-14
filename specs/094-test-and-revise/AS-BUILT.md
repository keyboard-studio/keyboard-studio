# Spec 094 Test and revise: as built

**Status:** Retired 2026-10-14. Shipped.
**Full docs:** [specs/_archive/094-test-and-revise/](../_archive/094-test-and-revise/) (spec, plan, tasks, research, data-model, contracts, checklists, quickstart). Not read by default.

## What shipped
- The Output test-and-revise loop: numbered `.kmp`-only test builds (testBuild projection; download/zip/PR bytes unchanged), tester reports, and revise-and-return via the location spine's `returnTo` seam with a revision snapshot on arrival at a step (Discard restores it).
- Builds and reports persist in `testingStore` as the draft envelope's additive `testing` slice.
