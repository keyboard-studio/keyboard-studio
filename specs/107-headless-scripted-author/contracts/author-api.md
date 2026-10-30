# Contract: author API (test-only)

Module: `packages/studio/src/test/headlessAuthor/runAuthorCase.ts`. Not exported from the studio
package; consumed by the 107 test files only.

```ts
export interface AuthorRunOptions {
  /** Absolute path of the keyboards corpus root (`.../keyboards/release`). Defaults to the sc004Harness CORPUS. */
  corpusRoot?: string;
  /** Eligibility slice for sweeps. Default: no slice filter (US1). */
  slice?: "all-eligible" | "latin" | { ids: readonly string[] };
  /** Stop after this decision point (for parity against partial records). Default: run every step. */
  stopAfter?: DecisionPoint;
}

export function runAuthorCase(c: Case, opts?: AuthorRunOptions): Promise<AuthorRun>;
```

Guarantees:

1. **Product functions only** (FR-010): every suggestion and default comes from a function listed in
   `driftGuard.ts`; the drift-guard test fails if one is renamed, removed or no longer called by its
   production caller (research R2).
2. **Store actions only** (FR-004): decisions are written through the actions the UI uses; no direct
   `setState` on a decision store.
3. **One projection** (FR-005): hand-off is `buildDecisionPointFixture`'s path
   (`rebuildWorkingCopyFromStores` → `buildOutputBundle` → compile → `checkConsistencyGates`).
4. **Isolation**: the function resets every studio store it touches before and after the case, so
   cases in one vitest process do not leak state (required for the one-invocation PR lane, R1).
5. **No I/O beyond the corpus and pinned data** (FR-008): a proposal that would fetch over the
   network fails the case with `network-required`.
6. **Skips are named**: `outcome: "skipped"` always carries `skipReason`; a case that passed
   eligibility and then fails is `failed`, never `skipped` (research R6).
7. **Proposal throws fail the case** at that step and decision id; no default is substituted.

```ts
export function compareParity(
  run: AuthorRun,
  record: DecisionRecord,
  allow: readonly ParityAllowEntry[],
): { diffs: ParityDiff[]; unexplained: ParityDiff[]; stale: ParityAllowEntry[] };
```

`ParityDiff = { decisionId; author: unknown; recorded: unknown; normalisedBy?: string }`. Normalisation
rules are named (research R8).
