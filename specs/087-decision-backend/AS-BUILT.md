# Spec 087 Decision backend: as built

**Status:** Retired 2026-10-14. Shipped (foundation of the 088–093 series).
**Full docs:** [specs/_archive/087-decision-backend/](../_archive/087-decision-backend/) (spec, plan, tasks, research, data-model, contracts, checklists, ARCHITECTURE, followups). Not read by default.

## What shipped
- The decision registry: question/gallery modules declare `provides`/`requires`; `orderByDependencies` (packages/studio/src/decisions/orderDecisions.ts) derives every order from that graph.
- The registry is the single source of order for questions AND steps (constitution Art IX); the step manifest holds no order.

## Divergences from the spec
- This spec's own ARCHITECTURE.md presented `steps/stepDependencies.ts` as a present file; spec 091 deleted that file and the advance engine it fed. The archived ARCHITECTURE.md is a pre-091 snapshot — read the code, not it, for the current step model.
