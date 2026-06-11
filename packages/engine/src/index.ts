// Engine package — implementation in issues #14–#19, #64.
// Issue #16 lands the kmcmplib WASM oracle wrapper.

export { runLexicalChecks, runSemanticChecks, runAllChecks } from "./validator/index.js";

// Issue #20 — base-browser GitHub API client.
export { createBaseBrowser } from "./base-browser/index.js";
export type { BaseBrowserConfig } from "./base-browser/index.js";

// Issue #16 — WASM oracle public surface.
export {
  validateWithOracle,
  oracle,
  _createOracle,
} from "./validator/oracle.js";
export { OracleLoadError } from "./validator/OracleLoadError.js";
export type { OracleLoadReason } from "./validator/OracleLoadError.js";
export type {
  GroupName,
  LintOptions,
} from "./validator/types.js";
export { ALL_GROUPS, TS_GROUPS, WASM_GROUPS } from "./validator/types.js";
export type {
  WasmOracleHandle,
  RawWasmFinding,
} from "./validator/wasmLoader.js";
export { loadWasmOracle } from "./validator/wasmLoader.js";
export { CODE_MAP, translatePassthrough, translateWasmFinding } from "./validator/codeMap.js";
export type { CodeMapEntry } from "./validator/codeMap.js";

// Issue #17 — Compiler service public surface (in-browser kmcmplib WASM).
export { compile, init, isReady, compilerService } from "./compiler/index.js";
export { parseKmnHeaderStores } from "./compiler/parseKmnHeaderStores.js";
export type { KmnHeaderStore } from "./compiler/parseKmnHeaderStores.js";
export { parseKpjFlags } from "./compiler/parseKpjFlags.js";
export type { CompilerOptions } from "./compiler/parseKpjFlags.js";

// Issue #39 — release-tree source loader (proxy + VFS hydration).
export { fetchKeyboardSourceToVfs } from "./loader/fetchKeyboardSourceToVfs.js";
export type {
  FetchFn,
  FetchKeyboardSourceOptions,
  FetchKeyboardSourceResult,
} from "./loader/fetchKeyboardSourceToVfs.js";

// Issues #46/#47 — output service (zip download + GitHub OAuth fork+PR).
export { createOutputService, toZip, serializeToZip } from "./output/index.js";

// Issue #233 — KeyboardIR codec public surface.
export { parse as parseKmn, emit as emitKmn, parseKvks, parseTouchLayout, OPAQUE_REASONS } from "./codec/index.js";
export type { ParseResult, OpaqueReason } from "./codec/index.js";

// Issue #239 — .kmn.imported sidecar + import-attribution.
export { addSidecar, isSidecarPath, buildImportAttributionBlock } from "./output/index.js";
export type { ImportAttributionInput } from "./output/index.js";

// Issue #234 — pattern recognizer public surface.
export { recognizePatterns } from "./recognizer/index.js";
export type { RecognizerRule, MatchResult, RecognizeResult } from "./recognizer/index.js";

// Issue #19 — scaffolder (template-cleanup pipeline).
export { createScaffolderService, scaffoldIR } from "./scaffolder/index.js";
export type { ScaffolderServiceOptions } from "./scaffolder/index.js";

// Issue #21 — Pattern-library loader.
export { loadPatterns, getPatterns, getById } from "./pattern-library/index.js";
export type { PatternFilter, LoadReport } from "./pattern-library/index.js";

// Issue #141 — character discovery service (Phase B).
// Public surface: factory + injectable types only.
// Internal helpers (buildLinguistPrompt, parseLinguistJson, cldrCrossCheck,
// parseUnicodeSet, loadExemplars, SCRIPT_BLOCKS) are NOT re-exported here;
// tests import them directly from the module file.
export { createCharacterDiscoveryService } from "./character-discovery/CharacterDiscoveryServiceImpl.js";
export type { LLMCompleter } from "./character-discovery/CharacterDiscoveryServiceImpl.js";
export type { CldrLoader, ExemplarResult } from "./character-discovery/cldr.js";
export { createFetchCldrLoader } from "./character-discovery/cldr.js";
