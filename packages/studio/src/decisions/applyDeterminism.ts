// applyDeterminism — spec 090 SC-005 / T009: the frozen-stores determinism
// harness every story's apply tests reuse.
//
// A module's `apply` must be a pure function of (value, ctx): same inputs,
// same WorkingCopyPatch, and no store touched. This harness runs an apply
// under conditions that make impurity fail loudly:
//
//   1. The context and value are DEEP-FROZEN clones — an apply that
//      mutates its inputs throws (re-wrapped as ApplyDeterminismError).
//   2. The apply runs more than once on independently built contexts —
//      an apply whose output depends on anything outside (value, ctx)
//      (a store read, a clock, a counter) produces divergent patches.
//   3. A caller-supplied store fingerprint is compared before and after
//      every run — an apply that WRITES a store changes it.
//
// The fingerprint is supplied by the caller because decisions/ may not
// import stores/ (depcruise decisions-layer): a story's test fingerprints
// the stores its apply could plausibly touch (typically a JSON snapshot
// of the decision + working-copy stores' relevant slices). Read-influence
// is covered by (2) whenever the read source can change between runs; a
// read of a store that never changes during the test is indistinguishable
// from a constant — which is why story tests ALSO run their apply through
// the gallery host against the real stores (the host tests) rather than
// relying on this harness alone.

import type { ApplyContext, WorkingCopyPatch } from "../survey/types.ts";

/** An apply failed the determinism checks; the message names which one. */
export class ApplyDeterminismError extends Error {
  constructor(message: string) {
    super(`applyDeterminism: ${message}`);
    this.name = "ApplyDeterminismError";
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Canonical string form (sorted keys) so patch equality is order-free. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export interface ApplyDeterminismOptions<V> {
  /** The apply under test (a module's `apply`). */
  apply: (value: V | undefined, ctx: ApplyContext) => WorkingCopyPatch;
  /** The decision value to apply. */
  value: V | undefined;
  /** Build a FRESH context per run (called once per run). */
  makeContext: () => ApplyContext;
  /**
   * Fingerprint of the stores the apply could touch, compared before and
   * after every run. Omit only when the apply's module cannot reach any
   * store by construction (the double-run + freeze checks still apply).
   */
  fingerprintStores?: () => string;
  /** How many times to run the apply (default 2). */
  runs?: number;
}

/**
 * Run an apply under the determinism checks and return its patch. Throws
 * ApplyDeterminismError on the first failed check.
 */
export function runApplyDeterministically<V>(opts: ApplyDeterminismOptions<V>): WorkingCopyPatch {
  const runs = opts.runs ?? 2;
  if (runs < 1) throw new ApplyDeterminismError("runs must be >= 1");
  let firstPatch: WorkingCopyPatch | undefined;
  let firstCanonical: string | undefined;
  for (let run = 0; run < runs; run++) {
    const before = opts.fingerprintStores?.();
    const ctx = deepFreeze(structuredClone(opts.makeContext()));
    const value = deepFreeze(structuredClone(opts.value));
    let patch: WorkingCopyPatch;
    try {
      patch = opts.apply(value, ctx);
    } catch (err) {
      if (err instanceof TypeError) {
        throw new ApplyDeterminismError(
          `apply threw ${err.message} on run ${run + 1} — it likely mutated its frozen context or value`,
        );
      }
      throw err;
    }
    const after = opts.fingerprintStores?.();
    if (before !== after) {
      throw new ApplyDeterminismError(
        `store fingerprint changed during run ${run + 1} — the apply wrote to a store`,
      );
    }
    const patchCanonical = canonical(patch);
    if (firstCanonical === undefined) {
      firstPatch = patch;
      firstCanonical = patchCanonical;
    } else if (patchCanonical !== firstCanonical) {
      throw new ApplyDeterminismError(
        `apply returned different patches across runs (run 1 vs run ${run + 1}) — ` +
          `its output depends on something outside (value, ctx)`,
      );
    }
  }
  return firstPatch as WorkingCopyPatch;
}
