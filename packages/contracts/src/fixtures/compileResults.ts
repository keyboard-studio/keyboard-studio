// see spec.md section 4 / section 8 step 11 — CompileResult test fixtures

import type { CompileResult } from "../compileResult";
import { validatorFindings } from "./lintFindings";

/**
 * A mixed-diagnostics CompileResult carrying at least one info, one warn,
 * and one error finding — exercises downstream rendering that must handle
 * all three severity bands.
 *
 * The artifacts simulate a successful kmcmplib WASM run for "my_keyboard";
 * URLs are static blob-URL placeholders (real ones would be created via
 * URL.createObjectURL in the browser, or be file:// / data: URIs in Node).
 */
export const mixedDiagnosticsResult: CompileResult = {
  success: false, // false because an error-level finding is present
  artifacts: [
    {
      filename: "my_keyboard.kmx",
      url: "blob:http://localhost/mock-kmx-00000000-0000-0000-0000-000000000001",
      sizeBytes: 2048,
    },
    {
      filename: "my_keyboard.kvk",
      url: "blob:http://localhost/mock-kvk-00000000-0000-0000-0000-000000000002",
      sizeBytes: 512,
    },
    {
      filename: "my_keyboard.js",
      url: "blob:http://localhost/mock-js-00000000-0000-0000-0000-000000000003",
      sizeBytes: 8192,
    },
  ],
  // Reuse the validator findings (layers A + B) which already include
  // error, warn, and hint severities; add an explicit "info" to ensure
  // all four test-required severity bands are present.
  diagnostics: [
    ...validatorFindings,
    {
      code: "KM_INFO_COMPILE_START",
      severity: "info",
      layer: "A",
      message: "Compilation started for keyboard 'my_keyboard'.",
    },
  ],
  warmCompileMs: 142,
};

