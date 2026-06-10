// Service container. Config flag: VITE_USE_REAL_ENGINE (default: true).
// Set VITE_USE_REAL_ENGINE=false in .env.local to force mocks (test/CI only).
// Note: mockBaseBrowser import here is intentional — services.ts is the
// designated service boundary. Vite tree-shakes it in real builds.
import type { BaseBrowserService } from "@keyboard-studio/contracts";
import { mockBaseBrowser } from "@keyboard-studio/contracts/mocks";
import { localBaseBrowser, LOCAL_PROXY_BASE } from "./localBaseBrowser.ts";

export const USE_REAL = import.meta.env.VITE_USE_REAL_ENGINE !== "false";

// Re-export the proxy base for callers that need it.
export { LOCAL_PROXY_BASE };

// BaseBrowserService: in dev, the Vite plugin-backed local browser is the
// real implementation. In production this would be createBaseBrowser() from
// the engine pointing at the GitHub API.
export function getBaseBrowserService(): BaseBrowserService {
  return USE_REAL ? localBaseBrowser : mockBaseBrowser;
}
