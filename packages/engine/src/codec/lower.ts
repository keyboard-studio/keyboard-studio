/**
 * KMN reader on the vendored Keyman parser front end (spec 116, contracts/lowering.md):
 * text -> KeyboardIR.
 *
 *   lex once (codec/ng/lexer.ts, with the onTrivia side-channel)
 *     -> split at NEWLINE into logical lines (continuations already joined)
 *     -> parse each line with the grammar's `line` production (LineRule)
 *     -> lower the line into the IR
 *
 * Upstream's whole-file `Parser.parse()` is never called: it silently truncates a
 * file at the first failing line (research R1, finding 3). The per-line loop is
 * the only entry point, so a rejected line costs only that line.
 *
 * Lowering kept the IR, node ids, opaque reasons and comments of the reader it
 * replaced, proven by a side-by-side comparison over the corpus
 * (specs/116-ng-parser-adoption/evidence/reader-differential.md);
 * reader-regression.corpus.test.ts holds it to those numbers. Line kinds, target selectors, comments and the store /
 * group / begin lines go through the old line-level readers
 * (parse-shared.ts, tokenize.ts classifyLine), which are cheap and rare.
 * Rule lines, the bulk of every keyboard, are lowered from the syntax tree:
 * each element node takes a typed fast path, and any element without one is
 * read from its exact source slice by the old element reader, so its
 * meaning cannot drift.
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

import { isNamedDeadkeyName } from "@keyboard-studio/contracts";

import type { Token as NgToken } from "./ng/lexer.js";
import { lexWithComments, type CommentRecord } from "./comment-channel.js";
import { TokenBuffer } from "./ng/token-buffer.js";
import { LineRule } from "./ng/kmn-analyzer.js";
import { ASTNode } from "./ng/tree-construction.js";
import { NodeType } from "./ng/node-type.js";
import { TokenType } from "./ng/token-type.js";
import { classifyLine, type Token as LineToken } from "./tokenize.js";
import { NodeIdMinter } from "../shared/node-ids.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";
import {
  unquote,
  splitTokens,
  parseStoreItems,
  sketchStoreItems,
  parseContextElements,
  parseOutputElementsCore,
  parseVkeyBracket,
  KNOWN_VKEY_MODIFIERS,
  parseIfGuard,
  isHeadClusterSoFar,
  splitOnArrow,
  stripTrailingComment,
  parseRuleLine,
  parseStoreLine,
  parseGroupLine,
  isReservedEntryGroup,
  parseBeginLine,
} from "./parse-shared.js";
import type { ParseResult } from "./parse-shared.js";
import {
  DeprecatedRewriter,
  parseHeaderStatement,
  type LegacyValueOptions,
} from "./deprecated-forms.js";

export type { ParseResult };

/** One grammar-lexed logical line. */
interface NgLine {
  /** Source text of the line from its start (physical lines joined), without the final line break. */
  raw: string;
  /** 1-based physical line the logical line starts on. */
  line: number;
  /** Number of physical lines it spans. */
  span: number;
}

/** Statements Keyman 19 removed; the grammar rejects a line that uses one. */
const REMOVED_STATEMENT_RE = /(^|[\s>])(clearcontext|fix|switch|key)(\s|$|\()/i;
/** Compile targets for other engines (`$kmfl:`, `$weaver:`). */
const FOREIGN_TARGET_RE = /^\s*\$(kmfl|weaver):/i;
const CODEPOINT_RE = /^U\+([0-9A-Fa-f]{4,6})$/;
const DIGITS_RE = /^\d+$/;
const LINE_BREAK_RE = /\r\n|\n|\r/;
const CONTINUATION_TAIL_RE = /\\\s*$/;

const lineRule = new LineRule();

/** Legacy line text: physical lines joined the way codec/continuation.ts joins them. */
function joinPhysical(pieces: string[]): string {
  let text = pieces[0] ?? "";
  for (let k = 1; k < pieces.length; k++) {
    text = text.replace(CONTINUATION_TAIL_RE, "") + (pieces[k] ?? "").trimStart();
  }
  return text;
}

/** Offset in `l.raw` of a token's first character. */
function tokenOffset(t: NgToken, l: NgLine): number {
  if (l.span === 1) return t.charNum - 1;
  // Multi-physical-line line: find the start of the token's physical line.
  let line = l.line;
  let i = 0;
  while (line < t.lineNum && i < l.raw.length) {
    const ch = l.raw[i];
    if (ch === "\r") {
      if (l.raw[i + 1] === "\n") i++;
      line++;
    } else if (ch === "\n") {
      line++;
    }
    i++;
  }
  return i + t.charNum - 1;
}

/**
 * Source slice of an element node within its line: from its first token to its
 * last, including the node's own keyword token, and extended over the closing
 * `)` a call such as `set(x='y')` ends with (the grammar keeps no node for it).
 * This is the token the legacy reader's splitTokens yields for the element.
 */
let sliceFirst = -1;
let sliceEnd = -1;

function visitBounds(n: ASTNode, l: NgLine): void {
  const t = n.token;
  if (t != null) {
    const s = tokenOffset(t, l);
    if (sliceFirst < 0 || s < sliceFirst) sliceFirst = s;
    if (s + t.text.length > sliceEnd) sliceEnd = s + t.text.length;
  }
  for (let i = 0; i < n.childCount; i++) visitBounds(n.childAt(i), l);
}

function nodeSlice(node: ASTNode, l: NgLine): string {
  sliceFirst = -1;
  sliceEnd = -1;
  visitBounds(node, l);
  const first = sliceFirst;
  let end = sliceEnd;
  if (first < 0) return "";
  let depth = 0;
  let quote = "";
  for (let i = first; i < end; i++) {
    const ch = l.raw[i];
    if (quote !== "") {
      if (ch === quote) quote = "";
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    }
  }
  while (depth > 0 && end < l.raw.length) {
    const ch = l.raw[end]!;
    if (ch === ")") depth--;
    else if (ch !== " " && ch !== "\t") break;
    end++;
  }
  return l.raw.slice(first, end);
}

/** First child of a node with a token (the node's own keyword token), lower-cased text. */
function keyword(node: ASTNode): string {
  return (node.token?.text ?? "").toLowerCase();
}

/** The sole child of a type that is a plain token node (no subtree), or undefined. */
function soleTokenChild(node: ASTNode, type: NodeType): NgToken | undefined {
  const child = node.getSoleChildOfType(type);
  if (child == null || child.hasChildren() || child.token == null) return undefined;
  return child.token;
}

/** A U+XXXX token as a character, or null when it is not a 4-6 digit codepoint in range. */
function codepointChar(text: string): string | null {
  const m = CODEPOINT_RE.exec(text);
  if (!m) return null;
  const cp = parseInt(m[1] ?? "0", 16);
  return cp > 0x10ffff ? null : String.fromCodePoint(cp);
}

/** A `dk(name)` element as a typed deadkey, or null when only the legacy reader can decide. */
function deadkeyElement(node: ASTNode): ContextElement | null {
  if (keyword(node) !== "dk") return null; // `deadkey(...)` is raw to the legacy reader
  const name = soleTokenChild(node, NodeType.DEADKEYNAME);
  if (name === undefined || node.numberOfChildren() !== 1) return null;
  const inner = name.text.trim();
  if (isNamedDeadkeyName(inner)) return { kind: "namedDeadkey", name: inner };
  if (/^[0-9A-Fa-f]+$/.test(inner)) return { kind: "deadkey", id: parseInt(inner, 16) };
  return null;
}

/**
 * A virtual key `[MODS K_X]` as the legacy reader's parseVkeyBracket reads it.
 * Read from the bracket's tokens when they are whitespace-separated (each token is
 * one of the reader's whitespace-split parts); otherwise from the exact slice.
 */
function vkeyOf(node: ASTNode, l: NgLine): { name: string; modifiers: string[] } | null {
  const n = node.childCount;
  if (n < 3 || node.childAt(0).nodeType !== NodeType.LEFT_SQ || node.childAt(n - 1).nodeType !== NodeType.RIGHT_SQ) {
    return parseVkeyBracket(nodeSlice(node, l));
  }
  let name: string | null = null;
  const modifiers: string[] = [];
  let prev: NgToken | null = null;
  for (let i = 1; i < n - 1; i++) {
    const child = node.childAt(i);
    const t = child.token;
    // A token holding whitespace (`[' ']`) is several legacy parts: read the slice.
    if (t == null || child.hasChildren() || /\s/.test(t.text)) return parseVkeyBracket(nodeSlice(node, l));
    if (prev !== null && (t.lineNum !== prev.lineNum || t.charNum <= prev.charNum + prev.text.length)) {
      return parseVkeyBracket(nodeSlice(node, l)); // glued tokens: one legacy part
    }
    prev = t;
    const upper = t.text.toUpperCase();
    if (KNOWN_VKEY_MODIFIERS.has(upper)) {
      modifiers.push(upper);
    } else if (name === null) {
      name = t.text;
    } else {
      return null; // two key names: the legacy reader rejects the bracket
    }
  }
  return name === null ? null : { name, modifiers };
}

/** `name` of an any/notany/index/outs node's STORENAME child, or undefined. */
function storeName(node: ASTNode): string | undefined {
  return soleTokenChild(node, NodeType.STORENAME)?.text;
}

/**
 * Lower one context-side element node, appending to `out`. Returns false (with
 * `opaque.reason` set) when the rule must be preserved as a fragment.
 * `legacyOpts` decodes d### / x### / octal tokens on the legacy-reader
 * fallback (#2633 §3); the typed fast paths never see one.
 */
function lowerContextNode(
  node: ASTNode,
  l: NgLine,
  out: ContextElement[],
  opaque: { reason: string | null },
  legacyOpts?: LegacyValueOptions,
): boolean {
  switch (node.nodeType) {
    case NodeType.STRING: {
      for (const ch of unquote(node.token.text)) out.push({ kind: "char", value: ch });
      return true;
    }
    case NodeType.U_CHAR: {
      const ch = codepointChar(node.token.text);
      if (ch !== null) {
        out.push({ kind: "char", value: ch });
        return true;
      }
      break;
    }
    case NodeType.VIRTUAL_KEY: {
      const vk = vkeyOf(node, l);
      if (vk !== null) {
        out.push({ kind: "vkey", name: vk.name, modifiers: vk.modifiers });
        return true;
      }
      break;
    }
    case NodeType.DEADKEY: {
      const dk = deadkeyElement(node);
      if (dk !== null) {
        out.push(dk);
        return true;
      }
      break;
    }
    case NodeType.ANY:
    case NodeType.NOTANY: {
      const name = storeName(node);
      if (name !== undefined && node.numberOfChildren() === 1) {
        out.push({ kind: node.nodeType === NodeType.ANY ? "any" : "notany", storeRef: name });
        return true;
      }
      break;
    }
    case NodeType.INDEX: {
      const name = storeName(node);
      const offset = soleTokenChild(node, NodeType.OFFSET)?.text;
      if (name !== undefined && offset !== undefined && DIGITS_RE.test(offset) && node.numberOfChildren() === 2) {
        out.push({ kind: "index", storeRef: name, offset: parseInt(offset, 10) });
        return true;
      }
      break;
    }
    case NodeType.CONTEXT: {
      const offset = soleTokenChild(node, NodeType.OFFSET)?.text;
      if (offset !== undefined && DIGITS_RE.test(offset) && node.numberOfChildren() === 1) {
        const n = parseInt(offset, 10);
        if (n > 1) {
          out.push({ kind: "context", offset: n });
          return true;
        }
        opaque.reason = OPAQUE_REASONS.INDEXED_CONTEXT;
        return false;
      }
      break;
    }
    case NodeType.IF: {
      // Typed only as an equality guard inside the head cluster (spec 103).
      const guard = parseIfGuard(nodeSlice(node, l));
      if (guard !== null && isHeadClusterSoFar(out)) {
        out.push({ kind: "if", store: guard.store, value: guard.value });
        return true;
      }
      opaque.reason = OPAQUE_REASONS.IF_OPTION_STORE;
      return false;
    }
    default:
      break;
  }
  // No fast path: read the element's exact source slice with the legacy reader.
  // `out` is passed as the prior context so a head-position check (platform) sees the whole rule so far.
  const els = parseContextElements(splitTokens(nodeSlice(node, l), true), opaque, out, legacyOpts);
  if (els === null) return false;
  for (const e of els) out.push(e);
  return true;
}

/**
 * Lower one output-side element node, appending to `out` (strict mode).
 * Returns false (with `opaque.reason` set) when the rule must be a fragment.
 * `legacyOpts` decodes d### / x### / octal tokens on the legacy-reader
 * fallback (#2633 §3); the typed fast paths never see one.
 */
function lowerOutputNode(
  node: ASTNode,
  l: NgLine,
  out: OutputElement[],
  opaque: { reason: string | null },
  legacyOpts?: LegacyValueOptions,
): boolean {
  switch (node.nodeType) {
    case NodeType.STRING: {
      for (const ch of unquote(node.token.text)) out.push({ kind: "char", value: ch });
      return true;
    }
    case NodeType.U_CHAR: {
      const ch = codepointChar(node.token.text);
      if (ch !== null) {
        out.push({ kind: "char", value: ch });
        return true;
      }
      break;
    }
    case NodeType.DEADKEY: {
      const dk = deadkeyElement(node);
      if (dk !== null) {
        out.push(dk as OutputElement);
        return true;
      }
      break;
    }
    case NodeType.BEEP:
      if (keyword(node) === "beep" && !node.hasChildren()) {
        out.push({ kind: "beep" });
        return true;
      }
      break;
    case NodeType.NUL:
      if (keyword(node) === "nul" && !node.hasChildren()) {
        out.push({ kind: "nul" });
        return true;
      }
      break;
    case NodeType.CONTEXT: {
      if (!node.hasChildren() && keyword(node) === "context") {
        out.push({ kind: "context", offset: 0 });
        return true;
      }
      const offset = soleTokenChild(node, NodeType.OFFSET)?.text;
      if (offset !== undefined && DIGITS_RE.test(offset) && node.numberOfChildren() === 1) {
        const n = parseInt(offset, 10);
        if (n < 1) {
          opaque.reason = OPAQUE_REASONS.INDEXED_CONTEXT;
          return false;
        }
        out.push({ kind: "context", offset: n });
        return true;
      }
      break;
    }
    case NodeType.INDEX: {
      const name = storeName(node);
      const offset = soleTokenChild(node, NodeType.OFFSET)?.text;
      if (name !== undefined && offset !== undefined && DIGITS_RE.test(offset) && node.numberOfChildren() === 2) {
        out.push({ kind: "index", storeRef: name, offset: parseInt(offset, 10) });
        return true;
      }
      break;
    }
    case NodeType.USE: {
      const group = soleTokenChild(node, NodeType.GROUPNAME);
      if (group !== undefined && node.numberOfChildren() === 1) {
        out.push({ kind: "useGroup", groupName: group.text });
        return true;
      }
      break;
    }
    default:
      break;
  }
  const els = parseOutputElementsCore(splitTokens(nodeSlice(node, l)), "strict", opaque, legacyOpts);
  if (els === null) return false;
  for (const e of els) out.push(e);
  return true;
}

/** Lenient produced-output sketch of an RHS (for fragments), read from each node's slice. */
function producedOutputOf(rhs: ASTNode, l: NgLine): OutputElement[] {
  const out: OutputElement[] = [];
  for (let i = 0; i < rhs.childCount; i++) {
    const node = rhs.childAt(i);
    // No legacy opts: the sketch decodes legacy tokens silently, as the old
    // extractProducedOutput did (the fragment preserves the source text).
    const els = parseOutputElementsCore(splitTokens(nodeSlice(node, l)), "lenient", { reason: null }) ?? [];
    for (const e of els) out.push(e);
  }
  return out;
}

/** The syntax tree's production for an accepted rule line, or null when it is not one. */
function productionOf(root: ASTNode): { lhs: ASTNode; rhs: ASTNode } | null {
  const production = root.getSoleChildOfType(NodeType.PRODUCTION);
  if (production == null) return null;
  const lhs = production.getSoleChildOfType(NodeType.LHS);
  const rhs = production.getSoleChildOfType(NodeType.RHS);
  if (lhs == null || rhs == null) return null;
  return { lhs, rhs };
}

/**
 * Whether the legacy reader's trailing-comment split of this rule line agrees with
 * the lexer's comment token, so the AST (which drops comments) sees the same RHS.
 * The legacy split only recognises a lower-case `c` after whitespace, on the
 * output side.
 */
function commentAgrees(l: NgLine, comment: CommentRecord, rhs: ASTNode): boolean {
  if (l.span !== 1 || l.raw[comment.column - 1] !== "c") return false;
  const prev = l.raw[comment.column - 2];
  if (prev === undefined || !/\s/.test(prev)) return false;
  // The comment must follow every output element.
  const b = rhs.getTokenBounds();
  if (b.lastLine === null || b.lastChar === null) return true;
  return b.lastLine < comment.line || (b.lastLine === comment.line && b.lastChar <= comment.column);
}

/** One grammar-lexed logical line, with the token range that produced it. */
interface LogicalLine {
  /** Raw source of the line, final line break included (token columns index into it, BOM included). */
  raw: string;
  /** 1-based physical line the logical line starts on. */
  line: number;
  /** Number of physical lines it spans. */
  span: number;
  /** Physical lines joined the way codec/continuation.ts joins them. */
  joined: string;
  /** Index of the first token of the line in the lexed token stream. */
  tokenStart: number;
  /** Index of the NEWLINE token terminating the line. */
  newlineIndex: number;
}

/**
 * Split the lexed token stream into logical lines (continuations already
 * joined). Extracted from lowerDetailed's loop so the #2633 encoding
 * pre-pass can walk the same lines before the main loop runs.
 */
function splitLogicalLines(ngTokens: NgToken[]): LogicalLine[] {
  const lines: LogicalLine[] = [];
  let physical = 1;
  let start = 0;
  let firstLine = true;
  for (let ti = 0; ti < ngTokens.length; ti++) {
    const nl = ngTokens[ti]!;
    if (nl.tokenType !== TokenType.NEWLINE) continue;
    const lineStart = start;
    start = ti + 1;

    // Raw source of the line, final line break included (token columns index
    // into it, BOM included; slices never reach the break). classifyLine trims,
    // so a single physical line needs no copy.
    const raw = nl.line ?? "";
    const end = raw.length - nl.text.length;
    const bom = firstLine && raw.charCodeAt(0) === 0xfeff ? 1 : 0;
    firstLine = false;
    let span = 1;
    let joined = bom === 0 ? raw : raw.slice(1);
    const cr = raw.indexOf("\r");
    const lf = raw.indexOf("\n");
    if ((cr >= 0 && cr < end) || (lf >= 0 && lf < end)) {
      const pieces = raw.slice(bom, end).split(LINE_BREAK_RE);
      span = pieces.length;
      joined = joinPhysical(pieces);
    }
    lines.push({ raw, line: physical, span, joined, tokenStart: lineStart, newlineIndex: ti });
    physical += span;
  }
  return lines;
}

/** lower()'s result plus the lines the grammar rejected (for the comparison suite). */
export interface LowerResult extends ParseResult {
  /** 1-based source lines of rule lines the grammar rejected, in order. */
  rejectedLines: number[];
}

export function lower(text: string, keyboardId: string): ParseResult {
  const { ir, opaqueFeatures, rewrites } = lowerDetailed(text, keyboardId);
  return { ir, opaqueFeatures, rewrites };
}

/**
 * lower(), also reporting grammar-rejected rule lines. A rejected line that uses a
 * statement Keyman 19 removed becomes a removed-statement fragment; any other is
 * read by the legacy line reader, which keeps its fragment reason (`if(a <> 'b')`
 * stays if-option-store) or its typed rule. The comparison suite requires every
 * corpus rejection to be a known one.
 */
export function lowerDetailed(text: string, keyboardId: string): LowerResult {
  const minter = new NodeIdMinter();
  const rejectedLines: number[] = [];

  // Lex once; the comment channel records the comment on each physical line.
  const { tokens: ngTokens, comments: commentRecords } = lexWithComments(text);
  const logicalLines = splitLogicalLines(ngTokens);

  const stores: IRStore[] = [];
  const groups: IRGroup[] = [];
  const comments: IRComment[] = [];
  const rawFragments: RawKmnFragment[] = [];
  const knownStoreItems = new Map<string, StoreItem[]>();
  const opaqueCount = new Map<string, number>();
  const bumpOpaque = (reason: string): void => {
    opaqueCount.set(reason, (opaqueCount.get(reason) ?? 0) + 1);
  };

  let headerParsed = false;
  let currentGroup: IRGroup | null = null;
  let beginEncoding: "Unicode" | "ANSI" | undefined;
  let beginEntryGroup: string | undefined;
  let pendingComments: Array<{ text: string; line: number }> = [];
  const sysStores: Record<string, string> = {};

  // Encoding breakpoints for the #2633 ANSI guard: (line, encoding) of each
  // `begin` directive in source order. A line's enclosing encoding is the
  // most recent begin at or before it; before any begin, the file's FIRST
  // begin encoding. Computed in a pre-pass — the main loop meets pre-begin
  // lines before it has seen any begin.
  const encodingBreakpoints: Array<{ line: number; encoding: "Unicode" | "ANSI" }> = [];
  for (const ll of logicalLines) {
    const t = classifyLine(ll.joined, ll.line);
    if (t.kind !== "begin") continue;
    const b = parseBeginLine(t.text);
    if (b !== null && (b.encoding === "Unicode" || b.encoding === "ANSI")) {
      encodingBreakpoints.push({ line: t.line, encoding: b.encoding });
    }
  }

  // Deprecated-form rewrites (#2633): header statements, legacy value
  // formats and target-selector prefixes, recorded here and returned in
  // ParseResult.rewrites. Finalised after the loop (merges + headers need
  // the whole file seen first).
  const rewriter = new DeprecatedRewriter({
    stores,
    groups,
    rawFragments,
    sysStores,
    minter,
    getCurrentGroup: () => currentGroup,
    encodingBreakpoints,
  });

  function flushCommentsFreestanding(): void {
    for (const c of pendingComments) {
      comments.push({ nodeId: minter.mint("comment"), text: c.text, anchor: "freestanding", sourceLine: c.line });
    }
    pendingComments = [];
  }

  function attachLeading(kind: "store" | "rule", nodeId: string): void {
    for (const c of pendingComments) {
      comments.push({
        nodeId: minter.mint("comment"),
        text: c.text,
        anchor: "leading",
        anchorRef: { kind, nodeId },
        sourceLine: c.line,
      });
    }
    pendingComments = [];
  }

  /** The legacy rule path: text in, typed rule or fragment out (used where the AST can't stand in). */
  function legacyRule(tok: LineToken, ruleNodeId: string): void {
    const parsedLine = parseRuleLine(tok.text);
    if (!parsedLine) throw new Error(`Malformed rule at line ${tok.line}:${tok.col}: ${tok.text}`);
    const opaqueCheck = { reason: null as string | null };
    const ctxElements = parseContextElements(
      splitTokens(parsedLine.contextRaw, true),
      opaqueCheck,
      [],
      rewriter.legacyOptsFor(tok.line),
    );
    let outElements: OutputElement[] | null = null;
    if (ctxElements !== null) outElements = parseOutputElementsCore(splitTokens(parsedLine.outputRaw), "strict", opaqueCheck, rewriter.legacyOptsFor(tok.line));
    if (ctxElements === null || outElements === null) {
      const sketch = parseOutputElementsCore(splitTokens(parsedLine.outputRaw), "lenient", { reason: null }) ?? [];
      pushRuleFragment(tok, ruleNodeId, opaqueCheck.reason ?? "unknown", sketch);
      return;
    }
    pushRule(tok, ruleNodeId, ctxElements, outElements, parsedLine.trailingComment);
  }

  function pushRuleFragment(tok: LineToken, ruleNodeId: string, reason: string, sketch: OutputElement[] | null): void {
    bumpOpaque(reason);
    const frag: RawKmnFragment = {
      nodeId: ruleNodeId,
      origin: "imported",
      // An opaque line is NOT rewritten, so a stripped target-selector
      // prefix stays visible in the fragment text (#2633 D9 fidelity).
      sourceText: rewriter.fragmentSourceText(tok),
      reason,
      sourceLine: tok.line,
    };
    // A target-prefixed opaque rule cannot be rewritten: the prefix stays
    // in the fragment text and the escalation is recorded so the user can
    // see it needs review. `$keyman:` ("both") is dropped, as everywhere.
    rewriter.recordKeymanDrop(tok);
    rewriter.recordTargetEscalation(tok, `(kept as-is — opaque rule; target gating could not be rewritten, needs review)`);
    if (currentGroup !== null) frag.groupNodeId = currentGroup.nodeId;
    if (sketch !== null && sketch.some((e) => e.kind === "char" || e.kind === "index" || e.kind === "outs")) {
      frag.producedOutput = sketch;
    }
    rawFragments.push(frag);
  }

  function pushRule(
    tok: LineToken,
    ruleNodeId: string,
    context: ContextElement[],
    output: OutputElement[],
    trailingComment: string | undefined,
  ): void {
    const base: IRRule = trailingComment !== undefined
      ? { nodeId: ruleNodeId, context, output, trailingComment, sourceLine: tok.line }
      : { nodeId: ruleNodeId, context, output, sourceLine: tok.line };
    // Target-selector rewrite (#2633 §1): `$keyman:` dropped,
    // `$keymanonly:` one platform('desktop native')-guarded rule,
    // `$keymanweb:` three platform-guarded copies. The first copy keeps
    // ruleNodeId, so the leading/trailing comments anchor to it.
    const rulesToPush = rewriter.applyTargetSelectorToRule(base, tok);
    for (const rule of rulesToPush) {
      if (currentGroup) currentGroup.rules.push(rule);
    }
    if (trailingComment !== undefined) {
      comments.push({
        nodeId: minter.mint("comment"),
        text: trailingComment,
        anchor: "trailing",
        anchorRef: { kind: "rule", nodeId: ruleNodeId },
        sourceLine: tok.line,
      });
    }
  }

  /** A rule line the grammar accepted, lowered from its syntax tree. */
  function astRule(tok: LineToken, l: NgLine, root: ASTNode, ruleNodeId: string): void {
    const prod = productionOf(root);
    const found = commentRecords.get(l.line + l.span - 1);
    const comment = found?.kind === "trailing" ? found : undefined;
    if (prod === null || (comment !== undefined && !commentAgrees(l, comment, prod.rhs))) {
      legacyRule(tok, ruleNodeId);
      return;
    }
    const { lhs, rhs } = prod;
    if (lhs.childCount === 1 && (lhs.childAt(0).nodeType === NodeType.MATCH || lhs.childAt(0).nodeType === NodeType.NOMATCH)) {
      legacyRule(tok, ruleNodeId); // a match/nomatch the line classifier saw as a rule
      return;
    }

    const opaque = { reason: null as string | null };
    // Legacy value formats on this line decode with the ANSI guard and a
    // rewrite record (#2633 §3).
    const legacyOpts = rewriter.legacyOptsFor(tok.line);
    // A keystroke with more than one element: kmcmplib uses only the first and warns.
    const keystroke = lhs.getSoleChildOfType(NodeType.KEYSTROKE);
    if (keystroke != null && keystroke.numberOfChildren() > 1) {
      pushRuleFragment(tok, ruleNodeId, OPAQUE_REASONS.MULTI_ELEMENT_KEYSTROKE, producedOutputOf(rhs, l));
      return;
    }

    const context: ContextElement[] = [];
    let ok = true;
    for (let ci = 0; ci < lhs.childCount; ci++) {
      const child = lhs.childAt(ci);
      if (child.nodeType === NodeType.INPUT_CONTEXT) {
        for (let ei = 0; ei < child.childCount; ei++) {
          if (!(ok = lowerContextNode(child.childAt(ei), l, context, opaque, legacyOpts))) break;
        }
      } else if (child.nodeType === NodeType.KEYSTROKE) {
        // The legacy reader strips a leading `+` and keeps any other as a raw separator.
        if (!tok.text.startsWith("+")) context.push({ kind: "raw", text: "+" });
        for (let ei = 0; ei < child.childCount; ei++) {
          if (!(ok = lowerContextNode(child.childAt(ei), l, context, opaque, legacyOpts))) break;
        }
      } else {
        ok = lowerContextNode(child, l, context, opaque, legacyOpts);
      }
      if (!ok) break;
    }

    let output: OutputElement[] | null = null;
    if (ok) {
      output = [];
      for (let ei = 0; ei < rhs.childCount; ei++) {
        if (!lowerOutputNode(rhs.childAt(ei), l, output, opaque, legacyOpts)) {
          output = null;
          break;
        }
      }
    }

    if (!ok || output === null) {
      pushRuleFragment(tok, ruleNodeId, opaque.reason ?? "unknown", producedOutputOf(rhs, l));
      return;
    }
    const trailingComment = comment !== undefined ? comment.text || undefined : undefined;
    pushRule(tok, ruleNodeId, context, output, trailingComment);
  }

  // ---- the line loop ----
  const root = new ASTNode(NodeType.ROOT);
  for (const ll of logicalLines) {
    const l: NgLine = { raw: ll.raw, line: ll.line, span: ll.span };
    const tok = classifyLine(ll.joined, l.line);

    root.truncateChildren(0);
    const buffer = new TokenBuffer(ngTokens, ll.tokenStart, ll.newlineIndex + 1);
    const accepted = lineRule.parse(buffer, root) && buffer.currentPosition === ll.newlineIndex + 1;

    switch (tok.kind) {
      case "blank":
        flushCommentsFreestanding();
        break;

      case "comment": {
        const rec = commentRecords.get(tok.line);
        pendingComments.push({ text: rec?.kind === "line" ? rec.text : tok.text, line: tok.line });
        break;
      }

      case "begin": {
        const parsed = parseBeginLine(tok.text);
        if (!parsed) throw new Error(`Malformed begin directive at line ${tok.line}:${tok.col}: ${tok.text}`);
        // A target-prefixed begin line is pathological (no corpus case):
        // the prefix is dropped, the entry point kept, and the drop recorded.
        rewriter.recordKeymanDrop(tok);
        rewriter.recordTargetEscalation(tok, `${tok.text} (prefix dropped — an entry point cannot be target-gated; needs review)`);
        headerParsed = true;
        if (beginEncoding === undefined) {
          beginEncoding = parsed.encoding as "Unicode" | "ANSI";
          beginEntryGroup = parsed.entryGroup || undefined;
        }
        flushCommentsFreestanding();
        break;
      }

      case "store": {
        const parsed = parseStoreLine(tok.text, tok.line);
        const storeNodeId = minter.mint("store");
        attachLeading("store", storeNodeId);
        if (parsed.isSystem) sysStores[parsed.name] = parsed.rawValue;
        // Legacy value formats in the body are decoded (ANSI-guarded) and the
        // rewrite recorded against this line.
        const { items, opaqueReason } = parseStoreItems(parsed.rawValue, true, rewriter.legacyOptsFor(tok.line));
        if (opaqueReason !== null) {
          bumpOpaque(opaqueReason);
          const frag: RawKmnFragment = {
            nodeId: storeNodeId,
            origin: "imported",
            // An opaque store is NOT rewritten, so a stripped target-selector
            // prefix stays visible in the fragment text (#2633 D9 fidelity).
            sourceText: rewriter.fragmentSourceText(tok),
            reason: opaqueReason,
            sourceLine: tok.line,
          };
          // A target-prefixed opaque store cannot be rewritten: the prefix
          // stays in the fragment text and the escalation is recorded.
          rewriter.recordKeymanDrop(tok);
          rewriter.recordTargetEscalation(tok, `(kept as-is — opaque store; target gating could not be rewritten, needs review)`);
          const sketch = sketchStoreItems(parsed.rawValue, knownStoreItems, rewriter.isAnsiLine(tok.line));
          if (sketch !== undefined) {
            frag.storeSketch = sketch;
            knownStoreItems.set(parsed.name.toLowerCase(), sketch);
          }
          if (currentGroup !== null) frag.groupNodeId = currentGroup.nodeId;
          rawFragments.push(frag);
        } else {
          // A store holding `outs()` references is typed, but later fragment sketches
          // flatten through it: keep the flattened items, as the sketch of the
          // fragment this store used to be.
          const flat = items.some((it) => it.kind === "outs")
            ? sketchStoreItems(parsed.rawValue, knownStoreItems, rewriter.isAnsiLine(tok.line))
            : items;
          if (flat !== undefined) knownStoreItems.set(parsed.name.toLowerCase(), flat);
          const irStore: IRStore = { nodeId: storeNodeId, name: parsed.name, items, isSystem: parsed.isSystem, sourceLine: tok.line };
          // Target-prefixed stores are merged after the loop (desktop body
          // wins); `$keyman:` ("both") is dropped now, with a rewrite record.
          rewriter.recordKeymanDrop(tok);
          if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
            irStore.targetSelector = tok.targetSelector;
            rewriter.recordStoreSource(storeNodeId, {
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
        if (!parsed) throw new Error(`Malformed group declaration at line ${tok.line}:${tok.col}: ${tok.text}`);
        // A target-prefixed group line is pathological (no corpus case):
        // the prefix is dropped, the group kept, and the drop recorded.
        rewriter.recordKeymanDrop(tok);
        rewriter.recordTargetEscalation(tok, `${tok.text} (prefix dropped — a group cannot be target-gated; needs review)`);
        flushCommentsFreestanding();
        currentGroup = {
          nodeId: minter.mint("group"),
          name: parsed.name,
          usingKeys: parsed.usingKeys,
          rules: [],
          readonly: isReservedEntryGroup(parsed.name),
          sourceLine: tok.line,
        };
        groups.push(currentGroup);
        headerParsed = true;
        break;
      }

      case "match":
      case "nomatch": {
        flushCommentsFreestanding();
        const split = splitOnArrow(tok.text);
        if (!split) throw new Error(`Malformed ${tok.kind} at line ${tok.line}:${tok.col}`);
        const rule: IRRule = {
          nodeId: minter.mint("rule"),
          context: [],
          output: [{ kind: "raw", text: split.rhs.trim() }],
          matchKind: tok.kind,
          sourceLine: tok.line,
        };
        // Target-prefixed transitions are merged after the loop (desktop
        // wins); `$keyman:` ("both") is dropped now, with a rewrite record.
        rewriter.recordKeymanDrop(tok);
        if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
          rule.targetSelector = tok.targetSelector;
        }
        if (currentGroup) {
          currentGroup.rules.push(rule);
        }
        break;
      }

      case "rule": {
        if (FOREIGN_TARGET_RE.test(l.raw)) {
          flushCommentsFreestanding();
          bumpOpaque(OPAQUE_REASONS.FOREIGN_COMPILE_TARGET);
          const frag: RawKmnFragment = {
            nodeId: minter.mint("raw"),
            origin: "imported",
            sourceText: tok.text,
            reason: OPAQUE_REASONS.FOREIGN_COMPILE_TARGET,
            sourceLine: tok.line,
          };
          if (currentGroup !== null) frag.groupNodeId = currentGroup.nodeId;
          rawFragments.push(frag);
          break;
        }
        if (!headerParsed) {
          // Old-style header statement (NAME, VERSION, ...) — collected for
          // finalisation after the loop, once it is known whether a real
          // store() already provides the value. A trailing c-comment rides
          // along as a freestanding comment so no text is lost.
          const { rhs: headerText, trailingComment: headerComment } =
            stripTrailingComment(tok.text);
          const header = parseHeaderStatement(headerText);
          if (header !== null) {
            rewriter.collectHeader(header, tok.line, tok.text);
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
            rewriter.recordKeymanDrop(tok);
            rewriter.recordTargetEscalation(tok, `${tok.text} (prefix dropped — a header statement cannot be target-gated; needs review)`);
            break;
          }
          // Rule before begin — treat as raw.
          flushCommentsFreestanding();
          bumpOpaque(OPAQUE_REASONS.UNKNOWN_PRE_BEGIN);
          rawFragments.push({
            nodeId: minter.mint("raw"),
            origin: "imported",
            // An opaque pre-begin line is NOT rewritten, so a stripped
            // target-selector prefix stays visible in the fragment text.
            sourceText: rewriter.fragmentSourceText(tok),
            reason: OPAQUE_REASONS.UNKNOWN_PRE_BEGIN,
            sourceLine: tok.line,
            // groupNodeId is intentionally absent: pre-begin = global/no group
          });
          // A target-prefixed pre-begin line cannot be rewritten (D9
          // fidelity): the prefix stays in the fragment text and the
          // escalation is recorded so the user can see it needs review.
          rewriter.recordKeymanDrop(tok);
          rewriter.recordTargetEscalation(tok, `(kept as-is — pre-begin line; target gating could not be rewritten, needs review)`);
          break;
        }
        const ruleNodeId = minter.mint("rule");
        attachLeading("rule", ruleNodeId);
        if (!accepted) {
          rejectedLines.push(tok.line);
          if (REMOVED_STATEMENT_RE.test(tok.text)) {
            pushRuleFragment(tok, ruleNodeId, OPAQUE_REASONS.REMOVED_STATEMENT, null);
          } else {
            legacyRule(tok, ruleNodeId);
          }
          break;
        }
        astRule(tok, l, root, ruleNodeId);
        break;
      }

      default:
        flushCommentsFreestanding();
        break;
    }
  }

  flushCommentsFreestanding();

  // Deprecated-form finalisation (#2633) — post-loop passes: merge
  // targeted stores/transitions, resolve the &CasedKeys/&mnemonicLayout
  // conflict, finalise pending headers, raise the version for added
  // platform() guards. Runs BEFORE the header is built: finalisation
  // synthesises stores and fixes up sysStores.
  rewriter.finalize();

  const sysVal = (name: string): string => unquote((sysStores[name] ?? "").trim());
  const targetsRaw = sysVal("TARGETS");
  const entryPoints: NonNullable<IRHeader["entryPoints"]> = {};
  if (beginEntryGroup !== undefined) entryPoints.main = beginEntryGroup;
  for (const g of groups) {
    const lowerName = g.name.toLowerCase();
    if (lowerName === "newcontext") entryPoints.newContext = true;
    if (lowerName === "postkeystroke") entryPoints.postKeystroke = true;
  }
  const header: IRHeader = {
    keyboardId,
    name: sysVal("NAME"),
    bcp47: [],
    copyright: sysVal("COPYRIGHT"),
    version: sysVal("KEYBOARDVERSION") || sysVal("VERSION"),
    targets: targetsRaw ? targetsRaw.split(/\s+/).filter(Boolean) : [],
    storeDirectives: [],
    ...(beginEncoding !== undefined ? { encoding: beginEncoding } : {}),
    ...(Object.keys(entryPoints).length > 0 ? { entryPoints } : {}),
  };

  const opaqueFeatures: Array<{ feature: string; count: number }> = [];
  for (const [feature, count] of opaqueCount) opaqueFeatures.push({ feature, count });

  const ir: KeyboardIR = {
    origin: "imported",
    header,
    stores,
    groups,
    comments,
    raw: rawFragments,
    recognizedPatterns: [],
  };
  return { ir, opaqueFeatures, rewrites: rewriter.rewrites, rejectedLines };
}
