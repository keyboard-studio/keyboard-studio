// see spec.md section 12 — mocks barrel

// Retained for mock fixture construction only.
// New callers should use createVirtualFS() from @keyboard-studio/contracts instead.
export { makeMockVirtualFS, scaffoldedFS } from "./mockVirtualFS";
export { mockBaseBrowser } from "./mockBaseBrowser";
export { mockPatternLibrary } from "./mockPatternLibrary";
export { mockValidator } from "./mockValidator";
export { mockCompiler } from "./mockCompiler";
export { mockScaffolder } from "./mockScaffolder";
export { mockLintEngine } from "./mockLintEngine";
export { mockOutputService } from "./mockOutputService";
