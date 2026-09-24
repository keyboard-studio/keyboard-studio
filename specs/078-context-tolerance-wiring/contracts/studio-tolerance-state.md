# Contract: studio tolerance state, analysis task and apply effect

## Flag

`flags/contextToleranceFlag.ts` exports `isContextToleranceEnabled()`, which
reads `VITE_KM_CONTEXT_TOLERANCE`. It follows the `mutateFlag.ts` pattern.

- **Off:** no analysis runs, no station renders and no notice appears.
- **Retiring the flag:** it is removed only after the corpus harness reports
  zero `regressed` in CI (FR-011).

## Analysis task (`useKeyboardArtifact`)

The hook gains the option `analyseContextTolerance?: boolean`. Only StudioShell
passes `true`.

1. After `setStage({ kind: "ready", ... })`, capture `const id = runId.current`,
   then set the slice to `{status: "analysing", runId: id}`.
2. Lazy-load the engine through `lib/contextToleranceEngine.ts`, then call
   `computeContextTolerance(workingIr)`.
3. After **each** await, return immediately if `id !== runId.current`.
4. Call `lintContextTolerance(ir, report)` from keyboard-lint to get
   `findings: LintFinding[]`.
5. Compute `fixableRuleIds` (gap findings minus FR-010 refusals) and
   `fingerprint`, then set the slice to `ready`.
6. Any throw sets the slice to `failed` with the error text. It is never
   rendered as clean.

The task is **never** awaited by the compile gate's `Promise.all`, and it adds
no timer (D3).

## keyboard-lint narrow entry

```ts
export function lintContextTolerance(ir: KeyboardIR, report: ToleranceReport): LintFinding[];
```

This is a thin wrapper over `checkContextTolerance`. keyboard-lint still takes
no engine import (depcruise unchanged).

## Notice (`lint/ContextToleranceNotice.tsx`)

The notice renders in StudioShell's existing `role="status" aria-live="polite"`
region, next to `LintSummary`. That keeps it on the same live region, with no
new announcer (FR-014).

What it shows:

- **Collapsed:** one advisory line counting the affected rules, keyed by
  `KM_WARN_CONTEXT_NOT_TOLERANT`.
- **Expanded:** each rule, with one keystroke case in plain words. Each
  character appears as `U+XXXX NAME` via `loadCharNames()`. When no name is
  available it falls back to `codepointLabel`.
- **Separately:** a could-not-check notice (`KM_HINT_CONTEXT_NOT_ANALYSED`, or
  the `failed` state), giving the count and the reasons.

Constraints:

- **No blocking.** It adds no C4 shippability entry, so it cannot block download
  or submission (FR-002).
- **Strings.** Every string is Lingui-wrapped under `lint.contextTolerance.*`.
  Normalization vocabulary appears only with a gloss (FR-013).

## Apply effect (`hooks/useContextToleranceApply.ts`)

**Trigger:** `phaseResults.marksContextTolerance` changes, where the decision is
`accept` or `partial` and `appliedFingerprint !== fingerprint`.

1. Recompute `computeContextTolerance`, then `proposeContextVariants`, on the
   **current** working IR.
2. `accepted = decision.acceptedSiteIds ∩ current fixable ids whose per-rule
   fingerprint matches`. Record any dropped ids as stale for the notice.
3. Build a `TransformProposal`, with sites `accepted` or `declined`. Call
   `applyFacetTransform(ir, proposal, { ruleOverride:
   createContextToleranceMigrationRule(result, "echo") })`.
4. If the result is not `committed`, surface the refusal reason in the notice.
   The IR stays unchanged.
5. Otherwise, set `patch` to the changed top-level keys of the verified IR,
   then call `applyMutatePatch(base, patch, CONTEXT_TOLERANCE_WRITES)` and
   `setWorkingIR`.
6. Write `appliedFingerprint` back into the phase result. That write is
   idempotent.

`CONTEXT_TOLERANCE_WRITES: readonly IRPath[]` lives in `steps/` and is spread
into the `marks` manifest entry's `writes`. A containment violation throws,
which is the seam's own behaviour.

## `useFacetTransform` change

`commit(proposal, options?: { ruleOverride?: MigrationRule })` forwards
`ruleOverride` to `applyFacetTransform`. The effect is the hook's first
production caller.
