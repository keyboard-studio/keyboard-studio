// Shared KeyboardIR fixtures for studio tests, built on the contracts
// makeTestIR builder. Kept free of store/persistence imports so any suite can
// use it without pulling in module side effects.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, type TestIROptions } from "@keyboard-studio/contracts/fixtures";

/**
 * An empty in-memory IR with keyboard id "test", name "test" and version
 * "10.0": enough to instantiate a working copy. `options` overrides any part,
 * with `header` merged field-by-field.
 *
 * The default origin is "synthesized" — these fixtures are constructed in
 * memory, never parsed (the retired "scaffolded" value was removed from
 * IROrigin by spec 084 Batch 4).
 */
export function makeScaffoldedIR(options: TestIROptions = {}): KeyboardIR {
  return makeTestIR({
    ...options,
    origin: options.origin ?? "synthesized",
    header: { name: "test", version: "10.0", ...options.header },
  });
}
