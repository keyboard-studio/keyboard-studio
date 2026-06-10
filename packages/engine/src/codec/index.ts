/**
 * Codec barrel — public surface for the KeyboardIR codec.
 * Issue #233.
 */

export { parse } from "./parse.js";
export type { ParseResult } from "./parse.js";

export { emit } from "./emit.js";

export { parseKvks } from "./parse-kvks.js";

export { parseTouchLayout } from "./parse-touch.js";

export { OPAQUE_REASONS } from "./opaque-reasons.js";
export type { OpaqueReason } from "./opaque-reasons.js";
