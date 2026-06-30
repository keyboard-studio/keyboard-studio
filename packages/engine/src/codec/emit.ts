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
 *   3. Fragment-free path only: non-system user stores referenced by no typed
 *      rule in any group (orphan stores) emitted before `begin`, in ir.stores
 *      declaration order. Store declarations are global/position-independent so
 *      re-parsing produces the same IR regardless of their placement. (D9 faithful
 *      emit — lossless store round-trip.)
 *   4. begin Unicode > use(<entryGroup>).
 *   5. For each group:
 *        blank line
 *        group(<name>) [using keys]
 *        user stores attached to the group (heuristic: stores whose names
 *        appear in the group's rules)
 *        rules (or RawKmnFragment source text)
 *   6. Faithful path only: any unsourced user stores not yet emitted via the
 *      per-group pass are swept here as a catch-all, preserving the invariant
 *      that ALL user stores in the IR appear in the output. (D9)
 *   7. Trailing newline.
 *
 * Comments:
 *   - "leading" comments are emitted immediately before their anchorRef's line.
 *   - "trailing" comments appear after the rule they anchor.
 *     (IRRule.trailingComment is used directly for inline trailing comments.)
 *   - "freestanding" comments are emitted at the top, before stores.
 */

import type {
  KeyboardIR,
  IRGroup,
  IRStore,
  IRRule,
  IRComment,
  RawKmnFragment,
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
    case "useGroup": return `use(${el.groupName})`;
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
// Store-reference helpers (shared between fragment-free and faithful paths)
// ---------------------------------------------------------------------------

/**
 * Collect the names of every user store referenced by a set of typed rules.
 *
 * Shared across the fragment-free and faithful store-emission paths. Extracted
 * once to avoid duplicating the element-kind enumeration at each call site.
 */
function referencedStoreNamesIn(rules: IRRule[]): Set<string> {
  const names = new Set<string>();
  for (const rule of rules) {
    for (const el of rule.context)
      if (el.kind === "any" || el.kind === "notany" || el.kind === "index") names.add(el.storeRef);
    for (const el of rule.output)
      if (el.kind === "index" || el.kind === "outs") names.add(el.storeRef);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Position-faithful emit helpers (fragment-bearing keyboards only)
// ---------------------------------------------------------------------------

/**
 * A single emittable item in a group body, tagged with a source line so the
 * position-faithful path can interleave stores, rules, and fragments in their
 * original source order.
 */
type GroupBodyItem =
  | { kind: "store"; sourceLine: number; text: string; nodeId: string }
  | { kind: "rule";  sourceLine: number; text: string; nodeId: string }
  | { kind: "frag";  sourceLine: number; text: string };

/**
 * Attribute user stores to groups by source position.
 *
 * A store belongs to the group whose header `sourceLine` is the greatest one
 * <= the store's own `sourceLine`. Returns a Map from group nodeId to the
 * stores positionally within it. Stores that precede all group headers (or
 * lack a sourceLine) fall into the `""` bucket (first-group fallback).
 *
 * Each store is attributed to EXACTLY ONE group — no duplicates across groups.
 */
function attributeStoresToGroups(
  userStores: IRStore[],
  groups: IRGroup[],
): Map<string, IRStore[]> {
  // Build a sorted list of (sourceLine, nodeId) pairs for all groups that have
  // a sourceLine. Groups without sourceLine (scaffolded) are excluded from
  // positional attribution; stores without sourceLine fall through to the
  // name-reference fallback handled by the caller.
  const groupBoundaries = groups
    .filter(g => g.sourceLine !== undefined)
    .map(g => ({ line: g.sourceLine as number, nodeId: g.nodeId }))
    .sort((a, b) => a.line - b.line);

  const result = new Map<string, IRStore[]>();
  for (const g of groups) result.set(g.nodeId, []);
  result.set("", []); // pre-group / unknown bucket

  for (const store of userStores) {
    if (store.sourceLine === undefined) {
      // No position info — handled by caller's name-reference fallback.
      continue;
    }
    // Find the last group boundary whose line <= store.sourceLine.
    let ownerNodeId = ""; // default: pre-group bucket
    for (const boundary of groupBoundaries) {
      if (boundary.line <= store.sourceLine) {
        ownerNodeId = boundary.nodeId;
      } else {
        break;
      }
    }
    const bucket = result.get(ownerNodeId) ?? [];
    bucket.push(store);
    result.set(ownerNodeId, bucket);
  }
  return result;
}

/**
 * Token-bounded store-name search: true if `storeName` appears as a whole
 * identifier token in `text` (surrounded by non-identifier characters or
 * string boundaries). Avoids the false-positive where a store named "a" would
 * match inside "any(abc)".
 *
 * The compiled RegExp is cached in a module-level Map keyed by store name.
 * The regex depends only on the store name, so the cache is safe for the
 * lifetime of the module. On keyboards with many fragments (e.g. taigi_viet_telex
 * at ~948 fragments), this avoids O(stores x fragments) recompilations per group.
 */
const STORE_NAME_REGEXP_CACHE = new Map<string, RegExp>();
function storeNameInText(storeName: string, text: string): boolean {
  let re = STORE_NAME_REGEXP_CACHE.get(storeName);
  if (re === undefined) {
    const escaped = storeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`);
    STORE_NAME_REGEXP_CACHE.set(storeName, re);
  }
  return re.test(text);
}

/**
 * Emit a single group's body in position-faithful order (stores + rules +
 * group-owned fragments interleaved by sourceLine). Called only when
 * `ir.raw.length > 0`.
 *
 * Store attribution strategy: positional (store.sourceLine within group's line
 * span) for stores that carry sourceLine; token-bounded name-reference scan of
 * typed rules + fragment text as fallback for unsourced stores. Each user store
 * is emitted exactly once across all groups (dedup by nodeId via emittedStores).
 *
 * Unsourced stores whose only reference lives inside a fragment attributed to a
 * DIFFERENT group pass no per-group check here. The caller emits a catch-all
 * sweep after the group loop to ensure no unsourced store is dropped (D9).
 *
 * Items without sourceLine sort to the BACK (Number.MAX_SAFE_INTEGER fallback)
 * so unsourced synthesized nodes append after the original source-ordered content.
 */
function emitGroupBodyFaithful(
  group: IRGroup,
  groupFragments: RawKmnFragment[],
  positionalStores: IRStore[],      // stores positionally attributed to this group
  unsourcedStores: IRStore[],       // stores without sourceLine — use name-ref fallback
  emittedStores: Set<string>,       // dedup guard: nodeIds already emitted
  commentMap: Map<string, IRComment[]>,
  lines: string[],
): void {
  const items: GroupBodyItem[] = [];

  // Positionally-attributed stores for this group.
  for (const store of positionalStores) {
    if (emittedStores.has(store.nodeId)) continue;
    emittedStores.add(store.nodeId);
    items.push({
      kind: "store",
      sourceLine: store.sourceLine ?? Number.MAX_SAFE_INTEGER,
      text: emitStore(store),
      nodeId: store.nodeId,
    });
  }

  // Name-reference fallback for stores without sourceLine: include if referenced
  // by a typed rule OR found (token-bounded) in a group-owned fragment.
  const referencedNames = referencedStoreNamesIn(group.rules);
  for (const store of unsourcedStores) {
    if (emittedStores.has(store.nodeId)) continue;
    const nameRef = referencedNames.has(store.name) ||
      groupFragments.some(f => storeNameInText(store.name, f.sourceText));
    if (!nameRef) continue;
    emittedStores.add(store.nodeId);
    items.push({
      kind: "store",
      sourceLine: Number.MAX_SAFE_INTEGER,
      text: emitStore(store),
      nodeId: store.nodeId,
    });
  }

  // Typed rules.
  for (const rule of group.rules) {
    items.push({
      kind: "rule",
      sourceLine: rule.sourceLine ?? Number.MAX_SAFE_INTEGER,
      text: emitRule(rule, group.usingKeys),
      nodeId: rule.nodeId,
    });
  }

  // Group-owned fragments.
  for (const frag of groupFragments) {
    items.push({
      kind: "frag",
      sourceLine: frag.sourceLine ?? Number.MAX_SAFE_INTEGER,
      text: frag.sourceText,
    });
  }

  // Sort by sourceLine. Items lacking sourceLine (fallback MAX_SAFE_INTEGER)
  // sort to the back, appending after original source-ordered content.
  // Sort is stable in V8/Node >= 11, so equal-sourceLine items preserve
  // insertion order.
  items.sort((a, b) => a.sourceLine - b.sourceLine);

  for (const item of items) {
    if (item.kind === "store" || item.kind === "rule") {
      pushLeadingComments(item.nodeId, commentMap, lines);
    }
    lines.push(item.text);
  }
}

// ---------------------------------------------------------------------------
// Main emit function
// ---------------------------------------------------------------------------

/**
 * Emit canonical .kmn text from a KeyboardIR.
 *
 * When `ir.raw.length === 0` (all fragment-free keyboards, the common case),
 * system stores are emitted first, then any non-system user stores referenced by
 * no typed rule in any group (orphan stores) are emitted before `begin` so they
 * are not silently dropped. Store declarations are global/position-independent
 * in .kmn so re-parsing yields the same IR regardless of their placement. (D9)
 *
 * When `ir.raw.length > 0` (fragment-bearing keyboards), a position-faithful
 * emit path is used that interleaves stores, rules, and fragments in their
 * original source order within each group, and preserves ALL user stores
 * (not just those referenced by typed rules). Unsourced stores whose only
 * reference lives in a fragment attributed to a different group are caught by a
 * post-group sweep that emits any remaining unsourced stores not yet output. (D9)
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

  // Preserve non-system user stores referenced by no typed rule in any group
  // (orphan stores) — previously silently dropped on the fragment-free path.
  // Emitted before `begin` in ir.stores declaration order, matching real .kmn
  // source layout; store declarations are global/position-independent so this
  // re-parses identically. Preserve over warn — emit() has no diagnostic
  // channel and faithful emit (D9) requires lossless store round-trip.
  if (ir.raw.length === 0) {
    const allReferenced = new Set<string>();
    for (const g of ir.groups) {
      for (const n of referencedStoreNamesIn(g.rules)) allReferenced.add(n);
    }
    for (const store of ir.stores) {
      if (!store.isSystem && !allReferenced.has(store.name)) {
        pushLeadingComments(store.nodeId, commentMap, lines);
        lines.push(emitStore(store));
      }
    }
  }

  // When fragments are present, emit global (pre-begin) fragments before the
  // begin directive, in sourceLine order. These are fragments whose groupNodeId
  // is undefined (UNKNOWN_PRE_BEGIN and similar global-scope opaques).
  if (ir.raw.length > 0) {
    const globalFrags = ir.raw
      .filter(f => f.groupNodeId === undefined)
      .sort((a, b) => (a.sourceLine ?? 0) - (b.sourceLine ?? 0));
    for (const frag of globalFrags) {
      lines.push("");
      lines.push(frag.sourceText);
    }
  }

  // begin directive.
  const entryGroup = ir.groups.find(g => !g.readonly);
  const entryName = entryGroup?.name ?? "main";
  lines.push("");
  lines.push(`begin ${ir.header.encoding ?? "Unicode"} > use(${entryName})`);

  // Build the positional store attribution map once (reused per group).
  // Only constructed on the fragment-bearing path to avoid overhead on the
  // common fragment-free path.
  const userStores = ir.stores.filter(s => !s.isSystem);
  const storeAttribution = ir.raw.length > 0
    ? attributeStoresToGroups(userStores, ir.groups)
    : null;
  // Stores that landed in the pre-group bucket ("") have a sourceLine that
  // precedes ALL group headers (or all groups lack sourceLine). Assign them
  // to the first non-readonly group so they are not silently dropped.
  if (storeAttribution !== null) {
    const preGroupStores = storeAttribution.get("") ?? [];
    if (preGroupStores.length > 0) {
      const firstGroup = ir.groups.find(g => !g.readonly);
      if (firstGroup !== undefined) {
        const existing = storeAttribution.get(firstGroup.nodeId) ?? [];
        storeAttribution.set(firstGroup.nodeId, [...preGroupStores, ...existing]);
      }
    }
    storeAttribution.delete("");
  }
  const unsourcedStores = ir.raw.length > 0
    ? userStores.filter(s => s.sourceLine === undefined)
    : [];
  // Dedup guard: tracks user store nodeIds already emitted in the faithful path.
  const emittedStores = new Set<string>();

  // Groups.
  for (const group of ir.groups) {
    lines.push("");
    const groupHeader = group.usingKeys
      ? `group(${group.name}) using keys`
      : `group(${group.name})`;
    lines.push(groupHeader);

    if (ir.raw.length > 0) {
      // Position-faithful path: interleave ALL user stores + rules + group-owned
      // fragments in their original source order.
      const groupFragments = ir.raw.filter(f => f.groupNodeId === group.nodeId);
      const positionalStores = storeAttribution?.get(group.nodeId) ?? [];
      emitGroupBodyFaithful(
        group, groupFragments, positionalStores, unsourcedStores,
        emittedStores, commentMap, lines,
      );
    } else {
      // Standard path (fragment-free, byte-identical to pre-fix): heuristic
      // store attribution + rules in IR order.

      // User stores that belong to this group: heuristic — stores referenced in
      // this group's rules. Iterated in ir.stores declaration order to preserve
      // round-trip comment anchoring (I3).
      const referencedStoreNames = referencedStoreNamesIn(group.rules);
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
  }

  // When fragments are absent, there are none to emit. When they are present,
  // group-owned fragments were already emitted inside each group block above.
  // Global fragments were emitted before the begin directive. Nothing remains.

  // Catch-all backstop: emit any non-system user store not yet output by the
  // positional or per-group passes. This covers two cases:
  //   (a) unsourced stores whose only reference lives in a fragment attributed
  //       to a different group (pass no per-group name-ref check above); and
  //   (b) sourced stores that precede ALL group headers in a degenerate keyboard
  //       with no non-readonly group — the pre-group bucket reassignment has
  //       nowhere to attach them, so the positional pass never emits them.
  // Using userStores (all non-system stores) rather than unsourcedStores alone
  // closes this gap with no effect on correct keyboards — every normally-emitted
  // store is already in emittedStores and is therefore skipped.
  // (D9 faithful emit — preserve ALL user stores.)
  if (ir.raw.length > 0) {
    for (const store of userStores) {
      if (emittedStores.has(store.nodeId)) continue;
      emittedStores.add(store.nodeId);
      pushLeadingComments(store.nodeId, commentMap, lines);
      lines.push(emitStore(store));
    }
  }

  lines.push(""); // trailing newline
  return lines.join("\n");
}
