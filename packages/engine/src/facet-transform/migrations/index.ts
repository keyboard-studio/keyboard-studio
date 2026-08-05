// facet-transform migrations — registry keyed by migrationRuleId.
//
// Each transition row's `migrationRuleId` (transition-matrix.ts) resolves to one
// of these rules. Copy-return, parameterized by the accepted-site subset.

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
