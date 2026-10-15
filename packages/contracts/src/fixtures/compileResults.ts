// see spec.md section 4 / section 8 step 11 — CompileResult test fixtures

import type { CompileResult, CompilerDiagnostic } from "../compileResult";
import { makeCompileResult } from "../compileResult";
import { layerAFindings } from "./lintFindings";

// Layer A only — kmcmplib WASM oracle never emits Layer B (style) or
// Layer C (hygiene) findings (#93). Drop the Layer B fixtures the previous
// mixed-diagnostics result was reusing.
const layerAOnly: CompilerDiagnostic[] = layerAFindings.map((f) => ({
  ...f,
  layer: "A" as const,
}));

/**
 * Recoverable-error fixture (`success: false` + non-empty artifacts).
 *
 * Carries error + warning + info severities — exercises downstream
 * rendering that must handle every band the compiler can emit. The error
 * is a duplicate-store finding (Layer A check #3) that kmcmplib treats as
 * recoverable: it strips the offending rules and emits partial artifacts.
 * The live-preview pane MAY load them for best-effort rendering.
 *
 * URLs are static blob-URL placeholders (real ones would be created via
 * URL.createObjectURL in the browser, or be file:// / data: URIs in Node).
 */
export const mixedDiagnosticsResult: CompileResult = makeCompileResult({
  success: false,
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
  // Layer A diagnostics + one upstream-style hint. Previous fixture used a
  // synthetic "KM_INFO_COMPILE_START" progress event with `severity: "info"`
  // — but kmcmplib never emits progress events, and `info` is studio-only
  // (Layer C). Replaced with a real-shape hint (KM_HINT_INDEX_STORE_LONG)
  // modeled on the upstream `HINT_IndexStoreLong` event class. See #96.
  diagnostics: [
    ...layerAOnly,
    {
      code: "KM_HINT_INDEX_STORE_LONG",
      severity: "hint",
      layer: "A",
      message: "Index store is long; consider splitting for readability.",
      location: { file: "source/my_keyboard.kmn", line: 8 },
    },
  ],
  compileMs: 142,
  isWarmCompile: true,
});
