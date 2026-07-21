# Feature Specification: Lens-Vocabulary Single Source of Truth

**Feature Branch**: `045-lens-vocabulary-source-of-truth`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "The lens vocabularies (§7.1 discovery-axis value sets, the axis-valued keyboard-facets, and the S-01..S-13 strategy catalog) exist as three parallel enumerations that can silently diverge. Unify them behind a single source-of-truth enumeration in packages/contracts that all three consumers import, protected by the existing compile-time drift-guard pattern plus a runtime lockstep test. Vocabulary unification only — no runtime-behavior change, no DISCUS/facets merge, no §7.2 tree-logic change."

**Governing sections**: [spec.md §7](../../spec.md) strategy selection — extracted to [specs/007-strategy-selection](../007-strategy-selection/spec.md) (the A1–A7 discovery axes, the §7.2 decision tree, and the S-01..S-13 catalog these vocabularies describe). Predecessor / consumer feature: [specs/043-base-selection-facets](../043-base-selection-facets/spec.md) (the axis-valued keyboard-facets — `added-char-count` = A1, `diacritic-mechanism` = A4, `spare-key-budget` = A7). Verification lens: [spec.md §18](../../spec.md) criteria, per [docs/discus-principles-integration.md](../../docs/discus-principles-integration.md). Composition map: [docs/lens-model.md](../../docs/lens-model.md) (how the four lenses compose and where the drift hazard lives).

## Overview

Keyboard Studio analyses every authoring decision through four lenses — keyboard-facets, the §7.1 discovery axes, DISCUS, and the §18 criteria — composed in [docs/lens-model.md](../../docs/lens-model.md). Three of those lenses share **vocabulary**: the value sets that name discovery-axis states, keyboard-facet values, and strategy ids overlap by design.

Today that shared vocabulary exists as **three parallel enumerations that are copied, not referenced**:

1. the **§7.1 discovery-axis value sets** (A1–A7a) in [specs/007-strategy-selection](../007-strategy-selection/spec.md) and the engine axis/tree consumers;
2. the **axis-valued keyboard-facets** — `added-char-count` = A1, `diacritic-mechanism` = A4, `spare-key-budget` = A7 — defined in [content/keyboard-facets](../../content/keyboard-facets) and classified in [utilities/facet-index](../../utilities/facet-index); and
3. the **S-01..S-13 strategy catalog** in [specs/007-strategy-selection](../007-strategy-selection/spec.md).

Three copies that *happen* to agree can silently drift apart. The 2026-07-21 DISCUS↔facets overlap audit found this — not DISCUS/facets duplication — to be the real drift hazard, and found it **worst at the A4 `diacritic-mechanism` vocabulary**, where the axis value set and the facet value set restate the same distinctions independently.

This feature unifies the vocabulary behind a **single source-of-truth enumeration in `packages/contracts`** that all three consumers import, so they cannot disagree by construction. It is **vocabulary unification only** — it does not merge DISCUS and facets (they are complementary), does not change any runtime behavior, and does not alter the §7.2 tree logic.

## Clarifications

### Session 2026-07-21

- Q: Is the DISCUS↔facets overlap itself the thing to fix? → A: **No.** The audit found DISCUS and facets are **complementary** (DISCUS judges the deltas; facets measure the base). The real hazard is the **three parallel value-set enumerations** that can diverge. This feature unifies the vocabulary; it does **not** merge the two lenses.
- Q: Where does the single source of truth live? → A: **`packages/contracts`** — the dependency root every other package already builds to. The three consumers *import* one enumeration rather than each holding a copy that agrees.
- Q: What protects it once unified? → A: The **compile-time drift-guard pattern** already used to bind `Pattern`/`Criterion` to their zod schemas (change one → build fails), **plus** a runtime drift test in the [scriptAxes.test.ts](../../packages/studio/src/lib/scriptAxes.test.ts) / [driftGuardrail.test.ts](../../packages/studio/src/dashboard/driftGuardrail.test.ts) mold that asserts the three consumers stay in lockstep.
- Q: Does this touch a locked contract field? → A: **Open — gating question.** If unification touches any **locked `Pattern` field** (e.g. `Pattern.strategyId`), Article I requires a **major `@keyboard-studio/contracts` version bump + a joint engine+content session**. This spec flags it; `/speckit-plan`'s Constitution Check MUST resolve it before tasks are generated. Do not assume it is or is not a locked-field change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One enumeration, three importers (Priority: P1)

An engine developer adds a new value to the A4 diacritic-mechanism axis. Today they must find and edit the axis value set, the matching keyboard-facet value set, and any strategy-catalog reference by hand — three edits that must agree, with nothing enforcing agreement. This story replaces the three copies with a **single exported enumeration in `packages/contracts`** that the axis consumer, the facet definitions/classifiers, and the strategy catalog all import. After it lands, the developer edits **one** place and every consumer sees the change.

**Why this priority**: This is the core of the feature and the MVP. Until there is one enumeration to import, no guard can hold the copies in lockstep — there is nothing shared to guard. Delivered alone, it already removes the divergence hazard for future edits.

**Independent Test**: Grep the three consumer sites and confirm each imports the contracts enumeration rather than declaring its own literal set; confirm the shipped facet-index build and the strategy selector produce byte-identical output to before (behavior unchanged), verifiable without the P2 guard in place.

**Acceptance Scenarios**:

1. **Given** the unified enumeration in `packages/contracts`, **When** the engine axis/tree consumer, the [content/keyboard-facets](../../content/keyboard-facets) definitions + [utilities/facet-index](../../utilities/facet-index) classifiers, and the S-01..S-13 catalog are inspected, **Then** each references the single contracts enumeration and none re-declares its own copy of the shared value set.
2. **Given** the A4 `diacritic-mechanism` value set (the worst drift site), **When** a value is added or renamed in contracts, **Then** the axis consumer, the facet value set, and the classifier all observe the change from the one edit — no second or third edit is required to keep them agreeing.
3. **Given** the unified enumeration, **When** the facet-index is rebuilt and the strategy selector is run against the existing fixtures, **Then** output is byte-identical to the pre-refactor baseline (this feature changes no runtime behavior).

---

### User Story 2 - The copies cannot drift (Priority: P2)

A future contributor edits one consumer in a way that would reintroduce divergence. This story adds the **guards** that make that impossible to merge: the compile-time drift-guard pattern that already binds `Pattern`/`Criterion` to their zod schemas, extended to the lens vocabularies (change one side, the build fails), **plus** a runtime lockstep test asserting the three enumerations agree.

**Why this priority**: Unification (P1) removes today's drift; the guard (P2) prevents tomorrow's. High value, but it depends on P1 — there must be one shared enumeration before a guard can assert lockstep.

**Independent Test**: Deliberately introduce a divergence (e.g. add a facet value absent from the axis set) on a scratch branch and confirm the build fails at the drift guard and the runtime lockstep test fails — then revert and confirm both pass.

**Acceptance Scenarios**:

1. **Given** the compile-time drift-guard pattern from [packages/contracts/src/schemas.ts](../../packages/contracts/src/schemas.ts), **When** it is extended to the lens vocabularies, **Then** a change to the enumeration that is not reflected in a bound consumer type **fails the build**, in the same commit, exactly as a `Pattern`↔schema divergence does today.
2. **Given** a runtime drift test in the [scriptAxes.test.ts](../../packages/studio/src/lib/scriptAxes.test.ts) / [driftGuardrail.test.ts](../../packages/studio/src/dashboard/driftGuardrail.test.ts) mold, **When** the three consumers are checked against the source enumeration, **Then** the test asserts they are in lockstep and **fails loudly** if any value set diverges.
3. **Given** both guards in place, **When** a contributor tries to add a value to one consumer only, **Then** either the build or the lockstep test blocks the merge — divergence cannot ship.

---

### Edge Cases

- **Facet value set is a superset of the axis value set.** A keyboard-facet may carry measurement-only states (e.g. `not-applicable` / `not-derivable` per [specs/043-base-selection-facets](../043-base-selection-facets/spec.md)) that are not axis states. The single source of truth MUST model the axis value set as the shared core and allow the facet to extend it with measurement-only values — the guard asserts the **shared core** stays in lockstep, not that the sets are identical.
- **Strategy catalog references a value the axis set does not.** S-13 touch-layer-switch is chosen *outside* the §7.2 tree; the lockstep assertion MUST NOT force every strategy id into an axis rule.
- **Locked-field collision.** If the unified enumeration would replace a literal currently typed on a **locked `Pattern` field** (e.g. `Pattern.strategyId`), the change is a locked-contract change — it stops for the Article I ritual (major version bump + joint session) rather than proceeding under this Draft.
- **Consumer in a package that must not depend on another.** The dependency-cruiser boundaries (`contracts` imports no workspace package; `engine ↛ studio`) MUST still hold — the source of truth living in `contracts` is what keeps every consumer able to import it without a boundary violation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST define a **single source-of-truth enumeration** for the shared lens vocabulary (the discovery-axis value sets, the axis-valued facet value sets, and the S-01..S-13 strategy catalog) in `packages/contracts` — one exported definition, not three copies that agree.
- **FR-002**: The engine axis/tree consumer MUST import the axis value sets from the contracts enumeration rather than re-declaring them.
- **FR-003**: The [content/keyboard-facets](../../content/keyboard-facets) definitions and the [utilities/facet-index](../../utilities/facet-index) classifiers for the axis-valued facets (`added-char-count` = A1, `diacritic-mechanism` = A4, `spare-key-budget` = A7) MUST derive their value sets from the same contracts enumeration.
- **FR-004**: The S-01..S-13 strategy catalog MUST reference the same contracts enumeration for the strategy ids it shares with the tree/axis consumers.
- **FR-005**: The unified enumeration MUST be protected by the **compile-time drift-guard pattern** already binding `Pattern`/`Criterion` to their zod schemas — a divergence between the enumeration and a bound consumer type MUST fail the build in the same commit.
- **FR-006**: A **runtime lockstep test** (in the [scriptAxes.test.ts](../../packages/studio/src/lib/scriptAxes.test.ts) / [driftGuardrail.test.ts](../../packages/studio/src/dashboard/driftGuardrail.test.ts) mold) MUST assert the three consumers stay in lockstep with the source enumeration and MUST fail loudly on any divergence of the shared core.
- **FR-007**: The refactor MUST NOT change runtime behavior — the facet-index build output and the strategy selector's recommendations MUST be byte-identical to the pre-refactor baseline against the existing fixtures.
- **FR-008**: The change MUST hold the existing architecture boundaries — `contracts` imports no workspace package, `engine ↛ studio`, and the facet-index utility stays a standalone `utilities/*` tool — verified by `pnpm depcruise` / `pnpm lint`.
- **FR-009**: The value sets are shared as a **core + extension** model: the guard asserts the shared axis core stays in lockstep across the three consumers; it MUST allow a facet to carry measurement-only values (`not-applicable` / `not-derivable`) that are not axis states, and MUST NOT force every strategy id into an axis rule.

### Constitution check (candidate gate)

This feature proposes a **new invariant** for `/speckit-plan`'s Constitution Check to enforce mechanically:

> **The lens vocabularies share a single source of truth in contracts.** The
> discovery-axis value sets, the axis-valued facet value sets, and the strategy
> catalog derive from one exported enumeration in `packages/contracts`; the
> three consumers import it rather than declaring copies, and a compile-time
> drift guard plus a runtime lockstep test hold them in step.

This is offered either as a new one-line **Article** or as an **extension of Article I** (the locked-contract gate), since it uses the same drift-guard mechanism Article I already relies on.

- **FR-010 (gating question — do not assume)**: If unification touches any **LOCKED `Pattern` field** (e.g. `Pattern.strategyId`), Article I / spec §18 apply: the change requires a **major `@keyboard-studio/contracts` version bump and a joint engine+content session**. The plan MUST resolve whether a locked field is touched **before** generating tasks; a plan that would edit a locked field MUST stop and escalate to the user rather than proceed.

### Non-Goals (explicit)

- **NG-001**: **No DISCUS/facets merge.** The two lenses are complementary per the 2026-07-21 audit (DISCUS judges the deltas; facets measure the base). This feature unifies **vocabulary**, not lenses.
- **NG-002**: **No runtime-behavior change.** Axis derivation, the §7.2 tree, the gallery, the facet classifiers, and the criteria gate behave exactly as before; only the *source* of the shared value sets moves.
- **NG-003**: **No §7.2 tree-logic change.** The decision-tree rules, firing order, and first-match semantics are untouched.
- **NG-004**: **No new facets and no new classifiers.** This feature re-homes existing vocabulary; it does not add measured signals (that is [specs/043](../043-base-selection-facets/spec.md)'s scope) or transform values (spec 039's scope).
- **NG-005**: **No locked-field edit under this Draft.** If a locked `Pattern` field is implicated (FR-010), the change escalates to the Article I ritual instead of shipping here.

### Team boundaries

- **Contracts** change (the new enumeration) is **joint engine+content ownership** — it lives in the shared dependency root and both teams consume it.
- **Engine** owns the axis / §7.2 tree consumers that import the enumeration.
- **Content** owns the facet definitions ([content/keyboard-facets](../../content/keyboard-facets)) and the facet-index classifiers ([utilities/facet-index](../../utilities/facet-index)) that derive from it.

## Key Entities

- **Lens-vocabulary enumeration**: the single exported definition in `packages/contracts` naming the shared axis value sets, the axis-valued facet value sets' shared core, and the S-01..S-13 strategy ids.
- **Consumer (axis/tree)**: the engine code that reads axis value sets to run the §7.2 decision tree.
- **Consumer (facets)**: the [content/keyboard-facets](../../content/keyboard-facets) definitions + [utilities/facet-index](../../utilities/facet-index) classifiers for the axis-valued facets.
- **Consumer (strategy catalog)**: the S-01..S-13 catalog in [specs/007-strategy-selection](../007-strategy-selection/spec.md) and its code representation.
- **Drift guard (compile-time)**: the schema-drift-guard pattern from [packages/contracts/src/schemas.ts](../../packages/contracts/src/schemas.ts), extended to the lens vocabularies.
- **Lockstep test (runtime)**: the drift test in the [scriptAxes.test.ts](../../packages/studio/src/lib/scriptAxes.test.ts) / [driftGuardrail.test.ts](../../packages/studio/src/dashboard/driftGuardrail.test.ts) mold.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the feature lands, the shared lens vocabulary is declared in **exactly one** place in `packages/contracts`; the three consumers import it, and a repo-wide search finds **zero** independent re-declarations of the shared value sets.
- **SC-002**: A deliberate divergence introduced in any one consumer **fails the build** (compile-time drift guard) **and** fails the runtime lockstep test — verified by a red/green check on a scratch change.
- **SC-003**: The facet-index build output and the strategy selector's recommendations are **byte-identical** to the pre-refactor baseline against the existing fixtures — behavior is unchanged.
- **SC-004**: `pnpm typecheck`, `pnpm test`, `pnpm lint` (including `pnpm depcruise`, `pnpm run facet-lint`, `pnpm run facet-index-lint`), and the new lockstep test all pass; no architecture boundary is violated.
- **SC-005**: The Constitution Check gains (or Article I is extended by) the single-source-of-truth invariant, and the locked-field question (FR-010) is explicitly resolved at plan time before any task is generated.

## Acceptance checklist

- [ ] A **single** lens-vocabulary enumeration exists in `packages/contracts` (no three-way copy).
- [ ] The **three consumers** — engine axis/tree, facet definitions + classifiers, strategy catalog — all import that one enumeration.
- [ ] A **compile-time drift guard** binds the enumeration to its consumers (change one → build fails), extending the `Pattern`/`Criterion` schema-guard pattern.
- [ ] A **runtime lockstep test** (scriptAxes / driftGuardrail mold) asserts the three stay in lockstep and fails loudly on divergence.
- [ ] The **DISCUS↔facets audit** finding and [docs/lens-model.md](../../docs/lens-model.md) are cross-linked from this spec, and this spec is linked back from [docs/lens-model.md](../../docs/lens-model.md).
- [ ] Runtime behavior is unchanged (byte-identical facet-index + strategy-selector output) and the locked-field gating question (FR-010) is resolved before implementation.

## Assumptions

- The **compile-time drift-guard pattern** in [packages/contracts/src/schemas.ts](../../packages/contracts/src/schemas.ts) is reusable for the lens vocabularies without new tooling — it already binds `Pattern`/`Criterion` to their zod schemas the same way.
- The three consumers can all import from `packages/contracts` without violating the dependency-cruiser boundaries, because `contracts` is the dependency root every package already builds to.
- The axis value sets are the **shared core**; the facets may extend that core with measurement-only states (`not-applicable` / `not-derivable`) that are legitimately not axis values, so the guard checks the shared core rather than set-equality.
- No **locked `Pattern` field** is edited under this Draft; if one turns out to be implicated (FR-010), the work escalates to the Article I ritual rather than proceeding.
- The existing facet-index and strategy-selector **fixtures** are sufficient to prove byte-identical output before and after the refactor.
