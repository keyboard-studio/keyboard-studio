# Contract: author API (test-only)

Module: `packages/studio/src/test/headlessAuthor/runAuthorCase.ts`. Not exported from the studio
package; consumed by the 107 test files only.

```ts
export interface AuthorRunOptions {
  /** Eligibility slice for sweeps. Default: no slice filter (US1). */
  slice?: "all-eligible" | "latin" | { ids: readonly string[] };
  /** Stop after this decision point (for parity against partial records). Default: run every step. */
  stopAfter?: DecisionPoint;
  /** Overrides for eligibility's corpus lookups (group, parse status, script, rule count); tests inject a keyboard the corpus lacks. Fields: data-model.md. */
  eligibilityDeps?: EligibilityDeps;
  /** Called as each step starts. Reporting only: drives the sweep's in-progress report and KS_AUTHOR_TRACE. */
  onStep?: (step: string) => void;
}

export function runAuthorCase(c: Case, opts?: AuthorRunOptions): Promise<AuthorRun>;
```

Guarantees:

0. **Bypasses the UI and nothing else** (FR-013, governing). Below the UI, every behaviour is the
   product's own code, called unmodified at the seam the UI calls it from. The module's own code is
   limited to case input, the walk policy's choice, the placeholder text and reporting. It mocks
   nothing (FR-014). It applies each choice through the UI handler's function (FR-015). Product code
   never imports it or branches on it (FR-016). `HA/boundary.test.ts` and the depcruise rule
   `product-not-to-headless-author` enforce this on every PR.
1. **Product functions only** (FR-010): every suggestion and default comes from a function listed in
   `driftGuard.ts`; the drift-guard test fails if one is renamed, removed or no longer called by its
   production caller (research R2).
2. **Store actions only** (FR-004, FR-015): decisions are written through the functions the UI
   handlers call; no direct `setState` on a decision store (the per-case reset is the single
   allow-listed exception, FR-014).
3. **One projection** (FR-005): hand-off is `buildDecisionPointFixture`'s path
   (`rebuildWorkingCopyFromStores` → `buildOutputBundle` → compile → `checkConsistencyGates`).
4. **Isolation**: the function resets every studio store it touches before and after the case, so
   cases in one vitest process do not leak state (required for the one-invocation PR lane, R1).
5. **No I/O beyond the corpus and pinned data** (FR-008): a proposal that would fetch over the
   network fails the case with `network-required`.
6. **Skips are named**: `outcome: "skipped"` always carries `skipReason`; a case that passed
   eligibility and then fails is `failed`, never `skipped` (research R6).
7. **Proposal throws fail the case** at that step and decision id; no default is substituted. A
   proposal the product itself catches is not a throw: the camazerty tolerance analysis publishes
   `status: failed`, the author continues, and G2 fails as an expected, owned gap.

```ts
export function compareParity(
  run: AuthorRun,
  record: DecisionRecord,
  allow: readonly ParityAllowEntry[],
): { diffs: ParityDiff[]; unexplained: ParityDiff[]; stale: ParityAllowEntry[] };
```

`ParityDiff = { decisionId; author: unknown; recorded: unknown; normalisedBy?: string }`. Normalisation
rules are named (research R8). There are four: timestamps dropped; `zzq<hex>` reduced to `zzq`; the
carve fingerprint recomputed on both sides; and tester-typed, where the author's own `PolicyStep` rule
for a decision is `placeholder` and the record's value is compared on presence.

Both sides are folded from their records with `recordToDecisionSet`. The live DecisionSet (`run.decisions`)
is not compared: a decision is recorded when its step completes, and later steps keep seeding the live
draft. An allow-list entry also explains that decision's agency difference (the 053 agency check).
