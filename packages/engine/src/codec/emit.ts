/**
 * Canonical .kmn emitter: KeyboardIR -> string.
 *
 * Codepoint formatting: uppercase U+XXXX (e.g. U+00E0). This matches the
 * Keyman compiler's canonical form and is preferred by the spec. The choice
 * of uppercase over lowercase is intentional; callers that need lowercase
 * should post-process the output.
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
  IRGroup,
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

/** Format a single Unicode character as U+XXXX (uppercase 4-digit minimum). */
function fmtCodepoint(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  const hex = cp.toString(16).toUpperCase();
  const padded = hex.padStart(4, "0");
  return `U+${padded}`;
}

/** Format a string as a sequence of U+XXXX tokens. */
function fmtString(s: string): string {
  return [...s].map(fmtCodepoint).join(" ");
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

function emitRule(rule: IRRule): string {
  const ctx = rule.context.map(fmtContextElement).join(" ");
  const out = rule.output.map(fmtOutputElement).join(" ");

  // Emit bare `> output` when context is empty (match/nomatch style);
  // otherwise prefix with `+` (covers both vkey and non-vkey context rules).
  let line = ctx === "" ? `> ${out}` : `+ ${ctx} > ${out}`;
  if (rule.trailingComment !== undefined) {
    line = `${line} c ${rule.trailingComment}`;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Store emitter
// ---------------------------------------------------------------------------

/**
 * Collapse a run of consecutive char StoreItems into a single quoted string.
 * Non-char items (vkey, deadkey, any, raw) are emitted as bare tokens.
 * This produces human-readable output for stores like &NAME and &COPYRIGHT
 * while preserving technical tokens in stores like &CasedKeys.
 */
function emitStoreItems(items: StoreItem[]): string {
  const parts: string[] = [];
  let charRun = "";
  for (const item of items) {
    if (item.kind === "char") {
      charRun += item.value;
    } else {
      if (charRun !== "") {
        parts.push(`'${charRun}'`);
        charRun = "";
      }
      parts.push(fmtStoreItem(item));
    }
  }
  if (charRun !== "") {
    parts.push(`'${charRun}'`);
  }
  return parts.join(" ");
}

function emitStore(store: IRStore): string {
  const nameToken = store.isSystem ? `&${store.name}` : store.name;
  const items = emitStoreItems(store.items);
  return `store(${nameToken}) ${items}`;
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
  "CASEDKEYS",
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
      lines.push(emitRule(rule));
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
