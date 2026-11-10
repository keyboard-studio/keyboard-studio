/**
 * KMN parser entry point: text -> KeyboardIR.
 *
 * Reads .kmn with the vendored Keyman parser front end and lowers the syntax
 * tree to the IR (lower.ts, spec 116). The legacy reader (parse-legacy.ts) is
 * kept only for the comparison suite until spec 116 US2 retires it.
 */
export { lower as parse } from "./lower.js";
export type { ParseResult } from "./parse-shared.js";
