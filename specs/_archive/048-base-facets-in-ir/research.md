# Phase 0 Research: Bake base-keyboard facets into the working-copy IR

## R1 — The offline classifier already operates on `KeyboardIR` — FR-008 is a hoist, not a re-implementation

**Decision**: Extract `utilities/facet-index/casing-classifier.ts`'s `classifyCasing(ir: KeyboardIR, def: FacetDefinition)` core determination logic into a shared location both the offline tool and the browser studio can import, rather than writing a second, independent runtime derivation.

**Rationale**: `classifyCasing` already takes `KeyboardIR` as its input — not a separate offline-only representation. The offline/runtime split the spec worries about (FR-008: "a single shared derivation is REQUIRED rather than a second, divergent implementation") is achievable by moving the function itself, not by keeping two implementations in sync by convention. `utilities/*` sits deliberately outside the pnpm workspace (per CLAUDE.md) so the studio cannot import it directly today — the hoist target is `packages/contracts` or `packages/engine` (the spec's own Assumptions section names both as acceptable).

**Alternatives considered**: Writing a second, simplified runtime-only casing check and asserting by test that it agrees with the offline classifier — rejected: this is exactly the "divergent implementation" FR-008 forbids; a passing test today gives no guarantee against silent drift tomorrow. A hoist makes agreement structural, not tested-for.

## R2 — The offline classifier's output is richer than what the IR needs; project down, don't carry the whole `Categorization`

**Decision**: The hoisted shared function returns a narrow `{value, determined: boolean}` (or equivalent) shape. `utilities/facet-index/casing-classifier.ts`'s `classifyCasing` calls the hoisted function for its core determination, then wraps the result in its own richer `Categorization` (`confidence`, `confidenceClass`, `provenanceTier`, `evidenceSize`, `analyzedCoverage`, `analysisOutcome`) for the offline report. The IR-baked `FacetValue` carries only `value` + `provenance` (`derived` | `overridden` | `undetermined`) per FR-003 — it does not need the offline report's confidence/evidence-size bookkeeping, which exists to help a human auditing the facet catalog, not a runtime consumer asking "is this base cased?"

**Rationale**: Conflating the two shapes would mean either impoverishing the offline report (losing audit detail) or bloating every working copy with fields no runtime consumer reads. Keeping them separate, with the runtime shape as a strict subset, satisfies FR-008's "same input, same value" requirement without forcing shape parity.

**Alternatives considered**: Carrying the full `Categorization` on the IR — rejected as unnecessary IR bloat with no identified consumer for the extra fields (FR-002 only asks for the value itself).

## R3 — Instantiation insertion points: `workingCopyStore.ts`, not `keyboard-ir.ts`

**Decision**: Both `instantiateFromBase` (`packages/studio/src/stores/workingCopyStore.ts`, ~line 1458) and `instantiateFromExisting` (~line 1520) call the shared derivation and attach the result as `ir.facets` before the store sets the new working copy. `keyboard-ir.ts` itself gains only the `facets?: FacetSet` field — it is a type definition module, not where derivation logic runs (Article II: `KeyboardIR` is a spine type, not a place for behavior).

**Rationale**: Matches this repo's established pattern — IR fields are populated by the store actions that construct a working copy, not by the type module itself. Both instantiation paths (Track 1 copy/adapt, Track 2 import) must derive facets identically (spec's own Edge Cases: "Track 2 instantiates the working copy the same way as Track 1"), so both call sites need the same call, not a shared preprocessing step that only one path remembers to invoke.

**Alternatives considered**: Deriving facets lazily on first read (a getter that computes on demand) — rejected: FR-001 explicitly says facets are derived "when the working copy is instantiated," and lazy derivation would need to be triggered from every possible first-read call site rather than the two well-defined instantiation points, plus would complicate the override mechanism (what does "override before first read" mean for a lazy value?).

## R4 — `.passthrough()` schema: confirm at implementation time whether an explicit entry is still warranted

**Decision**: `KeyboardIRSchema` (`packages/contracts/src/schemas.ts`) is a `.passthrough()` zod object that only pins `origin` and `touchLayout` explicitly. Adding `facets?` needs no schema change to avoid breaking runtime validation (passthrough already accepts unknown-but-unvalidated extra keys) — but Article I's drift-guard *intent* (a locked field's shape stays visible in the schema) argues for adding an explicit, loosely-typed `facets: z.unknown().optional()` entry anyway, for documentation parity with `touchLayout`'s explicit pin, even though passthrough would function without it.

**Rationale**: Deferred to implementation rather than decided here because it is a style/documentation call, not a functional gate — passthrough already satisfies FR-009's "additive, existing consumers unaffected" requirement either way.

**Alternatives considered**: A fully-typed zod schema for `FacetSet` mirroring the TS type exactly — deferred as a nice-to-have for a later increment once more than one facet is baked in; the casing-only first increment does not need it to satisfy any FR.

## R5 — `AdaptationEvidenceProvider` and `caseCounterpart` are distinct, unrelated mechanisms — not touched

**Decision**: `packages/studio/src/adaptation/evidence.ts`'s `AdaptationEvidenceProvider` (spec 038) and `packages/studio/src/survey/charNormUtils.ts`'s `caseCounterpart` (spec 049's interim workaround) are both left exactly as they are.

**Rationale**: `AdaptationEvidenceProvider`'s own code comment says its live implementation "reads the committed facet index" (the full offline JSON) and is "an explicit follow-up feature and deliberately not implemented here" — a heavier, different-purpose seam this spec's own Out-of-scope section already excludes. `caseCounterpart` answers a different question (a per-character case-pair lookup for the marks/diacritic survey questions) than a keyboard-level `casing` facet (cased vs. caseless classification of the whole base) — spec 049's own research.md already documents this as a deliberate, acceptable interim path, not something waiting for 048 to supersede it.

**Alternatives considered**: Refactoring `caseCounterpart` to derive from the new `casing` facet — rejected as unnecessary scope expansion; spec 049 is shipped and closed, and the two mechanisms serve different granularities (whole-keyboard vs. per-character).

## R6 — Issue #1347 confirms the casing-first scoping

**Decision**: Confirmed via `gh issue view 1347`: OPEN, titled "feat(studio): base-keyboard casing facet gate + lowercase-only diacritic questions" — matching the spec's own framing exactly. The diacritic-questions half already shipped as spec 049 (via the interim `caseCounterpart` workaround, R5); the casing-*gate* half — and this spec's general facet-baking mechanism as infrastructure — remains the open half.

**Rationale**: Confirms scoping the first implementation increment to `casing` only (per FR-002's "at minimum... starting with casing" and the spec's own Assumptions "incremental, remaining facets as consumers need them") is the correct, evidence-grounded scope — not an arbitrary narrowing.
