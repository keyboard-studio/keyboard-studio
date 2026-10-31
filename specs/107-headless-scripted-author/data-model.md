# Data model: Headless scripted author (spec 107)

All types are **test-only** (`packages/studio/src/test/headlessAuthor/caseTypes.ts`). None enters
`@keyboard-studio/contracts`; no `Pattern` field changes (Art. I).

## Case

One row in the `harness/cases.json` shape, plus the copied keyboard's group and track (FR-001).

| Field | Type | Rule |
|---|---|---|
| `id` | string | unique within a case file; used in report keys |
| `base` | string | corpus keyboard id |
| `group` | string | corpus directory under `release/` |
| `track` | `"copy"` \| `"adapt"` | as in `DecisionPointBase.track` |
| `english`, `autonym`, `code` | string | identity; `code` is BCP 47 |
| `script?` | string | ISO 15924; absent in the harness file, then taken from the identity step's prefill |
| `profile`, `lang` | number, string | harness bookkeeping fields, carried through to the report |
| `inputOrder` | string | marks profile |
| `outputForm` | string | marks profile |
| `backspace` | string | marks profile |
| `backspaceOnDiagonal` | boolean | marks profile |
| `sampleText` | string | used by the text-sample step |
| `overrides` | `Override[]` | may be empty |

**Override**: `{ kind: "overwrite"; char: string; key: string }` (the harness's
`overwriteChar`/`overwriteKey`). Further kinds are added with the same precedence (spec Assumptions).

Validation: unknown fields fail the load (so a harness schema change is noticed); `base` must pass
eligibility (R6) or the case is skipped with a named reason.

## PrSetEntry

`prSet.json` is an array of `{ caseId?: string; case?: Case; shape: Shape[]; reason: string; guards?: string }`,
with exactly one of `caseId` (a case in the canonical `cases/harness-cases.json`, FR-035) or `case`
(inline, only for keyboards outside the harness set).

- `shape` ⊆ `simple`, `deadkey-heavy`, `touch-layout`, `any-index`, `readonly-group`, `opaque-group`,
  `mixed-case-group`, `non-latin`, `regression-guard`.
- `guards` names the repaired defect (commit or PR) for `regression-guard` entries.
- Invariant (tested): the union of `shape` across entries covers every shape FR-031 names; the set has
  at most 6 entries unless the plan's budget (R1) is re-measured.

## Walk policy

Ordered rule applied per decision (FR-003): `override` → `top-suggestion` → `default` → `placeholder`.
Each applied decision yields a `PolicyStep = { decisionId; rule; value; proposalSource? }`.

**Placeholder**: `"zzq" + lowercase hex code points` with indicator `j`. Clash (sequence already in the
copied keyboard) → the case fails with `placeholder-clash` (spec Edge Cases).

## Author run (result of `runAuthorCase`)

| Field | Type |
|---|---|
| `caseId` | string |
| `outcome` | `"completed"` \| `"skipped"` \| `"failed"` |
| `skipReason?` | `"missing"` \| `"not-codec-clean"` \| `"unsupported-script-stub"` \| `"outside-slice"` \| `"too-large"` (sweep tiers only) |
| `failure?` | `{ step: string; decisionId?: string; kind: "proposal-threw" \| "placeholder-clash" \| "network-required" \| "scaffold-failed" \| "compile-failed"; detail: string }` |
| `record` | the 053 decision record (passes `parseDecisionRecord`) |
| `decisions` | the 088 DecisionSet |
| `bundle` | the output bundle from `buildOutputBundle` |
| `gates` | `GateResult[]` from `checkConsistencyGates`; G6 is `not-applicable` without a touch layout |
| `report` | `RunReport` |

## RunReport

| Field | Content |
|---|---|
| `steps` | `PolicyStep[]` in walk order |
| `placeholders` | `{ char; sequence; decisionId }[]` |
| `displacements` | `{ char; key; displaced; action: "confirm-move" \| "keep-both" \| "leave" }[]` |
| `skippedSteps` | `{ step; reason }[]` (steps the product auto-completed) |
| `knownGaps` | `{ gate; owner }[]` matched from spec 106's `KNOWN_GAPS` |
| `fallbackPolicy` | the store default used (FR-060; removed once #2366 lands) |
| `timingMs` | `{ author; replay }` (feeds SC-001/SC-002 evidence) |

## Parity allow-list entry

`{ caseId; decisionId; reason; explainedBy: string /* commit, PR or "record-age:<build>" */ }`.
A run reports entries whose difference no longer occurs as `stale` (FR-022). Records are never edited.

## Sweep summary

`{ tier; shard?; cases: { completed; skipped; failed }; byGate: Record<GateId, caseId[]>;
byFirstFailingStep: Record<string, caseId[]>; skips: Record<SkipReason, caseId[]> }`.

## Provenance mapping (088 ↔ 053)

Art. III requires stating how the two vocabularies map. The author does not choose provenance; it
calls the UI's store actions, which do. The table is what those actions produce for each walk-policy
rule, and what parity checks the record against.

| Walk-policy rule | 088 `DecisionProvenance` (decisions/decisionTypes.ts:169) | 053 `DecisionProvenance` (contracts/src/decisionRecord.ts:81) |
|---|---|---|
| top suggestion accepted unchanged | `asked` | `agency: "tool-proposed"`, `source` = the proposal's source (`langtags`, `cldr`, `analysis`, ...) |
| default left untouched (e.g. carve's untouched suggestion, carveAdapter.tsx:45) | `default` | `agency: "tool-proposed"`, no `source` |
| base-derived value confirmed | `asked` (was `extracted` until confirmed) | `agency: "base-derived"` |
| override from the case | `asked` | `agency: "hand-set"`, `proposed` = the suggestion it replaced, if any |
| placeholder | `asked` | `agency: "hand-set"` |
| value the product derived itself, no step shown | `derived` | not recorded as a survey answer |

`recordToDecisionSet` folds every recorded decision to `asked` (test/recordToDecisionSet.ts:57), so
DecisionSet parity compares values; the agency column is compared against the record directly.

## State transitions (one case)

`loaded` → `eligible` | `skipped(reason)` → `walking(step)` → (`failed(kind)` | `walked`) →
`replayed` → `gated` → `reported`.
