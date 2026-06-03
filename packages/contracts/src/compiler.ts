// see spec.md section 4 / section 8 step 11 — compiler service (kmcmplib WASM)

import type { VirtualFS } from "./virtualFS";
import type { CompileResult } from "./compileResult";

/**
 * Service contract for the in-browser WASM compiler (kmcmplib).
 *
 * The compiler is loaded once at startup and kept warm; subsequent calls
 * target a 100–300 ms wall-clock compile time (see `CompileResult.warmCompileMs`).
 * The live-preview pane debounces all edit events to a single 300 ms timer
 * before calling `compile()` (Decision 3, §14); this service does NOT
 * debounce internally — the caller is responsible.
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
   * Compile the keyboard identified by `keyboardId` from the given virtual FS
   * snapshot using the kmcmplib WASM binary.
   *
   * Produces `.kmx`, `.kvk`, and `.js` artifacts as URLs (see
   * `CompileArtifact.url` — browser blob URLs or Node file:// / data: URIs
   * depending on the host environment). Diagnostics in the result are Layer A
   * WASM-oracle findings and supersede any conflicting TS-check findings
   * for the same location (Decision 3, §14).
   *
   * This method MUST NOT mutate the provided `VirtualFS`; it reads only.
   *
   * @param fs - Current virtual FS snapshot; must contain at minimum
   *   `source/<keyboardId>.kmn`.
   * @param keyboardId - snake_case identifier matching the `.kmn` filename
   *   stem (e.g. "basic_kbdus").
   * @returns CompileResult including success flag, blob-URL artifacts,
   *   diagnostics, and warm-compile wall-clock time.
   * @see spec.md §4
   * @see spec.md §8 step 11
   */
  compile(fs: VirtualFS, keyboardId: string): Promise<CompileResult>;
}
