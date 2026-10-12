// see spec.md section 12 — mocks barrel

// Retained for mock fixture construction only.
// New callers should use createVirtualFS() from @keyboard-studio/contracts instead.
export { makeMockVirtualFS, scaffoldedFS } from "./mockVirtualFS";
export { mockStartBrowser } from "./mockStartBrowser";
export { mockPatternLibrary, mockPatternByIdSync } from "./mockPatternLibrary";
export { mockScaffolder } from "./mockScaffolder";
export { mockOutputService } from "./mockOutputService";
