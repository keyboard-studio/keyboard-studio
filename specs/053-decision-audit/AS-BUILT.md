# Spec 053 Decision audit: as built

**Status:** Retired 2026-09-29. Shipped in PR #1455 (squash `1756b6a5`, 2026-08-01). Tasks: 50/50 complete.
**Full docs:** [specs/_archive/053-decision-audit/](../_archive/053-decision-audit/) (spec, plan, tasks, research D-01..D-12, data-model, contracts/decision-record.contract.md, contracts/trail-ui.contract.md, checklists). Not read by default.
**Pinned here:** none

## What shipped
- An append-only per-keyboard decision record: survey answers and summarised editor actions, each with agency/provenance, a supersede link, and an attributed `.kmn` line diff (or an explained "unavailable").
- A "trail" view (route `trail`, always available in production) listing decisions with expandable impact, collapsed superseded entries, empty/truncated/partial notices.
- The record travels with the keyboard: `.studio/decision-record.json` in the zip, excluded from pull requests, plus a bounded decision summary block in the PR body.
- Persistence rides the durable draft; oversized records shed diff payloads rather than entries.
- A flow-map overlay of the walked path, only where the flow map itself is shown (dev gate).

## Public contracts
- `packages/contracts/src/decisionRecord.ts` (zod mirror and drift guards in `schemas.ts`): `DecisionRecord { format, version, keyboardId, entries, truncated: {shedCount}|null }`, `DecisionEntry { entryId, stepId, payload, provenance, recordedAt, supersedes, impact? }`, `DecisionPayload` (`survey-answer` | `editor-action`), `DecisionProvenance { agency: "base-derived"|"tool-proposed"|"hand-set"; source? }`, `DecisionImpact` (`captured`|`none`|`unavailable` with reason `lock-gate-dependency`|`no-rederivable-write-path`), `DiffHunk`, `EditorActionType = gallery_edit|mechanism_edit|touch_edit`, `DECISION_RECORD_FORMAT = "keyboard-studio.decision-record"`, `DECISION_RECORD_VERSION = 2` (code; contract says 1, bumped later), `PRE_IDENTITY_STEP_ID = "__pre_identity__"`, `makeEmptyDecisionRecord`.
- `packages/engine/src/decision-audit/` (re-exported via `engine/src/output`): `diffLines` (`lineDiff.ts`), `serializeDecisionRecord` / `parseDecisionRecord` (never throws; returns `{record, droppedCount, unreadable}`) / `serializedRecordBytes` (`record.ts`), `shedDecisionDetail` (`shed.ts`), `buildDecisionSummaryBlock` and `PR_SUMMARY_MAX_ENTRIES = 25` (`prSummary.ts`), `DECISION_RECORD_VFS_PATH = ".studio/decision-record.json"`, `STUDIO_METADATA_PREFIX`, `addDecisionRecordSidecar` (`sidecar.ts`), plus `recordMigration.ts`, `historyProposal.ts`.
- Studio: `recordDecision` injected into `ReducerDeps` in `steps/reducer.ts` (called from `applyStepCompletion`); `DurableDraft.decisionRecord?` in `lib/draftTypes.ts`, saved/restored in `lib/draftPersistence.ts`; `RouteId` `"trail"`.
- Trail testids: `decision-trail`, `-empty`, `-truncated`, `-partial`, `decision-entry`, `-headline`, `-expand`, `-impact`, `-superseded`, `decision-superseded-toggle`, `flowmap-path-overlay`. i18n ids under `trail.*`.

## Key decisions
- Types live in contracts (engine cannot import studio), additive module, no schema bump (D-01).
- Recording hangs off `applyStepCompletion` via injected dep so no step or gallery knows about auditing (D-02).
- Impact is the net line diff of the projected `.kmn` (`projectWorkingCopyVfs`) between step boundaries, so audit and shipped artifact cannot disagree (D-04). Survey counterfactuals re-run the question's `mutate()`; unavailable when absent or the seam is off (D-05).
- Own LCS line differ, no new dependency (D-06).
- `.studio/` prefix reuses the zip-included / PR-excluded sidecar filter; positional nesting deferred (D-07).
- Additive optional `DurableDraft` field, no `DRAFT_VERSION` bump (D-08). Shed largest-then-oldest payloads first to stay under the 4 MB cloud-draft budget; headlines, provenance and supersede links are never shed (D-09).
- First implementer of the journey-corpus event vocabulary (spec 032 unimplemented) (D-10).

## Gotchas and limits
- Shedding never drops entries, only impact payloads; the trail states the truncation.
- Steps behind a passed lock gate report impact unavailable rather than guessing.
- `parseDecisionRecord` is version-tolerant and partial-read tolerant by design.

## Divergences from the spec
`DECISION_RECORD_VERSION` is 2 at `packages/contracts/src/decisionRecord.ts:331`; the contract says 1 (bumped by a later spec, likely 055). Otherwise none found.

## Follow-ups and open issues
- Later specs build on it: 055 (legible decision trail), 077 (base decisions), 057, 059. Their links into `../053-.../` now hit the archive.
- Citations to fix: heavy `@see specs/053-decision-audit/...` comments in `packages/contracts/src/decisionRecord.ts`, `schemas.ts`, `packages/engine/src/decision-audit/*`; docs/github_flow.md lines 153-220 mention spec 053 by number only.
