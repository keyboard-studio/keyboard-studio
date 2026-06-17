/**
 * Canonical .kmn emitter: KeyboardIR -> string.
 *
 * Codepoint formatting: uppercase U+XXXX (e.g. U+00E0) for BMP characters;
 * single-quoted literal (e.g. '𑜠') for SMP characters (> U+FFFF). This keeps
 * SMP rules typed through emit→re-parse cycles. The choice of uppercase hex
 * for BMP is intentional; callers that need lowercase should post-process.
 *
 * Emission order:
 *   1. System stores in canonical order (see SYSTEM_STORE_ORDER).
 *   2. blank line.
 *   3. begin Unicode > use(<entryGroup>).
 *   4. For each group:
 *        blank line
 *        group(<name>) [using keys]
 *        user stores attached to the group (heuristic: stores whose names
 *        appear in the group's rules)
 *        rules (or RawKmnFragment source text)
 *   5. Trailing newline.
 *
 * Comments:
 *   - "leading" comments are emitted immediately before their anchorRef's line.
 *   - "trailing" comments appear after the rule they anchor.
 *     (IRRule.trailingComment is used directly for inline trailing comments.)
 *   - "freestanding" comments are emitted at the top, before stores.
 */

import type {
  KeyboardIR,
  IRStore,
  IRRule,
  IRComment,
  ContextElement,
  OutputElement,
  StoreItem,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Codepoint formatting
// ---------------------------------------------------------------------------

/**
 * Format a single Unicode character as U+XXXX (uppercase 4-digit minimum),
 * or as a quoted literal for SMP codepoints (> U+FFFF).
 *
 * SMP characters (e.g. U+11700 Ahom Letter Ka) would produce 5-digit U+XXXXX
 * tokens that trigger `isSmpLiteral()` in the parser and go opaque. Quoting
 * them ('𑜠') keeps the rule typed through emit→re-parse cycles, matching the
 * convention used in original keyboard source files.
 */
function fmtCodepoint(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp > 0xffff) {
    return `'${ch}'`;
  }
  const hex = cp.toString(16).toUpperCase();
  const padded = hex.padStart(4, "0");
  return `U+${padded}`;
}

/** Format a deadkey id as dk(XXXX). */
function fmtDk(id: number): string {
  return `dk(${id.toString(16).toLowerCase().padStart(4, "0")})`;
}

// ---------------------------------------------------------------------------
// Element serializers
// ---------------------------------------------------------------------------

function fmtContextElement(el: ContextElement): string {
  switch (el.kind) {
    case "char":    return fmtCodepoint(el.value);
    case "vkey":    return el.modifiers.length > 0
                      ? `[${el.modifiers.join(" ")} ${el.name}]`
                      : `[${el.name}]`;
    case "deadkey": return fmtDk(el.id);
    case "any":     return `any(${el.storeRef})`;
    case "notany":  return `notany(${el.storeRef})`;
    case "context": return `context(${el.offset})`;
    case "index":   return `index(${el.storeRef}, ${el.offset})`;
    case "baselayout": { if (el.value.includes("'")) throw new Error(`baselayout value must not contain single-quote: ${el.value}`); return el.value ? `baselayout('${el.value}')` : "baselayout"; }
    case "raw":     return el.text;
  }
}

function fmtOutputElement(el: OutputElement): string {
  switch (el.kind) {
    case "char":    return fmtCodepoint(el.value);
    case "deadkey": return fmtDk(el.id);
    case "beep":    return "beep";
    case "index":   return `index(${el.storeRef}, ${el.offset})`;
    case "outs":    return `outs(${el.storeRef})`;
    case "raw":     return el.text;
  }
}

function fmtStoreItem(item: StoreItem): string {
  switch (item.kind) {
    case "char":    return fmtCodepoint(item.value);
    case "vkey":    return `[${item.name}]`;
    case "deadkey": return fmtDk(item.id);
    case "any":     return "any";
    case "raw":     return item.text;
  }
}

// ---------------------------------------------------------------------------
// Rule emitter
// ---------------------------------------------------------------------------

function emitRule(rule: IRRule, groupUsingKeys: boolean): string {
  const ctx = rule.context.map(fmtContextElement).join(" ");
  const out = rule.output.map(fmtOutputElement).join(" ");

  // Group-transition rule (match/nomatch > use(group)) — the leading keyword
  // is structural; bare `> output` is an Invalid Token in kmcmplib.
  // rule.context is empty for these.
  //
  // For rules inside a `using keys` group (kmcmplib::ProcessKeyLineImpl,
  // fk->fUsingKeys = true), the syntax is `<lookahead> + <key> > <output>`;
  // emit prepends `+` so a vkey-only rule renders as `+ [K_A] > ...`. When
  // the context already contains a raw `+` token (parser captures the
  // structural `+` between pre-context and the matched key — e.g.
  // `platform('touch') any(word) any(final) + [K_SPACE]`), DO NOT prepend
  // another one; two `+`s in the same rule are an Invalid Token.
  //
  // For rules inside a NON-keys group (e.g. `group(deadkeys)` in
  // sil_cameroon_qwerty), the syntax is `<context> > <output>` with NO `+`.
  // Prepending `+` here trips ProcessKeyLineImpl's `+`-less branch and the
  // lexer rejects it. Hence the groupUsingKeys gate.
  let line: string;
  if (rule.matchKind !== undefined) {
    line = `${rule.matchKind} > ${out}`;
  } else if (ctx === "") {
    line = `> ${out}`;
  } else if (!groupUsingKeys) {
    line = `${ctx} > ${out}`;
  } else {
    const hasInlinePlus = rule.context.some(
      (el) => el.kind === "raw" && el.text.trim() === "+",
    );
    line = hasInlinePlus ? `${ctx} > ${out}` : `+ ${ctx} > ${out}`;
  }
  if (rule.trailingComment !== undefined) {
    line = `${line} c ${rule.trailingComment}`;
  }
  // Target-selector prefix (`$keyman:`, `$keymanweb:`, `$keymanonly:`) — the
  // source-line prefix that scopes a rule to a specific compile target. Must
  // come first on the line per kmcmplib::GetLinePrefixType.
  if (rule.targetSelector !== undefined) {
    line = `$${rule.targetSelector}: ${line}`;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Store emitter
// ---------------------------------------------------------------------------

/**
 * True when `ch` can sit inside a kmcmplib string literal without breaking it.
 *
 * Unsafe characters are emitted as standalone `U+XXXX` tokens instead — the
 * convention real `.kmn` sources use:
 *   - control / DEL (< U+0020, U+007F) — would terminate the lexer's line scan
 *   - combining marks (\p{M}) — would attach to surrounding chars in source
 *     view and round-trip through the parser as a different visible run
 *   - SMP codepoints (> U+FFFF) — fmtCodepoint handles these via single-quote
 *     literals individually; never bundle them into a charRun string
 *
 * The two quote characters (' and ") are NOT excluded here — delimiter
 * selection in flushBuf picks whichever the buffer doesn't contain.
 */
function isStringSafeChar(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x20 || cp === 0x7f) return false;
  if (cp > 0xffff) return false;
  if (/\p{M}/u.test(ch)) return false;
  return true;
}

/**
 * Collapse a run of consecutive char StoreItems into one or more quoted string
 * literals interleaved with U+XXXX tokens. Non-char items (vkey, deadkey, any,
 * raw) are emitted as bare tokens. This produces human-readable output for
 * stores like &NAME and &COPYRIGHT while preserving technical tokens in stores
 * like &CasedKeys, and correctly handles stores like &word that contain
 * literal apostrophes followed by combining marks (e.g. sil_cameroon_qwerty).
 *
 * Quote-selection strategy when flushing a string-safe buffer:
 *   - prefer single quotes
 *   - if the buffer contains ' but not ", use double quotes
 *   - if the buffer contains both, split on " and emit U+0022 between pieces
 */
function emitStoreItems(items: StoreItem[]): string {
  const parts: string[] = [];
  let buf = "";

  const flushBuf = (): void => {
    if (buf === "") return;
    const hasSingle = buf.includes("'");
    const hasDouble = buf.includes('"');
    if (!hasSingle) {
      parts.push(`'${buf}'`);
    } else if (!hasDouble) {
      parts.push(`"${buf}"`);
    } else {
      const pieces = buf.split('"');
      for (let i = 0; i < pieces.length; i++) {
        if (pieces[i] !== "") parts.push(`"${pieces[i]}"`);
        if (i < pieces.length - 1) parts.push("U+0022");
      }
    }
    buf = "";
  };

  for (const item of items) {
    if (item.kind === "char") {
      for (const ch of item.value) {
        if (isStringSafeChar(ch)) {
          buf += ch;
        } else {
          flushBuf();
          parts.push(fmtCodepoint(ch));
        }
      }
    } else {
      flushBuf();
      parts.push(fmtStoreItem(item));
    }
  }
  flushBuf();
  return parts.join(" ");
}

function emitStore(store: IRStore): string {
  const nameToken = store.isSystem ? `&${store.name}` : store.name;
  const items = emitStoreItems(store.items);
  const line = `store(${nameToken}) ${items}`;
  // Target-selector prefix — same convention as emitRule.
  return store.targetSelector !== undefined
    ? `$${store.targetSelector}: ${line}`
    : line;
}

// ---------------------------------------------------------------------------
// System store emission order
// ---------------------------------------------------------------------------

const SYSTEM_STORE_ORDER: readonly string[] = [
  "VERSION",
  "NAME",
  "TARGETS",
  "BITMAP",
  "VISUALKEYBOARD",
  "LAYOUTFILE",
  "COPYRIGHT",
  "KEYBOARDVERSION",
  "CasedKeys",
];

// ---------------------------------------------------------------------------
// Comment lookup helpers
// ---------------------------------------------------------------------------

function buildCommentMap(comments: IRComment[]): Map<string, IRComment[]> {
  const map = new Map<string, IRComment[]>();
  for (const c of comments) {
    if (c.anchorRef) {
      const key = c.anchorRef.nodeId;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
  }
  return map;
}

function pushLeadingComments(nodeId: string, commentMap: Map<string, IRComment[]>, lines: string[]): void {
  for (const c of (commentMap.get(nodeId) ?? []).filter(c => c.anchor === "leading")) {
    lines.push(c.text ? `c ${c.text}` : "c");
  }
}

// ---------------------------------------------------------------------------
// Main emit function
// ---------------------------------------------------------------------------

/**
 * Emit canonical .kmn text from a KeyboardIR.
 *
 * @param ir  The keyboard IR to serialize.
 * @returns   Canonical .kmn text with trailing newline.
 */
export function emit(ir: KeyboardIR): string {
  const lines: string[] = [];
  const commentMap = buildCommentMap(ir.comments);

  // Freestanding comments first (no anchorRef).
  for (const c of ir.comments) {
    if (c.anchor === "freestanding" && !c.anchorRef) {
      lines.push(c.text ? `c ${c.text}` : "c");
    }
  }

  // System stores in canonical order.
  const systemStores = ir.stores.filter(s => s.isSystem);
  const sysMap = new Map(systemStores.map(s => [s.name.toUpperCase(), s]));

  for (const name of SYSTEM_STORE_ORDER) {
    const store = sysMap.get(name);
    if (store) {
      pushLeadingComments(store.nodeId, commentMap, lines);
      lines.push(emitStore(store));
      sysMap.delete(name);
    }
  }
  // Remaining system stores not in the canonical list, alphabetical.
  const remainingSys = [...sysMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const store of remainingSys) {
    lines.push(emitStore(store));
  }

  // begin directive.
  const entryGroup = ir.groups.find(g => !g.readonly);
  const entryName = entryGroup?.name ?? "main";
  lines.push("");
  lines.push(`begin Unicode > use(${entryName})`);

  // Groups.
  for (const group of ir.groups) {
    lines.push("");
    const groupHeader = group.usingKeys
      ? `group(${group.name}) using keys`
      : `group(${group.name})`;
    lines.push(groupHeader);

    // User stores that belong to this group: heuristic — stores referenced in
    // this group's rules. Iterated in ir.stores declaration order to preserve
    // round-trip comment anchoring (I3).
    const referencedStoreNames = new Set<string>();
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind === "any" || el.kind === "notany" || el.kind === "index") {
          referencedStoreNames.add(el.storeRef);
        }
      }
      for (const el of rule.output) {
        if (el.kind === "index" || el.kind === "outs") {
          referencedStoreNames.add(el.storeRef);
        }
      }
    }
    for (const store of ir.stores) {
      if (!store.isSystem && referencedStoreNames.has(store.name)) {
        pushLeadingComments(store.nodeId, commentMap, lines);
        lines.push(emitStore(store));
      }
    }

    // Rules.
    for (const rule of group.rules) {
      pushLeadingComments(rule.nodeId, commentMap, lines);
      lines.push(emitRule(rule, group.usingKeys));
    }
  }

  // RawKmnFragments that are not anchored inside a group are emitted at the end.
  for (const frag of ir.raw) {
    lines.push("");
    lines.push(frag.sourceText);
  }

  lines.push(""); // trailing newline
  return lines.join("\n");
}
