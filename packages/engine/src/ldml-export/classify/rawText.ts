// The closed set of `raw` IR element texts and fragment reasons the classifier reads
// (research R19, mapping row 6.2). Nothing else is ever parsed out of `sourceText`
// or a `raw` element (Constitution Art II).
//
// The set is: `use(g)`, `layer('x')`, `platform('...')`, `set(&layer='x')`, plus two
// patterns row 6.2 admits because the codec keeps them as `raw` context elements:
// the bare token `nul` (row 3.24) and a bracketed key `[MODS K_X]` (row 2.22).

import { classifyRawElement } from "@keyboard-studio/contracts";
import { OPAQUE_REASONS } from "../../codec/opaque-reasons.js";
import type { RowId } from "../types.js";

const NAME = String.raw`[^()'"\s]+`;

/** `use(g)` -> `g`. */
export function parseUseCall(text: string): string | null {
  const m = new RegExp(String.raw`^use\(\s*(${NAME})\s*\)$`, "i").exec(text.trim());
  return m ? (m[1] as string) : null;
}

/** `layer('x')` -> `x`. */
export function parseLayerCall(text: string): string | null {
  const c = classifyRawElement(text);
  return c.kind === "layer" ? c.value : null;
}

/** `platform('desktop native')` -> `desktop native`. */
export function parsePlatformCall(text: string): string | null {
  const c = classifyRawElement(text);
  return c.kind === "platform" ? c.value : null;
}

/** `set(&layer='x')` -> `x` (spaces around `=` allowed). */
export function parseSetLayer(text: string): string | null {
  const c = classifyRawElement(text);
  return c.kind === "setLayer" ? c.value : null;
}

/** The bare `nul` token the codec keeps as a context element (row 3.24). */
export function isNulToken(text: string): boolean {
  return text.trim().toLowerCase() === "nul";
}

/** `[NUMLOCK K_A]` -> its modifier words and key; only the bracketed form (row 2.22). */
export function parseBracketKey(text: string): { modifiers: string[]; vkey: string } | null {
  const m = /^\[\s*((?:[A-Za-z]+\s+)*)([KTU]_[A-Za-z0-9_]+)\s*\]$/.exec(text.trim());
  if (!m) return null;
  const modifiers = (m[1] ?? "").split(/\s+/).filter((w) => w.length > 0);
  return { modifiers, vkey: m[2] as string };
}

const NUMLOCK_SCROLL = new Set(["NUMLOCK", "NOTNUMLOCK", "SCROLL", "NOTSCROLL"]);

/** A modifier word that LDML has no component for (row 2.22). */
export function isUnsupportedModifier(word: string): boolean {
  return NUMLOCK_SCROLL.has(word.toUpperCase());
}

export interface FragmentRoute {
  rowId: RowId;
  reason: string;
}

/** Row 6.1: the fragment reason selects row 3.18 or 1.12, everything else is `OPAQUE`. */
export function routeFragmentReason(reason: string): FragmentRoute {
  if (reason === OPAQUE_REASONS.OPTION_STORE_DIRECTIVE || reason === OPAQUE_REASONS.IF_OPTION_STORE) {
    return { rowId: "3.18", reason };
  }
  if (reason === OPAQUE_REASONS.CALL_RETURN) return { rowId: "1.12", reason };
  return { rowId: "6.1", reason };
}
