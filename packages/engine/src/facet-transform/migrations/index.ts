// facet-transform migrations — registry keyed by migrationRuleId.
//
// Each transition row's `migrationRuleId` (transition-matrix.ts) resolves to one
// of these rules. Copy-return, parameterized by the accepted-site subset.
//
// Context tolerance (spec 062) is deliberately NOT in `MIGRATION_RULES`: every
// rule here is a static singleton because its `apply()` derives everything
// synchronously from `workingCopyIr` alone. Context tolerance's proposal step
// (`proposeContextVariants`) is async — it compiles the keyboard through the
// real WASM pipeline — so its `MigrationRule` is built from an
// already-computed result via `createContextToleranceMigrationRule`, not
// looked up by id ahead of time. See `./context-tolerance.ts`'s module doc.

import type { MigrationRule } from "../types.js";
import { encodingSpellingRule } from "./encoding-spelling.js";
import { longpressToFlickRule } from "./longpress-to-flick.js";
import { nfdToNfcRule } from "./nfd-to-nfc.js";

/** All v1 migration rules, keyed by id. */
export const MIGRATION_RULES: Readonly<Record<string, MigrationRule>> = {
  [encodingSpellingRule.id]: encodingSpellingRule,
  [longpressToFlickRule.id]: longpressToFlickRule,
  [nfdToNfcRule.id]: nfdToNfcRule,
};

export { encodingSpellingRule } from "./encoding-spelling.js";
export { longpressToFlickRule } from "./longpress-to-flick.js";
export { nfdToNfcRule } from "./nfd-to-nfc.js";
export { createContextToleranceMigrationRule, CONTEXT_TOLERANCE_RULE_ID, CONTEXT_TOLERANCE_FACET_ID } from "./context-tolerance.js";
