# Implementation Plan: Show only lowercase base letters in the diacritic (marks) survey questions

**Feature dir**: [specs/049-lowercase-diacritic-questions/](./spec.md) · **Branch**: `049-lowercase-diacritic-questions`

## Summary

Continue the spec-047 casing convention into the marks/attachment survey questions: when the base
keyboard's script is cased, the mark-attachment station must offer base letters as **lowercase (or
caseless) only** — folding away any uppercase base whose lowercase counterpart is already present —
while the finished keyboard still attaches each mark to the uppercase counterparts (US2). The
casing signal is derived the same way the character step already derives it — per-letter through the
engine's `caseCounterpart` primitive — so there is one shared source of truth (FR-006). The change
is UI/derivation only: no locked `Pattern`/`ConfirmedAlphabet` field is added, the uppercase
attachments are computed at worklist-build time from the lowercase answers rather than stored.

The work is two P1 slices: US1 folds the *displayed* base-letter choices to lowercase; US2 guarantees
the *produced* attachments still cover the uppercase counterparts of every cased base the author ticks.

## Project Structure

```
packages/studio/src/survey/
  charNormUtils.ts                    # + shared lowercase-base fold helpers (FR-006 source of truth)
  PhaseB.tsx                          # refactor inline hiddenUppers → shared helper (no behavior change)
  marks/
    MarksSeriesStep.tsx               # fold bases before AttachmentStation; expand attachments before buildPlacementWorklist; count fix
    AttachmentStation.tsx             # consumes folded bases + corrected casePairCount (props unchanged)
    MarksSeriesStep.test.tsx          # + US1/US2 coverage

packages/engine/src/marks/
  case-fold.ts                        # NEW: expandCaseCounterpartAttachments() — reuses caseCounterpart (FR-002)
  attachment-proposals.ts             # deriveCaseCounterparts stays; referenced, not reshaped
packages/engine/src/index.ts          # export the new engine helper
packages/studio/tests/survey/marks/   # (or colocated) US1/US2 assertions
```

**Structure Decision**: The change lives entirely in the **studio marks survey** plus one small
**engine** pure helper. The display fold (US1) is studio-side, reusing the same `caseCounterpart`
primitive the character step uses; the attachment expansion (US2) is a new pure engine function so
the casing mechanism stays in the engine (constitution Article VI — engine owns the SPA + engine
subsystems; this stays within that boundary). No contracts package change.

## Constitution Check

| Article | Assessment |
|---|---|
| I. Pattern schema locked | PASS — no `Pattern`/schema field touched; uppercase attachments are derived at build time, not a stored field (spec Assumptions). |
| II. KeyboardIR spine | PASS — no codec/IR change; the base casing is read via the existing `caseCounterpart` primitive over the confirmed alphabet. |
| III. Single working copy | PASS — no new working copy, no intermediate serialization; only the derived worklist changes. |
| IV. Validator layering | PASS — no validator/debounce path touched. |
| V. VirtualFS only | PASS — no host-disk write; survey-time UI only. |
| VI. Team boundaries | PASS — engine team owns both the studio marks step and the new engine helper. |
| VII. Out of scope | PASS — no CJK/Ethiopic reorder, LDML, touch, etc.; purely refines the existing marks question. |
| VIII. House conventions | PASS — i18n message ids reused; no emoji; markdown links in docs. |

No violations — Complexity Tracking omitted.

## Phase 0 — Research

See [research.md](./research.md). Key decisions: (1) casing source of truth is the per-letter
`caseCounterpart` fold shared with the character step, not a spec-048 IR facet (not yet wired);
(2) uppercase attachments are produced by a new pure engine helper reusing `caseCounterpart`, because
the existing `deriveCaseCounterparts` only covers *attested* stacks and cannot carry live/plausible
answers; (3) the "capitals follow automatically" count is recomputed from the displayed lowercase
bases so FR-005/SC-004 hold.

## Phase 1 — Design & contracts

- [data-model.md](./data-model.md) — the two derived entities (folded base-letter view, derived
  uppercase attachment) and the fold/expansion rules.
- [contracts/](./contracts/) — the studio helper signatures and the new engine helper signature
  (`ui-contract.md`), the identifiers consumers/tests code against.

Constitution re-checked against the final design: still all PASS (no new stored field, no new
casing primitive — only reuse of `caseCounterpart`).
