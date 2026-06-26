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
} from "@keyboard-studio/contracts";

import { tokenize } from "./tokenize.js";
import { NodeIdMinter } from "./node-ids.js";
import { OPAQUE_REASONS, type OpaqueReason } from "./opaque-reasons.js";

// System stores whose canonical spelling is NOT all-uppercase. The lookup key
// is the uppercased form; the value is what gets stored in IRStore.name.
const CANONICAL_SYSTEM_STORE: Record<string, string> = { CASEDKEYS: "CasedKeys" };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParseResult {
  ir: KeyboardIR;
  opaqueFeatures: Array<{ feature: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a codepoint literal U+XXXX → string character, or return null. */
function parseCodepoint(tok: string): string | null {
  const m = /^U\+([0-9A-Fa-f]{4,6})$/.exec(tok);
  if (!m) return null;
  const cp = parseInt(m[1] ?? "0", 16);
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
 */
function splitTokens(text: string): string[] {
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
    let j = i;
    let depth = 0;
    while (j < text.length) {
      const c = text[j] ?? "";
      if (c === "(") { depth++; j++; continue; }
      if (c === ")") { depth--; j++; continue; }
      if (depth === 0) {
        if (c === " " || c === "\t") break;
        if (c === "'" || c === '"' || c === "[") break;
      }
      j++;
    }
    result.push(text.slice(i, j));
    i = j;
  }
  return result.filter(t => t.length > 0);
}

/** Return true if tok matches dk(...) with a named (non-hex) identifier. */
function isNamedDk(tok: string): boolean {
  const m = /^dk\s*\(\s*([^)]+)\s*\)$/i.exec(tok);
  if (!m) return false;
  const inner = (m[1] ?? "").trim();
  return !/^[0-9A-Fa-f]+$/.test(inner);
}

/** Parse a dk(NNNN) token where NNNN is hex → deadkey id number, or null. */
function parseDk(tok: string): number | null {
  const m = /^dk\s*\(\s*([0-9A-Fa-f]+)\s*\)$/i.exec(tok);
  if (!m) return null;
  return parseInt(m[1] ?? "0", 16);
}

/** Parse a modifier+vkey bracket group like [K_A] or [SHIFT K_A] → {name, modifiers}. */
function parseVkeyBracket(tok: string): { name: string; modifiers: string[] } | null {
  if (!tok.startsWith("[") || !tok.endsWith("]")) return null;
  const inner = tok.slice(1, -1).trim();
  const parts = inner.split(/\s+/);
  // The last part is the vkey name; everything before is modifiers.
  const KNOWN_MODIFIERS = new Set([
    "SHIFT", "RALT", "LALT", "CTRL", "LCTRL", "RCTRL",
    "ALT", "CAPS", "NCAPS", "RSHIFT",
  ]);
  const vkeyParts: string[] = [];
  const modParts: string[] = [];
  for (const p of parts) {
    if (KNOWN_MODIFIERS.has(p.toUpperCase())) {
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

/** Parse index(storeName, N) → {storeRef, offset}, or null. */
function parseIndex(tok: string): { storeRef: string; offset: number } | null {
  const m = new RegExp(`^index\\s*\\(\\s*(${KMN_IDENT})\\s*,\\s*(\\d+)\\s*\\)$`, "i").exec(tok);
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

/** Parse use(groupName) → groupName, or null. */
function parseUse(tok: string): string | null {
  const m = new RegExp(`^use\\s*\\(\\s*(${KMN_IDENT})\\s*\\)$`, "i").exec(tok);
  return m ? (m[1] ?? null) : null;
}

/**
 * Parse the value list of a store declaration. Always returns the parsed
 * `items`; `opaqueReason` is non-null when the body carries a construct the
 * typed IR can't represent (named deadkey, SMP literal), in which case the
 * caller wraps the whole store as a RawKmnFragment with that reason.
 */
function parseStoreItems(rawValue: string): { items: StoreItem[]; opaqueReason: OpaqueReason | null } {
  const toks = splitTokens(rawValue);
  const items: StoreItem[] = [];
  for (const tok of toks) {
    // SMP literal
    if (isSmpLiteral(tok)) return { items, opaqueReason: OPAQUE_REASONS.SMP_LITERAL };
    // U+XXXX codepoint
    const cp = parseCodepoint(tok);
    if (cp !== null) {
      items.push({ kind: "char", value: cp });
      continue;
    }
    // quoted string — expand to individual chars
    if (isQuoted(tok)) {
      const str = unquote(tok);
      for (const ch of str) {
        items.push({ kind: "char", value: ch });
      }
      continue;
    }
    // dk(name) — named (non-hex) deadkey identifier: opaque. Mirrors the
    // context (parseContextElements) and output (parseOutputElements) parsers,
    // which both classify a named deadkey as OPAQUE_REASONS.NAMED_DEADKEY.
    // Checked before parseDk so a non-hex dk(...) is not silently dropped to raw.
    if (isNamedDk(tok)) return { items, opaqueReason: OPAQUE_REASONS.NAMED_DEADKEY };
    // dk(NNNN)
    const dkId = parseDk(tok);
    if (dkId !== null) {
      items.push({ kind: "deadkey", id: dkId });
      continue;
    }
    // vkey bracket
    const vk = parseVkeyBracket(tok);
    if (vk !== null) {
      items.push({ kind: "vkey", name: vk.name });
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
  }
  return { items, opaqueReason: null };
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
  opaqueOut: { reason: string | null }
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
    // dk(name) — named (non-hex) deadkey identifier: opaque
    if (isNamedDk(tok)) {
      opaqueOut.reason = OPAQUE_REASONS.NAMED_DEADKEY;
      return null;
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
    // context(N)
    const ctxOffset = parseContext(tok);
    if (ctxOffset !== null) {
      if (ctxOffset > 1) {
        opaqueOut.reason = OPAQUE_REASONS.INDEXED_CONTEXT;
        return null;
      }
      elements.push({ kind: "context", offset: ctxOffset });
      continue;
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
    // if(...) — opaque
    if (/^if\s*\(/i.test(tok)) {
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
  opaqueOut: { reason: string | null }
): OutputElement[] | null {
  const elements: OutputElement[] = [];
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
    // quoted string
    if (isQuoted(tok)) {
      const str = unquote(tok);
      for (const ch of str) {
        elements.push({ kind: "char", value: ch });
      }
      continue;
    }
    // dk(name) — named (non-hex) deadkey identifier: opaque
    if (isNamedDk(tok)) {
      opaqueOut.reason = OPAQUE_REASONS.NAMED_DEADKEY;
      return null;
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
    // index(store, N)
    const idx = parseIndex(tok);
    if (idx !== null) {
      elements.push({ kind: "index", storeRef: idx.storeRef, offset: idx.offset });
      continue;
    }
    // outs(store) — opaque
    const outsRef = parseOuts(tok);
    if (outsRef !== null) {
      opaqueOut.reason = OPAQUE_REASONS.OUTS_EXPANSION;
      return null;
    }
    // use(group) in output — treat as raw (group transition; typically only at rule level)
    const useRef = parseUse(tok);
    if (useRef !== null) {
      elements.push({ kind: "raw", text: tok });
      continue;
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
 * Strip a trailing `c <comment>` from the RHS of a rule.
 * Returns { rhs, trailingComment }.
 */
function stripTrailingComment(rhs: string): { rhs: string; trailingComment: string | undefined } {
  // Trailing comment: whitespace + `c` + (whitespace or end of string)
  // We look from the end to find the last unquoted `c` preceded by whitespace.
  // Simple approach: tokenize the rhs and see if the last token(s) start a comment.
  const commentMatch = /\s+c(?:\s+(.*))?$/.exec(rhs);
  if (commentMatch) {
    const stripped = rhs.slice(0, commentMatch.index).trim();
    const commentText = (commentMatch[1] ?? "").trim();
    return { rhs: stripped, trailingComment: commentText || undefined };
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
  return { name, isSystem, rawValue: (m[2] ?? "").trim() };
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

  // Opaque feature count map.
  const opaqueCount = new Map<string, number>();

  function bumpOpaque(reason: string): void {
    opaqueCount.set(reason, (opaqueCount.get(reason) ?? 0) + 1);
  }

  // Parse state.
  // TODO: capture the `begin <encoding> > use(<group>)` entry group once
  // multi-group keyboards are supported; v1 assumes the single "main" group.
  let headerParsed = false; // true after we see `begin`
  let currentGroup: IRGroup | null = null;
  // Encoding from the first `begin` directive; stored in IRHeader.encoding.
  let beginEncoding: "Unicode" | "ANSI" | undefined;

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
      };
      comments.push(fc);
    }
    pendingComments = [];
  }

  // ---- Header system store extraction ----
  // We collect system stores by name for IRHeader construction.
  const sysStores: Record<string, string> = {};

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
          });
        }
        pendingComments = [];

        // System stores are also tracked for the IRHeader.
        if (parsed.isSystem) sysStores[parsed.name] = parsed.rawValue;

        // Body parsing is identical for system and user stores: wrap as a raw
        // fragment when it carries an opaque construct, otherwise emit a store.
        const { items, opaqueReason } = parseStoreItems(parsed.rawValue);
        if (opaqueReason !== null) {
          bumpOpaque(opaqueReason);
          const frag: RawKmnFragment = {
            nodeId: storeNodeId,
            origin: "imported",
            sourceText: tok.text,
            reason: opaqueReason,
            sourceLine: tok.line,
          };
          if (currentGroup !== null) frag.groupNodeId = currentGroup.nodeId;
          rawFragments.push(frag);
        } else {
          const irStore: IRStore = {
            nodeId: storeNodeId,
            name: parsed.name,
            items,
            isSystem: parsed.isSystem,
            sourceLine: tok.line,
          };
          if (tok.targetSelector !== undefined) irStore.targetSelector = tok.targetSelector;
          stores.push(irStore);
        }
        break;
      }

      case "group": {
        const parsed = parseGroupLine(tok.text);
        if (!parsed) {
          throw new Error(`Malformed group declaration at line ${tok.line}:${tok.col}: ${tok.text}`);
        }
        flushCommentsFreestanding();
        currentGroup = {
          nodeId: minter.mint("group"),
          name: parsed.name,
          usingKeys: parsed.usingKeys,
          rules: [],
          readonly: false,
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
        if (tok.targetSelector !== undefined) rule.targetSelector = tok.targetSelector;
        if (currentGroup) {
          currentGroup.rules.push(rule);
        }
        break;
      }

      case "rule": {
        if (!headerParsed) {
          // Rule before begin — treat as raw.
          flushCommentsFreestanding();
          bumpOpaque(OPAQUE_REASONS.UNKNOWN_PRE_BEGIN);
          rawFragments.push({
            nodeId: minter.mint("raw"),
            origin: "imported",
            sourceText: tok.text,
            reason: OPAQUE_REASONS.UNKNOWN_PRE_BEGIN,
            sourceLine: tok.line,
            // groupNodeId is intentionally absent: pre-begin = global/no group
          });
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

        // Parse context
        const ctxToks = splitTokens(parsedLine.contextRaw);
        const ctxElements = parseContextElements(ctxToks, opaqueCheck);

        let outElements: OutputElement[] | null = null;
        if (ctxElements !== null) {
          const outToks = splitTokens(parsedLine.outputRaw);
          outElements = parseOutputElements(outToks, opaqueCheck);
        }

        if (ctxElements === null || outElements === null) {
          // Opaque — wrap as raw fragment.
          const reason = opaqueCheck.reason ?? "unknown";
          bumpOpaque(reason);
          const frag: RawKmnFragment = {
            nodeId: ruleNodeId,
            origin: "imported",
            sourceText: tok.text,
            reason,
            sourceLine: tok.line,
          };
          if (currentGroup !== null) frag.groupNodeId = currentGroup.nodeId;
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
          if (tok.targetSelector !== undefined) rule.targetSelector = tok.targetSelector;
          if (currentGroup) {
            currentGroup.rules.push(rule);
          }
          // Trailing comment node
          if (parsedLine.trailingComment !== undefined) {
            comments.push({
              nodeId: minter.mint("comment"),
              text: parsedLine.trailingComment,
              anchor: "trailing",
              anchorRef: { kind: "rule", nodeId: ruleNodeId },
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

  const header: IRHeader = {
    keyboardId,
    name,
    bcp47: [], // populated by recognizer / survey
    copyright,
    version: keyboardVersion || version,
    targets,
    storeDirectives,
    ...(beginEncoding !== undefined ? { encoding: beginEncoding } : {}),
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

  return { ir, opaqueFeatures };
}
