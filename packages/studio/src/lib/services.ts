// Service container. Config flag: VITE_USE_REAL_ENGINE (default: true).
// Set VITE_USE_REAL_ENGINE=false in .env.local to force mocks (test/CI only).
// Note: mockBaseBrowser / mockOutputService / mockScaffolder imports here are
// intentional — services.ts is the designated service boundary. Vite
// tree-shakes them in real builds. Do NOT add mocks imports elsewhere in
// packages/studio/src/.
import type { BaseBrowserService, PatternLibraryService, ScaffolderService, VirtualFS } from "@keyboard-studio/contracts";
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
