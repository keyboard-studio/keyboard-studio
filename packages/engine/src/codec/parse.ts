/**
 * KMN parser: text -> KeyboardIR.
 *
 * Walks the token stream produced by tokenize() and builds a KeyboardIR.
 *
 * Recognised constructs become typed nodes (IRGroup, IRRule, IRStore, etc.).
 * Unrecognised constructs (opaque features listed in spec §14 D8) become
 * RawKmnFragment nodes with one of the OPAQUE_REASONS strings.
 *
 * Comments are anchored:
 *   - "leading"     — a comment token immediately preceding a rule/store token
 *   - "trailing"    — a c-comment at the end of a rule line (stripped inline)
 *   - "freestanding" — all other comment tokens
 */

import type {
  KeyboardIR,
  IRHeader,
  IRStore,
  IRGroup,
  IRRule,
  IRComment,
  RawKmnFragment,
  ContextElement,
  OutputElement,
  StoreItem,
  DeprecatedRewrite,
} from "@keyboard-studio/contracts";

import { isNamedDeadkeyName, isPlusSeparator } from "@keyboard-studio/contracts";

import { tokenize, type Token, type TargetSelector } from "./tokenize.js";
import { NodeIdMinter } from "../shared/node-ids.js";
import { OPAQUE_REASONS, type OpaqueReason } from "./opaque-reasons.js";
import {
  DESKTOP_PLATFORM_GUARD,
  WEB_PLATFORM_GUARDS,
} from "./target-guards.js";

// System stores whose canonical spelling is NOT all-uppercase. The lookup key
// is the uppercased form; the value is what gets stored in IRStore.name.
const CANONICAL_SYSTEM_STORE: Record<string, string> = { CASEDKEYS: "CasedKeys" };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParseResult {
  ir: KeyboardIR;
  opaqueFeatures: Array<{ feature: string; count: number }>;
  /**
   * Deprecated .kmn forms rewritten during parse (#2633), in source order.
   * Each entry is one visible rewrite: the parser still accepts the form,
   * but the emitted .kmn carries the modern equivalent. Empty when the
   * source used no deprecated forms.
   */
  rewrites: DeprecatedRewrite[];
}

// ---------------------------------------------------------------------------
// Deprecated .kmn forms (#2633)
// ---------------------------------------------------------------------------

/**
 * Decode a legacy Keyman value-format token to its character, or null.
 *
 * Keyman 19 deprecated `d###` (decimal), `x###` (hex) and bare `###`
 * (octal) codepoint spellings (WARN_DeprecatedValueFormat 0x0BC); Keyman 20
 * removes them. The modern spelling is `U+XXXX`. Only the unambiguous
 * shapes decode: `d` + 1-3 decimal digits 0-255 (a byte value), `x` + 1-4
 * hex digits (a BMP codepoint), or 1-3 octal digits (0-0777). Anything
 * outside those ranges stays raw — never mistype a token that is not a
 * legacy codepoint (e.g. an out-of-range `d999` keeps its raw form and the
 * compiler's error, rather than fabricating a character).
 */
function parseLegacyValueFormat(tok: string): string | null {
  const dec = /^d(\d{1,3})$/i.exec(tok);
  if (dec !== null) {
    const cp = parseInt(dec[1] ?? "0", 10);
    return cp <= 0xff ? String.fromCodePoint(cp) : null;
  }
  const hex = /^x([0-9A-Fa-f]{1,4})$/i.exec(tok);
  if (hex !== null) {
    return String.fromCodePoint(parseInt(hex[1] ?? "0", 16));
  }
  const oct = /^([0-7]{1,3})$/.exec(tok);
  if (oct !== null) {
    return String.fromCodePoint(parseInt(oct[1] ?? "0", 8));
  }
  return null;
}

/** Format a BMP character the way the rewrite record (and emit) spell it. */
function formatLegacyRewrite(ch: string): string {
  const hex = (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
  return `U+${hex}`;
}

/**
 * Options for decoding a legacy value-format token (#2633 §3).
 * `isAnsi` marks a `begin ANSI` section: values ≥ 128 there are code-page
 * bytes, not necessarily Unicode codepoints, so they are left raw and
 * reported via `onEscalation` rather than guessed. `onRewrite` records a
 * performed rewrite; both callbacks are omitted for best-effort sketches
 * (the fragment preserves the source text, so no rewrite happened there).
 */
interface LegacyValueOptions {
  isAnsi?: boolean;
  onRewrite?: (original: string, rewritten: string) => void;
  onEscalation?: (original: string) => void;
}

/**
 * Decode one legacy value-format token, honouring the ANSI guard. Returns
 * the character, or null when the token is not a legacy format — or when it
 * is one the ANSI guard forbids decoding (reported via `onEscalation`,
 * caller falls through to the raw handling).
 */
function tryLegacyValue(tok: string, opts?: LegacyValueOptions): string | null {
  const decoded = parseLegacyValueFormat(tok);
  if (decoded === null) return null;
  if (opts?.isAnsi === true && (decoded.codePointAt(0) ?? 0) >= 0x80) {
    opts.onEscalation?.(tok);
    return null;
  }
  opts?.onRewrite?.(tok, formatLegacyRewrite(decoded));
  return decoded;
}

// Old-style bare header statements (help.keyman.com "Header keywords"),
// matched pre-`begin` only. `BITMAPS` is the plural spelling of `BITMAP`.
// The mapping is the km-keyman ruling for #2633 (see
// ~/workspace/keyboard-studio-notes/2633-ruling.md): NAME / VERSION /
// COPYRIGHT / HOTKEY / BITMAP / MESSAGE become the matching system store
// (precedent: #4160/#4161 `VERSION 10.0` → `store(&VERSION) '10.0'`);
// LANGUAGE / LAYOUT have no modern store — `store(&LANGUAGE)` and
// `store(&LAYOUT)` are illegal since Keyman 10
// (validator/checks/deprecatedStores.ts, DeprecationChecks.cpp) — so those
// headers are dropped: the metadata belongs in the `.kps`.
const HEADER_STATEMENT_RE =
  /^(BITMAPS?|COPYRIGHT|HOTKEY|LANGUAGE|LAYOUT|MESSAGE|NAME|VERSION)\s+(.*)$/i;
const HEADER_STATEMENT_STORES: Record<string, string> = {
  NAME: "NAME",
  VERSION: "VERSION",
  COPYRIGHT: "COPYRIGHT",
  HOTKEY: "HOTKEY",
  BITMAP: "BITMAP",
  MESSAGE: "MESSAGE",
};
// Headers with no modern store: LANGUAGE / LAYOUT are dropped (the metadata
// belongs in the `.kps`); BITMAPS (two images, Keyman 3.2) has no
// single-store equivalent, so it is dropped with both filenames recorded.
const DROPPED_HEADER_STATEMENTS = new Set(["LANGUAGE", "LAYOUT", "BITMAPS"]);

interface ParsedHeaderStatement {
  /** Upper-cased keyword as written, e.g. "NAME". */
  keyword: string;
  /** System store the statement maps to, or null when the header is dropped. */
  storeName: string | null;
  /** Unquoted value text, e.g. "Test Keyboard" or "10.0". */
  value: string;
}

/**
 * Parse a pre-`begin` line as an old-style header statement, or null when
 * it is not one. The value must be exactly one quoted string or one bare
 * token — except BITMAPS, which takes two filenames. Anything else (missing
 * value, trailing junk) is not a header statement and falls through to the
 * unknown-pre-begin fragment path.
 */
function parseHeaderStatement(text: string): ParsedHeaderStatement | null {
  const m = HEADER_STATEMENT_RE.exec(text.trim());
  if (m === null) return null;
  const keyword = (m[1] ?? "").toUpperCase();
  const rawValue = (m[2] ?? "").trim();
  // BITMAPS takes two filenames ("a.bmp" "b.bmp"): no single-store
  // equivalent, so it is a dropped header — record both filenames (they
  // ride in the rewrite entry's sourceText), do not guess.
  if (keyword === "BITMAPS") {
    const two = /^("[^"]*"|'[^']*'|\S+)\s+("[^"]*"|'[^']*'|\S+)$/.exec(rawValue);
    if (two === null) return null;
    return { keyword, storeName: null, value: rawValue };
  }
  const quoted = /^"([^"]*)"$/.exec(rawValue) ?? /^'([^']*)'$/.exec(rawValue);
  let value: string;
  if (quoted !== null) {
    value = quoted[1] ?? "";
  } else if (/^\S+$/.test(rawValue)) {
    value = rawValue;
  } else {
    return null;
  }
  const storeName = HEADER_STATEMENT_STORES[keyword] ??
    (DROPPED_HEADER_STATEMENTS.has(keyword) ? null : undefined);
  if (storeName === undefined) return null;
  return { keyword, storeName, value };
}

/**
 * Translate an old-style HOTKEY string to the modern `store(&hotkey)`
 * virtual-key form (#2633 ruling §2): `^` = Ctrl, `%` = Alt, `+` = Shift,
 * then the letter key — `HOTKEY "^%A"` → `[CTRL ALT K_A]`. An
 * already-bracketed form (`[Alt Shift K_PAUSE]`) passes through verbatim.
 * Returns null for forms the mapping does not cover (non-letter keys) —
 * the caller then keeps the quoted-string form and records it.
 */
function translateHotkey(value: string): string | null {
  if (/^\[.*\]$/.test(value.trim())) return value.trim();
  const m = /^([\^%+]*)'?([A-Za-z])'?$/.exec(value.trim());
  if (m === null) return null;
  const mods: string[] = [];
  const marks = m[1] ?? "";
  if (marks.includes("^")) mods.push("CTRL");
  if (marks.includes("%")) mods.push("ALT");
  if (marks.includes("+")) mods.push("SHIFT");
  mods.push(`K_${(m[2] ?? "").toUpperCase()}`);
  return `[${mods.join(" ")}]`;
}

/** True when a raw fragment's source text declares `store(&NAME)` (system). */
function fragmentDeclaresSystemStore(frag: RawKmnFragment, name: string): boolean {
  const re = new RegExp(
    `^\\s*(?:\\$[^:]+:\\s*)?store\\s*\\(\\s*&${name}\\s*\\)`,
    "i",
  );
  return re.test(frag.sourceText);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a codepoint literal U+XXXX → string character, or return null. */
function parseCodepoint(tok: string): string | null {
  const m = /^U\+([0-9A-Fa-f]{4,6})$/.exec(tok);
  if (!m) return null;
  const cp = parseInt(m[1] ?? "0", 16);
  // Above the Unicode range: not a valid codepoint. isSmpLiteral only
  // intercepts these in strict mode, so lenient mode must guard here too
  // (String.fromCodePoint throws RangeError above U+10FFFF).
  if (cp > 0x10ffff) return null;
  return String.fromCodePoint(cp);
}

/** True if the codepoint literal is an SMP (> U+FFFF) value. */
function isSmpLiteral(tok: string): boolean {
  const m = /^U\+([0-9A-Fa-f]+)$/.exec(tok);
  if (!m) return false;
  return parseInt(m[1] ?? "0", 16) > 0xffff;
}

/** True if the token is wrapped in matching single or double quotes. */
function isQuoted(s: string): boolean {
  return (s.startsWith("'") && s.endsWith("'")) ||
         (s.startsWith('"') && s.endsWith('"'));
}

/** Strip single or double quotes from a quoted string token. */
function unquote(s: string): string {
  if (isQuoted(s)) return s.slice(1, -1);
  return s;
}

/**
 * Very small tokeniser for store/rule value lists.
 * Splits on whitespace but keeps:
 *   - quoted strings (single or double) together
 *   - bracket groups [...] together
 *   - parenthesised groups (...) together (e.g. index(store, N), dk(XXXX))
 * When `splitSeparatorPlus` is set (rule-context lists only), a top-level
 * `+` (the context/keystroke separator) also tokenises on its own, spaced
 * or not — except the `+` inside a `U+XXXX` literal (#2247). Store and
 * output lists pass false: `+` has no separator meaning there, so their
 * tokenisation is unchanged.
 */
function splitTokens(text: string, splitSeparatorPlus = false): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? "";
    // skip whitespace
    if (ch === " " || ch === "\t") { i++; continue; }
    // quoted string
    if (ch === "'" || ch === '"') {
      const q = ch;
      let j = i + 1;
      while (j < text.length && text[j] !== q) j++;
      result.push(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    // bracket group [...]
    if (ch === "[") {
      let j = i + 1;
      while (j < text.length && text[j] !== "]") j++;
      result.push(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    // bare token — read until whitespace, but keep parenthesised sub-groups
    // intact (e.g. index(store, N), dk(XXXX), any(store)).
    // ALSO stop at top-level quote and bracket characters so that adjacent
    // tokens such as `dk(1)" "` (deadkey followed by a quoted literal, no
    // whitespace required by kmcmplib) tokenise as two tokens rather than
    // one malformed run.
    // ALSO, for rule-context lists only (splitSeparatorPlus), stop at a
    // top-level `+` — the context/keystroke separator. kmcmplib lexes `+`
    // as its own token whether or not whitespace surrounds it, so an
    // unspaced form such as `dk(3)+ any(mey1)` (#2247) must tokenise as
    // `dk(3)`, `+`, `any(mey1)` — exactly the spaced form — instead of one
    // glued raw token `dk(3)+` that hides the deadkey from every typed-IR
    // consumer. This applies to the whole unspaced class (any `X+` / `+X`
    // where X is a bare token: dk(...), any(...), deadkey(...), a bareword
    // like `nul`, a paren group, …), on either side of the `+`. The one
    // exception is a `U+XXXX` codepoint literal: its `+` follows `U`/`u` and
    // precedes a hex digit and is never the separator (the same test the
    // validator's contextOrdering check uses). A `+` at the very start of a
    // bare token is emitted as a single-character token, so `+any(x)` and
    // `+[K_A]` also split. Store/output lists do not pass the flag: `+` is
    // not a separator there, and a corpus audit for #2247 found no typed
    // token glued by `+` in those positions (the sole glued output token in
    // 933 files is a raw word inside a misparsed comment tail, whose
    // segmentation is literal text, not separator structure).
    let j = i;
    let depth = 0;
    while (j < text.length) {
      const c = text[j] ?? "";
      if (c === "(") { depth++; j++; continue; }
      if (c === ")") { depth--; j++; continue; }
      if (depth === 0) {
        if (c === " " || c === "\t") break;
        if (c === "'" || c === '"' || c === "[") break;
        if (c === "+" && splitSeparatorPlus) {
          if (j === i) { j++; break; } // the separator itself: one-char token
          const prev = text[j - 1] ?? "";
          const next = text[j + 1] ?? "";
          const isCodepointPlus =
            (prev === "U" || prev === "u") && /[0-9A-Fa-f]/.test(next);
          if (!isCodepointPlus) break; // end this token before the separator
          // else: internal to a U+XXXX literal — consume and continue.
        }
      }
      j++;
    }
    result.push(text.slice(i, j));
    i = j;
  }
  return result.filter(t => t.length > 0);
}

/**
 * Parse a dk(name) token with a named (non-hex) identifier → the name
 * VERBATIM (the spelling of this occurrence is the element's stored form;
 * identity folding happens only through contracts' deadkeyNameKey), or
 * null. The named/hex boundary is contracts' isNamedDeadkeyName — one
 * definition: all-hex tokens are numeric deadkeys and never reach here
 * as names (#2238; the boundary does not move).
 */
function parseNamedDk(tok: string): string | null {
  const m = /^dk\s*\(\s*([^)]+)\s*\)$/i.exec(tok);
  if (!m) return null;
  const inner = (m[1] ?? "").trim();
  return isNamedDeadkeyName(inner) ? inner : null;
}

/** Parse a dk(NNNN) token where NNNN is hex → deadkey id number, or null. */
function parseDk(tok: string): number | null {
  const m = /^dk\s*\(\s*([0-9A-Fa-f]+)\s*\)$/i.exec(tok);
  if (!m) return null;
  return parseInt(m[1] ?? "0", 16);
}

// Recognised vkey-bracket modifier names (e.g. [SHIFT K_A]). Module-scoped so
// parseVkeyBracket doesn't rebuild the Set on every call — it runs once per
// bracket token across every store/context/output element parsed.
const KNOWN_VKEY_MODIFIERS = new Set([
  "SHIFT", "RALT", "LALT", "CTRL", "LCTRL", "RCTRL",
  "ALT", "CAPS", "NCAPS", "RSHIFT",
]);

/** Parse a modifier+vkey bracket group like [K_A] or [SHIFT K_A] → {name, modifiers}. */
function parseVkeyBracket(tok: string): { name: string; modifiers: string[] } | null {
  if (!tok.startsWith("[") || !tok.endsWith("]")) return null;
  const inner = tok.slice(1, -1).trim();
  const parts = inner.split(/\s+/);
  // The last part is the vkey name; everything before is modifiers.
  const vkeyParts: string[] = [];
  const modParts: string[] = [];
  for (const p of parts) {
    if (KNOWN_VKEY_MODIFIERS.has(p.toUpperCase())) {
      modParts.push(p.toUpperCase());
    } else {
      vkeyParts.push(p);
    }
  }
  if (vkeyParts.length !== 1) return null;
  return { name: vkeyParts[0] ?? "", modifiers: modParts };
}

// KMN store/group identifiers are more permissive than C-style: they allow
// hyphens, dots, colons, and non-ASCII letters (e.g. `store(non-subdot)`,
// `store(hamis-E:key)`, `store(a-ሳድስ)` in real released keyboards).
// kmcmplib's Validation::ValidateIdentifier only rejects empty names,
// over-length names, control chars, spaces, commas, parens, and Unicode
// non-characters — it does NOT reject leading digits, so `store(1)`,
// `store(12)` (malar_braille) are valid. Match that exactly: any sequence
// of one or more chars that are not whitespace, parens, or commas.
const KMN_IDENT = String.raw`[^\s\(\)\,]+`;

/** Returns a parser for keyword(storeName) → storeName. */
function makeStoreParser(keyword: string): (tok: string) => string | null {
  const re = new RegExp(`^${keyword}\\s*\\(\\s*(${KMN_IDENT})\\s*\\)$`, "i");
  return tok => { const m = re.exec(tok); return m ? (m[1] ?? null) : null; };
}

/** Parse any(storeName) → storeName, or null. */
const parseAny = makeStoreParser("any");

/** Parse notany(storeName) → storeName, or null. */
const parseNotAny = makeStoreParser("notany");

// Compiled once at module load — parseIndex runs on every context/output
// token, so recompiling this regex per call would recompile it once per
// token across the whole keyboard.
const INDEX_RE = new RegExp(`^index\\s*\\(\\s*(${KMN_IDENT})\\s*,\\s*(\\d+)\\s*\\)$`, "i");

/** Parse index(storeName, N) → {storeRef, offset}, or null. */
function parseIndex(tok: string): { storeRef: string; offset: number } | null {
  const m = INDEX_RE.exec(tok);
  if (!m) return null;
  return { storeRef: m[1] ?? "", offset: parseInt(m[2] ?? "0", 10) };
}

/** Parse context(N) → offset, or null. */
function parseContext(tok: string): number | null {
  const m = /^context\s*\(\s*(\d+)\s*\)$/i.exec(tok);
  if (!m) return null;
  return parseInt(m[1] ?? "0", 10);
}

/** Parse baselayout or baselayout('name') → layout name string (empty for bare form). */
function parseBaselayout(tok: string): string | null {
  if (!/^baselayout(\s*\(|$)/i.test(tok)) return null;
  const m = /^baselayout\s*\(\s*'?([^')]*)'?\s*\)/i.exec(tok);
  return m ? (m[1]?.trim() ?? "") : "";
}

/** Parse outs(storeName) → storeName, or null. */
const parseOuts = makeStoreParser("outs");

// Compiled once — parseIfGuard runs on every if(...) context token.
/** Parse `if(store = 'value')` (equality form only) → {store, value}, or null. */
const IF_GUARD_RE = new RegExp(
  String.raw`^if\s*\(\s*(${KMN_IDENT})\s*=\s*('[^']*'|"[^"]*")\s*\)$`,
  "i",
);

function parseIfGuard(tok: string): { store: string; value: string } | null {
  const m = IF_GUARD_RE.exec(tok);
  if (!m) return null;
  return { store: m[1] ?? "", value: unquote(m[2] ?? "") };
}

/**
 * True when every element parsed so far belongs to a rule's head cluster —
 * the only position a guard may be typed in (spec 103): leading guards
 * themselves, a `baselayout` head element, or a `platform(...)` head element
 * (which the codec carries as a raw element). A guard after any content
 * element or after the `+` keystroke separator (also a raw element) is not
 * typed; the caller keeps the rule opaque.
 */
function isHeadClusterSoFar(elements: ContextElement[]): boolean {
  return elements.every(
    (el) =>
      el.kind === "if" ||
      el.kind === "baselayout" ||
      (el.kind === "raw" && /^platform\s*\(/i.test(el.text.trim())),
  );
}

// Compiled once — parseUse runs on every output token, same rationale as
// INDEX_RE above.
const USE_RE = new RegExp(`^use\\s*\\(\\s*(${KMN_IDENT})\\s*\\)$`, "i");

/** Parse use(groupName) → groupName, or null. */
function parseUse(tok: string): string | null {
  const m = USE_RE.exec(tok);
  return m ? (m[1] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Store-body range notation (`X .. Y`, spec 042)
// ---------------------------------------------------------------------------

/**
 * Decode a single range endpoint token to its codepoint number, or null if it
 * is not a valid endpoint. An endpoint is either a `U+XXXX` literal (any plane,
 * via parseCodepoint) or a single-codepoint quoted literal (`'x'` / `"x"`).
 * A quoted literal whose content is not exactly one codepoint is NOT a valid
 * endpoint (→ malformed range).
 */
function decodeRangeEndpoint(tok: string): number | null {
  const cp = parseCodepoint(tok);
  if (cp !== null) return cp.codePointAt(0) ?? null;
  if (isQuoted(tok)) {
    const inner = unquote(tok);
    const chars = [...inner];
    if (chars.length === 1) return chars[0]?.codePointAt(0) ?? null;
  }
  return null;
}

/**
 * Split an unquoted token on the range operator `..`. Returns the text before
 * and after the operator, or null if the token is quoted or contains no `..`.
 * Used to recognise the no-whitespace / hybrid range spellings that arrive as a
 * single splitTokens token (`U+0905..U+0910`, `U+0905..`, `..U+0910`).
 */
function splitDotDot(tok: string): { before: string; after: string } | null {
  if (isQuoted(tok)) return null;
  const idx = tok.indexOf("..");
  if (idx === -1) return null;
  return { before: tok.slice(0, idx), after: tok.slice(idx + 2) };
}

type RangeDetection =
  | { kind: "range"; from: number; to: number; consumed: number }
  | { kind: "malformed"; consumed: number };

/**
 * Classify a codepoint range whose left endpoint is anchored at token index
 * `i`, given the decoded endpoints and how many tokens the construct spans.
 *
 * A `..` is only treated as a *codepoint*-range operator when at least ONE
 * endpoint decodes as a codepoint (`U+XXXX` or a single-char quoted literal).
 * When NEITHER decodes the construct is not ours — most importantly the vkey
 * range `[K_A]..[K_Z]` in `store(&CasedKeys)` — so we return null and let the
 * legacy per-token path handle the tokens (vkey, raw `..`, vkey) unchanged.
 * When exactly one endpoint decodes it is an intended-but-broken codepoint
 * range → malformed (the C9 cases: `U+0905 ..`, `U+0905 .. foo`, `'ab' .. U+0910`).
 * A mixed vkey/codepoint form (`[K_A] .. U+0060`) therefore also lands here as
 * malformed rather than falling through — deliberate: it is invalid Keyman (not
 * in the corpus), so surfacing the whole store opaque with a diagnostic reason
 * is safer than silently splitting it into a vkey + stray char.
 */
function classifyRange(from: number | null, to: number | null, consumed: number): RangeDetection | null {
  if (from === null && to === null) return null; // not a codepoint range (e.g. vkey range)
  if (from === null || to === null) return { kind: "malformed", consumed };
  return { kind: "range", from, to, consumed };
}

/**
 * Detect a codepoint range whose LEFT endpoint is at token index `i`. Returns
 * null when no such range is anchored here (caller handles the token normally),
 * a `range` result with decoded endpoints, or a `malformed` result when a `..`
 * operator is present with one decodable and one missing/undecodable endpoint.
 * Whitespace-independent: handles the spaced (`X .. Y`), no-space (`X..Y`), and
 * hybrid (`X..`, `..Y`) spellings (FR-002, FR-003). A bare `..` / leading `..Y`
 * token (left endpoint elsewhere) is NOT anchored here → null, so it is either
 * consumed by a range anchored at i-1 or falls to legacy handling.
 */
function detectRangeAt(toks: string[], i: number): RangeDetection | null {
  const cur = toks[i];
  if (cur === undefined) return null;
  const dd = splitDotDot(cur);

  // (a) the current token itself carries the `..` operator with a left part.
  if (dd !== null && dd.before !== "") {
    if (dd.after !== "") {
      // embedded `X..Y`
      return classifyRange(decodeRangeEndpoint(dd.before), decodeRangeEndpoint(dd.after), 1);
    }
    // trailing `X..`, second endpoint is the next token
    const next = toks[i + 1];
    const to = next !== undefined ? decodeRangeEndpoint(next) : null;
    return classifyRange(decodeRangeEndpoint(dd.before), to, next !== undefined ? 2 : 1);
  }

  // (b) the NEXT token carries the operator; `cur` is the intended left endpoint.
  const next = toks[i + 1];
  if (next === "..") {
    const toTok = toks[i + 2];
    const to = toTok !== undefined ? decodeRangeEndpoint(toTok) : null;
    return classifyRange(decodeRangeEndpoint(cur), to, toTok !== undefined ? 3 : 2);
  }
  const nextDd = next !== undefined ? splitDotDot(next) : null;
  if (nextDd !== null && nextDd.before === "" && nextDd.after !== "") {
    // next token is `..Y`
    return classifyRange(decodeRangeEndpoint(cur), decodeRangeEndpoint(nextDd.after), 2);
  }
  return null;
}

/**
 * A quoted store literal is bracketed menu-store syntax only when it is a
 * complete bracketed group with content ('[1ae 2a …]'). A lone '[' (or an
 * unterminated group) is a bracket character, not menu syntax.
 */
function isBracketedMenuLiteral(str: string): boolean {
  return str.length > 2 && str.startsWith("[") && str.endsWith("]");
}

/**
 * Parse the value list of a store declaration. Always returns the parsed
 * `items`; `opaqueReason` is non-null when the body carries a construct the
 * typed IR can't represent (named deadkey, SMP literal, bracketed menu-store
 * literal, malformed/descending range), in which case the caller wraps the
 * whole store as a RawKmnFragment with that reason.
 */
function parseStoreItems(
  rawValue: string,
  legacyOpts?: LegacyValueOptions,
): { items: StoreItem[]; opaqueReason: OpaqueReason | null } {
  const toks = splitTokens(rawValue);
  const items: StoreItem[] = [];
  for (let i = 0; i < toks.length; ) {
    const tok = toks[i] ?? "";
    // Range notation (`X .. Y`) — checked BEFORE the isSmpLiteral early-bail so
    // an astral range (U+11680 .. U+11689) expands into astral char items
    // instead of opaquing the whole store (spec 042, FR-005). A non-range
    // astral singleton still falls to the smp-literal branch below (C10).
    const range = detectRangeAt(toks, i);
    if (range !== null) {
      if (range.kind === "malformed") {
        return { items, opaqueReason: OPAQUE_REASONS.MALFORMED_RANGE };
      }
      if (range.from > range.to) {
        // descending — never fabricate a wrong-direction interior (FR-006).
        return { items, opaqueReason: OPAQUE_REASONS.DESCENDING_RANGE };
      }
      // from <= to: inclusive ascending expansion (from == to → one item).
      for (let cp = range.from; cp <= range.to; cp++) {
        items.push({ kind: "char", value: String.fromCodePoint(cp) });
      }
      i += range.consumed;
      continue;
    }
    // SMP literal
    if (isSmpLiteral(tok)) return { items, opaqueReason: OPAQUE_REASONS.SMP_LITERAL };
    // U+XXXX codepoint
    const cp = parseCodepoint(tok);
    if (cp !== null) {
      items.push({ kind: "char", value: cp });
      i++;
      continue;
    }
    // Legacy value format (#2633): d### / x### / octal ### → the character.
    // Decoded here so emit spells it U+XXXX (ANSI-guarded: see
    // tryLegacyValue — an escalated token falls through to the raw item).
    const legacy = tryLegacyValue(tok, legacyOpts);
    if (legacy !== null) {
      items.push({ kind: "char", value: legacy });
      i++;
      continue;
    }
    // quoted string — expand to individual chars
    if (isQuoted(tok)) {
      const str = unquote(tok);
      // Bracketed menu-store literal ('[1ae 2a …]') — old-style multi-tap
      // menu syntax: the bracketed entries are key sequences, not literal
      // characters, so expanding char-by-char would lose the menu semantics.
      // Preserve the whole store opaque instead. Only a COMPLETE bracketed
      // group with content counts: a lone '[' literal is a bracket
      // CHARACTER store (real keyboards do this — sil_yoruba8's
      // store(key.grv) '['), not menu syntax.
      if (isBracketedMenuLiteral(str)) {
        return { items, opaqueReason: OPAQUE_REASONS.MENU_STORE_SYNTAX };
      }
      for (const ch of str) {
        items.push({ kind: "char", value: ch });
      }
      i++;
      continue;
    }
    // dk(name) — named (non-hex) deadkey identifier: a typed name-carrying
    // element since #2238 (was opaque NAMED_DEADKEY pre-#2238). Mirrors the
    // context (parseContextElements) and output (parseOutputElements) parsers.
    // Checked before parseDk so a non-hex dk(...) is not silently dropped to raw.
    const namedStoreDk = parseNamedDk(tok);
    if (namedStoreDk !== null) {
      items.push({ kind: "namedDeadkey", name: namedStoreDk });
      i++;
      continue;
    }
    // dk(NNNN)
    const dkId = parseDk(tok);
    if (dkId !== null) {
      items.push({ kind: "deadkey", id: dkId });
      i++;
      continue;
    }
    // vkey bracket. The typed `StoreItem` "vkey" variant has no modifiers
    // field (locked contract — see @keyboard-studio/contracts's keyboard-ir.ts),
    // so a modifier-free bracket (`[K_E]`) parses to `{kind:"vkey"}` as before,
    // but a modifier-bearing bracket (`[SHIFT RALT K_E]`, as used by the
    // generalized S-08 "any(store) > index(store, N)" pattern) is preserved
    // verbatim as `{kind:"raw"}` rather than silently dropping its modifiers —
    // downstream consumers (modifierCombos.ts's resolveStoreKeyItem) re-parse
    // the bracket text via parseKeySpec to recover the combo.
    const vk = parseVkeyBracket(tok);
    if (vk !== null) {
      items.push(vk.modifiers.length > 0 ? { kind: "raw", text: tok } : { kind: "vkey", name: vk.name });
      i++;
      continue;
    }
    // outs(store) — inline expansion of another store's content. The typed
    // store-item model can't represent it, so (like parseOutputElements, which
    // classifies the same token as OPAQUE_REASONS.OUTS_EXPANSION) mark the whole
    // store opaque. Checked before the raw fallback so "outs(...)" is preserved
    // verbatim as a RawKmnFragment rather than emitted as literal store content
    // — which would produce broken .kmn once the store is referenced via
    // any()/notany().
    if (parseOuts(tok) !== null) {
      return { items, opaqueReason: OPAQUE_REASONS.OUTS_EXPANSION };
    }
    // if(...) / save|set|reset(...) / call(...) / return — option-store and
    // flow directives. These are not valid store-body content, but a malformed
    // source must not let them fall to a raw item (which would re-emit as broken
    // .kmn). Classify opaque, mirroring parseContextElements / parseOutputElements
    // so the whole token-classification-miss class is closed across all three.
    if (/^if\s*\(/i.test(tok)) {
      return { items, opaqueReason: OPAQUE_REASONS.IF_OPTION_STORE };
    }
    if (/^(?:save|set|reset)\s*\(/i.test(tok)) {
      return { items, opaqueReason: OPAQUE_REASONS.OPTION_STORE_DIRECTIVE };
    }
    if (/^call\s*\(/i.test(tok) || /^return$/i.test(tok)) {
      return { items, opaqueReason: OPAQUE_REASONS.CALL_RETURN };
    }
    // bare identifier (treated as raw if unrecognized)
    items.push({ kind: "raw", text: tok });
    i++;
  }
  return { items, opaqueReason: null };
}

/**
 * Lenient sketch of a store body for an opaque store fragment: flattens
 * `outs(name)` from previously seen stores, keeps SMP literals as char items and
 * named deadkeys as typed name-carrying items (verbatim name — #2238 deleted
 * the per-parse synthetic-id interning; no synthetic ids exist anywhere now).
 * Unresolvable tokens are skipped. Returns undefined when nothing resolves.
 */
/** Largest sketch (in items) kept for one opaque store; past it the sketch is dropped, never truncated. */
const MAX_SKETCH_ITEMS = 0x20000;

function sketchStoreItems(
  rawValue: string,
  known: Map<string, StoreItem[]>,
  isAnsiSketch = false,
): StoreItem[] | undefined {
  const out: StoreItem[] = [];
  const toks = splitTokens(rawValue);
  for (let i = 0; i < toks.length; ) {
    const tok = toks[i] ?? "";
    const range = detectRangeAt(toks, i);
    if (range !== null) {
      if (range.kind !== "malformed" && range.from <= range.to && range.to - range.from <= 0x10000) {
        if (out.length + (range.to - range.from + 1) > MAX_SKETCH_ITEMS) return undefined;
        for (let cp = range.from; cp <= range.to; cp++) out.push({ kind: "char", value: String.fromCodePoint(cp) });
      }
      i += range.consumed;
      continue;
    }
    i++;
    const cp = parseCodepoint(tok);
    if (cp !== null) { out.push({ kind: "char", value: cp }); continue; }
    // Legacy value format (#2633): decode silently, ANSI-guarded — the
    // sketch is best-effort and the fragment preserves the source text.
    const legacy = tryLegacyValue(tok, { isAnsi: isAnsiSketch });
    if (legacy !== null) { out.push({ kind: "char", value: legacy }); continue; }
    if (isSmpLiteral(tok)) {
      const m = /^U\+([0-9A-Fa-f]+)$/.exec(tok);
      out.push({ kind: "char", value: String.fromCodePoint(parseInt(m?.[1] ?? "0", 16)) });
      continue;
    }
    if (isQuoted(tok)) {
      // Bracketed menu-store literal: its entries are key sequences, not
      // chars — contribute nothing rather than fabricating char items.
      if (isBracketedMenuLiteral(unquote(tok))) continue;
      for (const ch of unquote(tok)) out.push({ kind: "char", value: ch });
      if (out.length > MAX_SKETCH_ITEMS) return undefined;
      continue;
    }
    const namedSketchDk = parseNamedDk(tok);
    if (namedSketchDk !== null) {
      out.push({ kind: "namedDeadkey", name: namedSketchDk });
      continue;
    }
    const dkId = parseDk(tok);
    if (dkId !== null) { out.push({ kind: "deadkey", id: dkId }); continue; }
    const ref = parseOuts(tok);
    if (ref !== null) {
      const key = ref.toLowerCase();
      const items = known.get(key);
      if (items !== undefined) {
        if (out.length + items.length > MAX_SKETCH_ITEMS) return undefined;
        for (const it of items) out.push(it);
      }
      continue;
    }
    const vk = parseVkeyBracket(tok);
    if (vk !== null) {
      out.push(vk.modifiers.length > 0 ? { kind: "raw", text: tok } : { kind: "vkey", name: vk.name });
    }
  }
  return out.length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// Context / output element parsers
// ---------------------------------------------------------------------------

/**
 * Parse a list of context element tokens (LHS of a rule, after stripping the
 * leading `+ [vkey]` prefix if present).
 *
 * Returns `null` if any token triggers an opaque reason; caller should wrap
 * the rule in a RawKmnFragment.
 */
function parseContextElements(
  toks: string[],
  opaqueOut: { reason: string | null },
  legacyOpts?: LegacyValueOptions,
): ContextElement[] | null {
  const elements: ContextElement[] = [];
  for (const tok of toks) {
    // SMP literal
    if (isSmpLiteral(tok)) {
      opaqueOut.reason = OPAQUE_REASONS.SMP_LITERAL;
      return null;
    }
    // U+XXXX
    const cp = parseCodepoint(tok);
    if (cp !== null) {
      elements.push({ kind: "char", value: cp });
      continue;
    }
    // Legacy value format (#2633): d### / x### / octal ### → the character
    // (ANSI-guarded: an escalated token falls through to the raw element).
    const legacy = tryLegacyValue(tok, legacyOpts);
    if (legacy !== null) {
      elements.push({ kind: "char", value: legacy });
      continue;
    }
    // quoted string
    if (isQuoted(tok)) {
      const str = unquote(tok);
      for (const ch of str) {
        elements.push({ kind: "char", value: ch });
      }
      continue;
    }
    // [VKEY] bracket
    const vk = parseVkeyBracket(tok);
    if (vk !== null) {
      elements.push({ kind: "vkey", name: vk.name, modifiers: vk.modifiers });
      continue;
    }
    // dk(name) — named (non-hex) deadkey identifier: typed name-carrying
    // element since #2238 (was opaque NAMED_DEADKEY pre-#2238).
    const namedCtxDk = parseNamedDk(tok);
    if (namedCtxDk !== null) {
      elements.push({ kind: "namedDeadkey", name: namedCtxDk });
      continue;
    }
    // dk(NNNN)
    const dkId = parseDk(tok);
    if (dkId !== null) {
      elements.push({ kind: "deadkey", id: dkId });
      continue;
    }
    // any(store)
    const anyRef = parseAny(tok);
    if (anyRef !== null) {
      elements.push({ kind: "any", storeRef: anyRef });
      continue;
    }
    // notany(store)
    const notAnyRef = parseNotAny(tok);
    if (notAnyRef !== null) {
      elements.push({ kind: "notany", storeRef: notAnyRef });
      continue;
    }
    // context(N) in context position — 076 FR-004: N greater than one is a
    // typed indexed-context reference. Degenerate offsets (0, and 1 in
    // context position) cannot be modelled faithfully, so the rule goes
    // opaque (INDEXED_CONTEXT) rather than fabricating a meaning.
    const ctxOffset = parseContext(tok);
    if (ctxOffset !== null) {
      if (ctxOffset > 1) {
        elements.push({ kind: "context", offset: ctxOffset });
        continue;
      }
      opaqueOut.reason = OPAQUE_REASONS.INDEXED_CONTEXT;
      return null;
    }
    // index(store, N) in context position
    const idxCtx = parseIndex(tok);
    if (idxCtx !== null) {
      elements.push({ kind: "index", storeRef: idxCtx.storeRef, offset: idxCtx.offset });
      continue;
    }
    // baselayout keyword — bare or baselayout('en-US') / baselayout()
    const baselayoutValue = parseBaselayout(tok);
    if (baselayoutValue !== null) {
      elements.push({ kind: "baselayout", value: baselayoutValue });
      continue;
    }
    // outs(store) — store-expansion reference in context position: opaque.
    // Mirrors parseOutputElements / parseStoreItems; without this a context
    // outs() would fall to a raw item and emit broken .kmn.
    if (parseOuts(tok) !== null) {
      opaqueOut.reason = OPAQUE_REASONS.OUTS_EXPANSION;
      return null;
    }
    // if(store = 'value') — a typed guard element when the guard is an
    // equality guard inside the head cluster (spec 103 FR-002). Anything
    // else — a not-equal or comma-form guard, an unparseable head, or a
    // guard after content / the keystroke separator — stays opaque with
    // the existing reason (FR-003): never mistyped, never dropped.
    if (/^if\s*\(/i.test(tok)) {
      const guard = parseIfGuard(tok);
      if (guard !== null && isHeadClusterSoFar(elements)) {
        elements.push({ kind: "if", store: guard.store, value: guard.value });
        continue;
      }
      opaqueOut.reason = OPAQUE_REASONS.IF_OPTION_STORE;
      return null;
    }
    // save/set/reset — opaque
    if (/^(?:save|set|reset)\s*\(/i.test(tok)) {
      opaqueOut.reason = OPAQUE_REASONS.OPTION_STORE_DIRECTIVE;
      return null;
    }
    // call/return — opaque
    if (/^call\s*\(/i.test(tok) || /^return$/i.test(tok)) {
      opaqueOut.reason = OPAQUE_REASONS.CALL_RETURN;
      return null;
    }
    // unknown — wrap as raw
    elements.push({ kind: "raw", text: tok });
  }
  return elements;
}

/**
 * Parse the output (RHS) of a rule.
 * Returns null on opaque construct; sets opaqueOut.reason.
 */
function parseOutputElements(
  toks: string[],
  opaqueOut: { reason: string | null },
  legacyOpts?: LegacyValueOptions,
): OutputElement[] | null {
  return parseOutputElementsCore(toks, "strict", opaqueOut, legacyOpts);
}

/**
 * Lenient variant of the output-element walk, used to build the best-effort
 * `RawKmnFragment.producedOutput` sketch for rules the strict parser opaques.
 * Never bails: constructs the strict mode rejects become typed elements where
 * the OutputElement union can express them (SMP literal → char, outs → outs)
 * and `{kind:"raw"}` placeholders otherwise, so unknown content still breaks
 * a char run in the produced-set walker. Output-side tokens only — callers
 * must pass RHS tokens, never context/guard content.
 */
function extractProducedOutput(toks: string[]): OutputElement[] {
  // The lenient core never returns null; the fallback keeps the types honest.
  return parseOutputElementsCore(toks, "lenient", { reason: null }) ?? [];
}

function parseOutputElementsCore(
  toks: string[],
  mode: "strict" | "lenient",
  opaqueOut: { reason: string | null },
  legacyOpts?: LegacyValueOptions,
): OutputElement[] | null {
  const elements: OutputElement[] = [];
  for (const tok of toks) {
    // SMP literal — strict opaques the rule; lenient decodes it (parseCodepoint
    // below accepts 4-6 hex digits).
    if (mode === "strict" && isSmpLiteral(tok)) {
      opaqueOut.reason = OPAQUE_REASONS.SMP_LITERAL;
      return null;
    }
    // U+XXXX
    const cp = parseCodepoint(tok);
    if (cp !== null) {
      elements.push({ kind: "char", value: cp });
      continue;
    }
    // Legacy value format (#2633): d### / x### / octal ### → the character
    // (ANSI-guarded: an escalated token falls through to the raw element).
    // In lenient mode (produced-output sketch) the decode is silent: the
    // sketch is best-effort and the fragment preserves the source text.
    const legacy = tryLegacyValue(tok, legacyOpts);
    if (legacy !== null) {
      elements.push({ kind: "char", value: legacy });
      continue;
    }
    // quoted string
    if (isQuoted(tok)) {
      const str = unquote(tok);
      for (const ch of str) {
        elements.push({ kind: "char", value: ch });
      }
      continue;
    }
    // dk(name) — named (non-hex) deadkey identifier: typed name-carrying
    // element since #2238 in BOTH modes (was opaque in strict mode and a
    // raw placeholder in the lenient produced-output sketch pre-#2238).
    const namedOutDk = parseNamedDk(tok);
    if (namedOutDk !== null) {
      elements.push({ kind: "namedDeadkey", name: namedOutDk });
      continue;
    }
    // dk(NNNN)
    const dkId = parseDk(tok);
    if (dkId !== null) {
      elements.push({ kind: "deadkey", id: dkId });
      continue;
    }
    // beep keyword
    if (tok.toLowerCase() === "beep") {
      elements.push({ kind: "beep" });
      continue;
    }
    // nul keyword — typed suppression marker (076 FR-004). Case-insensitive
    // like beep; a bare token only (splitTokens never yields `nul` glued to
    // neighbours except inside quotes/parens, which don't reach this branch).
    if (tok.toLowerCase() === "nul") {
      elements.push({ kind: "nul" });
      continue;
    }
    // context / context(N) in output position — typed context references
    // (076 FR-004). Bare `context` re-emits the whole matched context and is
    // represented as offset 0; `context(N)` (N >= 1) the Nth character of the
    // matched context. `context(0)` is malformed: strict mode opaques the
    // rule, lenient mode keeps a raw placeholder (never bails).
    if (tok.toLowerCase() === "context") {
      elements.push({ kind: "context", offset: 0 });
      continue;
    }
    const ctxOutOffset = parseContext(tok);
    if (ctxOutOffset !== null) {
      if (ctxOutOffset < 1) {
        if (mode === "strict") {
          opaqueOut.reason = OPAQUE_REASONS.INDEXED_CONTEXT;
          return null;
        }
        elements.push({ kind: "raw", text: tok });
        continue;
      }
      elements.push({ kind: "context", offset: ctxOutOffset });
      continue;
    }
    // index(store, N)
    const idx = parseIndex(tok);
    if (idx !== null) {
      elements.push({ kind: "index", storeRef: idx.storeRef, offset: idx.offset });
      continue;
    }
    // outs(store) — opaque in strict mode (round-trip fidelity); the typed
    // element is fine for the lenient produced-set sketch.
    const outsRef = parseOuts(tok);
    if (outsRef !== null) {
      if (mode === "strict") {
        opaqueOut.reason = OPAQUE_REASONS.OUTS_EXPANSION;
        return null;
      }
      elements.push({ kind: "outs", storeRef: outsRef });
      continue;
    }
    // use(group) in output — typed group-transition node (#268). Not opaque:
    // the rule stays typed; emit.ts renders it back to use(groupName).
    const useRef = parseUse(tok);
    if (useRef !== null) {
      elements.push({ kind: "useGroup", groupName: useRef });
      continue;
    }
    // save/set/reset — opaque; not producible content (the quoted value stays
    // inside the paren-group token, so it cannot leak as a char element).
    if (/^(?:save|set|reset)\s*\(/i.test(tok)) {
      if (mode === "strict") {
        opaqueOut.reason = OPAQUE_REASONS.OPTION_STORE_DIRECTIVE;
        return null;
      }
      elements.push({ kind: "raw", text: tok });
      continue;
    }
    // call/return — opaque; not producible content
    if (/^call\s*\(/i.test(tok) || /^return$/i.test(tok)) {
      if (mode === "strict") {
        opaqueOut.reason = OPAQUE_REASONS.CALL_RETURN;
        return null;
      }
      elements.push({ kind: "raw", text: tok });
      continue;
    }
    // unknown — wrap as raw
    elements.push({ kind: "raw", text: tok });
  }
  return elements;
}

// ---------------------------------------------------------------------------
// Rule line parser
// ---------------------------------------------------------------------------

interface ParsedRuleLine {
  /** Context tokens (LHS before `>`). */
  contextRaw: string;
  /** Output tokens (RHS after `>`). */
  outputRaw: string;
  /** Optional trailing comment stripped from output side. */
  trailingComment: string | undefined;
}

/**
 * Split a rule line on the first `>` that is not inside brackets or quotes.
 */
function splitOnArrow(text: string): { lhs: string; rhs: string } | null {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (inSingle || inDouble) continue;
    if (ch === "[") { depth++; continue; }
    if (ch === "]") { depth--; continue; }
    if (depth === 0 && ch === ">") {
      return { lhs: text.slice(0, i).trim(), rhs: text.slice(i + 1).trim() };
    }
  }
  return null;
}

/**
 * Strip a trailing `c <comment>` (or bare `c`) from a KMN source value.
 *
 * kmcmplib's lexer treats a whitespace-delimited `c` token — outside of quotes
 * and bracket groups — as the start of a line comment. This scan is quote- and
 * bracket-aware so a `c` inside a quoted output string (e.g. `'a c b'`) or a
 * key name (`[K_C]`) is not mistaken for a comment start. Used for both rule
 * RHS values and store values (both can carry a trailing `c` comment).
 *
 * Returns { rhs, trailingComment } — `rhs` with the comment removed (trimmed),
 * and the comment text (undefined when absent; an empty bare-`c` comment is
 * normalized to undefined).
 */
function stripTrailingComment(rhs: string): { rhs: string; trailingComment: string | undefined } {
  let inS = false;
  let inD = false;
  let depth = 0;
  for (let i = 0; i < rhs.length; i++) {
    const ch = rhs[i];
    if (ch === "'" && !inD) { inS = !inS; continue; }
    if (ch === '"' && !inS) { inD = !inD; continue; }
    if (inS || inD) continue;
    if (ch === "[") { depth++; continue; }
    if (ch === "]") { depth--; continue; }
    // A comment starts at an unquoted, depth-0 `c` bounded by whitespace on the
    // left and by whitespace (or end-of-string) on the right.
    if (
      depth === 0 &&
      ch === "c" &&
      /\s/.test(rhs[i - 1] ?? "") &&
      (i === rhs.length - 1 || /\s/.test(rhs[i + 1] ?? ""))
    ) {
      const stripped = rhs.slice(0, i).trim();
      const commentText = rhs.slice(i + 1).trim();
      return { rhs: stripped, trailingComment: commentText || undefined };
    }
  }
  return { rhs, trailingComment: undefined };
}

function parseRuleLine(text: string): ParsedRuleLine | null {
  // Strip leading `+` if present
  let body = text;
  if (body.startsWith("+")) {
    body = body.slice(1).trim();
  }
  const split = splitOnArrow(body);
  if (!split) return null;
  const { trailingComment, rhs: cleanRhs } = stripTrailingComment(split.rhs);
  return {
    contextRaw: split.lhs,
    outputRaw: cleanRhs,
    trailingComment,
  };
}

// ---------------------------------------------------------------------------
// Store declaration parser
// ---------------------------------------------------------------------------

interface ParsedStore {
  name: string;
  isSystem: boolean;
  rawValue: string;
  trailingComment: string | undefined;
}

/**
 * Parse `store(<name>) <value>` → name + value.
 * Throws on malformed syntax.
 */
function parseStoreLine(text: string, line: number): ParsedStore {
  const m = new RegExp(`^store\\s*\\(\\s*(&?${KMN_IDENT})\\s*\\)\\s*(.*)`, "is").exec(text);
  if (!m) {
    throw new Error(`Malformed store declaration at line ${line}: ${text}`);
  }
  const rawName = m[1] ?? "";
  const isSystem = rawName.startsWith("&");
  const upper = rawName.slice(1).toUpperCase();
  const name = isSystem ? (CANONICAL_SYSTEM_STORE[upper] ?? upper) : rawName;
  // Strip a trailing `c <comment>`: kmcmplib treats it as a line comment, not
  // store content, so it must not leak into store items or system-store header
  // values. Quote/bracket-aware so a `c` inside a quoted value is preserved.
  const { rhs: rawValue, trailingComment } = stripTrailingComment((m[2] ?? "").trim());
  return { name, isSystem, rawValue, trailingComment };
}

// ---------------------------------------------------------------------------
// Group declaration parser
// ---------------------------------------------------------------------------

function parseGroupLine(text: string): { name: string; usingKeys: boolean } | null {
  const m = new RegExp(`^group\\s*\\(\\s*(${KMN_IDENT})\\s*\\)(.*)`, "i").exec(text);
  if (!m) return null;
  const usingKeys = /using\s+keys/i.test(m[2] ?? "");
  return { name: m[1] ?? "", usingKeys };
}

/**
 * True for the reserved `begin` entry-point group names (spec 076 FR-004).
 * These groups are entered by the engine on new-context / post-keystroke
 * events, never via `use()`; they are modelled for fidelity only —
 * `readonly`, never reorder hooks. Matched case-insensitively; KMN group
 * names are matched case-insensitively by the compiler.
 */
function isReservedEntryGroup(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "newcontext" || lower === "postkeystroke";
}

// ---------------------------------------------------------------------------
// Begin directive parser
// ---------------------------------------------------------------------------

function parseBeginLine(text: string): { encoding: string; entryGroup: string } | null {
  const m = new RegExp(`^begin\\s+(\\w+)\\s*>\\s*use\\s*\\(\\s*(${KMN_IDENT})\\s*\\)`, "i").exec(text);
  if (!m) return null;
  return { encoding: m[1] ?? "Unicode", entryGroup: m[2] ?? "" };
}

// ---------------------------------------------------------------------------
// Main parse function
// ---------------------------------------------------------------------------

/**
 * Parse a .kmn source file into a KeyboardIR.
 *
 * @param text       Raw .kmn file text.
 * @param keyboardId Keyboard identifier (typically the filename stem).
 * @returns ParseResult with the IR and an opaque feature inventory.
 * @throws  Error with `line:col` if hard syntax errors are found.
 */
export function parse(text: string, keyboardId: string): ParseResult {
  const minter = new NodeIdMinter();
  const tokens = tokenize(text);

  // Accumulate output collections.
  const stores: IRStore[] = [];
  const groups: IRGroup[] = [];
  const comments: IRComment[] = [];
  const rawFragments: RawKmnFragment[] = [];
  // Store bodies seen so far (lowercased name), for flattening outs() in sketches.
  const knownStoreItems = new Map<string, StoreItem[]>();

  // Opaque feature count map.
  const opaqueCount = new Map<string, number>();

  function bumpOpaque(reason: string): void {
    opaqueCount.set(reason, (opaqueCount.get(reason) ?? 0) + 1);
  }

  // Parse state.
  let headerParsed = false; // true after we see `begin`
  let currentGroup: IRGroup | null = null;
  // Encoding from the first `begin` directive; stored in IRHeader.encoding.
  let beginEncoding: "Unicode" | "ANSI" | undefined;
  // Entry group from the first `begin <encoding> > use(<group>)` directive;
  // stored in IRHeader.entryPoints.main (spec 076 FR-004). First wins,
  // mirroring the encoding rule above.
  let beginEntryGroup: string | undefined;

  // Track "pending leading comments" — comments that haven't been anchored yet.
  let pendingComments: Array<{ text: string; line: number }> = [];

  /**
   * Flush pending comments as freestanding (called when the next token is not
   * a rule or store that can absorb them).
   */
  function flushCommentsFreestanding(): void {
    for (const c of pendingComments) {
      const fc: IRComment = {
        nodeId: minter.mint("comment"),
        text: c.text,
        anchor: "freestanding",
        sourceLine: c.line,
      };
      comments.push(fc);
    }
    pendingComments = [];
  }

  // ---- Header system store extraction ----
  // We collect system stores by name for IRHeader construction.
  const sysStores: Record<string, string> = {};

  // ---- Deprecated-form rewrites (#2633) ----
  // Every rewrite the parser performs on a deprecated form is recorded here
  // (kind, source line, what the line was, what it became) and returned in
  // ParseResult.rewrites so the import can show it in the as-built notes.
  const rewrites: DeprecatedRewrite[] = [];
  function recordRewrite(
    kind: DeprecatedRewrite["kind"],
    sourceLine: number,
    sourceText: string,
    rewrittenText: string,
  ): void {
    rewrites.push({ kind, sourceLine, sourceText, rewrittenText });
  }
  // Header statements collected during the loop, finalised after it — only
  // then is it known whether a real store() declaration already provides
  // the value (a real store wins, either order).
  interface PendingHeader {
    keyword: string;
    storeName: string | null;
    value: string;
    line: number;
    sourceText: string;
  }
  const pendingHeaders: PendingHeader[] = [];
  // Set when a rule is rewritten with a platform() guard — a guard needs
  // store(&version) >= '9.0' (see raiseVersionForPlatformGuards below).
  let addedPlatformGuards = false;
  // Original (prefix-stripped) line text of targeted typed stores, by nodeId,
  // plus the raw value for system stores — the post-loop store merge needs
  // both to write its rewrite records and fix up sysStores. `selector`
  // records which prefix the store came from (the merge deletes the
  // survivor's targetSelector, so the conflict pass reads it here).
  const storeSourceText = new Map<
    string,
    { text: string; rawValue: string; selector: TargetSelector }
  >();

  // Encoding breakpoints for the §3 ANSI guard: (line, encoding) of each
  // `begin` directive in source order. A line's enclosing encoding is the
  // most recent begin at or before it; before any begin, the file's FIRST
  // begin encoding (the same first-wins convention as IRHeader.encoding).
  const encodingBreakpoints: Array<{ line: number; encoding: "Unicode" | "ANSI" }> = [];
  for (const t of tokens) {
    if (t.kind !== "begin") continue;
    const b = parseBeginLine(t.text);
    if (b !== null && (b.encoding === "Unicode" || b.encoding === "ANSI")) {
      encodingBreakpoints.push({ line: t.line, encoding: b.encoding });
    }
  }
  function isAnsiLine(line: number): boolean {
    let current: "Unicode" | "ANSI" | undefined;
    for (const bp of encodingBreakpoints) {
      if (bp.line <= line) current = bp.encoding;
      else break;
    }
    if (current === undefined) current = encodingBreakpoints[0]?.encoding;
    return current === "ANSI";
  }
  /** Legacy-value options for a source line: ANSI guard + rewrite recording. */
  function legacyOptsFor(line: number): LegacyValueOptions {
    return {
      isAnsi: isAnsiLine(line),
      onRewrite: (original, rewritten) =>
        recordRewrite("legacy-value-format", line, original, rewritten),
      onEscalation: (original) =>
        recordRewrite(
          "legacy-value-format",
          line,
          original,
          `(kept as ${original} — a begin ANSI value ≥ 128 is a code-page byte, not a Unicode codepoint; needs a code-page decision)`,
        ),
    };
  }
  /**
   * Source text of a fragment line, preserving a stripped target-selector
   * prefix (#2633): opaque lines are NOT rewritten, so the gate stays
   * visible in the fragment. `$keyman:` ("both") is a no-op and is dropped.
   */
  function fragmentSourceText(tok: Token): string {
    if (tok.targetSelector === "keyman" || tok.targetSelector === undefined) return tok.text;
    return `$${tok.targetSelector}: ${tok.text}`;
  }
  /**
   * Record the drop of a `$keyman:` ("both") prefix — semantics-preserving,
   * so it is dropped wherever it appears (typed and opaque lines alike).
   */
  function recordKeymanDrop(tok: Token): void {
    if (tok.targetSelector === "keyman") {
      recordRewrite("target-selector", tok.line, `$keyman: ${tok.text}`, tok.text);
    }
  }

  /**
   * Bump every index(store, N) offset in a rule's source text by one — the
   * record of a guard rewrite, mirroring the IR change below. Only the code
   * part is touched (a trailing `c <comment>` may mention index() without
   * referring to a rule position). The text is returned unchanged when it
   * holds no index() call, so spacing is preserved exactly in that case.
   */
  function bumpIndexOffsetsInRuleText(text: string): string {
    if (!/\bindex\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*\d+\s*\)/i.test(text)) return text;
    const { rhs, trailingComment } = stripTrailingComment(text);
    const bumped = rhs.replace(
      /\bindex\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\d+)\s*\)/gi,
      (_m, store: string, n: string) => `index(${store}, ${Number(n) + 1})`,
    );
    return trailingComment === undefined ? bumped : `${bumped} c ${trailingComment}`;
  }

  /**
   * Rewrite a typed rule's target-selector prefix (#2633 §1): `$keyman:`
   * ("both") is dropped; `$keymanonly:` becomes one rule guarded
   * `platform('desktop native')`; `$keymanweb:` becomes THREE rules guarded
   * `platform('web')` / `platform('phone native')` / `platform('tablet
   * native')` (no single "js build" token exists). Returns the rules to
   * push — the first keeps `base.nodeId` (leading/trailing comments anchor
   * to it), the web copies mint fresh nodeIds and drop the trailing comment.
   * Sets `addedPlatformGuards` when any guard is added.
   *
   * Guard placement (verified against kmc 19.0.320-beta, exp1–exp6): the
   * guard goes FIRST in the context, and every index(store, N) offset is
   * bumped by one. index() pairs with the Nth context position (1-based,
   * counting every element including zero-width if()/platform() calls, and
   * counting multi-char strings per character) — a guard inserted before a
   * paired any() without the bump makes kmc report "An index() in the
   * output does not have a corresponding any() statement" (0x502032).
   * outs() is unaffected by guard position (no offset to track).
   */
  function applyTargetSelectorToRule(base: IRRule, tok: Token): IRRule[] {
    const selector = tok.targetSelector;
    if (selector === undefined) return [base];
    if (selector === "keyman") {
      recordRewrite("target-selector", tok.line, `$keyman: ${tok.text}`, tok.text);
      return [base];
    }
    const guards =
      selector === "keymanonly" ? [DESKTOP_PLATFORM_GUARD] : [...WEB_PLATFORM_GUARDS];
    addedPlatformGuards = true;
    const bumpedText = bumpIndexOffsetsInRuleText(tok.text);
    const rewrittenText = guards.map((g) => `${g} ${bumpedText}`).join("; ");
    recordRewrite("target-selector", tok.line, `$${selector}: ${tok.text}`, rewrittenText);
    return guards.map((guard, i) => {
      // index() offsets (context and output) are 1-based context positions;
      // the guard prepended below shifts every paired any() one position
      // later, so each offset is bumped by one. Elements are cloned — the
      // web copies must not share (and re-bump) base's elements.
      const context: ContextElement[] = [
        { kind: "raw", text: guard },
        ...base.context.map((el) =>
          el.kind === "index" ? { ...el, offset: el.offset + 1 } : el,
        ),
      ];
      const output = base.output.map((el) =>
        el.kind === "index" ? { ...el, offset: el.offset + 1 } : el,
      );
      // In a `using keys` group the `+` keystroke separator belongs AFTER
      // the guard, immediately before the KEY — the LAST context element
      // (the key is the last element by KMN definition, whatever its kind:
      // vkey, any(), char). kmc rejects `+ platform(...)` ("Invalid
      // statement in key part") and, in a non-keys group, `platform(...)
      // + <key>` — so in a non-keys group no `+` is inserted at all
      // (emitRule prepends none there either). Attested corpus shape:
      // `platform('touch') any(x) + [K_A]`.
      if (
        currentGroup?.usingKeys === true &&
        !context.some((el) => isPlusSeparator(el)) &&
        context.length > 1
      ) {
        context.splice(context.length - 1, 0, { kind: "raw", text: "+" });
      }
      const copy: IRRule = {
        nodeId: i === 0 ? base.nodeId : minter.mint("rule"),
        context,
        output,
        ...(base.sourceLine !== undefined ? { sourceLine: base.sourceLine } : {}),
      };
      if (i === 0 && base.trailingComment !== undefined) {
        copy.trailingComment = base.trailingComment;
      }
      return copy;
    });
  }

  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti];
    if (!tok) continue;

    switch (tok.kind) {
      case "blank":
        // Blank lines flush pending leading comments as freestanding.
        flushCommentsFreestanding();
        break;

      case "comment": {
        // Queue as pending — next rule/store may absorb it as "leading".
        pendingComments.push({ text: tok.text, line: tok.line });
        break;
      }

      case "begin": {
        const parsed = parseBeginLine(tok.text);
        if (!parsed) {
          throw new Error(`Malformed begin directive at line ${tok.line}:${tok.col}: ${tok.text}`);
        }
        // A target-prefixed begin line is pathological (no corpus case):
        // the prefix is dropped, the entry point kept, and the drop recorded.
        recordKeymanDrop(tok);
        if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
          recordRewrite(
            "target-selector",
            tok.line,
            `$${tok.targetSelector}: ${tok.text}`,
            `${tok.text} (prefix dropped — an entry point cannot be target-gated; needs review)`,
          );
        }
        // Record the encoding for IRHeader.encoding so that isMnemonicKeyboard()
        // can detect ANSI vs Unicode keyboards at import time.  The encoding
        // value from the FIRST begin directive wins (Unicode beats ANSI when
        // both are present in the same file — the parser tracks last-seen, but
        // for v1 keyboards with a single begin directive this is unambiguous).
        headerParsed = true;
        // Store the encoding string so we can attach it to the header after the
        // loop. Use a local variable captured by the closure below.
        if (beginEncoding === undefined) {
          beginEncoding = parsed.encoding as "Unicode" | "ANSI";
          // The entry group travels with the encoding: first begin directive
          // wins for both, so a multi-begin keyboard keeps its declared entry.
          beginEntryGroup = parsed.entryGroup || undefined;
        }
        flushCommentsFreestanding();
        break;
      }

      case "store": {
        const parsed = parseStoreLine(tok.text, tok.line);

        // Determine the nodeId reference for comment anchoring.
        const storeNodeId = minter.mint("store");

        // Attach pending comments as leading comments for this store.
        for (const c of pendingComments) {
          const ref = { kind: "store" as const, nodeId: storeNodeId };
          comments.push({
            nodeId: minter.mint("comment"),
            text: c.text,
            anchor: "leading",
            anchorRef: ref,
            sourceLine: c.line,
          });
        }
        pendingComments = [];

        // System stores are also tracked for the IRHeader.
        if (parsed.isSystem) sysStores[parsed.name] = parsed.rawValue;

        // Body parsing is identical for system and user stores: wrap as a raw
        // fragment when it carries an opaque construct, otherwise emit a store.
        // Legacy value formats in the body are decoded (ANSI-guarded) and the
        // rewrite recorded against this line.
        const { items, opaqueReason } = parseStoreItems(parsed.rawValue, legacyOptsFor(tok.line));
        if (opaqueReason !== null) {
          bumpOpaque(opaqueReason);
          const frag: RawKmnFragment = {
            nodeId: storeNodeId,
            origin: "imported",
            sourceText: fragmentSourceText(tok),
            reason: opaqueReason,
            sourceLine: tok.line,
          };
          // A target-prefixed opaque store cannot be rewritten (D9 fidelity):
          // the prefix stays in the fragment text and the escalation is
          // recorded so the user can see it needs review.
          recordKeymanDrop(tok);
          if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
            recordRewrite(
              "target-selector",
              tok.line,
              fragmentSourceText(tok),
              `(kept as-is — opaque store; target gating could not be rewritten, needs review)`,
            );
          }
          const sketch = sketchStoreItems(parsed.rawValue, knownStoreItems, isAnsiLine(tok.line));
          if (sketch !== undefined) {
            frag.storeSketch = sketch;
            knownStoreItems.set(parsed.name.toLowerCase(), sketch);
          }
          if (currentGroup !== null) frag.groupNodeId = currentGroup.nodeId;
          rawFragments.push(frag);
        } else {
          knownStoreItems.set(parsed.name.toLowerCase(), items);
          const irStore: IRStore = {
            nodeId: storeNodeId,
            name: parsed.name,
            items,
            isSystem: parsed.isSystem,
            sourceLine: tok.line,
          };
          // Target-prefixed stores are merged after the loop (desktop body
          // wins); `$keyman:` ("both") is dropped now, with a rewrite record.
          recordKeymanDrop(tok);
          if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
            irStore.targetSelector = tok.targetSelector;
            storeSourceText.set(storeNodeId, {
              text: tok.text,
              rawValue: parsed.rawValue,
              selector: tok.targetSelector,
            });
          }
          if (parsed.trailingComment !== undefined) irStore.trailingComment = parsed.trailingComment;
          stores.push(irStore);
        }
        break;
      }

      case "group": {
        const parsed = parseGroupLine(tok.text);
        if (!parsed) {
          throw new Error(`Malformed group declaration at line ${tok.line}:${tok.col}: ${tok.text}`);
        }
        // A target-prefixed group line is pathological (no corpus case):
        // the prefix is dropped, the group kept, and the drop recorded.
        recordKeymanDrop(tok);
        if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
          recordRewrite(
            "target-selector",
            tok.line,
            `$${tok.targetSelector}: ${tok.text}`,
            `${tok.text} (prefix dropped — a group cannot be target-gated; needs review)`,
          );
        }
        flushCommentsFreestanding();
        currentGroup = {
          nodeId: minter.mint("group"),
          name: parsed.name,
          usingKeys: parsed.usingKeys,
          rules: [],
          // Reserved entry-point groups (NewContext / PostKeystroke) are
          // fidelity-only: readonly, never reorder hooks (spec 076 FR-004).
          readonly: isReservedEntryGroup(parsed.name),
          sourceLine: tok.line,
        };
        groups.push(currentGroup);
        headerParsed = true; // groups also mark end of header
        break;
      }

      case "match":
      case "nomatch": {
        // match > use(group) / nomatch > use(group) — group-transition rules.
        // The leading keyword is preserved via rule.matchKind so emit can
        // reconstruct `match > ...` / `nomatch > ...` (a bare `>` line is an
        // Invalid Token in kmcmplib).
        flushCommentsFreestanding();
        const split = splitOnArrow(tok.text);
        if (!split) {
          throw new Error(`Malformed ${tok.kind} at line ${tok.line}:${tok.col}`);
        }
        const ruleNodeId = minter.mint("rule");
        const ctxEl: ContextElement[] = [];
        const outEl: OutputElement[] = [{ kind: "raw", text: split.rhs.trim() }];
        const rule: IRRule = {
          nodeId: ruleNodeId,
          context: ctxEl,
          output: outEl,
          matchKind: tok.kind,
          sourceLine: tok.line,
        };
        // Target-prefixed transitions are merged after the loop (desktop
        // wins); `$keyman:` ("both") is dropped now, with a rewrite record.
        recordKeymanDrop(tok);
        if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
          rule.targetSelector = tok.targetSelector;
        }
        if (currentGroup) {
          currentGroup.rules.push(rule);
        }
        break;
      }

      case "rule": {
        if (!headerParsed) {
          // Old-style header statement (NAME, VERSION, ...) — collected for
          // finalisation after the loop, once it is known whether a real
          // store() already provides the value. A trailing c-comment rides
          // along as a freestanding comment so no text is lost.
          const { rhs: headerText, trailingComment: headerComment } =
            stripTrailingComment(tok.text);
          const header = parseHeaderStatement(headerText);
          if (header !== null) {
            pendingHeaders.push({
              keyword: header.keyword,
              storeName: header.storeName,
              value: header.value,
              line: tok.line,
              sourceText: tok.text,
            });
            flushCommentsFreestanding();
            if (headerComment !== undefined) {
              comments.push({
                nodeId: minter.mint("comment"),
                text: headerComment,
                anchor: "freestanding",
                sourceLine: tok.line,
              });
            }
            // A target-prefixed header statement is pathological; the
            // prefix is dropped with the header (recorded here).
            recordKeymanDrop(tok);
            if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
              recordRewrite(
                "target-selector",
                tok.line,
                `$${tok.targetSelector}: ${tok.text}`,
                `${tok.text} (prefix dropped — a header statement cannot be target-gated; needs review)`,
              );
            }
            break;
          }
          // Rule before begin — treat as raw.
          flushCommentsFreestanding();
          bumpOpaque(OPAQUE_REASONS.UNKNOWN_PRE_BEGIN);
          rawFragments.push({
            nodeId: minter.mint("raw"),
            origin: "imported",
            sourceText: fragmentSourceText(tok),
            reason: OPAQUE_REASONS.UNKNOWN_PRE_BEGIN,
            sourceLine: tok.line,
            // groupNodeId is intentionally absent: pre-begin = global/no group
          });
          // A target-prefixed pre-begin line cannot be rewritten (D9
          // fidelity): the prefix stays in the fragment text and the
          // escalation is recorded so the user can see it needs review.
          recordKeymanDrop(tok);
          if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
            recordRewrite(
              "target-selector",
              tok.line,
              fragmentSourceText(tok),
              `(kept as-is — pre-begin line; target gating could not be rewritten, needs review)`,
            );
          }
          break;
        }

        const ruleNodeId = minter.mint("rule");

        // Attach pending comments as leading to this rule.
        for (const c of pendingComments) {
          comments.push({
            nodeId: minter.mint("comment"),
            text: c.text,
            anchor: "leading",
            anchorRef: { kind: "rule", nodeId: ruleNodeId },
            sourceLine: c.line,
          });
        }
        pendingComments = [];

        // Parse the rule line.
        const parsedLine = parseRuleLine(tok.text);
        if (!parsedLine) {
          throw new Error(`Malformed rule at line ${tok.line}:${tok.col}: ${tok.text}`);
        }

        // Quick opaque surface check before deep parse.
        const opaqueCheck = { reason: null as string | null };

        // Parse context — the only list where `+` is the context/keystroke
        // separator, so the only list tokenised with separator splitting
        // (#2247).
        const ctxToks = splitTokens(parsedLine.contextRaw, true);
        const ctxElements = parseContextElements(ctxToks, opaqueCheck, legacyOptsFor(tok.line));

        let outElements: OutputElement[] | null = null;
        if (ctxElements !== null) {
          const outToks = splitTokens(parsedLine.outputRaw);
          outElements = parseOutputElements(outToks, opaqueCheck, legacyOptsFor(tok.line));
        }

        if (ctxElements === null || outElements === null) {
          // Opaque — wrap as raw fragment.
          const reason = opaqueCheck.reason ?? "unknown";
          bumpOpaque(reason);
          const frag: RawKmnFragment = {
            nodeId: ruleNodeId,
            origin: "imported",
            sourceText: fragmentSourceText(tok),
            reason,
            sourceLine: tok.line,
          };
          // A target-prefixed opaque rule cannot be rewritten (D9 fidelity):
          // the prefix stays in the fragment text and the escalation is
          // recorded so the user can see it needs review.
          recordKeymanDrop(tok);
          if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
            recordRewrite(
              "target-selector",
              tok.line,
              fragmentSourceText(tok),
              `(kept as-is — opaque rule; target gating could not be rewritten, needs review)`,
            );
          }
          if (currentGroup !== null) frag.groupNodeId = currentGroup.nodeId;
          // Best-effort produced-output sketch (RHS only), attached only when
          // it carries statically producible content so the produced-set walk
          // has something to resolve. Guard/context tokens are never scanned.
          const sketch = extractProducedOutput(splitTokens(parsedLine.outputRaw));
          if (sketch.some(e => e.kind === "char" || e.kind === "index" || e.kind === "outs")) {
            frag.producedOutput = sketch;
          }
          rawFragments.push(frag);
        } else {
          const rule: IRRule = parsedLine.trailingComment !== undefined
            ? {
                nodeId: ruleNodeId,
                context: ctxElements,
                output: outElements,
                trailingComment: parsedLine.trailingComment,
                sourceLine: tok.line,
              }
            : {
                nodeId: ruleNodeId,
                context: ctxElements,
                output: outElements,
                sourceLine: tok.line,
              };
          // Target-selector rewrite (#2633 §1): `$keyman:` dropped,
          // `$keymanonly:` one platform('desktop native')-guarded rule,
          // `$keymanweb:` three platform-guarded copies. The first copy
          // keeps ruleNodeId, so the leading/trailing comments anchor to it.
          const rulesToPush = applyTargetSelectorToRule(rule, tok);
          if (currentGroup) {
            for (const r of rulesToPush) currentGroup.rules.push(r);
          }
          // Trailing comment node
          if (parsedLine.trailingComment !== undefined) {
            comments.push({
              nodeId: minter.mint("comment"),
              text: parsedLine.trailingComment,
              anchor: "trailing",
              anchorRef: { kind: "rule", nodeId: ruleNodeId },
              sourceLine: tok.line,
            });
          }
        }
        break;
      }

      default:
        flushCommentsFreestanding();
        break;
    }
  }

  // Flush any remaining pending comments.
  flushCommentsFreestanding();

  // ---------------------------------------------------------------------------
  // Deprecated-form finalisation (#2633) — post-loop passes.
  // ---------------------------------------------------------------------------

  // Merge target-prefixed store twins: group typed stores by lowercased
  // name; when a group has targeted stores and NO unprefixed store, the
  // desktop (`keymanonly`) body wins (first desktop wins; if no desktop,
  // the first web body wins). Losers are dropped and the survivor is
  // unprefixed. Groups that already have an unprefixed store are left
  // alone — that is a genuine duplicate in the source, which kmc errors
  // on today too.
  function mergeTargetedStores(): void {
    const byName = new Map<string, IRStore[]>();
    for (const s of stores) {
      const key = s.name.toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(s);
      byName.set(key, list);
    }
    for (const [, group] of byName) {
      const targeted = group.filter(
        (s) => s.targetSelector === "keymanweb" || s.targetSelector === "keymanonly",
      );
      if (targeted.length === 0) continue;
      if (group.some((s) => s.targetSelector === undefined)) continue;
      const desktop = targeted.find((s) => s.targetSelector === "keymanonly");
      const survivor = desktop ?? targeted[0]!;
      const survivorSrc = storeSourceText.get(survivor.nodeId);
      const survivorLine = survivorSrc?.text ?? `store(${survivor.isSystem ? "&" : ""}${survivor.name})`;
      recordRewrite(
        "target-selector",
        survivor.sourceLine ?? 0,
        `$${survivor.targetSelector}: ${survivorLine}`,
        survivorLine,
      );
      for (const loser of targeted) {
        if (loser === survivor) continue;
        const loserSrc = storeSourceText.get(loser.nodeId);
        const loserLine = loserSrc?.text ?? `store(${loser.isSystem ? "&" : ""}${loser.name})`;
        recordRewrite(
          "target-selector",
          loser.sourceLine ?? 0,
          `$${loser.targetSelector}: ${loserLine}`,
          `(dropped — store(${loser.name}) keeps the ${desktop !== undefined ? "desktop" : "first web"} body)`,
        );
        const idx = stores.indexOf(loser);
        if (idx >= 0) stores.splice(idx, 1);
      }
      // The survivor is now unprefixed; for a system store the header
      // extraction must see the SURVIVOR's value (the loop's last-wins
      // sysStores entry may hold a dropped twin's value).
      delete survivor.targetSelector;
      if (survivor.isSystem && survivorSrc !== undefined) {
        sysStores[survivor.name] = survivorSrc.rawValue;
      }
    }
  }

  // &CasedKeys and &mnemonicLayout cannot coexist in one file (kmc
  // 0x50206b: "&CasedKeys system store is not supported with mnemonic
  // layouts"). The pair is legal only when target-separated ($keymanweb:
  // vs $keymanonly:), and the store merge unprefixes both into one file.
  // When the pair was target-separated in the source, keep the WEB store
  // and drop the desktop-only one (the ruling's compile-gate fallback:
  // never emit a file that fails to build), recording the loss. When both
  // were unprefixed (or same-target) in the source the conflict is
  // pre-existing — leave it alone.
  function resolveCasedKeysMnemonicConflict(): void {
    const cased = stores.find((s) => s.isSystem && s.name.toUpperCase() === "CASEDKEYS");
    const mnemonic = stores.find(
      (s) => s.isSystem && s.name.toUpperCase() === "MNEMONICLAYOUT",
    );
    if (cased === undefined || mnemonic === undefined) return;
    const casedSel = storeSourceText.get(cased.nodeId)?.selector;
    const mnemonicSel = storeSourceText.get(mnemonic.nodeId)?.selector;
    const separated =
      (casedSel === "keymanweb" && mnemonicSel === "keymanonly") ||
      (casedSel === "keymanonly" && mnemonicSel === "keymanweb");
    if (!separated) return;
    const keepWeb = casedSel === "keymanweb" ? cased : mnemonic;
    const dropDesktop = casedSel === "keymanweb" ? mnemonic : cased;
    const dropSrc = storeSourceText.get(dropDesktop.nodeId);
    const dropLine = dropSrc?.text ?? `store(&${dropDesktop.name})`;
    recordRewrite(
      "target-selector",
      dropDesktop.sourceLine ?? 0,
      `$keymanonly: ${dropLine}`,
      `(dropped — store(&${keepWeb.name}) and store(&${dropDesktop.name}) cannot coexist; the web &${keepWeb.name} store is kept so the file compiles; the desktop-only value needs review)`,
    );
    const idx = stores.indexOf(dropDesktop);
    if (idx >= 0) stores.splice(idx, 1);
    delete sysStores[dropDesktop.name];
  }

  // Merge target-prefixed match/nomatch twins, per group and kind: desktop
  // wins, web is dropped; a lone prefixed transition is kept unprefixed.
  // Groups that already have an unprefixed transition of the same kind are
  // left alone (genuine duplicate in the source).
  function mergeTargetedTransitions(): void {
    for (const group of groups) {
      for (const kind of ["match", "nomatch"] as const) {
        const targeted = group.rules.filter(
          (r) => r.matchKind === kind &&
            (r.targetSelector === "keymanweb" || r.targetSelector === "keymanonly"),
        );
        if (targeted.length === 0) continue;
        if (group.rules.some((r) => r.matchKind === kind && r.targetSelector === undefined)) {
          continue;
        }
        const desktop = targeted.find((r) => r.targetSelector === "keymanonly");
        const survivor = desktop ?? targeted[0]!;
        const rhs = survivor.output[0]?.kind === "raw" ? survivor.output[0].text : "";
        recordRewrite(
          "target-selector",
          survivor.sourceLine ?? 0,
          `$${survivor.targetSelector}: ${kind} > ${rhs}`,
          `${kind} > ${rhs}`,
        );
        for (const loser of targeted) {
          if (loser === survivor) continue;
          const loserRhs = loser.output[0]?.kind === "raw" ? loser.output[0].text : "";
          recordRewrite(
            "target-selector",
            loser.sourceLine ?? 0,
            `$${loser.targetSelector}: ${kind} > ${loserRhs}`,
            `(dropped — ${kind} keeps the ${desktop !== undefined ? "desktop" : "first web"} variant)`,
          );
          const idx = group.rules.indexOf(loser);
          if (idx >= 0) group.rules.splice(idx, 1);
        }
        delete survivor.targetSelector;
      }
    }
  }

  // Finalise pending header statements: synthesise the matching system
  // store when no real store() declaration already provides the value
  // (a real store wins, either order — including an opaque fragment that
  // declares the name). LANGUAGE / LAYOUT / BITMAPS have no modern store
  // and are dropped, with the drop recorded.
  function finalizePendingHeaders(): void {
    for (const header of pendingHeaders) {
      if (header.storeName === null) {
        recordRewrite(
          "header-statement",
          header.line,
          header.sourceText,
          `(dropped — ${header.keyword} has no modern equivalent; metadata belongs in the .kps)`,
        );
        continue;
      }
      const name = header.storeName;
      const existingTyped = stores.find(
        (s) => s.isSystem && s.name.toUpperCase() === name,
      );
      const existingFrag = rawFragments.find((f) => fragmentDeclaresSystemStore(f, name));
      if (existingTyped !== undefined || existingFrag !== undefined) {
        recordRewrite(
          "header-statement",
          header.line,
          header.sourceText,
          `(dropped — store(&${name}) already declared; header value '${header.value}' not used)`,
        );
        continue;
      }
      // Synthesise the system store. HOTKEY translates to the virtual-key
      // form when the old string form maps cleanly; anything else becomes
      // plain characters of the quoted value (the HOTKEY fallback keeps the
      // quoted string so the value survives, and the record says so).
      let items: StoreItem[];
      let rewrittenText: string;
      if (name === "HOTKEY") {
        const vkey = translateHotkey(header.value);
        if (vkey !== null) {
          items = [{ kind: "raw", text: vkey }];
          rewrittenText = `store(&HOTKEY) ${vkey}`;
        } else {
          items = [...header.value].map((ch) => ({ kind: "char" as const, value: ch }));
          rewrittenText = `store(&HOTKEY) '${header.value}' (kept as a quoted string — no virtual-key mapping for '${header.value}')`;
        }
      } else {
        items = [...header.value].map((ch) => ({ kind: "char" as const, value: ch }));
        const q = header.value.includes("'") ? '"' : "'";
        rewrittenText = `store(&${name}) ${q}${header.value}${q}`;
      }
      const store: IRStore = {
        nodeId: minter.mint("store"),
        name,
        items,
        isSystem: true,
        sourceLine: header.line,
      };
      stores.push(store);
      if (!(name in sysStores)) {
        sysStores[name] =
          name === "HOTKEY" && items[0]?.kind === "raw"
            ? (items[0].text ?? "")
            : `'${header.value}'`;
      }
      recordRewrite("header-statement", header.line, header.sourceText, rewrittenText);
    }
  }

  // Raise store(&version) to '9.0' when platform() guards were added and
  // the file declares an explicit version below 9.0 — guards need Keyman
  // 9.0+. A missing version is left alone (the compiler infers it).
  function raiseVersionForPlatformGuards(): void {
    if (!addedPlatformGuards) return;
    const versionStore = stores.find(
      (s) => s.isSystem && s.name.toUpperCase() === "VERSION",
    );
    if (versionStore === undefined) return;
    if (!versionStore.items.every((it) => it.kind === "char")) return;
    const text = versionStore.items
      .map((it) => (it.kind === "char" ? it.value : ""))
      .join("");
    const m = /^(\d+)(?:\.\d+)?/.exec(text);
    if (m === null) return;
    if (parseInt(m[1] ?? "0", 10) >= 9) return;
    versionStore.items = [..."9.0"].map((ch) => ({ kind: "char" as const, value: ch }));
    sysStores["VERSION"] = "'9.0'";
    recordRewrite(
      "version-raise",
      versionStore.sourceLine ?? 0,
      `store(&VERSION) '${text}'`,
      `store(&VERSION) '9.0' (raised — platform() guards need Keyman 9.0+)`,
    );
  }

  mergeTargetedStores();
  resolveCasedKeysMnemonicConflict();
  mergeTargetedTransitions();
  finalizePendingHeaders();
  raiseVersionForPlatformGuards();
  // Rewrites are recorded in parse order per form; sort by source line for
  // a stable, source-order presentation in the as-built notes.
  rewrites.sort((a, b) => a.sourceLine - b.sourceLine);

  // ---------------------------------------------------------------------------
  // Build IRHeader from collected system store values.
  // ---------------------------------------------------------------------------

  function sysVal(name: string): string {
    const raw = sysStores[name] ?? "";
    return unquote(raw.trim());
  }

  const name = sysVal("NAME");
  const copyright = sysVal("COPYRIGHT");
  const version = sysVal("VERSION");
  const keyboardVersion = sysVal("KEYBOARDVERSION");
  const targetsRaw = sysVal("TARGETS");
  const targets = targetsRaw ? targetsRaw.split(/\s+/).filter(Boolean) : [];

  // storeDirectives: additional &-store directive bodies beyond the typed header fields.
  // We keep this as an empty array since per-store reconstruction happens from stores[].
  const storeDirectives: string[] = [];

  // FR-004: model the begin entry-point set on the header. The entry group
  // comes from the first `begin <encoding> > use(<group>)` directive (no
  // longer dropped on parse); the reserved-group flags are derived from the
  // parsed groups. Absent entirely when there is nothing to model (e.g. a
  // fragment-only parse with no begin directive and no reserved groups).
  const entryPoints: NonNullable<IRHeader["entryPoints"]> = {};
  if (beginEntryGroup !== undefined) entryPoints.main = beginEntryGroup;
  for (const g of groups) {
    const lower = g.name.toLowerCase();
    if (lower === "newcontext") entryPoints.newContext = true;
    if (lower === "postkeystroke") entryPoints.postKeystroke = true;
  }

  const header: IRHeader = {
    keyboardId,
    name,
    bcp47: [], // populated by recognizer / survey
    copyright,
    version: keyboardVersion || version,
    targets,
    storeDirectives,
    ...(beginEncoding !== undefined ? { encoding: beginEncoding } : {}),
    ...(Object.keys(entryPoints).length > 0 ? { entryPoints } : {}),
  };

  // ---------------------------------------------------------------------------
  // Build opaqueFeatures inventory.
  // ---------------------------------------------------------------------------

  const opaqueFeatures: Array<{ feature: string; count: number }> = [];
  for (const [feature, count] of opaqueCount) {
    opaqueFeatures.push({ feature, count });
  }

  const ir: KeyboardIR = {
    origin: "imported",
    header,
    stores,
    groups,
    comments,
    raw: rawFragments,
    recognizedPatterns: [],
  };

  return { ir, opaqueFeatures, rewrites };
}
