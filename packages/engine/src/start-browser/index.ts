// see spec.md §8 step 1 — base-browser public API
export { createStartBrowser } from "./start-browser.js";
export type { StartBrowserConfig, StartBrowserServiceWithDocProfile } from "./start-browser.js";
export {
  matchKeyboardScopePath,
  dedupeKpsPathsById,
  KPS_SCOPE_RE_SOURCE,
  KPS_SCOPE_RE_ROOT,
} from "./corpus-scope.js";
export type { KeyboardScopeMatch } from "./corpus-scope.js";
export { classifyStartDocumentation, extractUsableBaseDescription } from "./classifyStartDocumentation.js";
