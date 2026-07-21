# Feature Specification: Lens-Vocabulary Single Source of Truth

**Feature Branch**: `045-lens-vocabulary-source-of-truth`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "The lens vocabularies (§7.1 discovery-axis value sets, the axis-valued keyboard-facets, and the S-01..S-13 strategy catalog) exist as three parallel enumerations that can silently diverge. Unify them behind a single source-of-truth enumeration in packages/contracts that all three consumers import, protected by the existing compile-time drift-guard pattern plus a runtime lockstep test. Vocabulary unification only — no runtime-behavior change, no DISCUS/facets merge, no §7.2 tree-logic change."

**Governing sections**: [spec.md §7](../../spec.md) strategy selection — extracted to [specs/007-strategy-selection](../007-strategy-selection/spec.md) (the A1–A7 discovery axes, the §7.2 decision tree, and the S-01..S-13 catalog these vocabularies describe). Predecessor / consumer feature: [specs/043-base-selection-facets](../043-base-selection-facets/spec.md) (the axis-valued keyboard-facets — `added-char-count` = A1, `diacritic-mechanism` = A4, `spare-key-budget` = A7). Verification lens: [spec.md §11](../../spec.md) criteria, per [docs/discus-principles-integration.md](../../docs/discus-principles-integration.md). Composition map: [docs/lens-model.md](../../docs/lens-model.md) (how the four lenses compose and where the drift hazard lives).

## Overview

Keyboard Studio analyses every authoring decision through four lenses — keyboard-facets, the §7.1 discovery axes, DISCUS, and the §11 criteria — composed in [docs/lens-model.md](../../docs/lens-model.md). Three of those lenses share **vocabulary**: the value sets that name discovery-axis states, keyboard-facet values, and strategy ids overlap by design.

**The single source of truth for that vocabulary already exists in `packages/contracts`, and the engine already consumes it:**

- the **§7.1 discovery-axis value sets** (A1–A7a) are the per-axis unions on `DiscoveryAxisVector` in [packages/contracts/src/axes.ts](../../packages/contracts/src/axes.ts) — e.g. A4 is `DiacriticBehavior` (`none | stacking-combining | replacing-cycling | multi-family`), A1 is `Scale`, A7 is `SpareKeyAvailability`; and
- the **S-01..S-13 strategy catalog** is the `StrategyId` union (with `ALL_STRATEGY_IDS`) in [packages/contracts/src/strategy.ts](../../packages/contracts/src/strategy.ts).

The engine's §7.2 decision tree already imports **both** — [packages/engine/src/strategy-selector/rules.ts](../../packages/engine/src/strategy-selector/rules.ts) takes `DiscoveryAxisVector` and `StrategyId` from `@keyboard-studio/contracts` rather than restating them. So the axis→tree path is already single-sourced; **this feature must NOT author a new or redundant enumeration.**

What still drifts is the **straggler consumers that redeclare the same value sets independently of those contracts types** instead of deriving from them:

1. the **facet-index classifiers** under [utilities/facet-index](../../utilities/facet-index) — e.g. `diacritic-mechanism-classifier.ts` emits its A4 value as a bare `string` and hardcodes the `"stacking-combining" | "replacing-cycling" | "multi-family" | "none"` literals instead of typing against `DiacriticBehavior`; and
2. the axis-valued **keyboard-facet definitions** in [content/keyboard-facets](../../content/keyboard-facets) — `added-char-count` = A1, `diacritic-mechanism` = A4, `spare-key-budget` = A7 — whose `limits.values` re-list the same enum by hand (e.g. `diacritic-mechanism.yaml` restates the four A4 states).

Copies that *happen* to agree can silently drift apart. The 2026-07-21 DISCUS↔facets overlap audit found this — not DISCUS/facets duplication — to be the real drift hazard, and found it **worst at the A4 `diacritic-mechanism` vocabulary**, where the classifier literals and the facet `limits.values` restate the `DiacriticBehavior` distinctions with nothing binding them to the contracts type.

This feature **wires those straggler classifiers and facet YAMLs to derive from the existing `packages/contracts` enumerations** (`axes.ts` `DiscoveryAxisVector`/`DiacriticBehavior`, `strategy.ts` `StrategyId`), so they cannot disagree by construction. It is **vocabulary sourcing only** — it does not merge DISCUS and facets (they are complementary), does not change any runtime behavior, and does not alter the §7.2 tree logic.

## Clarifications

### Session 2026-07-21

- Q: Is the DISCUS↔facets overlap itself the thing to fix? → A: **No.** The audit found DISCUS and facets are **complementary** (DISCUS judges the deltas; facets measure the base). The real hazard is the **straggler value-set copies** — the facet-index classifier literals and the `content/keyboard-facets` YAML `limits.values` that restate the contracts axis/strategy enumerations by hand and can diverge from them. This feature sources those stragglers from the existing contracts types; it does **not** merge the two lenses.
- Q: Where does the single source of truth live? → A: **`packages/contracts`** — the dependency root every other package already builds to — and it **already exists there** (`axes.ts` `DiscoveryAxisVector` + per-axis unions incl. `DiacriticBehavior`; `strategy.ts` `StrategyId`). The engine's §7.2 tree already imports it. The work is making the **straggler consumers** (the facet-index classifiers and the `content/keyboard-facets` YAMLs) derive from it rather than each holding a hand-written copy; this feature does **not** author a new enumeration.
- Q: What protects it once unified? → A: The **compile-time drift-guard pattern** already used to bind `Pattern`/`Criterion` to their zod schemas (change one → build fails), **plus** a runtime drift test in the [scriptAxes.test.ts](../../packages/studio/src/lib/scriptAxes.test.ts) / [driftGuardrail.test.ts](../../packages/studio/src/dashboard/driftGuardrail.test.ts) mold that asserts the straggler consumers stay in lockstep with the contracts source.
- Q: Does this touch a locked contract field? → A: **Open — gating question.** If unification touches any **locked `Pattern` field** (e.g. `Pattern.strategyId`), Article I requires a **major `@keyboard-studio/contracts` version bump + a joint engine+content session**. This spec flags it; `/speckit-plan`'s Constitution Check MUST resolve it before tasks are generated. Do not assume it is or is not a locked-field change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One enumeration, three importers (Priority: P1)

A content author adds a new value to the A4 diacritic-mechanism axis. The axis type already lives in one place — `DiacriticBehavior` in `packages/contracts/src/axes.ts`, which the engine's §7.2 tree already imports. But today they must *also* find and edit the facet-index classifier's hardcoded literal set and the `content/keyboard-facets/diacritic-mechanism.yaml` `limits.values` by hand — copies that must agree with the contracts type, with nothing enforcing agreement. This story makes those **straggler consumers derive from the existing contracts enumeration** (`DiacriticBehavior` / `StrategyId`) instead of restating it. After it lands, the author edits the contracts type in **one** place and every consumer — engine, classifier, facet definition — sees the change.

**Why this priority**: This is the core of the feature and the MVP. The contracts SSOT and the engine's use of it already exist; the divergence hazard is the stragglers that copy those value sets. Until they import the contracts types, no guard can hold them in lockstep — the copy is still there to drift. Delivered alone, this already removes the divergence hazard for future edits.

**Independent Test**: Grep the straggler consumer sites (the facet-index classifiers, the `content/keyboard-facets` YAMLs) and confirm each derives its value set from the contracts enumeration rather than declaring its own literal set; confirm the shipped facet-index build and the strategy selector produce byte-identical output to before (behavior unchanged), verifiable without the P2 guard in place.

**Acceptance Scenarios**:

1. **Given** the existing enumerations in `packages/contracts` (`axes.ts` `DiscoveryAxisVector`/`DiacriticBehavior`, `strategy.ts` `StrategyId`), **When** the [utilities/facet-index](../../utilities/facet-index) classifiers and the [content/keyboard-facets](../../content/keyboard-facets) definitions for the axis-valued facets are inspected, **Then** each derives its value set from the contracts enumeration and none re-declares its own hand-written copy of the shared value set. (The engine axis/tree consumer already imports it and stays as-is.)
2. **Given** the A4 `diacritic-mechanism` value set (the worst drift site), **When** a value is added or renamed in the contracts `DiacriticBehavior` type, **Then** the engine consumer, the facet value set, and the classifier all observe the change from the one edit — no second or third edit is required to keep them agreeing.
3. **Given** the wired consumers, **When** the facet-index is rebuilt and the strategy selector is run against the existing fixtures, **Then** output is byte-identical to the pre-refactor baseline (this feature changes no runtime behavior).

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
- **Locked-field collision.** If sourcing a consumer from the contracts enumeration would replace a literal currently typed on a **locked `Pattern` field** (e.g. `Pattern.strategyId`), the change is a locked-contract change — it stops for the Article I ritual (major version bump + joint session) rather than proceeding under this Draft.
- **Consumer in a package that must not depend on another.** The dependency-cruiser boundaries (`contracts` imports no workspace package; `engine ↛ studio`) MUST still hold — the source of truth living in `contracts` is what keeps every consumer able to import it without a boundary violation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The **single source-of-truth enumerations** for the shared lens vocabulary already exist in `packages/contracts` (`axes.ts` `DiscoveryAxisVector` and its per-axis unions — including `DiacriticBehavior`, `Scale`, `SpareKeyAvailability` — and `strategy.ts` `StrategyId` / `ALL_STRATEGY_IDS`). The system MUST treat these as the source of truth and MUST **NOT** author a new or parallel enumeration; the feature re-homes the straggler copies onto them.
- **FR-002**: The engine axis/tree consumer already imports the axis value sets and strategy ids from contracts (`packages/engine/src/strategy-selector/rules.ts`); the feature MUST preserve that and MUST NOT re-introduce a local copy.
- **FR-003**: The [content/keyboard-facets](../../content/keyboard-facets) definitions and the [utilities/facet-index](../../utilities/facet-index) classifiers for the axis-valued facets (`added-char-count` = A1, `diacritic-mechanism` = A4, `spare-key-budget` = A7) MUST derive their value sets from the existing contracts enumerations rather than hand-listing literals — e.g. `diacritic-mechanism-classifier.ts` MUST type its output against `DiacriticBehavior` instead of emitting a bare `string`, and `content/keyboard-facets/diacritic-mechanism.yaml`'s `limits.values` MUST be sourced from / checked against that same type rather than restated independently.
- **FR-004**: Any facet-index or content consumer that references strategy ids MUST use the existing `StrategyId` union from contracts rather than re-declaring the S-01..S-13 catalog; the strategy catalog itself already lives in contracts and stays there.
- **FR-005**: The contracts enumerations MUST be protected by the **compile-time drift-guard pattern** already binding `Pattern`/`Criterion` to their zod schemas — a divergence between an enumeration and a bound consumer type MUST fail the build in the same commit.
- **FR-006**: A **runtime lockstep test** (in the [scriptAxes.test.ts](../../packages/studio/src/lib/scriptAxes.test.ts) / [driftGuardrail.test.ts](../../packages/studio/src/dashboard/driftGuardrail.test.ts) mold) MUST assert the three consumers stay in lockstep with the source enumeration and MUST fail loudly on any divergence of the shared core.
- **FR-007**: The refactor MUST NOT change runtime behavior — the facet-index build output and the strategy selector's recommendations MUST be byte-identical to the pre-refactor baseline against the existing fixtures.
- **FR-008**: The change MUST hold the existing architecture boundaries — `contracts` imports no workspace package, `engine ↛ studio`, and the facet-index utility stays a standalone `utilities/*` tool — verified by `pnpm depcruise` / `pnpm lint`.
- **FR-009**: The value sets are shared as a **core + extension** model: the guard asserts the shared axis core stays in lockstep across the three consumers; it MUST allow a facet to carry measurement-only values (`not-applicable` / `not-derivable`) that are not axis states, and MUST NOT force every strategy id into an axis rule.

### Constitution check (candidate gate)

This feature proposes a **new invariant** for `/speckit-plan`'s Constitution Check to enforce mechanically:

> **The lens vocabularies share a single source of truth in contracts.** The
> discovery-axis value sets, the axis-valued facet value sets, and the strategy
> catalog derive from the **existing** contracts enumerations (`axes.ts`
> `DiscoveryAxisVector`/`DiacriticBehavior`, `strategy.ts` `StrategyId`); every
> consumer — engine tree, facet-index classifiers, `content/keyboard-facets`
> definitions — imports/derives from them rather than declaring copies, and a
> compile-time drift guard plus a runtime lockstep test hold them in step.

This is offered either as a new one-line **Article** or as an **extension of Article I** (the locked-contract gate), since it uses the same drift-guard mechanism Article I already relies on.

- **FR-010 (gating question — do not assume)**: If unification touches any **LOCKED `Pattern` field** (e.g. `Pattern.strategyId`), Article I / spec §18 apply: the change requires a **major `@keyboard-studio/contracts` version bump and a joint engine+content session**. The plan MUST resolve whether a locked field is touched **before** generating tasks; a plan that would edit a locked field MUST stop and escalate to the user rather than proceed.

### Non-Goals (explicit)

- **NG-001**: **No DISCUS/facets merge.** The two lenses are complementary per the 2026-07-21 audit (DISCUS judges the deltas; facets measure the base). This feature unifies **vocabulary**, not lenses.
- **NG-002**: **No runtime-behavior change.** Axis derivation, the §7.2 tree, the gallery, the facet classifiers, and the criteria gate behave exactly as before; only the *source* of the shared value sets moves.
- **NG-003**: **No §7.2 tree-logic change.** The decision-tree rules, firing order, and first-match semantics are untouched.
- **NG-004**: **No new facets and no new classifiers.** This feature re-homes existing vocabulary; it does not add measured signals (that is [specs/043](../043-base-selection-facets/spec.md)'s scope) or transform values (spec 039's scope).
- **NG-005**: **No locked-field edit under this Draft.** If a locked `Pattern` field is implicated (FR-010), the change escalates to the Article I ritual instead of shipping here.

### Team boundaries

- **Contracts** types (the existing `DiscoveryAxisVector`/`DiacriticBehavior`/`StrategyId` enumerations) are **joint engine+content ownership** — they live in the shared dependency root and both teams consume them; any extension needed to support sourcing is a joint change.
- **Engine** owns the axis / §7.2 tree consumers that import the enumeration.
- **Content** owns the facet definitions ([content/keyboard-facets](../../content/keyboard-facets)) and the facet-index classifiers ([utilities/facet-index](../../utilities/facet-index)) that derive from it.

## Key Entities

- **Lens-vocabulary enumerations (existing)**: the definitions already in `packages/contracts` — `axes.ts` `DiscoveryAxisVector` and its per-axis unions (incl. `DiacriticBehavior`, `Scale`, `SpareKeyAvailability`) naming the shared axis value sets, and `strategy.ts` `StrategyId` / `ALL_STRATEGY_IDS` naming the S-01..S-13 strategy ids. This feature sources consumers from these; it does not create a new one.
- **Consumer (axis/tree) — already wired**: the engine code (`packages/engine/src/strategy-selector/rules.ts`) that imports `DiscoveryAxisVector`/`StrategyId` to run the §7.2 decision tree.
- **Consumer (facets) — the straggler to wire**: the [content/keyboard-facets](../../content/keyboard-facets) definitions + [utilities/facet-index](../../utilities/facet-index) classifiers for the axis-valued facets, which currently hand-list the value sets.
- **Strategy catalog (in contracts)**: the S-01..S-13 catalog as `StrategyId`; its prose home is [specs/007-strategy-selection](../007-strategy-selection/spec.md).
- **Drift guard (compile-time)**: the schema-drift-guard pattern from [packages/contracts/src/schemas.ts](../../packages/contracts/src/schemas.ts), extended to the lens vocabularies.
- **Lockstep test (runtime)**: the drift test in the [scriptAxes.test.ts](../../packages/studio/src/lib/scriptAxes.test.ts) / [driftGuardrail.test.ts](../../packages/studio/src/dashboard/driftGuardrail.test.ts) mold.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the feature lands, the shared lens vocabulary is declared in **exactly one** place — the existing `packages/contracts` enumerations; every consumer (engine tree, facet-index classifiers, `content/keyboard-facets` definitions) derives from it, and a repo-wide search finds **zero** independent re-declarations of the shared value sets (in particular, no classifier emitting the A4 values as bare `string` literals and no facet `limits.values` restating them by hand).
- **SC-002**: A deliberate divergence introduced in any one consumer **fails the build** (compile-time drift guard) **and** fails the runtime lockstep test — verified by a red/green check on a scratch change.
- **SC-003**: The facet-index build output and the strategy selector's recommendations are **byte-identical** to the pre-refactor baseline against the existing fixtures — behavior is unchanged.
- **SC-004**: `pnpm typecheck`, `pnpm test`, `pnpm lint` (including `pnpm depcruise`, `pnpm run facet-lint`, `pnpm run facet-index-lint`), and the new lockstep test all pass; no architecture boundary is violated.
- **SC-005**: The Constitution Check gains (or Article I is extended by) the single-source-of-truth invariant, and the locked-field question (FR-010) is explicitly resolved at plan time before any task is generated.

## Acceptance checklist

- [ ] The **existing** contracts enumerations (`axes.ts` `DiscoveryAxisVector`/`DiacriticBehavior`, `strategy.ts` `StrategyId`) are used as the single source of truth — **no new/redundant enumeration** was authored.
- [ ] The **straggler consumers** — facet-index classifiers and `content/keyboard-facets` definitions — derive from those contracts types rather than hand-listing literals (the engine axis/tree consumer already imports them).
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
