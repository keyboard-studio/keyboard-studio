// Service container. Config flag: VITE_USE_REAL_ENGINE (default: true).
// Set VITE_USE_REAL_ENGINE=false in .env.local to force mocks (test/CI only).
// Note: mockBaseBrowser / mockOutputService / mockScaffolder imports here are
// intentional — services.ts is the designated service boundary. Vite
// tree-shakes them in real builds. Do NOT add mocks imports elsewhere in
// packages/studio/src/.
import type {
  BaseBrowserService,
  CharacterDiscoveryService,
  OutputService,
  PatternLibraryService,
  ScaffolderService,
  VirtualFS,
  KeyboardIR,
  CompileResult,
} from "@keyboard-studio/contracts";
import type {
  MissingCharSuggestions,
  CharacterMapGroup,
  ExemplarSource,
  SourcedCharacter,
  SourcedInventory,
  ExemplarTier,
  ToZipOptions,
  BuildKmpResult,
  BuildKmpOptions,
  KmpBuildArtifacts,
} from "@keyboard-studio/engine";
import { charactersInTier } from "@keyboard-studio/engine";
import { mockBaseBrowser, mockOutputService, mockPatternLibrary, mockScaffolder } from "@keyboard-studio/contracts/mocks";
import { getBackendUrl } from "./githubOAuth.ts";
import { localBaseBrowser, LOCAL_PROXY_BASE } from "./localBaseBrowser.ts";
import { getPatternLibraryService as getBrowserPatternLibraryService } from "./browserPatternLibrary.ts";

export const USE_REAL = import.meta.env.VITE_USE_REAL_ENGINE !== "false";

// Re-export the proxy base for callers that need it (e.g. scaffolder).
export { LOCAL_PROXY_BASE };

// BaseBrowserService: backed by the build-time/dev-server catalog at
// /local-kbd-api/list. In dev the localKeyboards Vite plugin serves it from
// the sibling keymanapp/keyboards clone; in production the build-keyboards-index
// script materialises dist/local-kbd-api/list at deploy time. Both feed the
// same localBaseBrowser implementation, so this stays synchronous and never
// touches the GitHub API at runtime.
export function getBaseBrowserService(): BaseBrowserService {
  return USE_REAL ? localBaseBrowser : mockBaseBrowser;
}

// ScaffolderService: when USE_REAL is false returns the mock scaffolder so
// CI / test runs never touch WASM. When real, lazily imports from the engine
// (mirrors the loadEngine() lazy-import pattern in useKeyboardArtifact) and
// pins it to /local-kbd-proxy so per-keyboard source fetches go through the
// same Vercel/Vite rewrite as the catalog.
let scaffolderCache: ScaffolderService | null = null;
export async function getScaffolderService(): Promise<ScaffolderService> {
  if (!USE_REAL) return mockScaffolder;
  if (scaffolderCache !== null) return scaffolderCache;
  const { createScaffolderService } = await import(
    /* @vite-ignore */ "@keyboard-studio/engine"
  );
  scaffolderCache = createScaffolderService({ proxyBase: LOCAL_PROXY_BASE });
  return scaffolderCache;
}

// PatternLibraryService: in the browser the BrowserPatternLibraryService loads
// patterns via import.meta.glob (no node:fs). When USE_REAL is false returns
// the mock so CI/test never triggers the glob loader.
export function getPatternLibraryService(): PatternLibraryService {
  return USE_REAL ? getBrowserPatternLibraryService() : mockPatternLibrary;
}

// CharacterDiscoveryService: when USE_REAL is false returns a minimal stub so
// CI / test runs never touch the CLDR CDN or the LLM completer. When real,
// lazily imports from the engine with the browser fetch-backed CLDR loader.
// The LLM completer is not wired for text-sample (harvestFromText ignores it).
let charDiscoveryCache: CharacterDiscoveryService | null = null;
export async function getCharacterDiscoveryService(): Promise<CharacterDiscoveryService> {
  if (!USE_REAL) {
    const stub: CharacterDiscoveryService = {
      harvestFromText: async () => [],
      pickerCandidates: async () => [],
      synthesizeInventory: async () => { throw new Error("LLM completer not configured in test mode"); },
    };
    return stub;
  }
  if (charDiscoveryCache !== null) return charDiscoveryCache;
  const { createCharacterDiscoveryService, createFetchCldrLoader } = await import(
    /* @vite-ignore */ "@keyboard-studio/engine"
  );
  const loader = createFetchCldrLoader();
  const noopCompleter = async (): Promise<string> => { throw new Error("LLM completer not configured"); };
  charDiscoveryCache = createCharacterDiscoveryService(loader, noopCompleter);
  return charDiscoveryCache;
}

// OutputService (zip path only): when USE_REAL is false returns the mock zip
// serializer. When real, lazily imports toZip from the engine.
// The GitHub OAuth publishPR path is separate (createGitHubOutputService).
// The options argument carries the decision record for the packaged
// `.studio/` sidecar (specs/053-decision-audit FR-020). It is optional on both
// sides: the mock ignores it, and a session that recorded nothing produces the
// archive it produced before the feature existed.
type ToZipFn = (vfs: VirtualFS, opts?: ToZipOptions) => Promise<Uint8Array>;
let toZipCache: ToZipFn | null = null;
export async function getToZip(): Promise<ToZipFn> {
  if (!USE_REAL) return mockOutputService.toZip.bind(mockOutputService);
  if (toZipCache !== null) return toZipCache;
  const { toZip } = await import(/* @vite-ignore */ "@keyboard-studio/engine");
  toZipCache = toZip as ToZipFn;
  return toZipCache;
}

// Installable package (.kmp) — the PRIMARY download (spec §12). Lazily imports
// buildKmp from the engine, which in turn lazily imports @keymanapp/kmc-package,
// so jszip + marked stay out of the studio's entry chunk until an author asks
// for a package.
//
// There is no mock: a .kmp is a real Keyman package built from real compiled
// artifacts, and a fake one would be an artifact a user could try to install.
// Under VITE_USE_REAL_ENGINE=false this rejects, and the .kmp button surfaces
// that through the same error path as any other build failure.
type BuildKmpFn = (
  vfs: VirtualFS,
  keyboardId: string,
  artifacts: KmpBuildArtifacts,
  opts?: BuildKmpOptions,
) => Promise<BuildKmpResult>;
let buildKmpCache: BuildKmpFn | null = null;
export async function getBuildKmp(): Promise<BuildKmpFn> {
  if (!USE_REAL) {
    throw new Error(
      "[output] .kmp packaging requires the real engine (VITE_USE_REAL_ENGINE=false)",
    );
  }
  if (buildKmpCache !== null) return buildKmpCache;
  const { buildKmp } = await import(/* @vite-ignore */ "@keyboard-studio/engine");
  buildKmpCache = buildKmp as BuildKmpFn;
  return buildKmpCache;
}

// The .kmn compile, for the output path. useKeyboardArtifact runs its own
// compile for the live preview against the PREVIEW vfs; the output path needs a
// compile against the PROJECTED vfs, which includes assignments and the final
// keyboard id. Sharing this accessor rather than the preview's stage result is
// what keeps a package's .kmx and its descriptor built from the same source.
//
// This does NOT introduce a second debounce cycle (decision D3): it fires once,
// on an explicit download click, and produces no live diagnostics.
type CompileFn = (vfs: VirtualFS, keyboardId: string) => Promise<CompileResult>;
let compileCache: CompileFn | null = null;
export async function getCompile(): Promise<CompileFn> {
  if (!USE_REAL) {
    throw new Error(
      "[output] compiling for output requires the real engine (VITE_USE_REAL_ENGINE=false)",
    );
  }
  if (compileCache !== null) return compileCache;
  const { compile } = await import(/* @vite-ignore */ "@keyboard-studio/engine");
  compileCache = compile as CompileFn;
  return compileCache;
}

// The doc stubs a package descriptor lists but the adapt track lacks. Sync, so
// it rides the same lazy engine import as the rest of the output path.
type EnsurePackageFilesFn = (input: {
  vfs: VirtualFS;
  displayName: string;
  copyright?: string;
  year?: number;
}) => { created: string[] };
let ensurePackageFilesCache: EnsurePackageFilesFn | null = null;
export async function getEnsurePackageFiles(): Promise<EnsurePackageFilesFn> {
  if (ensurePackageFilesCache !== null) return ensurePackageFilesCache;
  const { ensurePackageFiles } = await import(
    /* @vite-ignore */ "@keyboard-studio/engine"
  );
  ensurePackageFilesCache = ensurePackageFiles as EnsurePackageFilesFn;
  return ensurePackageFilesCache;
}

// GitHubOutputService (verifyToken / publishPR — the OAuth fork+PR path,
// spec §12 "Option A"): when USE_REAL is false returns the mock (which already
// implements verifyToken/publishPR against fixture data). When real, lazily
// imports createGitHubOutputService from the engine, which wires the calls to
// the live GitHub API via fetch. Cached after first construction.
//
// Only the verifyToken/publishPR slice of OutputService is exposed here — the
// zip path goes through getToZip above.
type GitHubOutputService = Pick<OutputService, "verifyToken" | "publishPR">;
let gitHubOutputServiceCache: GitHubOutputService | null = null;
export async function getGitHubOutputService(): Promise<GitHubOutputService> {
  if (!USE_REAL) return mockOutputService;
  if (gitHubOutputServiceCache !== null) return gitHubOutputServiceCache;
  const { createGitHubOutputService } = await import(
    /* @vite-ignore */ "@keyboard-studio/engine"
  );
  gitHubOutputServiceCache = createGitHubOutputService();
  return gitHubOutputServiceCache;
}

// ManagedPROutputService (publishManagedPR — the org-mediated Option B path,
// docs/github_flow.md "Option B"): when USE_REAL is false returns the mock
// (which implements publishManagedPR against fixture data). When real, lazily
// imports createManagedPROutputService from the engine, which POSTs to the
// oauth-backend proxy. Cached after first construction.
//
// proxyEndpoint is resolved from VITE_OAUTH_BACKEND_URL (same config the OAuth
// flow uses via getBackendUrl) + "/submit/managed-pr". Same-origin ("") is the
// default so requests go to /submit/managed-pr on the page host (Vercel
// co-located serverless function).
type ManagedPROutputService = Pick<OutputService, "publishManagedPR">;
let managedPROutputServiceCache: ManagedPROutputService | null = null;
export async function getManagedPROutputService(): Promise<ManagedPROutputService> {
  if (!USE_REAL) return mockOutputService;
  if (managedPROutputServiceCache !== null) return managedPROutputServiceCache;
  const { createManagedPROutputService } = await import(
    /* @vite-ignore */ "@keyboard-studio/engine"
  );
  managedPROutputServiceCache = createManagedPROutputService();
  return managedPROutputServiceCache;
}

/**
 * The backend proxy URL for the Option B managed-PR submit endpoint.
 *
 * Reads from VITE_OAUTH_BACKEND_URL (same config the OAuth flow uses via
 * getBackendUrl in lib/githubOAuth.ts). Defaults to same-origin ("") so
 * requests hit /submit/managed-pr on the page's own host (Vercel co-located
 * serverless function — see MEMORY deployment note). Not hard-coded.
 */
export function getManagedPRProxyEndpoint(): string {
  const base = getBackendUrl();
  return `${base}/submit/managed-pr`;
}

// suggestMissingChars — Phase B exemplar-grounded missing-character suggestions.
// When USE_REAL is false returns null (deterministic, no network) so tests
// render the neutral "no data" note without touching real data.
//
// Since spec 044 the engine call takes NO loader: it reads the committed,
// pinned CLDR+SLDR index instead of fetching CLDR at authoring time. The
// dynamic import is still cached after first use so subsequent calls skip it
// (mirrors getScaffolderService), and the index chunk is warmed off the startup
// critical path by warmExemplarSource() below.
type SuggestEngineFn = (opts: {
  bcp47: string;
  baseIr: KeyboardIR;
  languageName?: string;
}) => Promise<MissingCharSuggestions | null>;
let suggestEngineCache: SuggestEngineFn | null = null;
export async function suggestMissingChars(
  bcp47: string,
  baseIr: KeyboardIR,
  languageName?: string,
): Promise<MissingCharSuggestions | null> {
  if (!USE_REAL) return null;
  if (suggestEngineCache === null) {
    const { suggestMissingCharacters } = await import(
      /* @vite-ignore */ "@keyboard-studio/engine"
    );
    suggestEngineCache = suggestMissingCharacters;
  }
  const fn = suggestEngineCache;
  return fn({
    bcp47,
    baseIr,
    ...(languageName !== undefined ? { languageName } : {}),
  });
}

// warmExemplarSource — kicks off the lazily-imported exemplar index so the
// first Characters step does not pay for it inline. Idempotent and safe to
// fire-and-forget; every consumer awaits the same idempotent warm-up
// internally, so a call that has not finished yet is never a correctness
// problem, only a latency one.
export async function warmExemplarSource(): Promise<void> {
  if (!USE_REAL) return;
  const { loadExemplarSource } = await import(/* @vite-ignore */ "@keyboard-studio/engine");
  await loadExemplarSource();
}

// sourcedExemplars — the Phase B propose-then-confirm inventory for a target
// language (spec 044 FR-016/FR-017). Returns null when neither source covers
// the tag or the confidence gate fires; the discovery-method list then omits
// the exemplar option entirely rather than offering an empty one.
export async function sourcedExemplars(bcp47: string): Promise<SourcedInventory | null> {
  if (!USE_REAL) return null;
  const { loadExemplarSource, sourceExemplars } = await import(
    /* @vite-ignore */ "@keyboard-studio/engine"
  );
  await loadExemplarSource();
  return sourceExemplars(bcp47);
}

export type { SourcedInventory, SourcedCharacter, ExemplarSource, ExemplarTier };
export { charactersInTier };

// Re-export the type so callers can use it without a direct engine import.
export type { MissingCharSuggestions };

// characterMapGroups — Phase B right-pane character map data source
// (CharacterMapPane.tsx). When USE_REAL is false returns [] (deterministic,
// no network) so tests render the pane's empty state without real CLDR
// traffic. When real, lazy-imports buildCharacterMap from the engine; caches
// the function after first import so subsequent calls skip the dynamic
// import entirely (mirrors suggestMissingChars above).
//
// `baseScripts` forwards to buildCharacterMap's opts.baseScripts — additional
// ISO 15924 scripts (e.g. the base keyboard's own script) to enumerate
// alongside the resolved target script, so groups from both appear.
//
// NOTE: buildCharacterMap is a parallel-track engine deliverable (character
// discovery, spec §8 Phase B) — the import below is written against its
// locked signature and resolves once the engine export lands.
let characterMapEngineCache:
  | ((
      baseIr: KeyboardIR | null,
      bcp47?: string,
      languageName?: string,
      opts?: { baseScripts?: readonly string[] },
    ) => Promise<CharacterMapGroup[]>)
  | null = null;
export async function characterMapGroups(
  baseIr: KeyboardIR | null,
  bcp47?: string,
  languageName?: string,
  baseScripts?: readonly string[],
): Promise<CharacterMapGroup[]> {
  if (!USE_REAL) return [];
  if (characterMapEngineCache === null) {
    const { buildCharacterMap } = await import(/* @vite-ignore */ "@keyboard-studio/engine");
    characterMapEngineCache = buildCharacterMap;
  }
  return characterMapEngineCache(baseIr, bcp47, languageName, {
    ...(baseScripts !== undefined ? { baseScripts } : {}),
  });
}

// Re-export the type so callers (CharacterMapPane.tsx) can use it without a
// direct engine import.
export type { CharacterMapGroup };

// neededCharsForLanguage — the full needed-char set for a target BCP47
// language (issue #525 items 2/4, language-driven surplus), across all four
// exemplar tiers. Mirrors suggestMissingChars's lazy-import + cache pattern
// above. When USE_REAL is false returns null (deterministic, no data access —
// matches suggestMissingChars's test-mode contract). When real, reads the
// pinned offline index; no loader, no network.
type NeededCharsEngineFn = (opts: { bcp47: string }) => Promise<Set<string> | null>;
let neededCharsEngineCache: NeededCharsEngineFn | null = null;
export async function neededCharsForLanguage(bcp47: string): Promise<Set<string> | null> {
  if (!USE_REAL) return null;
  if (neededCharsEngineCache === null) {
    const { neededCharsForLanguage: engineNeededCharsForLanguage } = await import(
      /* @vite-ignore */ "@keyboard-studio/engine"
    );
    neededCharsEngineCache = engineNeededCharsForLanguage;
  }
  const fn = neededCharsEngineCache;
  return fn({ bcp47 });
}
