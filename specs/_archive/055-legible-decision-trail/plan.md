# Implementation Plan: Legible decision trail

**Feature**: [specs/055-legible-decision-trail](spec.md) · **Branch**: `055-legible-decision-trail` · **Size**: oversized

## Summary

The decision audit that spec 053 designed is shipped, but three of its reporting paths were never wired to a producer, its author-facing text interpolates raw payload identifiers, and its impact capture reads only the keyboard's rule source. This plan closes those gaps without revising 053's model: the mechanisms stage learns to count its own assignments and the keys it newly occupied by reading the working-copy store the rest of the studio already reads; the boundary capture widens from one `.kmn` to every non-binary file the output projection emits; the base keyboard's contribution is recorded at `choose_base` so later counts have a denominator; and the headline stops interpolating ids, naming questions from the flow-question catalog and stages from the studio's own message catalog.

The technical approach is *store-derived reporting through the seams that already exist*. Every new count comes from an injected dep on `createDecisionRecorder`, alongside the `getDeletionCounts` dep that already works — no editor component learns that an audit exists, and no adapter prop shape changes. The one contract change is to `EditorActionSummary` and `DecisionImpact` in `packages/contracts/src/decisionRecord.ts`, each landing with its zod mirror in `schemas.ts` in the same commit.

No new dependency, no new stack element, and no new timer: recording stays on the step-completion event `recordStepCompletion` already fires from `StepHost`, after `applyStepCompletion`, so the working copy the recorder reads is the one the step just produced.

## Project Structure

```
packages/contracts/src/
  decisionRecord.ts             EditorActionSummary counts -> optional; DecisionImpact
                                captured -> per-file set + sharedWith; BaseContribution
  schemas.ts                    zod mirror, same commit (drift guards at :789-793)

packages/studio/src/decisions/
  recordEditorStep.ts           mechanismsAssigned + keysAdded producers; optional counts
  recordBaseContribution.ts     NEW - the choose_base baseline entry (FR-030..FR-035)
  createDecisionRecorder.ts     new deps; joint attribution across a boundary's entries
  snapshotSource.ts             whole-VFS baseline (Map<path,text>), volatile normalizer
  headline.ts                   question/stage names, non-zero dimensions only
  stageGroups.ts                NEW - presentation grouping over the record (US5)
  recordMigration.ts            NEW - read-time normalization of pre-feature records
  DecisionEntryRow.tsx          per-dimension ICU messages; shared-change statement
  DecisionTrailView.tsx         stage groups + per-stage roll-up line

packages/studio/src/
  lib/occupiedHostKeys.ts       NEW - key-occupancy predicate over a KeyboardIR
  StudioShell.tsx               wire the new recorder deps (:600-660)
  locales/en/messages.json      new + revised trail message ids

packages/engine/src/decision-audit/
  prSummary.ts                  absent-count handling; per-file effect cell

utilities/i18n-content-extract/extract.ts      extract the optional audit_label field
utilities/content-i18n-lint/index.js           per-key-optional parity for audit_label
content/i18n/en/flowQuestions.json             audit_label values (content-owned)
```

**Structure Decision**: the change stays inside the three directories 053 created (`packages/studio/src/decisions`, `packages/contracts/src/decisionRecord.ts` + its mirror, `packages/engine/src/decision-audit`), plus two tooling files for the optional catalog field. Four new studio modules are added rather than growing existing ones, because each is a distinct pure unit with its own tests: baseline recording, key occupancy, stage grouping, and pre-feature record normalization.

## Constitution Check

Gate before Phase 0, re-checked after Phase 1 design. Re-check result recorded in the right-hand column.

| Article | Assessment | Post-design re-check |
|---|---|---|
| I. Pattern schema is a locked contract | **PASS.** No `Pattern` field is touched. The types this feature changes — `EditorActionSummary`, `DecisionImpact` — are 053's own contract in `decisionRecord.ts`, not `pattern.ts`, so ordinary drift-guard discipline applies (type + zod mirror in one commit) rather than a major bump and joint session. This resolves the spec's stated "unconfirmed" reading (see research D-03). | PASS — design touches `decisionRecord.ts` + `schemas.ts` only. |
| II. KeyboardIR is the engine spine | **PASS.** The new key-occupancy predicate reads a typed `KeyboardIR`, never `.kmn` text. No new `parse()` call and no try/catch around one. | PASS. |
| III. Single persistent working copy | **PASS.** Every new count is read from the one working copy at step completion. No second copy, no intermediate serialization — the boundary capture reads the existing output projection, which is the sanctioned serialization point. | PASS — `recordBaseContribution` reads the instantiated store (FR-035), never re-reads the base source. |
| IV. Validator layering / one 300 ms debounce | **PASS.** No validation timer is added. Recording remains on the `recordStepCompletion` event; the impact capture is fire-and-forget off that same event, exactly as 053 shipped it. | PASS — the widened capture reuses the existing async boundary call, adding no timer. |
| V. VirtualFS only during authoring | **PASS.** The widened comparison reads `vfs.entries()` from the *projected clone* that `projectWorkingCopyForOutput` already builds in memory. Nothing is written to host disk. | PASS. |
| VI. Team boundaries | **PASS, split declared.** Engine team owns studio, contracts, engine, and the two utilities. Content team owns the `audit_label` *values* in `content/i18n/en/flowQuestions.json`. The field's plumbing (extractor + lint) is engine-side tooling; the prose is content-side. | PASS. |
| VII. Out of scope for v1 | **PASS.** Nothing here implements CJK/Ethiopic reorder, LDML, mobile-app integration, hosting, `.kpj.user`, touch-first authoring, multi-source merge, or opaque-fragment editing. | PASS. |
| VIII. House conventions | **PASS.** No emoji in console output; no GitHub issue numbers in shipped code; commit titles follow `<prefix>(<area>): <description>`. New message ids follow the `area ( "." segment )+` rule (spec 046). | PASS. |

No violations. **Complexity Tracking omitted** — nothing required a justified departure.

## Phase 0 — Research

See [research.md](research.md). Eleven decisions, including resolutions for both of the spec's deferred open questions (D-01 pre-feature record presentation, D-02 stage roll-up semantics) and the unconfirmed contract-tier reading (D-03).

## Phase 1 — Design & contracts

- [data-model.md](data-model.md) — the reshaped `EditorActionSummary` and `DecisionImpact`, the new `BaseContribution` payload, and the two derived presentation entities.
- [contracts/](contracts/) — [record-shape.contract.md](contracts/record-shape.contract.md) (the contracts-package surface and its drift-guard obligations), [headline-spec.contract.md](contracts/headline-spec.contract.md) (the pure selection surface and the message ids it selects), and [catalog-audit-label.contract.md](contracts/catalog-audit-label.contract.md) (the optional flow-question field, its extraction, and its parity rule).

## Delivery order

The user stories are independently testable, and the dependency between them is one-directional:

1. **Foundational** — the contract reshape (`EditorActionSummary` optional counts, `DecisionImpact` per-file set) plus its zod mirror. Everything else consumes it; nothing ships until consumers handle absence (FR-005a).
2. **US1 + US3 together** (both P1/P2, both read the same store state at the same completion event) — mechanisms and keys-added producers, the base-contribution baseline.
3. **US2** (P1) — plain-language headlines, the catalog field, the mechanical identifier test.
4. **US4** (P2) — the widened whole-VFS capture and joint attribution.
5. **US5** (P3) — stage grouping. Cuttable without touching anything above it; it is presentation over an unchanged record.

Polish rides with the last phase: the anti-regression rewrite (FR-027/FR-029) is not a separate phase — each producer lands with the production-path test that drives it non-zero, which is what makes FR-029 a guard rather than a checklist item.

## Risks

- **Key occupancy has no existing predicate.** `MechanismAssignment.target` is a character, not a key; the host key is recovered by `extractMechanismHostKey`, and there is no shipped "which keys does this IR occupy" selector. This is the one genuinely new derivation (research D-05) and the highest-uncertainty task in the plan.
- **The widened capture enlarges every stored impact.** Bounded by 053's existing truncation rule, which this feature must not relax (FR-016, Edge Cases). Watch the shed rate in verification.
- **`content-i18n-lint` parity is currently whole-key-set.** Adding one optional field per question turns every started target locale red unless the parity rule learns per-key optionality first (research D-08). Land the lint change before any `audit_label` value.
