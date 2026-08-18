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
//
// Bundle-safety note: `createContextToleranceMigrationRule` is deliberately
// NOT re-exported from this barrel either. `context-tolerance.ts` imports
// `../../pattern-apply/context-variants.ts`, which imports
// `../simulator/index.ts` — a Node-`vm`-sandbox-based module ("Designed for
// Node/vitest use only", per its own doc) whose vendored `codes.js` import
// only resolves via a `tsconfig.json` `paths` alias that bundlers never see.
// This file's own barrel (`facet-transform/index.ts`) is re-exported from the
// engine package root, which `packages/studio` imports for its (genuinely
// browser-safe) `proposeFacetTransform`/`applyFacetTransform` — a static
// `export ... from "./context-tolerance.js"` here would drag that whole
// Node-only chain into Rollup's studio build graph even though nothing in
// this barrel's own registry calls it (see comment above). Every real call
// site (engine's own tests, and eventually the studio hook once it exists)
// imports `createContextToleranceMigrationRule` directly from
// `../facet-transform/migrations/context-tolerance.js` instead.

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
