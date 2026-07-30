# Implementation Plan: Marks treatment question

**Feature**: [spec.md](spec.md) · **Branch**: `052-marks-treatment-question` · **Created**: 2026-07-29

**Governing specs**: [specs/046-marks-question-series/spec.md](../046-marks-question-series/spec.md) (amended: FR-010, FR-011, FR-012, SC-006, SC-007) · [specs/007-strategy-selection/spec.md](../007-strategy-selection/spec.md) (amended: §7.2 precedence, §7.5 table) · interacts with [specs/049-lowercase-diacritic-questions/](../049-lowercase-diacritic-questions/)

## Summary

Marks-series station S2 currently takes one mutually-exclusive answer — is a marked letter "its own letter of the alphabet" or a letter the mark "is added to as you type" — and that single value cannot state what a Cameroonian tone orthography actually wants: a productive mark on its own key *and* two or three prominent composed characters on dedicated keys. This feature replaces that one answer with three independently-settable parts recorded at one station: per-mark **treatment** (does this mark earn a key), a set of **promoted composed characters**, and the **input order** folded in from the retired S3 station — reducing the series from five rendered stations to four. Each option gets an operable two-or-three-key demonstration built from the author's own letters (US2), the promotion option is gated on a real key budget instead of today's always-affordable stub (US3), and the recorded answer is finally projected onto the diacritic-behaviour axis so strategy selection can no longer contradict it (US4).

Three findings from the codebase shape the approach and are why the work is smaller than the spec's surface suggests. First, `SurveyPhaseResult.computedAxes` already exists as an additive optional field merged by `mergePhaseResults` — US4 needs no contract change, only a producer. Second, axis A7 `spareKeyAvailability` has **no live producer anywhere** outside tests and fixtures (verified by exhaustive grep), so FR-016's "same result for every keyboard it produces today" is trivially satisfiable and the risk lives in what we choose *not* to newly seed. Third, the touch scaffolder already resolves deadkey patterns into long-press `sk[]` subkey menus, so FR-014's load-bearing half — a deadkey is never *producible* on touch — already holds structurally; only the option-set presentation is new work.

The one design judgement the spec flagged for confirmation at plan review — that platform option sets collapse to a single `(treatment, order)` answer plus promotions, making deadkey-on-touch unrepresentable rather than warned — is **confirmed here**, on evidence: the spine (`packages/studio/src/steps/advance.ts`) routes every project through both `mechanisms` and `touch`, so there is no touch-only target for a platform-forked option set to key on.

## Project Structure

```
packages/contracts/
  data/base-layouts.json                   NEW (relocated from utilities/facet-index/data/)
  src/keyBudget.ts                         NEW  canonical key-budget determination (FR-016)
  src/axes.ts                              EDIT A7 documented as a projection of keyBudget
  src/schemas.ts                           EDIT KeyBudget zod mirror + drift guard
packages/engine/src/marks/
  treatment.ts                             NEW  MarkTreatment answer type (replaces MentalModelAnswer)
  treatment-prefill.ts                     NEW  (from mental-model-prefill.ts) + real spareKeys
  promotion.ts                             NEW  promotable set, budget gating, case derivation
  strategy-reconcile.ts                    NEW  treatment -> A4/A3a projection + precedence (US4)
  worklist.ts                              EDIT dual reachability; delete "classified twice"
  mental-model-prefill.ts                  DELETED (superseded by treatment-prefill.ts)
packages/studio/src/survey/marks/
  MarkTreatmentStation.tsx                 NEW  (replaces MentalModelStation.tsx) S2, order folded in
  MarkDemoWidget.tsx                       NEW  US2 demonstration + pending-state announcement
  MarksSeriesStep.tsx                      EDIT 4 stations; wires budget; emits computedAxes
  MentalModelStation.tsx                   DELETED
  InputOrderStation.tsx                    DELETED (folded into S2; content still read from
                                                 questions/reserve/pb_mark_input_order.ts)
packages/studio/src/locales/{en,fr}/messages.json   EDIT (lingui extract)
utilities/facet-index/
  spare-key-budget-classifier.ts           EDIT delegates to contracts/keyBudget.ts
  base-layout.ts                           EDIT reads the relocated table from contracts
specs/046-marks-question-series/spec.md    EDIT FR-010/011/012, SC-006, SC-007 amendments
specs/007-strategy-selection/spec.md       EDIT §7.2 precedence rule, §7.5 table + gap restatement
docs/design-notes/mark-composition-model.md EDIT S2/S3 sections (the stale note)
```

**Structure Decision**: no new package and no new directory tier. The answer type and its derivations stay in `packages/engine/src/marks/` beside the existing series modules; the key budget moves *up* into `packages/contracts` (not engine) because `utilities/facet-index` must keep reading it and a utility may not be depended upon by a package — contracts is the existing shared floor both already import, and it already hosts comparable IR-analysis helpers (`buildProducedSet`).

## Constitution Check

Gate before Phase 0, re-checked after Phase 1 design (re-check result recorded at the bottom of this section).

| Article | Assessment |
|---|---|
| **I. Pattern schema is a locked contract** | **PASS.** No `Pattern` field is renamed, retyped, or removed, and no `{{slotId}}` syntax changes. The type this feature reshapes is `MentalModelAnswer` → `MarkTreatment` in `@keyboard-studio/engine`, not `Pattern`. Article I's stop-and-escalate therefore does not fire. The §18 process for a locked contract *does* still apply — tracked as a justified violation row below. |
| **II. KeyboardIR is the engine spine** | **PASS.** The key-budget measurement reads a base's typed `KeyboardIR` (`groups[].rules[]` contexts) and never parses `.kmn` text. No new `try/catch` around `parse()`; `RawKmnFragment` nodes are counted as unmeasured coverage exactly as the existing classifier does, never dropped. |
| **III. Single persistent working copy** | **PASS.** The station reads the working copy and the confirmed alphabet; it writes only its own React state and, at completion, one `SurveyPhaseResult`. FR-012 makes this explicit for the demonstration widget: operating a demo mutates nothing. No second working copy, no intermediate serialization. |
| **IV. Validator layering is fixed** | **PASS.** No validator check is added, moved, or re-layered. The demonstration widget is a local text-transform preview, not a diagnostic producer — it emits no diagnostics (FR-012) and therefore introduces no second debounce timer or parallel validation path. Confirmed against the D3 scope note in [CLAUDE.md](../../CLAUDE.md): D3 governs anything producing diagnostics from the working copy, which this does not. |
| **V. VirtualFS only during authoring** | **PASS.** No host-disk write. The relocated `base-layouts.json` is a build-time pinned dataset read as a module import, not authoring I/O. |
| **VI. Team boundaries** | **WAIVED BY THE PRODUCT OWNER for this feature.** Recorded, not asserted. This change genuinely spans both teams: engine owns the answer type, worklist mapping, key budget, and strategy reconciliation; content owns the designer-facing wording (FR-007/FR-008) and the demonstration's framing. The owner waived the singular-ownership declaration on the grounds that both sides are being authored together (spec Assumptions). Article VI is unchanged and still applies to other features. |
| **VII. Out of scope for v1** | **PASS.** No CJK/Ethiopic reorder, LDML, mobile-app integration, hosting, `welcome.htm` variants, `.kpj.user`, multi-source merge, opaque-fragment survey editing, or byte-identical round-trip. **Touch-first authoring is not implemented**: touch is only *derived* — the station offers no touch-first surface, and the "no deadkey on touch" property is a derivation consequence, which is the same posture spec 035 already ships. |
| **VIII. House conventions** | **PASS.** No emoji in any console output added. Doc/spec edits use markdown links. No GitHub issue number appears in shipped code or comments — issue #1433 is cited in this plan, the spec, and the PR body only. Commit titles follow `<prefix>(<area>): <description>` (`feat(studio)`, `feat(engine)`, `docs(spec)`). |

### Complexity Tracking

| Violation | Why needed | Simpler alternative rejected |
|---|---|---|
| A locked engine contract (`MentalModelAnswer` and `WorklistInputs.mentalModel`) is reshaped, requiring the §18 major-version-bump + joint engine+content session process | FR-003 makes treatment and promotion independently settable. A single enum value cannot carry two independent facts plus an order; there is no additive way to widen it. | Keeping `MentalModelAnswer` and adding a parallel `promotedCharacters` field beside it. Rejected: it leaves the misleading "own-letter" name as the primary answer, and FR-001's per-mark override plus FR-004's folded order still cannot be expressed on the old enum — the old name would survive as a trap for exactly the confusion this feature exists to remove. **Process note:** `@keyboard-studio/engine` is at `0.1.0`; under pre-1.0 semver the breaking signal is the minor, so the bump is `0.1.0 → 0.2.0`, which satisfies §18's intent. Confirm at the joint session. |
| Article VI's single-team declaration is not satisfied | See the Article VI row: the change genuinely spans both teams and the owner waived the split for this feature. | Splitting into an engine-only feature and a content-only follow-up. Rejected by the owner: the wording and the answer type are being designed against each other, and shipping the type without the wording would leave the station asserting alphabetic unithood over a data model that no longer means it. |
| `utilities/facet-index/data/base-layouts.json` is relocated to `packages/contracts/data/`, moving a spec 040 artifact that was deliberately tool-local | FR-016 requires exactly **one** authoritative key-budget determination. The measurement needs the pinned stock-key table; leaving the table tool-local forces either a duplicate table in the engine or an engine that cannot measure — both are the defect FR-016 names. | Injecting the key set as a parameter and leaving the table in the utility. Rejected: it makes the *function* single but the *data* still tool-local, so a studio caller has no table to pass and would supply its own — reintroducing the divergence. The file is 436 bytes and its pin semantics are unchanged by the move. |

**Post-design re-check (after Phase 1)**: unchanged — all rows above still hold against the final [data-model.md](data-model.md) and [contracts/](contracts/). The design added no validator surface, no second debounce, no `Pattern` edit, and no host-disk write. The Article VI waiver and the three Complexity Tracking rows are the complete set of non-PASS outcomes.

## Phase 0 — Research

Recorded in [research.md](research.md). Seven decisions, of which three are load-bearing:

- **D1** picks the facet-index measurement (promoted to `packages/contracts/src/keyBudget.ts`) as the canonical key-budget determination, with A7 becoming a boundary-preserving projection.
- **D2** scopes FR-016 deliberately: it does **not** newly seed A7 into the live axis vector, because A7 has no live producer today and seeding it would turn on axis-based gallery ranking and rule 10 for the first time — a regression surface far outside this feature.
- **D5** confirms the owner-flagged platform-collapse judgement, on the evidence that no touch-only target exists in the spine.

## Phase 1 — Design & contracts

- [data-model.md](data-model.md) — `MarkTreatment`, `PromotedComposedCharacter`, `MarkInputOrder`, `KeyBudget`, and the reshaped `WorklistInputs` / `PlacementWorklist` relationship, with validation rules and the re-proposal state transitions.
- [contracts/mark-treatment-answer.md](contracts/mark-treatment-answer.md) — the engine answer type and its §18 change record.
- [contracts/key-budget.md](contracts/key-budget.md) — the single determination, its three bands, and the A7 projection table.
- [contracts/station-ui.md](contracts/station-ui.md) — the station's UI contract: `data-testid` handles, ARIA roles, and the assertion surface SC-004/SC-005/SC-006 are measured against.

## Sequencing note for `/speckit-tasks`

Four user stories, delivered in priority order, each independently testable:

1. **P1 / US1** — the answer. Needs the type change (§18 gate), the station rewrite with order folded in, the worklist change, and the two governing-spec amendments to 046. Ships with plain-text options and no demonstration.
2. **P2 / US2** — the demonstration widget. Pure studio addition on top of P1's option set.
3. **P3 / US3** — the key budget. Contracts relocation + canonical module + wiring the real `spareKeys` into the prefill, plus the facet-index delegation.
4. **P4 / US4** — strategy consistency. The A4/A3a projection, the §7.2 precedence amendment, and the §7.5 table revalidation. Carries the widest regression surface and therefore goes last.

The 046 amendments (FR-010, FR-011, FR-012, SC-006, SC-007) must land in the **same change** as the P1 behaviour, not afterwards — including deleting the `verifyWorklistCoverage` "classified twice" assertion rather than working around it. The §7.5 revalidation must run after P4 and its result recorded per FR-026.
