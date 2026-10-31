# Implementation Plan: Touch key identity criteria (spec 104)

**Branch**: `km/104-touch-key-id-criteria` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/104-touch-key-id-criteria/spec.md`, as clarified 2026-10-17 (4 rulings: FR-002 host set, FR-016 refusal collapse, FR-029 re-linking, FR-015 unvisited-list pass-through)

## Summary

One foundational module — the **production resolver** in contracts — answers
"what does this touch key produce, per state, and from what source" for every
consumer that today derives production on its own (or fails to: audit gaps
1–5, research.md §3). On top of it: the criteria decision table
(`decideKeyIdForm()`, contracts §2) drives minting, severance (rule-level
transplant with refusal, plus its FR-029 mirror, re-linking), dead-key
repair, and the Track 1 automatic / Track 2 choice flows. All identity state
is decision-spine records (spec 093); no new storage, no new lint codes, no
new modal machinery — the studio surfaces generalise existing components
(DocumentationFixProposals rows, ContextToleranceStation, KeyInspector).

## Technical Context

**Language/Version**: TypeScript (monorepo, pnpm 9.12.0 pinned), strict mode per package tsconfig
**Primary Dependencies**: existing only — contracts rule-join (`buildTouchKeyRuleIndex`), codec rule cloning, vendored KeymanWeb (test harness), kmc-kmn 19.0.240-alpha (fixture compilation in tests). No new runtime dependencies.
**Storage**: none new. Identity state = decision-spine records in the working copy (Constitution Art. III); fixtures + corpus under existing test/tooling trees.
**Testing**: Vitest unit/integration per package (table-driven for the decision table; parity tests per migrated consumer); tap-simulation harness over vendored KMW (compile with kmc, drive ActiveLayout → processor); Playwright e2e walks in the studio harness; corpus gate as a nightly-class tool run in the dev overnight soak, not a per-PR gate.
**Target Platform**: studio web app (authoring-time only). No runtime/KeymanWeb changes; the KeymanWeb engine, OSK iframe, and postMessage channel are untouched (standing line).
**Project Type**: web application — monorepo packages (contracts / engine / keyboard-lint / studio).
**Performance Goals**: resolver is called per key occurrence at edit/import time; it MUST stay linear in rules-per-key over the rule-join index (no per-call re-traversal of the .kmn). Panel rendering resolves the selected key only. Corpus gate runtime bounded by the overnight soak window.
**Constraints**: byte-identical behaviour for every migrated consumer except where an audit gap mandates a change (each change named in its parity test); FR-007 atomicity (no serialised intermediate with a producing T_ and no rules); en+fr catalogue for all new copy via messages:extract, never template literals (FR-026); findings only at owning steps (spec #2145 model, FR-024).
**Scale/Scope**: 5 packages touched; 27 tasks; corpus = 962 upstream layouts for the gate; fixtures = 5 idiom keyboards (FR-028).

## Constitution Check

*GATE: passed at plan time; re-checked after implementation (Phase gates in tasks.md).*

| Article | Verdict | Basis |
|---|---|---|
| I. Pattern schema is a locked contract | PASS | No pattern-schema change. The resolver and decision table are new contracts modules, not schema amendments; minting policy changes are spec-104-superseding-by-name (FR-010/FR-013 vs 065/063), recorded in spec.md's governing-authority section. |
| II. KeyboardIR is the engine spine | PASS | Severance/carve operate on KeyboardIR + codec rule nodes (cloned verbatim incl. spec 103 `if()` elements); no side-channel .kmn text editing. |
| III. State model — decisions as live truth | PASS | Key identity decisions, guard specification, repairs, transplant records are decision-spine records in the working copy; resume/re-presentation semantics follow FR-017's suppression rule. |
| IV. Validator layering is fixed | PASS | keyboard-lint consumes the resolver from contracts (its only importable home); TOUCH_KEY_NO_RULE remains the single dead-key finding; no new lint codes, no layering change. |
| VI. Team boundaries | PASS | Ownership per spec.md: contracts = resolver + decision procedure; engine = transplant/carve/scaffolder; studio = choice surfaces + guard question; content = en/fr copy. |
| IX. No user-facing survey surface outside the decision registry | PASS — gated | The guard question and every Track 2 choice MUST register as decision-registry entries (GuardSpecification / KeyIdentityDecision records, T005/T013/T016). A surface that asks without registering is a constitution violation; T013's acceptance includes the registry entry. |
| X. Defaults are proposals; nothing is decided silently | PASS | Preselection is presentation, never consent (FR-015 pass-through ruling); severance on Track 2 is a choice; re-linking is offered, never automatic (FR-029); the one automatic path (Track 1 creation/Copy) shows the severance line and records the decision (FR-011 + contracts §3 step 5). |
| XI. Done means integrated | PASS | SC-006 requires the four e2e walks + full CI incl. the e2e lane; the corpus gate (FR-027) runs in the dev soak before promotion. |

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/104-touch-key-id-criteria/
├── spec.md                  # post-clarify (4 rulings integrated)
├── plan.md                  # this file
├── research.md              # evidence base (semantics, census, audit, adjudication)
├── data-model.md            # resolver record + spine record entities
├── quickstart.md            # validation scenarios (SC-001…SC-006 walkthroughs)
├── contracts/
│   └── key-id-criteria.md   # normative decision table, resolver record, author copy
└── tasks.md                 # 27 tasks, 6 phases
```

### Source code (repository root)

```text
packages/contracts/src/
├── touchProduction.ts       # NEW: resolveTouchProduction() + decideKeyIdForm()
├── touch-key-rule-join.ts   # resolver builds on buildTouchKeyRuleIndex (unchanged API)
├── touch-coverage.ts        # migrated onto the resolver (T025)
├── touch-key-diagnostics.ts # findDeadTouchKeys re-pointed at the resolver (T006)
└── decisionRecord.ts        # + KeyIdentityDecision / GuardSpecification / RepairProposal / TransplantRecord (T005)

packages/engine/src/
├── simulator/tapSimulation.test.ts        # NEW harness + caps probe (T002, T022)
├── pattern-apply/
│   ├── severTouchKey.ts                   # NEW: transplant + refusal + re-link mirror (T011, T027)
│   ├── touch-mechanism-shared.ts          # removal matching via resolver (T007)
│   ├── enumerateTouchMethodsForChar.ts    # resolver-addressed (T008)
│   ├── applyCarveKeycapRemovalsToVfs.ts   # carve matching via resolver (T009)
│   ├── keyIdMinting.ts / proposeTouchKeyId.ts  # decision table + inherit gate (T010)
│   └── applyDesktopModifications*.ts / propagateDesktopLayersToTouch.ts  # (T017, T018)
└── scaffolder/scaffoldTouchLayout.ts      # ruled-T_ identity reuse (T019)

packages/studio/src/
├── survey/marks/            # guard station (ContextToleranceStation pattern) (T013)
├── components/              # repair/choice list (DocumentationFixProposals pattern) (T015, T016)
├── editors/                 # KeyPropertyPanel/KeyInspector: production table, provenance, re-link action (T020, T027)
└── steps/                   # owning-step lists, work-to-do counts (T015, T016, T020)

tools/                       # corpus gate + refusal-rate probe (T021, T026)
```

**Structure Decision**: the resolver lives in **contracts**, not engine —
keyboard-lint cannot import engine, and FR-003's "exactly one resolver" is
only satisfiable from the lowest layer. It extends the spec 063 rule-join
(same package, same index) rather than replacing it. Engine owns the
mutations (transplant, carve, scaffolder); studio owns presentation only and
takes every verdict from contracts/engine APIs.

## Phases

1. **Setup + Foundational** (tasks Phase 1–2): idiom fixtures + tap-simulation
   harness first (they pin the semantics the resolver encodes), then the
   resolver, decision table, record types, diagnostics + coverage migration.
   Exit gate: SC-005 table tests green; parity tests show verdict changes
   only where an audit gap names them.
2. **Carve + creation** (Phase 3): the originally reported defect (US4) and
   the creation path (US1) — removal/enumeration/carve rewired, proposer on
   the decision table, severance transplant + re-link mirror. Refusal
   fixtures from the fv_/gff_ store patterns. Exit gate: SC-001, SC-003.
3. **Evidence checkpoint**: refusal-rate corpus probe (T026) runs here —
   before any Track 2 UX is built — and sizes the Phase 4 choice surfaces.
4. **Track flows** (Phase 4): guard station, Copy parity + repair list,
   Track 2 choices incl. the FR-016 refusal collapse and FR-017
   decline-suppression. Exit gate: SC-002 (with context probes), SC-004.
5. **Derivation surfaces** (Phase 5): placement replay, combo propagation,
   scaffolder/reseed (US5).
6. **Inspectability + gates** (Phase 6): property panel (US6), corpus gate in
   the dev soak, caps-fallback probe (may land any time after Phase 1; its
   result either removes the contracts §5 proviso or promotes caps-state
   production to a first-class resolver value), e2e walks, spec-trace +
   AS-BUILT. Exit gate: SC-006 — full CI incl. e2e lane green.

## Testing

- **Decision table**: table-driven, one case per contracts §2 arm + every
  spec edge case (SC-005), reusing the proposer suites' fixtures.
- **Resolver parity**: per migrated consumer, verdict-diff over the corpus
  fixture set, confined to the audit gaps — the guard against the
  single-point-of-failure risk below.
- **Tap simulation**: FR-028 fixtures through the vendored KMW harness —
  the same method that produced research.md §1's verdicts, so a semantics
  regression in either direction (ours or a toolchain upgrade's) is caught.
- **Corpus gate** (FR-027): nightly-class, dev soak; per-PR fast lane keeps
  its budget (dev-first flow).
- **E2E**: four Playwright walks (SC-006); "Resolve CI" means all lanes,
  e2e included.

## Risks

- **Resolver as single point of failure** (proposal §6): mitigated by the
  parity tests in Phase 1 and by building on the shipped rule-join rather
  than a new traversal.
- **Transplant refusal rate**: sized by the T026 probe at the Phase 3
  checkpoint, before the choice UX is built (Phase 4).
- **Track 2 choice fatigue**: bounded by FR-018 (batched, only where the
  criteria bite; editor-triggered severance decided inline at commit) and
  by the warnings-placement model (owning step only).
- **Host-set drift**: the FR-002 host set is project-declared data; if a
  project's targets change after severances were recorded, equality is
  re-evaluated but nothing re-severs or re-links by itself (FR-002 rider i)
  — stale severances surface only through the FR-029 re-link offer.
- **Toolchain drift**: research.md §1's verdicts are pinned to
  kmc-kmn 19.0.240 / vendored KMW 18d10993; the FR-028 fixtures are the
  tripwire when either upgrades.
