/**
 * Codec barrel — public surface for the KeyboardIR codec.
 * Issue #233.
 */

export { parse } from "./parse.js";
export type { ParseResult } from "./parse.js";

export { emit } from "./emit.js";

export { parseKvks } from "./parse-kvks.js";

export {
  parseTouchLayout,
  emitTouchLayout,
  TOUCH_LAYOUT_JSON_INDENT,
} from "./parse-touch.js";

export { conformTouchLayoutToKeymanSchema } from "./touch-layout-conform.js";
export type { ConformTouchLayoutResult } from "./touch-layout-conform.js";

export { OPAQUE_REASONS } from "./opaque-reasons.js";
export type { OpaqueReason } from "./opaque-reasons.js";

export { computeSha256Hex } from "./hash.js";

// Full import pipeline (parse → recognize → Layer A′ fidelity → emit →
// ImportReport). The studio's live import path runs the fidelity stage from
// this orchestrator's composition (see validator/index-import-fidelity.js);
// the orchestrator itself is the composition for Node-side importers.
export { importKeyboard, buildImportReport } from "./import-keyboard.js";
export type {
  ImportKeyboardResult,
  BuildImportReportParams,
} from "./import-keyboard.js";

export { normaliseForComparison } from "./normalise-ir.js";
