# Spec 089 Decision apply: as built

**Status:** Retired 2026-10-14. Shipped (088–093 stacked series).
**Full docs:** [specs/_archive/089-decision-apply/](../_archive/089-decision-apply/) (spec, plan, tasks, research, data-model, contracts, quickstart, followups). Not read by default.

## What shipped
- Typed IRPath decision mutations applied to the working copy on step completion, with compile gating: a decision whose application breaks compilation is blocked, not silently applied.
- The incremental `apply` path that spec 093's replay must agree with (constitution Art III).
