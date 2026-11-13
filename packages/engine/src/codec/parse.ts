/**
 * KMN parser entry point: text -> KeyboardIR.
 *
 * Reads .kmn with the vendored Keyman parser front end and lowers the syntax
 * tree to the IR (lower.ts, spec 116). It is the only .kmn reader.
 */
export { lower as parse } from "./lower.js";
export type { ParseResult } from "./parse-shared.js";
