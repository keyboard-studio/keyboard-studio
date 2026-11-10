/**
 * Legacy KMN reader: text -> KeyboardIR (spec 116 retires it once lower.ts matches it).
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
import { NodeIdMinter } from "../shared/node-ids.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";
import {
  unquote,
  splitTokens,
  KMN_IDENT,
  parseStoreItems,
  sketchStoreItems,
  parseContextElements,
  parseOutputElements,
  extractProducedOutput,
} from "./parse-shared.js";

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
export function parseLegacy(text: string, keyboardId: string): ParseResult {
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
          const sketch = sketchStoreItems(parsed.rawValue, knownStoreItems);
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
          if (tok.targetSelector !== undefined) irStore.targetSelector = tok.targetSelector;
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

  return { ir, opaqueFeatures };
}
