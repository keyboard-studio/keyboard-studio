# Spec 086 Context normalization group: as built

**Status:** Retired 2026-10-14. Shipped 2026-10-11 (PR #1956 squash ac878444; camelCase id rename followed in PR #2031).
**Full docs:** [specs/_archive/086-context-normalization-group/](../_archive/086-context-normalization-group/) (spec, plan, tasks, research, data-model, contracts, checklists, quickstart). Not read by default.

## What shipped
- One context-only normalization group in front of the keyboard's entry point, derived without simulation, cached per keyboard source, replayed through the projection overlay; the working IR stays step-free.
- Spec 062's per-rule path demoted to fallback for refused steps and `regressed` keyboards (FR-019). **The retirement criteria for the 062 path live in this spec's archived engine contract** (contracts/engine-normalization-step.md) and remain in force: desktop-engine verification + paste premise + no `regressed` corpus keyboard. The FR-021 post-reorder measurement was deferred unverified at ship time.
