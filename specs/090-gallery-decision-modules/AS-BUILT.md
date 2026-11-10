# Spec 090 Gallery decision modules: as built

**Status:** Retired 2026-10-14. Shipped (088–093 stacked series).
**Full docs:** [specs/_archive/090-gallery-decision-modules/](../_archive/090-gallery-decision-modules/) (spec, plan, tasks, research, data-model, followups). Not read by default.

## What shipped
- The desktop/touch galleries expressed as decision modules in the registry (provides/requires), replacing the bespoke QU question-unification loop: gallery choices are decisions, ordered and gated by the same machinery as survey questions.
- The decision trail records gallery dispositions (kept/added/replaced/rejected) alongside question answers.

## Later rulings
- **2026-11-10 (Matthew): D-090-24 and D-090-30/31/39/40 revised.** These rulings kept carve, dead keys, rules, physical layout and touch layout out of the replayed working copy: their values were recorded and `apply` was a no-op, while the output projection re-applied them. Now every surface's `apply` returns the transformed keyboard (option c, previously rejected), and replay is the only producer of output. See [spec 118](../118-replayed-ir-output/spec.md) and the spec 105 FR-007 amendment.
