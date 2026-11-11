// kmn-diff barrel export -- spec 117 US8 (contracts/code-edits.md).
//
// Pure IR-to-IR structural diff, content-anchored apply, owner lookup, and inversion for the
// Code tab's Apply.

export { diffIR } from "./diffIR.js";
export { applyIRChanges } from "./applyIRChanges.js";
export type { ApplyIRChangesResult } from "./applyIRChanges.js";
export { findOwners } from "./findOwners.js";
export { invertChanges } from "./invertChanges.js";
