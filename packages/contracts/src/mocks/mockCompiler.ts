// see spec.md section 4 / section 8 step 11 — CompilerService mock

import type { CompilerService } from "../compiler";
import type { VirtualFS } from "../virtualFS";
import type { CompileResult } from "../compileResult";
import { mixedDiagnosticsResult } from "../fixtures/index";

// Module-level "warm" flag mirrors what a real impl would track. After
// init() resolves we flip this to true; subsequent compile() calls return
// CompileResult.isWarmCompile = true.
let warm = false;
let initPromise: Promise<void> | null = null;

/**
 * In-memory mock of {@link CompilerService}.
 * Returns fixture data without invoking the real implementation.
 * @see spec.md §4 / §8 step 11
 */
export const mockCompiler: CompilerService = {
  init(): Promise<void> {
    if (initPromise !== null) return initPromise;
    initPromise = Promise.resolve().then(() => {
      warm = true;
    });
    return initPromise;
  },

  isReady(): boolean {
    return warm;
  },

  compile(_fs: VirtualFS, _keyboardId: string): Promise<CompileResult> {
    // Returns the mixed-diagnostics fixture with isWarmCompile reflecting
    // whether init() has resolved. A real implementation would read _fs and
    // invoke the WASM binary, updating `warm` after the first compile.
    return Promise.resolve({
      ...mixedDiagnosticsResult,
      isWarmCompile: warm,
    });
  },
};
