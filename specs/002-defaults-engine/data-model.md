# Phase 1 Data Model: Defaults engine

New and touched types. **All additions are additive and optional** — no `Pattern`/`Criterion`/`PatternQuestion` change (Article I). Each new contract type lands with its zod mirror in `packages/contracts/src/schemas.ts` in the **same commit** (compile-time drift guard).

## New contract types (`@keyboard-studio/contracts`)

### `ProvenanceLabel` (`src/defaultProposal.ts`)

The source of a proposal, shown to the author. Closed enum + rationale + optional confidence (mirrors `PlacementCandidate`).

| Field | Type | Notes |
|---|---|---|
| `source` | `"base" \| "corpus" \| "axis-fill" \| "cldr" \| "langtags" \| "authenticated-identity" \| "region" \| "derived-from-axis" \| "hinted-prompt"` | Maps the spec's "Provenance label" Key Entity; `hinted-prompt` is the FR-012 no-default case. |
| `rationale` | `string` | Human-readable ("N existing keyboards place this here"; "langtags localname"). |
| `confidence` | `number?` | 0–1, when the source provides it (corpus/derived). Optional. |

**Validation**: `source` ∈ enum; `confidence` ∈ [0,1] when present. FR-010 / SC-003: every emitted proposal MUST carry a `ProvenanceLabel`.

### `DefaultProposal` (`src/defaultProposal.ts`)

A proposed value for one decision point.

| Field | Type | Notes |
|---|---|---|
| `questionId` | `string` | The survey/flow question the proposal seeds. |
| `value` | `string \| string[] \| null` | Proposed value; `null` ⇒ no derivable value (paired with a `NoDefaultDecision`). |
| `provenance` | `ProvenanceLabel` | Required (FR-010). |
| `overridable` | `boolean` | Always `true` in v1 (FR-010 "override in place"); field present for forward-compat. |
| `alternatives` | `DefaultProposal[]?` | Lower-ranked alternatives shown but not selected (conflicting-source edge case). |

**State**: a proposal is *seeded* (value enters the field) → *confirmed* (author leaves it) or *overridden* (author edits). The "Default once, then user owns it" semantics are enforced by the existing `getSeedValue` contract; this type only describes the proposal, not the field's mutable state.

### `NoDefaultDecision` (`src/defaultProposal.ts`)

Explicit record that a decision point has no derivable default (FR-012).

| Field | Type | Notes |
|---|---|---|
| `questionId` | `string` | |
| `reason` | `string` | Why no source attested one (e.g. "no langtags/CLDR autonym"). |
| `hintedPrompt` | `string` | The hint shown in place of a blank field. |

**Invariant**: a decision point is in exactly one of {`DefaultProposal` with non-null value, `NoDefaultDecision`}. A blank with neither, where a source existed, is the FR-013 defect.

### `AxisFill` (`src/axisFills.ts`)

Per-axis origin record (FR-011 / SC-005).

| Field | Type | Notes |
|---|---|---|
| `axis` | `keyof DiscoveryAxisVector` | A1–A7 (+ sub-axes). |
| `value` | `string \| boolean` | The filled value (matches the axis's own type). |
| `origin` | `"ir-derived" \| "structural-prior" \| "survey-answer" \| "proposer"` | How it was filled. |
| `provenance` | `ProvenanceLabel?` | Present when `origin` is `structural-prior`/`proposer`. |

## Touched contract types

### `SurveyPhaseResult` (`src/surveyPhaseResult.ts`) — ADDITIVE

Add one optional field; everything else unchanged (no rename/removal):

```
axisFills?: AxisFill[];   // origin of each axis this phase filled (FR-011)
```

`mergePhaseResults()` (`src/surveySession.ts`) gains last-wins merge of `axisFills` into a new optional `SurveySession.axisFills?: AxisFill[]`, mirroring how `computedAxes` already merges. No signature change to `mergePhaseResults` (it already walks `phaseResults`).

## Reused types (no change)

| Type / function | Package | Role in this feature |
|---|---|---|
| `DiscoveryAxisVector`, `Scale`, `ScriptClass`, … | contracts `axes.ts` | Proposer reads; `AxisFill.axis` keys it. **Locked — not modified.** |
| `MechanismAssignment` (`source: "discus-suggested" \| "user"`) | contracts `assignmentMap.ts` | Proposed assignments tagged `discus-suggested`; help table reads via `effectiveMechanisms()`. Already supports the proposer. |
| `PlacementCandidate` (`priorSource`, `confidence`) | contracts `placementMap.ts` | Provenance model precedent; placement proposals already use it. |
| `KeyboardProvenance` (`localizedName`, representative) | contracts | Copyright *you*-branch fallback; autonym secondary. |
| `ScaffoldIRIdentity`, `resetIdentity`, `sanitizeDisplayName` | engine `scaffolder/` | Display-name proposal applied here; proposer supplies the value. |
| `deriveScriptPrefill`, `scriptClassOf`, `routingGroupOf` | studio `lib/scriptAxes.ts` | Phase C′ reorder proposer reuse. |
| `loadExemplars`, `CldrLoader` | engine `character-discovery/cldr.ts` | Autonym CLDR fallback; inventory anchor. |
| `producedGlyphs` | engine `inventory/` | Help-table coverage; advisory signals. |
| `getSeedValue` | studio `survey/SurveyRunner.tsx` | The proposal value channel ("default once, then user owns it"). |
| `LintFinding`, `LintChip` | studio `lint/` | Provenance chip rendering + FR-013 warning-band audit findings. |

## Proposer context (engine-internal, not a contract)

`ProposerContext` (`engine/src/proposers/context.ts`) is assembled from the working copy for each phase:

| Field | Source |
|---|---|
| `ir` | `workingCopyStore.ir` |
| `identity` / `bcp47` | `identityPatch` + resolved tag |
| `producedGlyphs` | `producedGlyphs(ir)` |
| `assignments` | `surveyResults.assignments` |
| `axes` | `surveyResults.axes` (merged) |
| `inventory` | `surveyResults.confirmedInventory` |
| `authIdentity` | GitHub OAuth display name (GitHub path only; `undefined` on ZIP) |
| `langtags` | new langtags loader result for `bcp47` |

## Entity relationships

```
SurveySession
 ├─ phaseResults: SurveyPhaseResult[]
 │    ├─ computedAxes?: Partial<DiscoveryAxisVector>   (existing)
 │    ├─ axisFills?: AxisFill[]                        (NEW, additive)
 │    │    └─ provenance?: ProvenanceLabel
 │    └─ assignments?: MechanismAssignment[]           (existing; source="discus-suggested")
 ├─ axes / axisFills (merged, last-wins)               (axisFills NEW)
 └─ confirmedInventory

DefaultProposal ──(per questionId, runtime, not persisted on the session)── ProvenanceLabel
NoDefaultDecision ──(FR-012, runtime)── hintedPrompt
```

`DefaultProposal` / `NoDefaultDecision` are **runtime** proposer outputs consumed by the studio's seed/provenance adapter; they are not persisted onto the locked `SurveySession` (only `axisFills` is, because FR-011/SC-005 require it to be recoverable from a completed survey).
