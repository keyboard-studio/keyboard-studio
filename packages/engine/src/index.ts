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
export { stripDanglingAssetStores } from "./compiler/stripDanglingAssetStores.js";
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
  KpsFontEntry,
  KpsStylesheetEntry,
} from "./loader/fetchKeyboardSourceToVfs.js";

// Issues #46/#47 — output service (zip download + GitHub OAuth fork+PR).
export { createOutputService, toZip, serializeToZip } from "./output/index.js";

// Issue #233 — KeyboardIR codec public surface.
export { parse as parseKmn, emit as emitKmn, parseKvks, parseTouchLayout, emitTouchLayout, OPAQUE_REASONS } from "./codec/index.js";
export type { ParseResult, OpaqueReason } from "./codec/index.js";

// Issue #239 — .kmn.imported sidecar + import-attribution.
export { addSidecar, isSidecarPath, buildImportAttributionBlock } from "./output/index.js";
export type { ImportAttributionInput } from "./output/index.js";

// Track 2 adapt-staging helpers (output-only; not used in the OSK preview path).
export { bumpKeyboardVersion, stageAdaptHistory } from "./output/index.js";

// Issue #183 — headless simulate() API is exposed via the `./simulator`
// subpath export, NOT from this main entry. The vendored Keyman engine
// uses bare import specifiers (e.g. `@keymanapp/common-types`) that resolve
// via tsconfig paths at compile time but cannot be resolved by browser
// bundlers like Vite. Keeping simulator off the main entry prevents the
// browser-targeted SPA from following that import chain.

// Issue #234 — pattern recognizer public surface.
export { recognizePatterns } from "./recognizer/index.js";
export type { RecognizerRule, MatchResult, RecognizeResult } from "./recognizer/index.js";

// Issue #19 — scaffolder (template-cleanup pipeline).
export { createScaffolderService, renameFilesInVfs } from "./scaffolder/index.js";
export { scaffoldIR, resetIdentity } from "./scaffolder/scaffold-ir.js";
export { scaffoldTouchLayout, buildMinimalPhoneTouchLayout } from "./scaffolder/index.js";
export type { ScaffolderServiceOptions } from "./scaffolder/index.js";
export type { ScaffoldIROptions, ScaffoldIRIdentity } from "./scaffolder/scaffold-ir.js";

// Issue #21 — Pattern-library loader.
export { loadPatterns, getPatterns, getById } from "./pattern-library/index.js";
export type { PatternFilter, LoadReport } from "./pattern-library/index.js";

export { filterFor } from "./pattern-library/index.js";

// Strategy selector: §7.2 decision tree.
export { selectStrategy } from "./strategy-selector/index.js";
// §7.2 decision tree as data — drives both selectStrategy and the studio Flow Map.
export {
  PRIMARY_RULES,
  SECONDARY_RULES,
  STRATEGY_LABELS,
} from "./strategy-selector/rules.js";
export type {
  PrimaryRuleDef,
  SecondaryRuleDef,
  SecondaryRuleId,
  ConditionalSecondary,
} from "./strategy-selector/rules.js";

// Issue #248 — Sprint-1 identity stub mutator (deleted at Sprint-2 start per #238).
export { applyIdentityStubMutation } from "./stub-mutator/index.js";

// Issue #141 — character discovery service (Phase B).
// Public surface: factory + injectable types only.
// Internal helpers (buildLinguistPrompt, parseLinguistJson, cldrCrossCheck,
// parseUnicodeSet, loadExemplars, SCRIPT_BLOCKS) are NOT re-exported here;
// tests import them directly from the module file.
export { createCharacterDiscoveryService } from "./character-discovery/CharacterDiscoveryServiceImpl.js";
export type { LLMCompleter } from "./character-discovery/CharacterDiscoveryServiceImpl.js";
export type { CldrLoader, ExemplarResult } from "./character-discovery/cldr.js";
export { createFetchCldrLoader } from "./character-discovery/cldr.js";

// Pattern-apply: slot substitution + MechanismAssignment[] to .kmn injection.
export { substituteSlots, applyAssignments, applyAssignmentsToVfs, applyCarveToVfs, applyKeycapLabelsToVfs, resolveRenderableMechanisms } from "./pattern-apply/index.js";
export type { SubstituteResult, ApplyAssignmentsResult } from "./pattern-apply/index.js";

// Inventory diff (spec §8): static extraction of a keyboard's produced glyph set.
export { producedGlyphs, collectFromOutput } from "./inventory/producedGlyphs.js";
export type { ProducedGlyphsOptions } from "./inventory/producedGlyphs.js";
