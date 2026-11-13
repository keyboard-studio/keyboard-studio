/**
 * Element- and store-level .kmn readers used by the lowering of the vendored
 * Keyman parser's AST (lower.ts): codepoints, quoting, token splitting, deadkeys, virtual keys,
 * store items and sketches, ranges, context and output elements.
 * Moved verbatim from parse.ts (spec 116 T032); no behaviour change.
 */

import type {
  ContextElement,
  DeprecatedRewrite,
  KeyboardIR,
  OutputElement,
  StoreItem,
} from "@keyboard-studio/contracts";

import { isNamedDeadkeyName, hasRawCallPrefix, classifyRawElement } from "@keyboard-studio/contracts";

import { OPAQUE_REASONS, type OpaqueReason } from "./opaque-reasons.js";
import { tryLegacyValue, type LegacyValueOptions } from "./deprecated-forms.js";
import { isRewritePlatformGuard } from "./target-guards.js";

/** What a .kmn reader returns: the IR and its opaque-feature inventory. */
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

/** Parse a codepoint literal U+XXXX → string character, or return null. */
export function parseCodepoint(tok: string): string | null {
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
export function isSmpLiteral(tok: string): boolean {
  const m = /^U\+([0-9A-Fa-f]+)$/.exec(tok);
  if (!m) return false;
  return parseInt(m[1] ?? "0", 16) > 0xffff;
}

/** True if the token is wrapped in matching single or double quotes. */
export function isQuoted(s: string): boolean {
  return (s.startsWith("'") && s.endsWith("'")) ||
         (s.startsWith('"') && s.endsWith('"'));
}

/** Strip single or double quotes from a quoted string token. */
export function unquote(s: string): string {
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
export function splitTokens(text: string, splitSeparatorPlus = false): string[] {
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
    // bracket group [...] — quote-aware, so a quoted key name such as
    // [CTRL ALT SHIFT "]"] does not end the group at the quoted ']'.
    if (ch === "[") {
      let j = i + 1;
      let quote = "";
      while (j < text.length && (quote !== "" || text[j] !== "]")) {
        const c = text[j] ?? "";
        if (quote !== "") { if (c === quote) quote = ""; }
        else if (c === "'" || c === '"') quote = c;
        j++;
      }
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
export function parseNamedDk(tok: string): string | null {
  const m = /^dk\s*\(\s*([^)]+)\s*\)$/i.exec(tok);
  if (!m) return null;
  const inner = (m[1] ?? "").trim();
  return isNamedDeadkeyName(inner) ? inner : null;
}

/** Parse a dk(NNNN) token where NNNN is hex → deadkey id number, or null. */
export function parseDk(tok: string): number | null {
  const m = /^dk\s*\(\s*([0-9A-Fa-f]+)\s*\)$/i.exec(tok);
  if (!m) return null;
  return parseInt(m[1] ?? "0", 16);
}

// Recognised vkey-bracket modifier names (e.g. [SHIFT K_A]). Module-scoped so
// parseVkeyBracket doesn't rebuild the Set on every call — it runs once per
// bracket token across every store/context/output element parsed.
export const KNOWN_VKEY_MODIFIERS = new Set([
  "SHIFT", "RALT", "LALT", "CTRL", "LCTRL", "RCTRL",
  "ALT", "CAPS", "NCAPS", "RSHIFT",
]);

/** Parse a modifier+vkey bracket group like [K_A] or [SHIFT K_A] → {name, modifiers}. */
export function parseVkeyBracket(tok: string): { name: string; modifiers: string[] } | null {
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
export const KMN_IDENT = String.raw`[^\s\(\)\,]+`;

/** Returns a parser for keyword(storeName) → storeName. */
export function makeStoreParser(keyword: string): (tok: string) => string | null {
  const re = new RegExp(`^${keyword}\\s*\\(\\s*(${KMN_IDENT})\\s*\\)$`, "i");
  return tok => { const m = re.exec(tok); return m ? (m[1] ?? null) : null; };
}

/** Parse any(storeName) → storeName, or null. */
export const parseAny = makeStoreParser("any");

/** Parse notany(storeName) → storeName, or null. */
export const parseNotAny = makeStoreParser("notany");

// Compiled once at module load — parseIndex runs on every context/output
// token, so recompiling this regex per call would recompile it once per
// token across the whole keyboard.
export const INDEX_RE = new RegExp(`^index\\s*\\(\\s*(${KMN_IDENT})\\s*,\\s*(\\d+)\\s*\\)$`, "i");

/** Parse index(storeName, N) → {storeRef, offset}, or null. */
export function parseIndex(tok: string): { storeRef: string; offset: number } | null {
  const m = INDEX_RE.exec(tok);
  if (!m) return null;
  return { storeRef: m[1] ?? "", offset: parseInt(m[2] ?? "0", 10) };
}

/** Parse context(N) → offset, or null. */
export function parseContext(tok: string): number | null {
  const m = /^context\s*\(\s*(\d+)\s*\)$/i.exec(tok);
  if (!m) return null;
  return parseInt(m[1] ?? "0", 10);
}

/** Parse baselayout or baselayout('name') → layout name string (empty for bare form). */
export function parseBaselayout(tok: string): string | null {
  if (!/^baselayout(\s*\(|$)/i.test(tok)) return null;
  const m = /^baselayout\s*\(\s*'?([^')]*)'?\s*\)/i.exec(tok);
  return m ? (m[1]?.trim() ?? "") : "";
}

/** Parse outs(storeName) → storeName, or null. */
export const parseOuts = makeStoreParser("outs");

/** Parse save(storeName) → storeName, or null. */
export const parseSave = makeStoreParser("save");

/** Parse reset(storeName) → storeName, or null. */
export const parseReset = makeStoreParser("reset");

/** Parse call(storeName) → storeName, or null. */
export const parseCall = makeStoreParser("call");

/** Whether a token is the bare `return` statement. */
export function isReturnToken(tok: string): boolean {
  return /^return$/i.test(tok);
}

/** Parse layer('name') (a quoted literal argument only) → name, or null. */
export function parseLayer(tok: string): string | null {
  const c = classifyRawElement(tok);
  return c.kind === "layer" ? c.value : null;
}

/** Parse platform('name') (a quoted literal argument only) → name, or null. */
export function parsePlatform(tok: string): string | null {
  const c = classifyRawElement(tok);
  return c.kind === "platform" ? c.value : null;
}

const SET_RE = new RegExp(String.raw`^set\s*\(\s*(${KMN_IDENT})\s*=\s*([\s\S]*?)\s*\)$`, "i");

/**
 * Parse set(store = value) → {storeRef, value}, or null. The value is the
 * grammar's `text+`: quoted strings, U+ codepoints, deadkeys and outs(store).
 * Anything else in the value (or no value at all) is not typed: null.
 */
export function parseSet(tok: string): { storeRef: string; value: OutputElement[] } | null {
  const m = SET_RE.exec(tok);
  if (!m) return null;
  const parts = splitTokens(m[2] ?? "");
  if (parts.length === 0) return null;
  const value: OutputElement[] = [];
  for (const part of parts) {
    const cp = parseCodepoint(part);
    if (cp !== null) { value.push({ kind: "char", value: cp }); continue; }
    if (isQuoted(part)) {
      for (const ch of unquote(part)) value.push({ kind: "char", value: ch });
      continue;
    }
    const named = parseNamedDk(part);
    if (named !== null) { value.push({ kind: "namedDeadkey", name: named }); continue; }
    const dk = parseDk(part);
    if (dk !== null) { value.push({ kind: "deadkey", id: dk }); continue; }
    const outs = parseOuts(part);
    if (outs !== null) { value.push({ kind: "outs", storeRef: outs }); continue; }
    return null;
  }
  return { storeRef: m[1] ?? "", value };
}

// Compiled once — parseIfGuard runs on every if(...) context token.
/** Parse `if(store = 'value')` (equality form only) → {store, value}, or null. */
export const IF_GUARD_RE = new RegExp(
  String.raw`^if\s*\(\s*(${KMN_IDENT})\s*=\s*('[^']*'|"[^"]*")\s*\)$`,
  "i",
);

export function parseIfGuard(tok: string): { store: string; value: string } | null {
  const m = IF_GUARD_RE.exec(tok);
  if (!m) return null;
  return { store: m[1] ?? "", value: unquote(m[2] ?? "") };
}

/**
 * True when every element parsed so far belongs to a rule's head cluster —
 * the only position a guard may be typed in (spec 103): leading guards
 * themselves, a `baselayout` head element, or a `platform(...)` head element
 * (typed, or raw when its argument is not a quoted literal). A guard after any content
 * element or after the `+` keystroke separator (also a raw element) is not
 * typed; the caller keeps the rule opaque.
 */
export function isHeadClusterSoFar(elements: ContextElement[]): boolean {
  return elements.every(
    (el) =>
      el.kind === "if" ||
      el.kind === "baselayout" ||
      el.kind === "platform" ||
      (el.kind === "raw" && hasRawCallPrefix(el.text, "platform")),
  );
}

// Compiled once — parseUse runs on every output token, same rationale as
// INDEX_RE above.
export const USE_RE = new RegExp(`^use\\s*\\(\\s*(${KMN_IDENT})\\s*\\)$`, "i");

/** Parse use(groupName) → groupName, or null. */
export function parseUse(tok: string): string | null {
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
export function decodeRangeEndpoint(tok: string): number | null {
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
export function splitDotDot(tok: string): { before: string; after: string } | null {
  if (isQuoted(tok)) return null;
  const idx = tok.indexOf("..");
  if (idx === -1) return null;
  return { before: tok.slice(0, idx), after: tok.slice(idx + 2) };
}

export type RangeDetection =
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
export function classifyRange(from: number | null, to: number | null, consumed: number): RangeDetection | null {
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
export function detectRangeAt(toks: string[], i: number): RangeDetection | null {
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
export function isBracketedMenuLiteral(str: string): boolean {
  return str.length > 2 && str.startsWith("[") && str.endsWith("]");
}

/**
 * Parse the value list of a store declaration. Always returns the parsed
 * `items`; `opaqueReason` is non-null when the body carries a construct the
 * typed IR can't represent (named deadkey, SMP literal, bracketed menu-store
 * literal, malformed/descending range), in which case the caller wraps the
 * whole store as a RawKmnFragment with that reason.
 */
export function parseStoreItems(
  rawValue: string,
  /**
   * Read an in-range SMP literal (`U+1F600`) as a character instead of opaquing
   * the store. The spec 116 reader passes true (the Keyman lexer reads SMP
   * literals as characters); the legacy reader keeps the default.
   */
  allowSmp = false,
  /** Legacy value-format decoding (#2633 §3): ANSI guard + rewrite recording. */
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
    if (isSmpLiteral(tok) && !(allowSmp && parseCodepoint(tok) !== null)) return { items, opaqueReason: OPAQUE_REASONS.SMP_LITERAL };
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
    // outs(store) — inline expansion of another store's content, kept as a
    // typed reference (spec 116); resolveStoreItems expands it where an
    // analysis needs the content. Checked before the raw fallback so
    // "outs(...)" is never emitted as literal store content, which would
    // produce broken .kmn once the store is referenced via any()/notany().
    const storeOuts = parseOuts(tok);
    if (storeOuts !== null) {
      items.push({ kind: "outs", storeRef: storeOuts });
      i++;
      continue;
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
export const MAX_SKETCH_ITEMS = 0x20000;

export function sketchStoreItems(
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
export function parseContextElements(
  toks: string[],
  opaqueOut: { reason: string | null },
  /** Context elements already read before these tokens (head-position checks look at them too). */
  prior: readonly ContextElement[] = [],
  /** Legacy value-format decoding (#2633 §3): ANSI guard + rewrite recording. */
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
      if (guard !== null && isHeadClusterSoFar([...prior, ...elements])) {
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
    // platform('x') — typed in head position only, with a quoted literal
    // argument; anywhere else (or malformed) it stays a raw element.
    // The four #2633 rewrite spellings (platform('web') / 'phone native' /
    // 'tablet native' / 'desktop native') stay raw: the rewrite produces
    // them as raw guards, and a re-parse must read them back the same way
    // or parse → emit → parse is not stable — and deadkey mining's
    // platform-gated skip keys on the raw spelling. No corpus keyboard
    // sources those four values (verified 2026-11-11), so this changes
    // nothing the spec 116 reader differential records.
    const platformValue = parsePlatform(tok);
    if (platformValue !== null && !isRewritePlatformGuard(tok) && isHeadClusterSoFar([...prior, ...elements])) {
      elements.push({ kind: "platform", value: platformValue });
      continue;
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
export function parseOutputElements(
  toks: string[],
  opaqueOut: { reason: string | null },
  /** Legacy value-format decoding (#2633 §3): ANSI guard + rewrite recording. */
  legacyOpts?: LegacyValueOptions,
): OutputElement[] | null {
  return parseOutputElementsCore(toks, "strict", opaqueOut, legacyOpts);
}

export function parseOutputElementsCore(
  toks: string[],
  mode: "strict" | "lenient",
  opaqueOut: { reason: string | null },
  /** Legacy value-format decoding (#2633 §3): ANSI guard + rewrite recording. */
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
    // layer('x') — typed in strict mode (spec 116). The lenient sketch keeps
    // the raw placeholder it always had, so a fragment's producedOutput is unchanged.
    if (mode === "strict") {
      const layerValue = parseLayer(tok);
      if (layerValue !== null) {
        elements.push({ kind: "layer", value: layerValue });
        continue;
      }
    }
    // save/set/reset — typed in strict mode (spec 116); not producible content
    // (the quoted value stays inside the paren-group token, so it cannot leak
    // as a char element). A form the typed members cannot hold stays opaque
    // under the same reason as before.
    if (/^(?:save|set|reset)\s*\(/i.test(tok)) {
      if (mode === "strict") {
        const saveRef = parseSave(tok);
        const resetRef = parseReset(tok);
        const setRef = parseSet(tok);
        if (saveRef !== null) elements.push({ kind: "save", storeRef: saveRef });
        else if (resetRef !== null) elements.push({ kind: "reset", storeRef: resetRef });
        else if (setRef !== null) elements.push({ kind: "set", storeRef: setRef.storeRef, value: setRef.value });
        else {
          opaqueOut.reason = OPAQUE_REASONS.OPTION_STORE_DIRECTIVE;
          return null;
        }
        continue;
      }
      elements.push({ kind: "raw", text: tok });
      continue;
    }
    // call/return — typed in strict mode (spec 116); not producible content
    if (/^call\s*\(/i.test(tok) || /^return$/i.test(tok)) {
      if (mode === "strict") {
        const callRef = parseCall(tok);
        if (callRef !== null) elements.push({ kind: "call", storeRef: callRef });
        else if (isReturnToken(tok)) elements.push({ kind: "return" });
        else {
          opaqueOut.reason = OPAQUE_REASONS.CALL_RETURN;
          return null;
        }
        continue;
      }
      elements.push({ kind: "raw", text: tok });
      continue;
    }
    // unknown — wrap as raw
    elements.push({ kind: "raw", text: tok });
  }
  return elements;
}
// System stores whose canonical spelling is NOT all-uppercase. The lookup key
// is the uppercased form; the value is what gets stored in IRStore.name.
export const CANONICAL_SYSTEM_STORE: Record<string, string> = { CASEDKEYS: "CasedKeys" };

// ---------------------------------------------------------------------------
// Rule line parser
// ---------------------------------------------------------------------------

export interface ParsedRuleLine {
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
export function splitOnArrow(text: string): { lhs: string; rhs: string } | null {
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
export function stripTrailingComment(rhs: string): { rhs: string; trailingComment: string | undefined } {
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

export function parseRuleLine(text: string): ParsedRuleLine | null {
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

export interface ParsedStore {
  name: string;
  isSystem: boolean;
  rawValue: string;
  trailingComment: string | undefined;
}

/**
 * Parse `store(<name>) <value>` → name + value.
 * Throws on malformed syntax.
 */
export function parseStoreLine(text: string, line: number): ParsedStore {
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

export function parseGroupLine(text: string): { name: string; usingKeys: boolean } | null {
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
export function isReservedEntryGroup(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "newcontext" || lower === "postkeystroke";
}

// ---------------------------------------------------------------------------
// Begin directive parser
// ---------------------------------------------------------------------------

export function parseBeginLine(text: string): { encoding: string; entryGroup: string } | null {
  const m = new RegExp(`^begin\\s+(\\w+)\\s*>\\s*use\\s*\\(\\s*(${KMN_IDENT})\\s*\\)`, "i").exec(text);
  if (!m) return null;
  return { encoding: m[1] ?? "Unicode", entryGroup: m[2] ?? "" };
}

