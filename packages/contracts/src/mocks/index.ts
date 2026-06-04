// see spec.md section 12 — mocks barrel

// makeMockVirtualFS is exposed for studio-level construction of an empty
// VFS before the scaffolder has run (e.g. the #39 preview pane fetches
// release-tree source straight into a fresh VFS, no scaffold step). For
// authoring flows, prefer ScaffolderService.scaffold() which returns a
// fully-populated VFS keyed off a Pattern.
export { makeMockVirtualFS, scaffoldedFS } from "./mockVirtualFS";
export { mockBaseBrowser } from "./mockBaseBrowser";
export { mockPatternLibrary } from "./mockPatternLibrary";
export { mockValidator } from "./mockValidator";
export { mockCompiler } from "./mockCompiler";
export { mockScaffolder } from "./mockScaffolder";
export { mockLintEngine } from "./mockLintEngine";
export { mockOutputService } from "./mockOutputService";
