// Service container. Config flag: VITE_USE_REAL_ENGINE (default: true).
// Set VITE_USE_REAL_ENGINE=false in .env.local to force mocks (test/CI only).
// Note: mockBaseBrowser / mockOutputService / mockScaffolder imports here are
// intentional — services.ts is the designated service boundary. Vite
// tree-shakes them in real builds. Do NOT add mocks imports elsewhere in
// packages/studio/src/.
import type { BaseBrowserService, CharacterDiscoveryService, PatternLibraryService, ScaffolderService, VirtualFS } from "@keyboard-studio/contracts";
import { mockBaseBrowser, mockOutputService, mockScaffolder } from "@keyboard-studio/contracts/mocks";
import { localBaseBrowser, LOCAL_PROXY_BASE } from "./localBaseBrowser.ts";
import { getPatternLibraryService as getBrowserPatternLibraryService } from "./browserPatternLibrary.ts";
import { mockPatternLibrary } from "@keyboard-studio/contracts/mocks";

export const USE_REAL = import.meta.env.VITE_USE_REAL_ENGINE !== "false";

// Re-export the proxy base for callers that need it.
export { LOCAL_PROXY_BASE };

// BaseBrowserService: in dev, the Vite plugin-backed local browser is the
// real implementation. In production this would be createBaseBrowser() from
// the engine pointing at the GitHub API.
export function getBaseBrowserService(): BaseBrowserService {
  return USE_REAL ? localBaseBrowser : mockBaseBrowser;
}

// ScaffolderService: when USE_REAL is false returns the mock scaffolder so
// CI / test runs never touch WASM. When real, lazily imports from the engine
// (mirrors the loadEngine() lazy-import pattern in useKeyboardArtifact).
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
