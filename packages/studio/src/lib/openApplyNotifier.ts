// openApplyNotifier -- how a code path with no UI of its own (the reducer's and
// the gallery host's patch sink) hands an opened keyboard's change that could
// NOT be written silently to the author (spec 111 FR-041).
//
// `OpenApplyHost` owns the consent dialog and the outcome notices. It registers
// here while mounted; a sink that gets `needs-consent` or `failed` from the
// apply seam calls `handOverToOpenApplyHost(change)`. The host applies the
// change through its normal `applyOnOpen` (consent dialog, then write; or the
// "could not be applied" notice), one at a time in the order handed over. No
// timers: the chain is a promise chain.

import type { OpenApplyOptions, OpenApplyResult, OpenChange } from "./openApply/types.ts";

/**
 * A change handed to the host. `build` makes the change from the CURRENT working
 * copy when it is its turn to be applied (not when it was handed over), so a
 * change queued behind another one never diffs against an older IR and reverts
 * the one applied meanwhile; null means it no longer applies. `onNotApplied`
 * runs when the author declines or the apply fails, so the decision record can
 * be put back to match the files.
 */
export interface HandOver {
  build: () => OpenChange | null;
  onNotApplied: () => void;
}

type Notifier = (item: HandOver) => void;

let notifier: Notifier | null = null;

/** Register (or clear, with null) the host's hand-over entry point. */
export function setOpenApplyNotifier(next: Notifier | null): void {
  notifier = next;
}

/**
 * Give the host a change that was not written. Returns false when no host is
 * mounted (a headless run): the caller then reports it itself, never drops it.
 */
export function handOverToOpenApplyHost(item: HandOver): boolean {
  if (notifier === null) return false;
  notifier(item);
  return true;
}

// The apply seam itself is reached through a registration, not an import: the
// patch sink is imported by the marks value module, which `openApply` depends
// on, so a direct import would close a cycle. `openApply.ts` registers itself
// when it loads (every Open surface and the host import it).
type Applier = (change: OpenChange, opts?: OpenApplyOptions) => OpenApplyResult;
let applier: Applier | null = null;

export function setOpenChangeApplier(next: Applier): void {
  applier = next;
}

/** Apply a change through the seam; a failed result when the seam is not loaded (never a silent no-op). */
export function applyThroughOpenSeam(change: OpenChange, opts?: OpenApplyOptions): OpenApplyResult {
  if (applier === null) return { status: "failed", reason: "The apply seam is not loaded." };
  return applier(change, opts);
}
