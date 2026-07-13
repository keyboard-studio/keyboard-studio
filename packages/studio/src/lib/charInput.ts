// charInput — resolves a character box's raw typed text (literal character OR
// U+XXXX Unicode notation) to the actual character, and resolves a key-picker
// dropdown's selection (a real vkey id, OR the "Enter my own character..."
// custom option plus its typed text) down to a physical key.
//
// Auto-detection only: input starting with "U+"/"u+" followed by 4-6 hex
// digits is parsed as a codepoint; everything else is a literal character.
// There is no explicit "this is unicode" toggle. Bare hex with no "U+"
// prefix (e.g. "0041") is deliberately treated as a literal string, not a
// codepoint — parseUPlusNotation's bare-hex acceptance is intentionally NOT
// exposed here, since a bare "0041" typed into a character box is ambiguous
// (studio-only policy; the canonical parser stays permissive for other
// consumers).
//
// parseUPlusNotation itself is the single canonical U+ parser
// (@keyboard-studio/contracts) — this module never re-implements it.

import { parseUPlusNotation, toUPlusNotation } from "@keyboard-studio/contracts";
import { CUSTOM_KEY_OPTION_VALUE, charToVkey } from "./keyOptions.ts";

// ---------------------------------------------------------------------------
// resolveCharInput — character box resolution
// ---------------------------------------------------------------------------

export type CharInputResult =
  | { ok: true; value: string; wasNotation: boolean }
  | { ok: false; reason: string };

const UPLUS_PREFIX = /^[Uu]\+/;

// ---------------------------------------------------------------------------
// Delimiter guard (P0) — the pattern kmnFragment templates substitute a
// resolved character straight into a single-quoted KMN string literal (e.g.
// `'{{firstLetterOut}}'`) or a double-quoted JSON block (deadkey's
// touchLayoutFragment), and substituteSlots() (engine/src/pattern-apply) does
// raw string replacement with no escaping. A resolved ASCII apostrophe (')
// or quotation mark (") would break that literal/JSON — caught only much
// later at the WASM oracle. Block the two ASCII delimiter characters here;
// the string-safe Unicode look-alikes (U+02BC MODIFIER LETTER APOSTROPHE,
// U+2019 RIGHT SINGLE QUOTATION MARK, U+201C/D) are NOT delimiters and stay
// allowed — the error message below steers authors toward them for a
// glottal stop / saltillo.
// ---------------------------------------------------------------------------

export const DELIMITER_UNSAFE: ReadonlySet<string> = new Set(["'", '"']);

const DELIMITER_UNSAFE_REASON =
  "Straight quotes (' or \") can't be typed here. For a glottal stop or saltillo, use U+02BC or U+2019.";

function containsDelimiterUnsafeChar(value: string): boolean {
  for (const ch of value) {
    if (DELIMITER_UNSAFE.has(ch)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Grapheme counting (P1) — used by the singleGrapheme option below. Prefers
// Intl.Segmenter (correctly counts a base+combining sequence that did not
// precompose under NFC, e.g. "n" + U+0303, as ONE grapheme); falls back to a
// code-point count where Intl.Segmenter is unavailable. Either path counts a
// single astral/SMP character (UTF-16 length 2, one code point, e.g.
// U+1D400) as ONE grapheme.
// ---------------------------------------------------------------------------

function countGraphemes(value: string): number {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _segment of segmenter.segment(value)) count++;
    return count;
  }
  return [...value].length;
}

/** True when `value` is exactly one Unicode combining mark (\p{M}) on its own. */
const LONE_COMBINING_MARK_RE = /^\p{M}$/u;
export function isLoneCombiningMark(value: string): boolean {
  return LONE_COMBINING_MARK_RE.test(value);
}

export interface ResolveCharInputOptions {
  /**
   * Reject a resolved value that is more than one grapheme cluster — for the
   * strictly-one-character boxes (seqFirst, seqSecond, deadkeyBaseLetter).
   * Opt-in only: the key-picker custom-char path is unaffected (it is
   * already constrained by charToVkey's single-character lookup).
   */
  singleGrapheme?: boolean;
  /**
   * Reject the ASCII straight-quote delimiter characters (see
   * DELIMITER_UNSAFE above). Opt-in only: does NOT apply to the custom
   * SWAP/RALT/touch host-key characters, which resolve only to a K_ vkey id
   * and are never emitted as a literal.
   */
  blockDelimiters?: boolean;
}

/**
 * Resolve a character box's raw typed text to the actual character.
 *
 * - Empty (after trim) -> ok:false.
 * - Text starting with "U+"/"u+" -> parsed via parseUPlusNotation; an
 *   invalid codepoint (bad hex, surrogate, > U+10FFFF) -> ok:false with a
 *   human-readable reason.
 * - Anything else -> literal passthrough (trimmed), wasNotation:false.
 *
 * The resolved value is always NFC-normalized (both the literal and the U+
 * path) BEFORE the singleGrapheme/blockDelimiters checks below, so a
 * decomposed paste (e.g. "e" + U+0301) collapses to its precomposed form
 * ("é") to match the deadkey patterns' stated NFC convention.
 */
export function resolveCharInput(
  raw: string,
  options: ResolveCharInputOptions = {},
): CharInputResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "Enter a character or a U+ Unicode value." };
  }

  let value: string;
  let wasNotation: boolean;
  if (UPLUS_PREFIX.test(trimmed)) {
    const resolved = parseUPlusNotation(trimmed);
    if (resolved === null) {
      return {
        ok: false,
        reason: "Not a valid Unicode value (use U+ followed by 4-6 hex digits)",
      };
    }
    value = resolved.normalize("NFC");
    wasNotation = true;
  } else {
    value = trimmed.normalize("NFC");
    wasNotation = false;
  }

  if (options.singleGrapheme === true && countGraphemes(value) > 1) {
    return { ok: false, reason: "Enter one character only." };
  }
  if (options.blockDelimiters === true && containsDelimiterUnsafeChar(value)) {
    return { ok: false, reason: DELIMITER_UNSAFE_REASON };
  }

  return { ok: true, value, wasNotation };
}

// ---------------------------------------------------------------------------
// reflectCharInput — live "the other direction" reflection shown below a
// character box or a key-picker's custom-character input.
//
// - A LITERAL character reflects to its Unicode value: "é" -> "é → U+00E9".
// - U+ NOTATION reflects to the resolved character: "U+00E9" -> "U+00E9 → é"
//   (the raw typed text is echoed, not a re-normalized "U+00E9" — matching
//   the pre-existing KeyPickerField convention of echoing customChar.trim()
//   for a notation entry).
// - Empty input -> kind "empty" (render nothing).
// - Anything resolveCharInput rejects (bad U+, blocked delimiter, multi-
//   grapheme with singleGrapheme set) -> kind "error" with the SAME reason
//   resolveCharInput produced, so a caller's reflection and its canApply
//   gate can never disagree about what counts as invalid.
//
// Pure — callers decide where/how to render the result. KeyPickerField
// appends " → <vkey>" itself to the "ok" text so its success line also shows
// the mapped physical key (e.g. "; → U+003B → K_SEMI").
// ---------------------------------------------------------------------------

export type CharReflection =
  | { kind: "empty" }
  | { kind: "ok"; text: string }
  | { kind: "error"; reason: string };

export function reflectCharInput(
  raw: string,
  options: ResolveCharInputOptions = {},
): CharReflection {
  if (raw.trim().length === 0) {
    return { kind: "empty" };
  }
  const resolved = resolveCharInput(raw, options);
  if (!resolved.ok) {
    return { kind: "error", reason: resolved.reason };
  }
  return resolved.wasNotation
    ? { kind: "ok", text: `${raw.trim()} → ${resolved.value}` }
    : { kind: "ok", text: `${resolved.value} → ${toUPlusNotation(resolved.value)}` };
}

// ---------------------------------------------------------------------------
// resolveKeyPickerSelection — key-picker dropdown resolution
//
// Shared by every "Enter my own character..." dropdown in MechanismGallery
// and TouchGallery (see KeyPickerField.tsx) and by the gallery components
// themselves for canApply/handleApply — one pure function, no duplicated
// resolution logic between the presentational component and its caller.
// ---------------------------------------------------------------------------

export type KeyPickerResolution =
  | { kind: "empty" }
  | { kind: "key"; vkey: string }
  | { kind: "customOk"; vkey: string; char: string; wasNotation: boolean }
  | { kind: "customError"; reason: string };

export interface KeyPickerResolveOptions {
  /**
   * Reject ASCII straight-quote delimiters in the custom-character text.
   * Used ONLY by the S-02 deadkey-trigger picker: its resolved char is also
   * reused as `accentChar` (the deadkey's own literal output), unlike the
   * SWAP/RALT/touch host-key pickers, which resolve solely to a K_ vkey id
   * and never emit the typed character as a literal. Default false.
   */
  blockDelimiters?: boolean;
}

/**
 * Resolve a key-picker's current selection to a physical key.
 *
 * `selectValue` is either a real vkey id, "" (nothing chosen), or
 * CUSTOM_KEY_OPTION_VALUE (the "Enter my own character..." option is
 * active). `customChar` is only consulted when `selectValue` is the custom
 * sentinel.
 */
export function resolveKeyPickerSelection(
  selectValue: string,
  customChar: string,
  options: KeyPickerResolveOptions = {},
): KeyPickerResolution {
  if (selectValue !== CUSTOM_KEY_OPTION_VALUE) {
    return selectValue === "" ? { kind: "empty" } : { kind: "key", vkey: selectValue };
  }
  const parsed = resolveCharInput(
    customChar,
    options.blockDelimiters === true ? { blockDelimiters: true } : {},
  );
  if (!parsed.ok) {
    return { kind: "customError", reason: parsed.reason };
  }
  const vkey = charToVkey(parsed.value);
  if (vkey === null) {
    return {
      kind: "customError",
      reason: `Cannot map '${parsed.value}' to a physical key — pick a key from the list instead.`,
    };
  }
  return { kind: "customOk", vkey, char: parsed.value, wasNotation: parsed.wasNotation };
}

/** Extract the resolved vkey id from a KeyPickerResolution, or null if unresolved. */
export function resolvedVkeyOf(resolution: KeyPickerResolution): string | null {
  return resolution.kind === "key" || resolution.kind === "customOk" ? resolution.vkey : null;
}
