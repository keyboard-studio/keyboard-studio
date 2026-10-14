# Spec 093 Derived keyboard: as built

**Status:** Retired 2026-10-14 by maintainer ruling. The recalculation core shipped; the decisions-only draft model did not, and is closed as not-planned.
**Full docs:** [specs/_archive/093-derived-keyboard/](../_archive/093-derived-keyboard/) (spec, plan, tasks, research, data-model, quickstart, perf-baseline, followups). Not read by default.

## What shipped
- Replay/recalculation: a changed decision recalculates its downstream closure and replays from the checkpoint before it; incremental `apply` (089) and replay agree, and replay installs the result. Warm-edit median 7.20 ms on sil_euro_latin (T021 baseline).
- Base switch = RETAIN + RECALCULATE: decisions are kept and re-derived against the new base; answers that no longer fit are re-proposed, never dropped.
- The governing statement of the shipped state model is constitution Art III: drafts save an **envelope** (starting point, working-copy snapshot, decisions, 053 record, feature slices).

## Closed as not-planned (2026-10-14 ruling)
- **FR-004** (drafts save starting point + decisions only; DRAFT_VERSION 3): stopped during the build when dropping the working-copy snapshot was shown to lose author work silently; left as an open obligation in followups.md, now **closed**. Drafts remain v2 envelope + tolerant-read.
- **FR-005** (delete `repropagate`/`staleSteps`): already retired inside followups.md with rationale during the build; confirmed closed here.
