# Spec 023 QU decompose wizard: as built

**Status:** Retired 2026-10-14. Superseded before it landed (its header still claimed "LANDED on branch (PR pending)" — it never merged as specified).
**Full docs:** [specs/_archive/023-qu-decompose-wizard/](../_archive/023-qu-decompose-wizard/) (spec). Not read by default.

## What shipped instead
- The wizard decomposition this spec modelled as YAML `next` rules was achieved by the decision registry (specs 087–091): steps are derived screens over decision modules.
- The one fork this spec specified in YAML — the copy/adapt track choice — is implemented as a hand-coded branch in `packages/studio/src/steps/advance.ts` (`case "track":`), not as data.
