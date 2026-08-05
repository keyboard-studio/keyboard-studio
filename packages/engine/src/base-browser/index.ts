// see spec.md §8 step 1 — base-browser public API
export { createBaseBrowser } from "./base-browser.js";
export type { BaseBrowserConfig } from "./base-browser.js";
export {
  matchKeyboardScopePath,
  dedupeKpsPathsById,
  KPS_SCOPE_RE_SOURCE,
  KPS_SCOPE_RE_ROOT,
} from "./corpus-scope.js";
export type { KeyboardScopeMatch } from "./corpus-scope.js";
