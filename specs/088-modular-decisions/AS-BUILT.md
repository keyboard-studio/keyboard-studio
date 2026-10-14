# Spec 088 Modular decisions: as built

**Status:** Retired 2026-10-14. Shipped (PR series from 2026-10-06; foundation branch of the 088–093 stack).
**Full docs:** [specs/_archive/088-modular-decisions/](../_archive/088-modular-decisions/) (spec, plan, tasks, research, data-model, contracts, checklists, HANDOFF). Not read by default.

## What shipped
- The `decisionModule` contract, the decision set store (`decisionStore`), decision provenance (`"asked" | "extracted" | "default" | "derived"`), and derived gating of steps from the decision set.
- Draft persistence of the decision set inside the draft envelope (see spec 093 AS-BUILT for the envelope as a whole).

## Divergences from the spec
- FR-006 ("answers stored ONLY in decisionStore") did not hold as built: a filtered `surveyAnswerStore` also persists (only answers to decision-`provides` questions are kept), answers ride in the draft's `surveyAnswers` slice, and load rehydrates answers from decisions without overwriting explicit ones. The two stores coexist by design of the shipped code; the constitution v2 Art III scoped-truth table is the governing statement.
