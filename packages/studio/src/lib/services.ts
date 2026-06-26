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
} from "@keyboard-studio/contracts";
import type { MissingCharSuggestions, CldrFullLoader } from "@keyboard-studio/engine";
import { mockBaseBrowser, mockOutputService, mockScaffolder } from "@keyboard-studio/contracts/mocks";
import { localBaseBrowser, LOCAL_PROXY_BASE } from "./localBaseBrowser.ts";
import { getPatternLibraryService as getBrowserPatternLibraryService } from "./browserPatternLibrary.ts";
import { mockPatternLibrary } from "@keyboard-studio/contracts/mocks";

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
let toZipCache: ((vfs: VirtualFS) => Promise<Uint8Array>) | null = null;
export async function getToZip(): Promise<(vfs: VirtualFS) => Promise<Uint8Array>> {
  if (!USE_REAL) return mockOutputService.toZip.bind(mockOutputService);
  if (toZipCache !== null) return toZipCache;
  const { toZip } = await import(/* @vite-ignore */ "@keyboard-studio/engine");
  toZipCache = toZip as (vfs: VirtualFS) => Promise<Uint8Array>;
  return toZipCache;
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

// suggestMissingChars — Phase B CLDR-grounded missing-character suggestions.
// When USE_REAL is false returns null (deterministic, no network) so tests
// render the neutral "no data" note without real CLDR traffic.
// When real, lazy-imports suggestMissingCharacters + createFetchCldrFullLoader
// from the engine; caches the loader + engine fn together after first import so
// subsequent calls skip the dynamic import entirely (mirrors getScaffolderService).
type SuggestEngineCache = {
  fn: (opts: { bcp47: string; baseIr: KeyboardIR; loader: CldrFullLoader; languageName?: string }) => Promise<MissingCharSuggestions | null>;
  loader: CldrFullLoader;
};
let suggestEngineCache: SuggestEngineCache | null = null;
export async function suggestMissingChars(
  bcp47: string,
  baseIr: KeyboardIR,
  languageName?: string,
): Promise<MissingCharSuggestions | null> {
  if (!USE_REAL) return null;
  if (suggestEngineCache !== null) {
    return suggestEngineCache.fn({
      bcp47,
      baseIr,
      loader: suggestEngineCache.loader,
      ...(languageName !== undefined ? { languageName } : {}),
    });
  }
  const { suggestMissingCharacters, createFetchCldrFullLoader } = await import(
    /* @vite-ignore */ "@keyboard-studio/engine"
  );
  suggestEngineCache = {
    fn: suggestMissingCharacters,
    loader: createFetchCldrFullLoader(),
  };
  return suggestEngineCache.fn({
    bcp47,
    baseIr,
    loader: suggestEngineCache.loader,
    ...(languageName !== undefined ? { languageName } : {}),
  });
}

// Re-export the type so callers can use it without a direct engine import.
export type { MissingCharSuggestions };
