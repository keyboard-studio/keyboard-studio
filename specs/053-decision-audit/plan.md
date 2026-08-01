# Implementation Plan: Per-keyboard decision audit (CYOA Phase 1 — record and review)

**Feature Branch**: `053-decision-audit`

**Spec**: [spec.md](spec.md)

**Created**: 2026-07-31

**Owner**: Engine team (Constitution Article VI — the change touches the SPA, persistence, and output paths)

## Summary

Every decision an author makes — each survey answer, and each editor step's net effect — is appended to a per-keyboard, append-only decision record that rides the existing durable draft, is rendered as an author-facing trail, and ships as evidence in the pull-request body plus a machine-readable sidecar in the downloaded package. Recording hangs off the one place every step completion already funnels through, `applyStepCompletion` in [packages/studio/src/steps/reducer.ts](../../packages/studio/src/steps/reducer.ts), via an injected dependency, so no step component learns about auditing and no second traversal model appears.

The technical spine is reuse rather than new machinery. A decision's attributed source change is a line diff over the emitted `.kmn` text that [projectWorkingCopyVfs](../../packages/studio/src/lib/projectWorkingCopyVfs.ts) already produces continuously for the live OSK preview — the same projection the download and pull-request paths consume — so the audit and the artifact cannot disagree. The packaged record reuses the existing zip-included / PR-excluded sidecar lifecycle (`isSidecarPath` in [packages/engine/src/output/sidecar.ts](../../packages/engine/src/output/sidecar.ts), consumed by `isSourceFile` in [github.ts](../../packages/engine/src/output/github.ts)), which is what makes "zero files added to the committed source tree" structural rather than aspirational. Persistence is an additive optional field on the existing `DurableDraft` envelope, following the `phaseBDraft` precedent — no draft-version bump, so a record-bearing and a record-free build read each other's drafts.

Two things need naming because they are not obvious from the codebase. First, no diff library is a dependency of any package here, and the record's diffs are line-oriented `.kmn` text, so this adds a small engine-local line differ rather than a new npm dependency. Second, the journey-corpus event vocabulary this feature must align with ([specs/032-journey-corpus](../032-journey-corpus/spec.md)) exists only as spec prose — there is no `content/journeys/` directory and no replay harness — so this feature is its first implementer and defines the shared event kinds in `packages/contracts` where 032 can later consume them unchanged.

**One item needs Keyman-team confirmation and is flagged rather than assumed away.** The zip's root already *is* the keyboard's directory content (`source/<id>.kmn`, `<id>.kps`), and `NEXT_STEPS.md` is already injected beside it as studio metadata. There is therefore no existing "beside, not inside" position in the archive. This plan realizes FR-020 as a clearly-marked studio-metadata prefix at the archive root, excluded from the pull-request commit by the existing filter and named explicitly in the submission instructions as not-to-be-copied — and records the structural alternative (nest the keyboard under `<id>/`) as the follow-up if the Keyman team wants the separation to be positional. See [research.md](research.md) D-07.

## Project Structure

```
packages/contracts/src/
  decisionRecord.ts              NEW   DecisionEntry / DecisionRecord / DecisionProvenance / event kinds
  schemas.ts                     EDIT  zod mirror + drift guards for the new types (same-commit rule, Article I)
  index.ts                       EDIT  re-export ./decisionRecord

packages/engine/src/decision-audit/    NEW
  lineDiff.ts                    unified line diff over emitted .kmn text
  record.ts                      serialize / parse / version-tolerant read (SC-009)
  shed.ts                        size-budget truncation — detail payloads only, never entries
  prSummary.ts                   bounded markdown block for the PR body
  index.ts
packages/engine/src/output/
  sidecar.ts                     EDIT  studio-metadata prefix joins isSidecarPath
  zip.ts                         EDIT  emit the record; name it in NEXT_STEPS.md as not-to-be-copied
  index.ts                       EDIT  export the decision-audit surface

packages/studio/src/decisions/         NEW
  decisionLogStore.ts            append-only slice: append, supersede, read, hydrate
  recordSurveyAnswers.ts         fan a SurveyPhaseResult out into one entry per answer
  recordEditorStep.ts            aggregate one editor step into one entry
  snapshotSource.ts              step-boundary read of the already-projected .kmn text
  impact.ts                      on-request impact: stored diff, or mutate() counterfactual
  headline.ts                    localized headline from the structured descriptor
  DecisionTrailView.tsx          the author-facing trail (production surface)
  DecisionEntryRow.tsx           one row, expandable to its attributed change
packages/studio/src/steps/
  reducer.ts                     EDIT  ReducerDeps gains an injected recordDecision
packages/studio/src/dashboard/
  pathOverlay.ts                 NEW   walked-path projection over the existing StepGraph
  FlowGraphView.tsx              EDIT  render the overlay; identical output with nothing selected
packages/studio/src/lib/
  draftTypes.ts                  EDIT  DurableDraft.decisionRecord?
  draftPersistence.ts            EDIT  save / load / shed wiring
  navigate.ts                    EDIT  RouteId gains "trail"
packages/studio/src/
  StudioShell.tsx                EDIT  trail route + nav entry (production); overlay passed as a prop
packages/studio/src/locales/{en,fr}/   EDIT  message catalogues for all new author-facing text
packages/studio/src/components/
  ManagedPRSubmitPanel.tsx       EDIT  append the bounded decision block to prBody
```

**Structure Decision**: the record's types go in `packages/contracts` because both the engine (sidecar, PR summary) and the studio (store, trail) consume them; derivation that is pure and shippable-evidence-shaped goes in the engine; anything author-facing or store-bound stays in the studio, and dashboard code receives its overlay as a prop rather than importing a store, preserving the existing dashboard-layer boundary. Tests are colocated `*.test.ts` / `*.test.tsx` beside each module, matching the surrounding convention.

## Constitution Check

| Article | Assessment |
|---|---|
| **I. Pattern schema is a locked contract** | **PASS.** No field of `Pattern`, `PatternQuestion`, or `Criterion` is renamed, retyped, or removed. `decisionRecord.ts` is a new additive module, the same shape of change as `axisFill.ts`. `SurveyAnswer` is deliberately *not* extended — provenance rides the new entry type, not the locked answer union. The new types get their zod mirror plus `Expect<AssignableTo<…>>` drift guards in `schemas.ts` in the same commit, per the Article's same-change rule. |
| **II. KeyboardIR is the engine spine** | **PASS.** Impact is a diff over `.kmn` text the codec emitter already produced through the existing projection; nothing parses or authors raw `.kmn`. Recording is read-only with respect to the IR — no `RawKmnFragment` is inspected, rewritten, or dropped. |
| **III. Single persistent working copy** | **PASS, with the reviewable seam stated.** No second working copy exists and no step reads the record as authoring input. Step-boundary source snapshots are retained reads of a projection the live preview *already* runs every cycle, so the feature adds no serialization pass. The seam a reviewer should look at: Article III's "serialized only at output" forbids intermediate serialization, and this retains a snapshot of one. Retention of an existing computation is not a new serialization path, which is why this reads PASS — but if the Article is read to cover retention as well as computation, that reading needs sign-off, and it is called out here rather than buried. |
| **IV. Validator layering is fixed** | **PASS.** No new debounce timer and no second validation path. Snapshots are taken on step-completion events, not on a timer; the trail renders recorded data and never runs the validator. Persistence timers (`AUTOSAVE_DEBOUNCE_MS`, `CLOUD_SYNC_DEBOUNCE_MS`) are reused as-is, and per the D3 scope note they emit no diagnostics. |
| **V. VirtualFS only during authoring** | **PASS.** Nothing writes to host disk. The record lives in `localStorage` (via the existing draft), in the VirtualFS for the zip, and in the PR body — all existing channels. |
| **VI. Team boundaries** | **PASS.** Engine team, declared in the spec's Assumptions. The change touches the SPA, persistence, and output paths — all Engine-owned. No Content-owned surface (pattern library, survey text, gallery ordering, LLM prompts, criteria) is edited; the new strings are studio chrome in the Tier A lingui catalogues. |
| **VII. Out of scope for v1** | **PASS.** Nothing on the prohibited list is implemented. No CJK/Ethiopic reorder, no LDML, no mobile-app integration, no touch-first authoring, no multi-source merge, no survey-editing of opaque fragments, no byte-identical round-trip claim. Phase 2 (revising a recorded decision, staleness closure consumption) and Phase 3 (character classes) stay out per the spec's own Out-of-scope section. |
| **VIII. House conventions** | **PASS.** No emoji in console output; markdown links in user-facing text; no GitHub issue numbers in shipped code or comments; commits as `feat(contracts)` / `feat(engine)` / `feat(studio)`. |

No Article fails, so there is no Complexity Tracking table.

**Phase policy note.** This spec has three user stories, so it is a multi-phase feature under the constitution's "One conversation per phase" policy: on an attended run, `implement` stops after each user-story phase and resumes in a fresh conversation. Setup and Foundational work rides with P1 (US1 recording + trail); Polish rides with the last phase.

## Phase 0 — Research

See [research.md](research.md). Twelve decisions are recorded there, of which four are load-bearing enough to name here: impact is captured from the already-running shared projection rather than a new pipeline (D-04); the packaged record reuses the existing zip-included / PR-excluded sidecar lifecycle (D-07); provenance reuses the existing `base-derived` / `hand-set` literals rather than inventing a third vocabulary (D-03); and in a build with the `mutate()` seam off — its shipped default — survey-decision counterfactuals are unavailable and correctly report the FR-011 reason, while direct per-step capture keeps every entry's attributed change truthful (D-05).

## Phase 1 — Design & contracts

See [data-model.md](data-model.md) for the entities and their validation and state rules, and [contracts/](contracts/) for the interface consumers and tests code against:

- [contracts/decision-record.contract.md](contracts/decision-record.contract.md) — the record's TS shape, its completed-instance serialization, the sidecar path and naming, and the version-tolerance rules behind SC-009.
- [contracts/trail-ui.contract.md](contracts/trail-ui.contract.md) — the trail route, its entry points, the identifiers tests select on, and the flow-map overlay's no-selection identity guarantee.

**Constitution re-check after design**: unchanged from the table above. The design added no new locked-type edit, no second debounce, no host-disk write, and no cross-team boundary crossing; the one item to review remains the Article III retention seam, stated in the table.
