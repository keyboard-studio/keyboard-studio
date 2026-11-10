/**
 * KMN parser entry point: text -> KeyboardIR.
 *
 * For now this is the legacy reader (parse-legacy.ts). Spec 116 T040
 * switches it to the vendored Keyman parser front end plus lowering
 * (lower.ts); callers keep this import path and signature.
 */
export { parseLegacy as parse } from "./parse-legacy.js";
export type { ParseResult } from "./parse-legacy.js";
