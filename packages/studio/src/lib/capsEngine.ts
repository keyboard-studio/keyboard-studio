// Lazy handle on `@keyboard-studio/engine/caps` (spec 112).
//
// The caps comparison compiles and simulates, so its subpath carries the
// simulator. It is imported on first use, when the Open-path fix is built,
// never in the initial bundle. Same memo shape as contextToleranceEngine.ts:
// one load per session, and only a successful load is cached.

export type CapsEngine = typeof import("@keyboard-studio/engine/caps");

let _modulePromise: Promise<CapsEngine> | null = null;

/** Load (once) and return the caps engine subpath. */
export function loadCapsEngine(): Promise<CapsEngine> {
  if (_modulePromise === null) {
    _modulePromise = import("@keyboard-studio/engine/caps").catch((err: unknown) => {
      _modulePromise = null;
      throw err;
    });
  }
  return _modulePromise;
}
