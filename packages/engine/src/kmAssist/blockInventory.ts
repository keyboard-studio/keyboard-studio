/**
 * The non-letter characters a diacritic block ("guard") store can cover:
 * space, digits, punctuation and symbols the keyboard can actually type.
 *
 * The orthography model holds bases and marks only, so a block set drafted
 * from it alone could never include the contexts a block set mostly exists
 * for. Two sources are unioned:
 *
 * 1. What the keyboard's own rules produce (`producedGlyphs`, space
 *    included), filtered to the non-letter, non-mark kinds.
 * 2. A desktop floor — space, `0`–`9` and the ASCII punctuation/symbol floor
 *    the punctuation step already uses. On desktop, the OS layout types these
 *    by fall-through whenever the keyboard doesn't handle the key, and that
 *    fall-through is not modelled anywhere the engine can read. The floor is
 *    skipped for a keyboard whose `&TARGETS` names no desktop platform, since
 *    a touch layout types only what it declares.
 *
 * Union rather than replace: a block set should cover everything typable,
 * so keeping the produced set and adding the floor is the conservative
 * choice (the punctuation step replaces because it proposes characters to
 * ADD, a different question).
 *
 * Order: bucket order (space, digit, punctuation, symbol, other), then code
 * point. Deterministic.
 */
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { producedGlyphs } from "../inventory/producedGlyphs.js";
import { ASCII_PUNCTUATION_FLOOR } from "../character-discovery/punctuationProposal.js";
import { BUCKET_ORDER, bucketOfChar } from "./explain.js";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Space, ASCII digits and ASCII punctuation/symbols: typable on any desktop. */
export const DESKTOP_BLOCK_FLOOR: readonly string[] = Object.freeze([
  " ",
  ...DIGITS,
  ...ASCII_PUNCTUATION_FLOOR,
]);

/** `&TARGETS` tokens that build a desktop keyboard. */
const DESKTOP_TARGETS = new Set(["any", "desktop", "windows", "macosx", "linux"]);

/**
 * True unless the keyboard's `&TARGETS` names only non-desktop platforms. A
 * keyboard with no `&TARGETS` store builds desktop only.
 */
function targetsIncludeDesktop(ir: KeyboardIR): boolean {
  const targets = ir.stores.find((s) => s.isSystem && s.name.toUpperCase() === "TARGETS");
  if (targets === undefined) return true;
  const text = targets.items
    .map((item) => (item.kind === "char" ? item.value : item.kind === "raw" ? item.text : " "))
    .join("");
  const tokens = text.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 0);
  return tokens.length === 0 || tokens.some((t) => DESKTOP_TARGETS.has(t));
}

/** A single known non-letter, non-mark character; unknown category data is left out, never guessed. */
function isNonLetter(ch: string): boolean {
  const bucket = bucketOfChar(ch);
  return bucket !== undefined && bucket !== "letter" && bucket !== "mark";
}

function bucketRank(ch: string): number {
  return BUCKET_ORDER.indexOf(bucketOfChar(ch) ?? "other");
}

/**
 * Non-letter characters the keyboard can type, for drafting a block set.
 * See the module comment for the two sources and the ordering.
 */
export function guardBlockInventory(ir: KeyboardIR): string[] {
  const chars = new Set(producedGlyphs(ir, { includeSpace: true }).filter(isNonLetter));
  if (targetsIncludeDesktop(ir)) for (const ch of DESKTOP_BLOCK_FLOOR) chars.add(ch);
  return [...chars].sort(
    (a, b) => bucketRank(a) - bucketRank(b) || (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0),
  );
}
