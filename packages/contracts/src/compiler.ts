// see spec.md section 4 / section 8 step 11 — compiler service (kmcmplib WASM)

import type { VirtualFS } from "./virtualFS";
import type { CompileResult } from "./compileResult";

/**
 * Thrown by {@link CompilerService.init} (and propagated through the first
 * {@link CompilerService.compile} call) when the WASM binary cannot be
 * fetched or instantiated. UI consumers should catch this and surface a
 * "compiler unavailable, please reload" message; `cause` carries the
 * underlying network / WebAssembly.instantiate error.
 *
 * @see spec.md §4
 * @see #95
 */
export class CompilerLoadError extends Error {
  override readonly name = "CompilerLoadError";
  /** Underlying fetch / WebAssembly.instantiate error, if any. */
  override readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    // Preserve the prototype chain so `instanceof CompilerLoadError` works
    // across the ES2022 / class-fields downlevel target.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Service contract for the in-browser WASM compiler (kmcmplib).
 *
 * The compiler is loaded once at startup and kept warm; subsequent calls
 * target a 100–300 ms wall-clock compile time (see {@link CompileResult.compileMs}
 * filtered on `isWarmCompile === true`). The live-preview pane debounces all
 * edit events to a single 300 ms timer before calling `compile()`
 * (Decision 3, §14); this service does NOT debounce internally — the caller is
 * responsible.
 *
 * Use {@link init} at app startup to begin WASM fetch + instantiate BEFORE
 * the user types anything; the first {@link compile} would otherwise pay the
 * cold-start cost (1-3 seconds) and blow past the 300 ms debounce target.
 *
 * `compile()` operates on the virtual FS rather than raw source so that
 * multi-file keyboards (`.kmn` + `.keyman-touch-layout` + `.kvks`) are
 * compiled in one consistent snapshot.
 *
 * @see spec.md §4 (compiler service entry)
 * @see spec.md §8 step 11 (live preview debounce)
 */
export interface CompilerService {
  /**
   * Begin loading the kmcmplib WASM binary. Idempotent; safe to call
   * multiple times. Returns the same promise across concurrent / repeat
   * calls until the load completes (success or failure).
   *
   * Studios should call this on app startup so the binary is warm by the
   * time the user produces the first edit.
   *
   * @returns A promise that resolves when the binary is loaded and ready
   *   for `compile()` calls.
   * @throws {@link CompilerLoadError} on fetch / instantiate failure.
   *   `err.cause` carries the underlying network / WebAssembly error.
   * @see spec.md §4
   */
  init(): Promise<void>;

  /**
   * Synchronous "is the WASM binary loaded?" check. Returns `true` after
   * a successful {@link init}; `false` before `init` is called, while it
   * is in-flight, or after a failed load.
   *
   * Used by the live-preview pane to decide whether to show a
   * "loading compiler…" spinner while `init()` is in flight.
   */
  isReady(): boolean;

  /**
   * Compile the keyboard identified by `keyboardId` from the given virtual FS
   * snapshot using the kmcmplib WASM binary.
   *
   * If {@link init} has not yet completed, this method will await it
   * internally — but the resulting `CompileResult` will have
   * `isWarmCompile: false` and `compileMs` including the cold-start cost.
   * Callers that care about hitting the 300 ms target should invoke
   * `init()` at startup and wait for `isReady()` before calling `compile()`.
   *
   * Produces `.kmx`, `.kvk`, and `.js` artifacts as URLs (see
   * `CompileArtifact.url` — browser blob URLs or Node file:// / data: URIs
   * depending on the host environment). Diagnostics in the result are
   * {@link CompilerDiagnostic} (Layer A only) and supersede any conflicting
   * TS-check findings for the same location (Decision 3, §14).
   *
   * This method MUST NOT mutate the provided `VirtualFS`; it reads only.
   *
   * @param fs - Current virtual FS snapshot; must contain at minimum
   *   `source/<keyboardId>.kmn`.
   * @param keyboardId - snake_case identifier matching the `.kmn` filename
   *   stem (e.g. "basic_kbdus").
   * @returns CompileResult including success flag, artifact URLs, Layer A
   *   diagnostics, wall-clock compile time, and a `isWarmCompile` discriminator.
   * @throws {@link CompilerLoadError} if `init()` has never been called and
   *   the implicit on-demand load fails.
   * @see spec.md §4
   * @see spec.md §8 step 11
   */
  compile(fs: VirtualFS, keyboardId: string): Promise<CompileResult>;
}
