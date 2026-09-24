// Lazy handle on `@keyboard-studio/engine/context-tolerance` (spec 078).
//
// The analysis compiles and simulates, so its subpath carries the simulator
// and the Unicode-name table. It is imported on first use, after a preview
// compile reaches `ready`, never in the initial bundle. Follows the
// langtagsDefaults.ts memo: one load per session, and only a successful load
// is cached so a failed chunk fetch can be retried.

export type ContextToleranceEngine = typeof import("@keyboard-studio/engine/context-tolerance");

let _modulePromise: Promise<ContextToleranceEngine> | null = null;

/** Load (once) and return the context-tolerance engine subpath. */
export function loadContextToleranceEngine(): Promise<ContextToleranceEngine> {
  if (_modulePromise === null) {
    _modulePromise = import("@keyboard-studio/engine/context-tolerance").catch((err: unknown) => {
      _modulePromise = null;
      throw err;
    });
  }
  return _modulePromise;
}
