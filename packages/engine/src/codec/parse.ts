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

import { tokenize, type Token } from "./tokenize.js";
import { NodeIdMinter } from "./node-ids.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";

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

/** Strip single or double quotes from a quoted string token. */
function unquote(s: string): string {
  if ((s.startsWith("'") && s.endsWith("'")) ||
      (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
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
    let j = i;
    let depth = 0;
    while (j < text.length) {
      const c = text[j] ?? "";
      if (c === "(") { depth++; j++; continue; }
      if (c === ")") { depth--; j++; continue; }
      if (depth === 0 && (c === " " || c === "\t")) break;
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
// We require the first char to be a letter/underscore (no leading digit) and
// allow any subsequent non-whitespace, non-paren character.
const KMN_IDENT = String.raw`[^\s\d\(\)\,][^\s\(\)\,]*`;

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
 * Parse the value list of a store declaration.
 * Returns StoreItem[] or null if an opaque item is detected.
 */
function parseStoreItems(rawValue: string): { items: StoreItem[]; opaque: boolean } {
  const toks = splitTokens(rawValue);
  const items: StoreItem[] = [];
  for (const tok of toks) {
    // SMP literal
    if (isSmpLiteral(tok)) return { items, opaque: true };
    // U+XXXX codepoint
    const cp = parseCodepoint(tok);
    if (cp !== null) {
      items.push({ kind: "char", value: cp });
      continue;
    }
    // quoted string — expand to individual chars
    if ((tok.startsWith("'") && tok.endsWith("'")) ||
        (tok.startsWith('"') && tok.endsWith('"'))) {
      const str = unquote(tok);
      for (const ch of str) {
        items.push({ kind: "char", value: ch });
      }
      continue;
    }
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
    // bare identifier (treated as raw if unrecognized)
    items.push({ kind: "raw", text: tok });
  }
  return { items, opaque: false };
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
    if ((tok.startsWith("'") && tok.endsWith("'")) ||
        (tok.startsWith('"') && tok.endsWith('"'))) {
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
    if ((tok.startsWith("'") && tok.endsWith("'")) ||
        (tok.startsWith('"') && tok.endsWith('"'))) {
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
  let entryGroupName = "main";
  let headerParsed = false; // true after we see `begin`
  let currentGroup: IRGroup | null = null;

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
        entryGroupName = parsed.entryGroup;
        headerParsed = true;
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

        if (parsed.isSystem) {
          // Track for IRHeader.
          sysStores[parsed.name] = parsed.rawValue;
          // Also add to stores array as a system store.
          const { items, opaque: sysOpaque } = parseStoreItems(parsed.rawValue);
          if (sysOpaque) {
            // System store contains SMP or other opaque content — wrap as raw.
            bumpOpaque(OPAQUE_REASONS.SMP_LITERAL);
            rawFragments.push({
              nodeId: storeNodeId,
              origin: "imported",
              sourceText: tok.text,
              reason: OPAQUE_REASONS.SMP_LITERAL,
            });
          } else {
            stores.push({
              nodeId: storeNodeId,
              name: parsed.name,
              items,
              isSystem: true,
            });
          }
        } else {
          // User store — may belong to current group or be global.
          const { items, opaque } = parseStoreItems(parsed.rawValue);
          if (opaque) {
            // Wrap as raw fragment.
            bumpOpaque(OPAQUE_REASONS.SMP_LITERAL);
            rawFragments.push({
              nodeId: storeNodeId,
              origin: "imported",
              sourceText: tok.text,
              reason: OPAQUE_REASONS.SMP_LITERAL,
            });
          } else {
            const irStore: IRStore = {
              nodeId: storeNodeId,
              name: parsed.name,
              items,
              isSystem: false,
            };
            stores.push(irStore);
          }
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
        };
        groups.push(currentGroup);
        headerParsed = true; // groups also mark end of header
        break;
      }

      case "match":
      case "nomatch": {
        // match > use(group) / nomatch > use(group)
        // These are group-transition rules. We represent them as raw fragments
        // unless we want typed match/nomatch — for now, emit as raw to be safe,
        // since IRRule doesn't have a "match" concept. Actually we can store
        // them as IRRule with a special `use(...)` output element (kind: "raw").
        flushCommentsFreestanding();
        const split = splitOnArrow(tok.text);
        if (!split) {
          throw new Error(`Malformed ${tok.kind} at line ${tok.line}:${tok.col}`);
        }
        const ruleNodeId = minter.mint("rule");
        // context is empty for match/nomatch
        const ctxEl: ContextElement[] = [];
        const outEl: OutputElement[] = [{ kind: "raw", text: split.rhs.trim() }];
        const rule: IRRule = {
          nodeId: ruleNodeId,
          context: ctxEl,
          output: outEl,
        };
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
          rawFragments.push({
            nodeId: ruleNodeId,
            origin: "imported",
            sourceText: tok.text,
            reason,
          });
        } else {
          const rule: IRRule = parsedLine.trailingComment !== undefined
            ? {
                nodeId: ruleNodeId,
                context: ctxElements,
                output: outElements,
                trailingComment: parsedLine.trailingComment,
              }
            : {
                nodeId: ruleNodeId,
                context: ctxElements,
                output: outElements,
              };
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
