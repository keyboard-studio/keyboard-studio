# Data model: Context tolerance reaches the author

These are the entities from [spec.md § Key Entities](spec.md#key-entities) as the
plan realises them. Every contract addition is **additive and optional**. None
touches `Pattern` (Constitution Art. I). Each one lands in the same commit as its
zod mirror in `packages/contracts/src/schemas.ts`, with a drift guard.

## Tolerance report (existing: `ToleranceReport`, contracts)

This type is unchanged. The report is produced once per compile by
`computeContextTolerance(ir)` ([contracts/engine-context-tolerance-entry.md](contracts/engine-context-tolerance-entry.md)).

| Field | Notes |
|---|---|
| `findings: RuleToleranceFinding[]` | One entry per analysed rule |
| `notAnalysedCount: number` | Opaque `RawKmnFragment` rules |
| `compileDiagnostics?` | Present when the analysis compile failed. The notice renders this as **could not check** (FR-004), never as clean |

**Classification (new engine helper, research D5).**
`classifyToleranceFinding(f)` returns one of:

- `tolerant`
- `made-tolerant`
- `gap`: the status is `not-analysed`, `failingKeystrokes` is set and there is no reason
- `not-analysed`: a reason is present

**Invariant (SC-005).** These must add up exactly:

```
count(tolerant) + count(made-tolerant) + count(gap) + count(not-analysed) + notAnalysedCount
  = total rules
```

## Context tolerance state (new studio store slice, `workingCopyStore.contextTolerance`)

```ts
type ContextToleranceState =
  | { status: "idle" }                         // flag off, or no compile yet
  | { status: "analysing"; runId: number }
  | { status: "ready"; runId: number; report: ToleranceReport;
      findings: LintFinding[];                 // from lintContextTolerance()
      fixableRuleIds: string[]; fingerprint: string }
  | { status: "failed"; runId: number; reason: string }  // rendered as could-not-check
```

- The slice is **not persisted**. It is recomputed on every compile.
- A result is written only when its `runId === runId.current`.

## Tolerance proposal (engine: `ContextVariantsResult` → `TransformProposal`)

This is built in the studio from `proposeContextVariants(ir, report)`.

- Each `AffectedSite` has `siteId = ContextVariant.sourceRuleId` and
  `userDisposition: "pending" | "accepted" | "declined"`. In the station, every
  site starts **accepted** (the §3c pre-fill).
- Each site also carries a **disclosure** (research D9):
  - `shadows: RuleRef[]`: the rules this addition shadows or is shadowed by,
    whether fallback or not.
  - `unobservable?: "mnemonic-backspace"`.
  - `markOrderNote?`: for two-class stacks.
- A rule that FR-010 refuses **never becomes a site**. It stays in the report as
  `not-analysed`, with the refusal reason.

## Tolerance decision (new: `SurveyPhaseResult.marksContextTolerance?`)

```ts
interface MarksContextToleranceDecision {
  decision: "accept" | "partial" | "decline";
  acceptedSiteIds: string[];     // [] for decline; all proposed ids for accept
  proposedSiteIds: string[];     // what the tool offered
  fingerprint: string;           // digest of fixableRuleIds at decision time
  appliedFingerprint?: string;   // set by the apply effect after a successful write
}
```

- This is the step's **only write** (FR-005a). It persists through `phaseResults`,
  which is already in `WorkingCopySnapshot`, so there is no `DRAFT_VERSION` bump.
- When results merge, the last phase that carries it wins. This mirrors
  `marksOutputForm`.

## Decision record entries (contracts: `decisionRecord.ts`)

**Contract additions:**

- `DecisionProposalSource` gains the member `"analysis"`.
- `DecisionProvenance` gains `proposed?: { value: string; siteIds?: string[] }`.
  This is the tool's offer, kept when the author overrides it.

**Entries** (`stepId: "marks"`, payload kind `survey-answer`):

| questionId | answerType | Written when | Provenance |
|---|---|---|---|
| `marks.context_tolerance` | `select` | Always, once the station is decided | `accept` → `tool-proposed` / `source: "analysis"`. `partial` or `decline` → `hand-set` + `proposed: { value: "accept", siteIds }` |
| `marks.context_tolerance.sites` | `text` | `partial` only | Same as above |

- A revisit with an identical value is deduplicated by `decisionLogStore.append`.
- A changed value supersedes the earlier entry.
- `DECISION_RECORD_VERSION` stays at 2 because the reader is tolerant.
- Spec 077 reuses `"analysis"` / `proposed` (see [plan.md § Coordination](plan.md#coordination-with-spec-077)).

## Decision fingerprint

- It is computed as `toleranceFingerprint(ir, ruleIds)`: an FNV-1a 64-bit hex
  digest of each rule's emitted `.kmn` text, taken in rule-id order and joined
  with `\n`.
- It is stable across sessions and reloads.
- The digests are compared when deciding whether to raise the proposal again
  (FR-009) and whether an accepted site has gone stale (the "edits rules after
  accepting" edge case).

## Write-back policy

This is fixed at `"echo"`. The studio always passes `"echo"` to
`createContextToleranceMigrationRule` and never produces
`DiscoveryAxisVector.contextToleranceWriteBack` (Story 4 resolved as echo-only).

## State transitions (station and effect)

```
report not ready ──► station shows "checking…" (author may continue; no decision written)
report ready, 0 fixable ──► station hidden (clean) or could-not-check notice only
report ready, fixable, no prior decision ──► station pre-filled: all sites accepted
prior decision, fingerprint == current ──► station shows prior decision, not re-proposed
prior decision, fingerprint != current ──► station re-proposed (pre-filled again)

decision accept|partial, appliedFingerprint != fingerprint
   ──► effect: recompute → filter stale → verify → applyMutatePatch → set appliedFingerprint
       ──► next compile: report shows accepted rules made-tolerant; unticked stay gap
decision decline ──► no effect; finding remains visible as advisory
```
