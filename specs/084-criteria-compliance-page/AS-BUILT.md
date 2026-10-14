# Spec 084 Criteria compliance page: as built

**Status:** Retired 2026-10-14 by maintainer ruling. Shipped (PR #1937 planning; PR #2048 implementation, merged 2026-10-14).
**Full docs:** [specs/_archive/084-criteria-compliance-page/](../_archive/084-criteria-compliance-page/) (spec, plan, tasks, triage-not-yet-checkable, decision-18-6-origin-streamline). Not read by default.

## What shipped
- The criteria status page over all 149 criteria / 19 sections of `packages/contracts/data/criteria.json` (the data file is the authority; every count is computed from it), with the Compare-tab check for foreign keyboards.
- The §18.6 inventory builder (origin mechanism deleted, per the streamline decision) and author attestations via `criteriaRecord`.
- Follow-on check batches landed as PR #2055 (Batches 2/3/5 + 10.6; IMPLEMENTED_LINT_CODES = 57).

## Still open (tracked outside this spec)
- The KPJ constant pair (1.10b + 2.7) — blocked on the maintainer's ruling on criterion 1.10's pinned format constant.
- The EXTERNAL rows (9.4, 15.2, 15.4, 15.5, 16.2) — repo-tree state, not studio-checkable.
