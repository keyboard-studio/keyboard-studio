// Shared fixtures for the spec 062 context-tolerance tests
// (pattern-apply/context-variants.test.ts, validator/context-tolerance.sweep.test.ts).

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { emit } from "../../codec/emit.js";
import { compile } from "../../compiler/index.js";

/**
 * A `.kmn` header for a Unicode keyboard targeting `any`, beginning in
 * `group(main)`. `mnemonic` adds `store(&mnemoniclayout) '1'`.
 */
export function kmnHeader(name = "ContextVariants", { mnemonic = true } = {}): string {
  return [
    `store(&NAME) '${name}'`,
    "store(&VERSION) '14.0'",
    "store(&KEYBOARDVERSION) '1.0'",
    "store(&TARGETS) 'any'",
    ...(mnemonic ? ["store(&mnemoniclayout) '1'"] : []),
    "",
    "begin Unicode > use(main)",
    "",
  ].join("\n");
}

export const HEADER = kmnHeader();

// Mirrors sil_yoruba8's real acute-table shape: a store-backed diacritic rule
// plus an existing bare-key fallback that must NOT fire once the generated
// rule is present (Story 1 Acceptance Scenario 3). The acute store U+00E2
// (a-with-circumflex) is a single precomposed codepoint whose NFD form is
// "a" + U+0302 (combining circumflex) — the two byte forms the US3
// write-back policy switch chooses between.
export const GAP_KMN = [
  HEADER,
  "group(main) using keys",
  "",
  "store(base) U+00E0",
  "store(acute) U+00E2",
  "store(key.act) ']'",
  "",
  "any(base) + any(key.act) > index(acute,1)",
  "+ ']' > U+00B4",
  "",
].join("\n");

/** The `]` key the GAP_KMN diacritic rule fires on. */
export const ACUTE_KEY = { vkey: "K_RBRKT", modifiers: [] as const };

/** A confident "not-tolerant" context-tolerance facet measurement for migration apply(). */
export const MEASUREMENT = {
  facetId: "context-tolerance",
  dominantValue: "not-tolerant",
  confidenceClass: "confident" as const,
  consistency: 1,
  exceptionSites: [],
  evidenceSize: 1,
};

/** Emit `ir` into a fresh VirtualFS and compile it through kmc-kmn. */
export async function compileIr(ir: KeyboardIR) {
  const vfs = createVirtualFS([
    { path: `source/${ir.header.keyboardId}.kmn`, content: emit(ir), isBinary: false },
  ]);
  return compile(vfs, ir.header.keyboardId);
}
