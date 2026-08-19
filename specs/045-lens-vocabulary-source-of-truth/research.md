# Phase 0 Research: Lens-Vocabulary Single Source of Truth

All unknowns resolved against the live tree (2026-08-19). No `NEEDS CLARIFICATION` remain.

## R1 — Scope is narrower than the spec's own framing: A7 is already sourced correctly

**Decision**: Of the three axis-valued facets the spec names (A1 `added-char-count`, A4 `diacritic-mechanism`, A7 `spare-key-budget`), only **A1 and A4 are genuine stragglers**. A7 already derives from a contracts single source, just not the one the spec assumed.

**Rationale**: `utilities/facet-index/spare-key-budget-classifier.ts` declares `export type SpareKeyBudget = KeyBudgetBand;` — a type **alias**, not a hand-copied literal union — of `packages/contracts/src/keyBudget.ts`'s `KeyBudgetBand` (spec 052 FR-016). `KeyBudgetBand`'s vocabulary (`many | ralt-only | fully-booked`, kebab-case) differs from `axes.ts`'s `SpareKeyAvailability` (`many | RAlt only | fully booked`, display-string form) by design — they are two representations of the same measurement at different layers (machine key vs. display string), bridged by a **bijective, tested** projection function `keyBudgetToSpareKeyAvailability` (`packages/contracts/src/keyBudget.ts:190`, covered by `keyBudget.test.ts`'s dedicated "A7 projection (FR-016)" suite, including an explicit surjectivity/bijectivity assertion). The `spare-key-budget.yaml` facet's `limits.values` hand-lists the `KeyBudgetBand` members in YAML — unavoidable (YAML cannot import a TS type) and already the pattern FR-003 asks for elsewhere.

**Conclusion**: A7 needs no code change. This feature's real surface is **A1 and A4 only**.

**Alternatives considered**: Forcing the facet-index classifier to import `SpareKeyAvailability` directly instead of `KeyBudgetBand` — rejected: `SpareKeyAvailability`'s display-string values are documented as "unsafe as map keys" (axes.ts's own docstring) specifically because they're for display, not internal representation; `KeyBudgetBand` is the correct machine-key source per spec 052, and the existing bijective projection is the sanctioned bridge. Re-plumbing A7 would violate NG-002 (no runtime-behavior change) for a facet that already satisfies the feature's intent.

## R2 — The two genuine stragglers, characterized precisely

**A1 `added-char-count`** (`utilities/facet-index/added-char-count-classifier.ts:32`): declares
```ts
export type A1Band = "tiny" | "small" | "medium" | "large" | "massive";
```
— structurally **identical**, member-for-member, to `axes.ts`'s `Scale` type (`packages/contracts/src/axes.ts:3`), but not imported or aliased from it. `a1Band(count): A1Band` returns this local type.

**A4 `diacritic-mechanism`** (`utilities/facet-index/diacritic-mechanism-classifier.ts:177`): worse than A1 — no type at all. `classifyDiacriticMechanism` declares `let value: string;` and assigns one of the four `DiacriticBehavior` literals (`"none"`, `"stacking-combining"`, `"replacing-cycling"`, `"multi-family"`) as bare strings, with only a runtime comment ("every emitted value is one of the four members, within limits by construction") standing in for a type-level guarantee. `content/keyboard-facets/diacritic-mechanism.yaml`'s `limits.values` independently hand-lists the same four strings.

**Decision**: Fix both by the same mechanism — type-alias the classifier's return-value type to the contracts enum (mirroring A7's own `SpareKeyBudget = KeyBudgetBand` pattern), and widen the classifier's internal `value` variable from `string` to that alias so a typo or dropped member fails `tsc`, not just a runtime assumption.

**Rationale**: This is the **same fix shape already proven correct in this codebase** (A7) — no new pattern to invent, and it satisfies FR-001 (no new/parallel enumeration) by construction, since the alias IS the contracts type.

## R3 — The YAML `limits.values` half: sourced *how*, given YAML cannot import TypeScript

**Decision**: YAML `limits.values` stays a literal list (there is no mechanism for a YAML file to "import" a TS union), but gets a **new build-time/test-time check** — not a hand-audit — asserting each YAML's `limits.values` set is exactly the contracts enum's member set (plus any declared measurement-only extensions per NG's core+extension model, spec's Edge Cases section). This is the "derive from" the spec's FR-003 asks for, realized as an enforced equality rather than a language-level import (impossible across YAML/TS).

**Rationale**: `content/keyboard-facets/*.yaml` is data, consumed by `utilities/facet-index/load-defs.ts` and validated by `utilities/facet-index/validate.ts` (schema-shape validation only today — confirmed no cross-check against contracts enums exists there). The spec's own FR-003 wording ("checked against that same type rather than restated independently") anticipates exactly this — a checked restatement, not an eliminated one.

**Alternatives considered**: Generating the YAML `limits.values` from the TS enum via a codegen script (mirroring `scripts/codegen-langtags.mjs`'s pattern) — rejected as disproportionate: these are 4-5-member enums that change rarely (unlike vendored external datasets), and a generated-file workflow adds a build step where a same-commit assertion test suffices and is simpler to review in a diff.

## R4 — The compile-time drift guard: mirror `_ScaleGuard`, add two new guards

**Decision**: `packages/contracts/src/schemas.ts` already contains the exact guard shape to mirror: `type _ScaleGuard = Expect<AssignableTo<z.infer<typeof ScaleSchema>, Scale>>;` (line 782) binds a zod schema to the `Scale` TS type. This feature's compile-time guard is a **different pairing** (a facet-index classifier's return type against a contracts type, not a zod schema against a TS type), so the existing `_ScaleGuard`/`_ScriptClassGuard` guards are not directly reusable — but the `Expect<AssignableTo<A, B>>` utility-type mechanism they're built on is reusable verbatim. New guards: `type _A1BandGuard = Expect<AssignableTo<A1Band, Scale>>` (bidirectionally, or `AssignableTo` both ways to assert equality) and a corresponding one for A4's new alias against `DiacriticBehavior`, placed alongside the classifiers themselves (not in `schemas.ts`, since `utilities/facet-index` is a standalone tool per CLAUDE.md and must not gain a workspace-package dependency edge beyond what it already has to `@keyboard-studio/contracts`).

**Rationale**: Reuses the established `Expect<AssignableTo<...>>` idiom (already proven, already type-checked in CI via `pnpm typecheck`) rather than inventing a second drift-guard mechanism.

## R5 — The runtime lockstep test: extend, don't duplicate, an existing suite

**Decision**: Neither `scriptAxes.test.ts` nor `driftGuardrail.test.ts` (the two molds spec 045 cites) is the right host — both read, they cover different axes (A2/script derivation, and the spec-016 manifest bijection guardrail, respectively) with no A1/A4/A7 content. The new runtime lockstep test is better placed as a **new, small vitest file colocated with the two classifiers** (`utilities/facet-index/lens-vocabulary-lockstep.test.ts`), asserting: (a) `Object.values` of the YAML `limits.values` for `diacritic-mechanism.yaml` and `added-char-count.yaml` equal `ALL_STRATEGY_IDS`-style exhaustive arrays for `DiacriticBehavior`/`Scale` (the shared-core check, extension-tolerant per NG's core+extension model), and (b) a golden classification per spec-§7.5 exemplar keyboard still returns a value that type-checks as the contracts type, not merely a string.

**Rationale**: `scriptAxes.test.ts`/`driftGuardrail.test.ts` are cited by the spec as a *mold* (a style to imitate — assert-and-fail-loudly on divergence) rather than a literal host module; colocating with the classifiers keeps the test beside the code it guards, consistent with how every other facet-index classifier already colocates its `.test.ts` sibling.

## R6 — FR-010's locked-field gating question: resolved, no escalation needed

**Decision**: No locked `Pattern` field is touched. `Pattern.strategyId` (the field FR-010 specifically flags as a risk) is untouched by this feature — `StrategyId` itself (the type) is not a `Pattern` field, it is the type A `Pattern.strategyId` field is typed *as*; this feature does not touch `strategy.ts`'s `StrategyId` definition or `Pattern`'s use of it at all (FR-004 explicitly preserves the existing `StrategyId` import pattern unchanged — no facet-index/YAML consumer in this feature's real scope, A1/A4, references `StrategyId`). The locked-contract ritual (Article I) does not trigger.

**Rationale**: Resolves the spec's own explicit gating question (FR-010) before task generation, as the spec requires. Confirmed by grep: neither `added-char-count-classifier.ts` nor `diacritic-mechanism-classifier.ts` nor their YAMLs reference `StrategyId` or any strategy id anywhere.

**Alternatives considered**: N/A — this is a factual resolution, not a design choice.
