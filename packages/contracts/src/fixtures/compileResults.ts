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

/**
 * Clean compile fixture (`success: true` + non-empty artifacts).
 *
 * No error / fatal diagnostics; carries one warning and one hint to
 * exercise renderers that distinguish non-blocking severities. The
 * preview pane loads the artifacts unconditionally.
 */
export const cleanCompileResult: CompileResult = makeCompileResult({
  success: true,
  artifacts: [
    {
      filename: "my_keyboard.kmx",
      url: "blob:http://localhost/mock-kmx-clean-00000000",
      sizeBytes: 1900,
    },
    {
      filename: "my_keyboard.kvk",
      url: "blob:http://localhost/mock-kvk-clean-00000000",
      sizeBytes: 500,
    },
    {
      filename: "my_keyboard.js",
      url: "blob:http://localhost/mock-js-clean-00000000",
      sizeBytes: 8000,
    },
  ],
  diagnostics: [
    {
      code: "KM_HINT_CANONICAL_STORE_ORDER",
      severity: "hint",
      layer: "A",
      message:
        "Stores declared after the first rule group — canonical layout would put them at top of file.",
    },
  ],
  compileMs: 187,
  isWarmCompile: true,
});

/**
 * Parse-fatal fixture (`success: false` + empty artifacts).
 *
 * kmcmplib could not produce any output — typically an unterminated string
 * or syntax error before the first `group(...)` declaration. The live
 * preview pane MUST hide; no partial artifacts to load.
 */
export const parseFatalCompileResult: CompileResult = makeCompileResult({
  success: false,
  artifacts: [],
  diagnostics: [
    {
      code: "KM_FATAL_UNTERMINATED_STRING",
      severity: "fatal",
      layer: "A",
      message: "Unterminated string literal at line 12, column 24.",
      location: { file: "source/my_keyboard.kmn", line: 12, column: 24 },
    },
  ],
  compileMs: 38,
  isWarmCompile: true,
});

/**
 * Cold-start fixture (`isWarmCompile: false`).
 *
 * The first compile() call after page load: `compileMs` includes the
 * 1-3 second WASM fetch + instantiate overhead. Consumers that filter
 * telemetry on the 100-300 ms target from spec §4 must exclude cold-start
 * compiles (`isWarmCompile === false`).
 */
export const coldStartCompileResult: CompileResult = makeCompileResult({
  success: true,
  artifacts: [
    {
      filename: "my_keyboard.kmx",
      url: "blob:http://localhost/mock-kmx-cold-00000000",
      sizeBytes: 1900,
    },
  ],
  diagnostics: [],
  compileMs: 2387,
  isWarmCompile: false,
});

