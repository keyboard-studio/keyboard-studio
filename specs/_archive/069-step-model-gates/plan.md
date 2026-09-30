# Implementation Plan: Step-model constitutional gates

**Branch**: `km/step-model-gates` | **Spec**: [spec.md](./spec.md) | **Date**: 2026-08-17

## Summary

This feature turns three already-mostly-true architectural properties of the survey step model into
machine-enforced gates, mirroring the criteria-count and zod-drift guards CLAUDE.md already
documents as the house pattern. Concretely: (1) a new Core Principle IX in
`.specify/memory/constitution.md` states that no user-facing survey surface may exist outside
`steps/manifest.ts`; (2) `registry.test.ts` is upgraded from `> 0` to an exact-count assertion
against the question registry; and (3) a manifest-resolution test plus a new `depcruiser` rule stop
`StudioShell.tsx` / `StepHost.tsx` from ever regaining a direct `editors/` import. Investigation
found that `StepHost.tsx` (spec 028 Stage 5) already mediates all editor rendering through
`step.component`, and `StudioShell.tsx` already has zero direct `Gallery`/editor imports — this
feature is a **regression guard** over an existing invariant, not new plumbing (FR-006). The one
number that needs correcting before it can be gated: the registry has grown from the spec's
2026-07-06 count of 101 to **114** modules today (a fifth sub-registry, `registry.reserve.ts`, now
exists), so FR-002's assertion is written against the re-verified count, not the stale one, per the
spec's own Assumptions section.

## Project Structure

```
.specify/memory/constitution.md                          # + Core Principle IX; cross-ref bump; version footer
packages/studio/src/survey/questions/registry.test.ts     # > 0  ->  exact count (114), documented breakdown
packages/studio/src/steps/manifest.test.ts                # + FR-003 resolution describe block
                                                            # + FR-004 source-guard describe block (extends SC-004)
.dependency-cruiser.cjs                                    # + 'renderer-no-direct-editor-import' rule
```

No production code changes: `StudioShell.tsx`, `StepHost.tsx`, `steps/manifest.ts`, and
`steps/types.ts` are read-only inputs this feature verifies against, not files it edits (FR-005,
FR-007, FR-006).

**Structure Decision**: All four touched files already exist; nothing new is scaffolded. The gate
logic lands as new `describe` blocks inside the two existing test files that already own these
contracts (`registry.test.ts` owns registry invariants; `manifest.test.ts` already has an SC-004
source-guard block this feature extends) rather than new test files, plus one new `forbidden` entry
in the existing `.dependency-cruiser.cjs` array.

## Constitution Check

| Principle | Assessment |
|---|---|
| I. Pattern schema is a locked contract | PASS — no `Pattern`/contracts changes (FR-008). |
| II. KeyboardIR is the engine spine | PASS — no codec/IR changes. |
| III. Single persistent working copy | PASS — no working-copy or track changes. |
| IV. Validator layering / one debounce cycle | PASS — no validator or debounce changes. |
| V. VirtualFS only during authoring | PASS — no output/serialization changes. |
| VI. Team boundaries (§12/§13) | PASS — SPA governance + test gates are Engine-team territory. |
| VII. Out of scope for v1 | PASS — no gallery decomposition, no step-host runtime built (FR-005/FR-006). |
| VIII. House conventions | PASS — commit/issue titles follow `<prefix>(<area>): <description>`; no emoji. |

No violations — Complexity Tracking is omitted.

## Phase 0 — Research

See [research.md](./research.md). Five decisions resolved: the re-verified registry count, the
depcruiser rule's exact `from` scope, the source-guard technique replacing the spec's naive
grep, the reuse of `StepHost.tsx` as the FR-006 mediating layer, and the constitution
cross-reference/version-footer updates that ride with the Article IX addition.

## Phase 1 — Design & Contracts

See [data-model.md](./data-model.md) for the entities this feature gates, and
[contracts/](./contracts/) for the verbatim text and exact identifiers a future implementer must
copy without rewording (the constitution principle text, the registry assertion phrasing, and the
depcruiser rule name).

Re-checked against the Constitution Check above after design: still all PASS — the design adds
only test assertions, one governance paragraph, and one `depcruiser` rule; no new runtime code
path exists to re-evaluate.

## Out of Scope (restated from spec FR-005–FR-008)

No gallery decomposition, no step-host/registry runtime, no manifest/`steps/types.ts`/`keyboardIR`
changes, no `@keyboard-studio/contracts` bump.
