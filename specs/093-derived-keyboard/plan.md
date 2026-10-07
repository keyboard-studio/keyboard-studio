# Implementation Plan: The keyboard is derived from decisions (specs/093-derived-keyboard)

**Branch**: `km/derived-keyboard` (stacked on `km/live-extraction`) | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/093-derived-keyboard/spec.md`; series plan in
[088 HANDOFF.md](../088-modular-decisions/HANDOFF.md) ("Recalculation on change", phase 6).

## Summary

The final spec of the modular-decisions series. Specs 088–092 made decisions the only *written*
state in the live app: one `decisionStore` keyed by decision id (088), every question writing
only through a pure `apply` (089), galleries and pickers as decision modules whose overlays are
decision values with per-item provenance (090), steps derived from `requires` (091), and live
extraction with setup itself as a decision (092). Spec 093 closes the loop: the working copy
becomes `replay(starting point, apply(d1), …, apply(dn))` — a cache rebuilt from the decisions
in derived order, never saved and never edited directly. A change recalculates its downstream
closure in the `requires` graph under the HANDOFF provenance rule, generalising (and then
deleting) the touch-only `steps/repropagate.ts` + `staleSteps` precedent. Drafts go to
`DRAFT_VERSION` 3 and save the starting point's id and the decisions, nothing else.

Two questions are **owner decisions awaiting Matthew's ruling** and are NOT resolved by this
plan — see "Open owner decisions" below. The task list is structured so everything except the
tasks explicitly gated on ruling (a) proceeds either way, and measurement precedes any
commitment on (b).

No new stack choices: TypeScript, the existing studio stores, vitest per package, Playwright
walks in `pnpm dev` for live-app success criteria (the 088 lesson: demo/harness results don't
count). No `packages/contracts` change, no new timer.

## Open owner decisions (gating clarifications — verbatim, unresolved)

### (a) Changing the starting point — gates US2 task T017 only

From [spec.md](spec.md), Edge Cases, verbatim:

> **Changing the starting point** is the widest possible closure.
> [NEEDS CLARIFICATION: is it a recalculation (re-extract everything, keep asked answers), or a
> new project that carries the answers over?]

Matthew's ruling is pending (asked 2026-10-06, with a lean toward recalculation recorded by the
asking agent — a lean is not a ruling). Until he rules: the replay engine, closure, provenance
rule, checkpointing, draft-v3 format and measurement tasks proceed unchanged, because they are
identical under either answer (research §8). Only T017 (starting-point-change behaviour and its
test) is blocked on the ruling; it MUST NOT be implemented on an assumed answer.

### (b) SC-004 perf budgets — proposed numbers, measurement first

From [spec.md](spec.md), SC-004, verbatim:

> On `sil_euro_latin`, a single-decision edit rebuilds within the budget set in `/speckit-plan`
> (proposed: under 300 ms, so the preview updates within one debounce cycle), and resume within
> a budget set there too (proposed: under 2 s). Measure before committing to these.

This plan follows the spec's instruction: **measure before committing**. Tasks T002 (baseline
harness) and T021 (re-measurement on the replay path) produce the evidence; the numbers
**<300 ms per single-decision edit** and **<2 s resume** on `sil_euro_latin` are recorded here
as **proposed, pending Matthew's ruling** — not committed thresholds, and no task treats them
as pass/fail gates until he rules. Whether FR-006's disposable rebuild cache is built at all
depends on those measurements.

## Technical Context

**Language/Version**: TypeScript (repo standard), Node ≥ 22.19.0, pnpm 9

**Primary Dependencies**: existing studio stack only — `decisionStore` (088), pure
`QuestionModule.apply` + the `applyMutatePatch` runner (089), decision modules with per-item
provenance (090), `orderByDependencies` in `packages/studio/src/decisions/orderDecisions.ts`,
`reproposalNoticeStore`, engine codec (IR production is consumed, not changed)

**Storage**: drafts via `packages/studio/src/lib/draftPersistence.ts` (`DRAFT_VERSION` 2 → 3);
checkpoints in-memory only; no host-disk writes during authoring

**Testing**: vitest per package (never bare vitest at root), Playwright walks in `pnpm dev` for
SC-001/SC-003, a property test for SC-002, the golden walk from 089 SC-001 for SC-005, a
measurement harness for SC-004

**Target Platform**: the studio SPA (web), same as 088–092

**Project Type**: web application (single package focus: `packages/studio`)

**Performance Goals**: PROPOSED, pending ruling (b) — <300 ms single-decision edit rebuild and
<2 s resume on `sil_euro_latin`; measured first (T002/T021), committed only on Matthew's ruling

**Constraints**: no `packages/contracts` change; no new timer (the rebuild is a write, not a
validation — validation runs once on the rebuilt copy inside the existing D3 300 ms cycle);
`RawKmnFragment`s carried through replay unchanged; every success criterion measured in the
live app or through the real `StepHost`, per the 088 lesson

**Scale/Scope**: one replay engine + recalculation rule in `packages/studio/src/decisions/`,
wiring at the `StepHost`/`StudioShell` seam, deletion of `steps/repropagate.ts` + `staleSteps`,
draft format v3 in `lib/draftPersistence.ts`

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Article | Assessment |
|---|---|
| I — Pattern schema locked | PASS — no Pattern fields touched; nothing in `packages/contracts` changes. |
| II — KeyboardIR is the engine spine | PASS — replay operates on `KeyboardIR` via contained patches; `RawKmnFragment`s are carried through unchanged, never regenerated or dropped (research §10). |
| III — Single persistent working copy | EVOLUTION, justified — Article III describes one working copy that "every step mutates" and that "is serialized only at output". 093 keeps exactly one working copy and output-only serialisation, but changes its provenance: it is now *produced* by replaying decisions over the starting point, and it is no longer saved in drafts. This is the series' governing rule ("decisions are the only stored state, and the keyboard is derived from them", 088) reaching the article's own subject. The amendment is recorded as Polish task T025 (087 amended Article IX the same way when the registry superseded the manifest); the spec and sign-off ledger win on any conflict until then. |
| IV — Validator layering / D3 | PASS — the rebuild is a write, not a validation; validation runs once on the rebuilt copy in the existing D3 cycle. No new timer, no parallel validation path. |
| V — VirtualFS only during authoring | PASS — checkpoints are in-memory; drafts keep the existing localStorage/cloud envelope mechanics; no host-disk writes, no intermediate serialisation (checkpoints are retained IR references, not serialised copies). |
| VI — Team boundaries | PASS — Engine owns the replay engine, recalculation, draft format, and deletions. No content-owned surface (survey copy, gallery ordering as content) is changed; renderers keep their look (090 assumption carries forward). |
| VII — Out of scope for v1 | PASS — no CJK/Ethiopic, no LDML, no survey-editing of opaque fragments, no multi-source merge. SC-003's "byte-identical" is rebuild-vs-stored *determinism of the derived source*, not a codec byte-identical round-trip claim. |
| VIII — House conventions | PASS — locked commit-prefix vocabulary; no issue numbers in shipped code; no emoji in console output; draft-migration mismatch is logged (console), matching 088's house rule for store disagreements. |
| IX — Decision registry is the single source of order | PASS — replay order and the recalculation closure both come from `orderByDependencies` over the registry's `provides`/`requires`; no hand-maintained order or second graph is introduced (research §2). |

Post-design re-check: unchanged — Phase 1 design (data-model.md) introduces no new surface
outside the registry, no contracts change, and no timer. One justified evolution (Article III),
carried as T025; no other violations, so no Complexity Tracking table is needed.

## Project Structure

### Documentation (this feature)

```text
specs/093-derived-keyboard/
├── spec.md              # Feature specification (existing)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output (validation guide)
├── perf-baseline.md     # Created by T002, updated by T021 (SC-004 evidence)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

No `contracts/` directory: this feature exposes no external interface; its contracts are the
decision-record shape (data-model.md) and the existing mutate-seam contract it writes through.

### Source Code (repository root)

```text
packages/studio/src/decisions/
├── replayKeyboard.ts        # NEW — pure replay: (starting point IR, DecisionSet, order) → IR
├── downstreamClosure.ts     # NEW — reverse reachability over the orderByDependencies graph
├── recalculate.ts           # NEW — provenance rule over the closure (US1 scenarios 1–6)
├── replayCheckpoints.ts     # NEW — in-memory per-decision IR checkpoints (FR-003)
└── *.test.ts                # closure, provenance-matrix, determinism property tests
packages/studio/src/lib/
└── draftPersistence.ts      # DRAFT_VERSION 3; envelope drops workingCopy; v2→v3 migration
packages/studio/src/steps/
├── repropagate.ts           # DELETED (FR-005) after consumers migrate to the general rule
└── reducer.ts               # staleSteps seam removed; consumers re-pointed
packages/studio/src/stores/
├── reproposalNoticeStore.ts # consumed as-is (asked-no-longer-fits re-proposals)
└── workingCopyStore.ts      # working copy becomes replay output; staleSteps slice deleted
packages/studio/e2e/         # Playwright walks: US1 layout-change walk, US2 reload walk
```

**Structure Decision**: the replay engine lives in `decisions/` (the series' home since 087)
and follows `repropagate.ts`'s injected-deps pattern — pure, store-free, unit-testable — with
wiring at the existing `StepHost`/`StudioShell` seam. File names above are the plan's working
names; the implementer may consolidate (e.g. checkpoints inside `replayKeyboard.ts`) provided
the purity boundary and the test files land.

## Series prerequisites (verify at Setup, T001)

093 assumes, from the stacked branches: 088's `decisionStore` + decision-keyed drafts at
`DRAFT_VERSION` 2; 089's pure `apply(value, ctx) → WorkingCopyPatch` + single patch runner +
the golden-walk baseline script (089 SC-001); 090's decision modules for every `settles` name,
overlays as decision values with per-item provenance, and in-place IR rewrites moved inside
`apply`; 091's derived steps; 092's setup-as-a-decision (the starting point is established by
an `apply`, so replay has a well-defined index 0). If any prerequisite is missing on the
stacked branch when implementation starts, implementation halts and reports — it does not
reinvent the missing piece inside 093.
