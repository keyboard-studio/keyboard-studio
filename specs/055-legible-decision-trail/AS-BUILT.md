# Spec 055 Legible decision trail: as built

**Status:** Retired 2026-09-29. Shipped in PR #1461 (squash `ff47d316`, 2026-08-03). Tasks: 43/43 complete.
**Full docs:** [specs/_archive/055-legible-decision-trail/](../_archive/055-legible-decision-trail/) (spec, plan, tasks, research D-01..D-12, data-model, contracts, checklists). Not read by default.
**Pinned here:** [contracts/catalog-audit-label.contract.md](contracts/catalog-audit-label.contract.md) (linked from `docs/i18n-spike.md` as the `audit_label` catalog contract).

Builds on spec 053 (decision audit). Extends its record; does not replace it.

## What shipped

- Truthful per-stage reporting: editor-action counts are `number | undefined` (absent = not measured, `0` = measured and unchanged); nothing is coerced to 0.
- Every trail entry renders as a sentence via `headlineFor` / `headlineOf`, naming the question from the flow-question catalog.
- A `base-contribution` decision recorded once at `choose_base`: base id/name, starting key count, derived axes, inherited metadata, instantiation mode.
- Whole-package impact: a decision's attributed change spans every changed text file in the projection, not one file; co-decisions share a capture (`sharedWith`).
- The trail reads as a staged narrative (stage groups with net-effect roll-ups).
- Optional per-question `audit_label` in the content catalog overrides the prompt as headline text.

## Public contracts

- `packages/contracts/src/decisionRecord.ts`: `EditorActionSummary` (`keysRemoved?`, `keysAdded?`, `mechanismsAssigned?`, `touchKeysAffected?`, `sample`, `sampleTruncated`); `DecisionFileChange { path, hunks, magnitude }`; `DecisionImpact` = `captured { files, magnitude, sharedWith? }` | `none` | `unavailable { reason }`; `BaseContribution` payload (`kind: "base-contribution"`); `DECISION_RECORD_VERSION = 2`; `EDITOR_ACTION_SAMPLE_LIMIT = 12`.
- Zod mirror in `packages/contracts/src/schemas.ts`; counts are `.optional()`, never `.default(0)`; drift-guarded.
- Read normalizer: `packages/engine/src/decision-audit/recordMigration.ts` `normalizeDecisionRecord`. A `version < 2` record has all counts read as absent and its single-file impact lifted to a one-element `files`. Never written back, never enriched.
- Headline: `packages/studio/src/decisions/headline.ts` `headlineFor(entry, deps)`, `headlineOf(payload, provenance, deps)`; `lookupQuestionLabel` is injected (`lookupQuestionLabel.ts` resolves `audit_label` then `prompt` via `resolveContentString`).
- Catalog key `content.flowQuestion.<id>.audit_label`, optional per question and per locale; `audit_label?: string` on the question definition (`packages/studio/src/survey/types.ts`). The English file is extractor-generated (`utilities/i18n-content-extract`), never hand-edited.
- Recorder: `packages/studio/src/decisions/recordBaseContribution.ts`; grouping: `stageGroups.ts` `buildStageGroups`.

## Key decisions

- Pre-feature records are marked by record version, not sniffed by shape (D-01).
- `EditorActionSummary` is 053's contract, not a Day-1 locked type, so widening it is ordinary drift-guard work (D-03).
- `keysAdded` is measured against the carve-projected IR (D-05); unmeasured is `undefined` so every consumer must handle it (D-06).
- Per-key optional parity in the i18n lint so one optional field does not redden every started locale (D-08).
- Attributed change spans the projected VFS, with one named volatile normalizer; one capture per boundary, attributed jointly (D-09, D-10).
- Base baseline recorded at `choose_base` from the instantiated store (D-11).
- Identifier-free rendering (FR-028) is enforced by a rendering test, not the static linter (D-12): `DecisionEntryRow.identifiers.test.tsx`.

## Gotchas and limits

- Impact is computed only on request for one entry; grouping must not compute a group's impacts to render a roll-up.
- Detail is shed, entries never are (`packages/engine/src/decision-audit/shed.ts`); `impact: null` = captured then shed.
- The keyboard artifact must stay byte-identical with and without the trail: capture reads the projection, never writes it.
- `derivedAxes` and `inheritedMetadata[].field` carry codes; prose is the studio's job.
- Event vocabulary (`gallery_edit` / `mechanism_edit` / `touch_edit`) is unchanged.

## Divergences from the spec

None found. Contract identifiers match the code.

## Follow-ups and open issues

- Out of scope and still so: revising a decision from the trail, character-class decisions, per-key editor decisions, enabling `mutate()`, retroactively enriching old records.
- Stale relative link after archiving: `docs/i18n-spike.md:142` links `specs/055-legible-decision-trail/spec.md` (now the archive). Many code comments cite `specs/055-legible-decision-trail`; the stub folder still resolves them.
