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
 *   7. Store-declaration dependency order (both paths, #2404): user store
 *      declarations — typed stores and opaque `store(...)` fragments — are
 *      reordered by a stable topological sort over `outs(X)` references, so a
 *      store that expands `outs(X)` is always emitted after X's declaration
 *      (kmcmplib resolves outs() at declaration time; KMCMP 5251101
 *      otherwise). Where there is no dependency the existing order is kept,
 *      and a declaration only ever moves later, never earlier.
 *   8. Trailing newline.
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
import { isPlusSeparator } from "../shared/rule-shape.js";

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

/** A quoted KMN literal for a layer / platform argument: single quotes unless the text holds one. */
function fmtQuotedArg(what: string, value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  throw new Error(`${what} value must not contain both quote characters: ${value}`);
}

/** The value of a `set(store = value)`: a text run of chars, deadkeys and outs, with no range collapse. */
function fmtSetValue(value: OutputElement[]): string {
  const items: StoreItem[] = [];
  for (const v of value) {
    if (v.kind === "char" || v.kind === "deadkey" || v.kind === "namedDeadkey" || v.kind === "outs") items.push(v);
    else throw new Error(`set() value cannot hold a ${v.kind} element`);
  }
  // An empty value is the empty string literal; `set(opt = )` is not valid KMN.
  return items.length === 0 ? "''" : emitStoreItems(items, true);
}

export function fmtContextElement(el: ContextElement): string {
  switch (el.kind) {
    case "char":    return fmtCodepoint(el.value);
    case "vkey":    return el.modifiers.length > 0
                      ? `[${el.modifiers.join(" ")} ${el.name}]`
                      : `[${el.name}]`;
    case "deadkey": return fmtDk(el.id);
    case "namedDeadkey": return `dk(${el.name})`;
    case "any":     return `any(${el.storeRef})`;
    case "notany":  return `notany(${el.storeRef})`;
    case "context": return `context(${el.offset})`;
    case "index":   return `index(${el.storeRef}, ${el.offset})`;
    case "baselayout": { if (el.value.includes("'")) throw new Error(`baselayout value must not contain single-quote: ${el.value}`); return el.value ? `baselayout('${el.value}')` : "baselayout"; }
    case "if":      { if (el.value.includes("'")) throw new Error(`if() guard value must not contain single-quote: ${el.value}`); return `if(${el.store} = '${el.value}')`; }
    case "platform": return `platform(${fmtQuotedArg("platform()", el.value)})`;
    case "raw":     return el.text;
  }
}

export function fmtOutputElement(el: OutputElement): string {
  switch (el.kind) {
    case "char":    return fmtCodepoint(el.value);
    case "deadkey": return fmtDk(el.id);
    case "namedDeadkey": return `dk(${el.name})`;
    case "beep":    return "beep";
    case "nul":     return "nul";
    case "context": return el.offset === 0 ? "context" : `context(${el.offset})`;
    case "index":   return `index(${el.storeRef}, ${el.offset})`;
    case "outs":    return `outs(${el.storeRef})`;
    case "useGroup": return `use(${el.groupName})`;
    case "layer":   return `layer(${fmtQuotedArg("layer()", el.value)})`;
    case "set":     return `set(${el.storeRef} = ${fmtSetValue(el.value)})`;
    case "save":    return `save(${el.storeRef})`;
    case "reset":   return `reset(${el.storeRef})`;
    case "call":    return `call(${el.storeRef})`;
    case "return":  return "return";
    case "raw":     return el.text;
  }
}

function fmtStoreItem(item: StoreItem): string {
  switch (item.kind) {
    case "char":    return fmtCodepoint(item.value);
    case "vkey":    return `[${item.name}]`;
    case "deadkey": return fmtDk(item.id);
    case "namedDeadkey": return `dk(${item.name})`;
    case "any":     return "any";
    case "outs":    return `outs(${item.storeRef})`;
    case "raw":     return item.text;
  }
}

// ---------------------------------------------------------------------------
// Rule emitter
// ---------------------------------------------------------------------------

export function emitRule(rule: IRRule, groupUsingKeys: boolean): string {
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
    const hasInlinePlus = rule.context.some(isPlusSeparator);
    line = hasInlinePlus ? `${ctx} > ${out}` : `+ ${ctx} > ${out}`;
  }
  if (rule.trailingComment !== undefined) {
    line = `${line} c ${rule.trailingComment}`;
  }
  // Target-selector prefixes (`$keyman:`, `$keymanweb:`, `$keymanonly:`)
  // are Keyman 19-deprecated and removed in Keyman 20 — emit NEVER writes
  // them, even for a stale or hand-built IR that still carries a
  // `targetSelector` (#2633 backstop: parse rewrites prefixed lines into
  // platform() guards / merged stores, so a well-formed IR has no
  // targetSelector left; this drop is the last line of defence).
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
 *   - SMP codepoints (> U+FFFF) in processing stores — fmtCodepoint handles
 *     these via single-quote literals individually; never bundle them into a
 *     charRun string. System stores are exempt (see the metadata branch).
 *
 * The two quote characters (' and ") are NOT excluded here — delimiter
 * selection in flushBuf picks whichever the buffer doesn't contain.
 */
function isStringSafeChar(ch: string, metadata = false): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x20 || cp === 0x7f) return false;
  // System stores (&NAME, &COPYRIGHT, ...) are human-facing metadata that rules
  // never match against: combining marks and format characters stay inside the
  // string so the value reads naturally. SMP codepoints (> U+FFFF) may join
  // the string too — VERIFIED against kmcmplib (issue #1811 residual AC):
  // @keymanapp/kmc-kmn 19.0.240-alpha compiles `store(&NAME) '𑜠𑜡x'`, a lone
  // SMP string `'𑜠'`, and a mixed BMP+SMP+combining string with zero
  // diagnostics and a valid .kmx. The check is pinned by the oracle tests in
  // packages/engine/src/compiler/compile.test.ts ("SMP in system store
  // (#1811)"), which fail if a future kmcmplib stops accepting this form.
  if (metadata) return true;
  // Processing stores: SMP codepoints stay per-character quoted literals.
  if (cp > 0xffff) return false;
  // Processing stores: spell out everything invisible or attaching — combining
  // marks, format characters (ZWJ, ZWNJ, LRM, soft hyphen, ...) and unusual
  // spaces (NBSP, narrow NBSP, ...) — so the author can see what is stored.
  if (/\p{M}|\p{Cf}/u.test(ch)) return false;
  if (cp !== 0x20 && /\p{Zs}/u.test(ch)) return false;
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
/**
 * Length of the maximal run of single-codepoint `char` items starting at index
 * `i` whose codepoints ascend by exactly +1. Used by emitStoreItems to
 * re-collapse an expanded range (spec 042, FR-008) back to `X .. Y` notation so
 * authored `.kmn` stays compact — the inverse of parseStoreItems' expansion.
 */
function ascendingRunLength(items: StoreItem[], i: number): number {
  let n = 0;
  let prev: number | null = null;
  while (i + n < items.length) {
    const it = items[i + n];
    if (it === undefined || it.kind !== "char") break;
    const cps = [...it.value];
    if (cps.length !== 1) break;
    const cp = cps[0]?.codePointAt(0);
    if (cp === undefined) break;
    if (prev !== null && cp !== prev + 1) break;
    prev = cp;
    n++;
  }
  return n;
}

/**
 * True when every codepoint in an ascending run [i, i+len) is printable ASCII
 * (U+0020–U+007E). Such a run is left for the existing string-collapse path: a
 * quoted word like 'abc' is more human-legible than `U+0061 .. U+0063`, and
 * this preserves dictionary/&word stores (spec 042 FR-008 "human-legible").
 * Range re-collapse targets the non-ASCII script ranges that motivate the
 * feature (Devanagari, historic SMP scripts, Hebrew accents), all of which
 * fall outside this window.
 */
function isAllPrintableAscii(items: StoreItem[], i: number, len: number): boolean {
  for (let k = i; k < i + len; k++) {
    const it = items[k];
    if (it === undefined || it.kind !== "char") return false;
    const cp = it.value.codePointAt(0) ?? 0;
    if (cp < 0x20 || cp > 0x7e) return false;
  }
  return true;
}

/**
 * How many `X .. Y` range tokens re-collapse WOULD produce for this store —
 * the same maximal-ascending-run walk emitStoreItems performs, counted ahead
 * of time so the whole store can opt out (see KMCMPLIB_STORE_RANGE_BUDGET).
 */
function countProspectiveRanges(items: StoreItem[]): number {
  let count = 0;
  for (let i = 0; i < items.length; ) {
    const runLen = ascendingRunLength(items, i);
    if (runLen >= 3 && !isAllPrintableAscii(items, i, runLen)) {
      count++;
      i += runLen;
    } else {
      i++;
    }
  }
  return count;
}

/**
 * kmcmplib (19.0.240-alpha) crashes with a wasm memory-access-out-of-bounds
 * (in `u16icmp` under `GetXStringImpl`) compiling a keyboard whose store
 * declaration carries 8 or more `X .. Y` ranges on one line, when the file
 * also uses option-store statements (`reset(...)`) — empirically bisected
 * against bj_cree_woods, whose Eastern-Finals store re-collapses to 12
 * ranges: 7 ranges compile, 8 crash, per-store not per-file. The crash
 * poisons the cached wasm instance, so every later compile in the session
 * fails too. Until the upstream fix lands, cap re-collapse at 7 ranges per
 * store: a store that would exceed the budget is emitted fully explicit
 * (codepoints/strings always compile). Same trade as the dk() suppression
 * below — FR-008's compaction is a legibility nicety, never worth an
 * uncompilable artifact.
 */
const KMCMPLIB_STORE_RANGE_BUDGET = 7;

function emitStoreItems(items: StoreItem[], metadata = false): string {
  const parts: string[] = [];
  let buf = "";

  // Range re-collapse (spec 042, FR-008) is suppressed for any store that also
  // contains a `dk()` deadkey item. kmcmplib cannot parse a store that holds
  // both a `X .. Y` range AND a `dk()` item in the same declaration — it emits
  // KM_ERROR_KMCMP_5251093 "Invalid 'deadkey' or 'dk' statement" and produces
  // no .kmx. This bites the deadkey lookup stores that pair a run of consecutive
  // combining marks with a trailing deadkey (e.g. `store(dkf0021)` in
  // sil_cameroon_azerty: `U+0300 U+0301 U+0302 U+0303 ... dk(003d)`), so a Track-1
  // copy of that keyboard failed to compile. Range re-collapse is a pure
  // legibility nicety, so dropping it for these stores costs nothing semantically.
  //
  // It is also suppressed when it would produce more than
  // KMCMPLIB_STORE_RANGE_BUDGET ranges in this one store — see that constant's
  // comment for the compiler crash this avoids.
  // Any dk() token suppresses re-collapse — numeric or named (#2238): the
  // kmcmplib restriction is on the dk() statement form, not the id shape.
  const hasDeadkey = items.some((it) => it.kind === "deadkey" || it.kind === "namedDeadkey");
  const suppressRanges =
    metadata || hasDeadkey || countProspectiveRanges(items) > KMCMPLIB_STORE_RANGE_BUDGET;

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

  for (let i = 0; i < items.length; ) {
    // Range re-collapse: a maximal ascending +1 run of >= 3 char items becomes
    // `first .. last` (spec 042, FR-008). All-printable-ASCII runs are left for
    // the string path (a quoted word reads better than a codepoint range).
    const runLen = ascendingRunLength(items, i);
    if (runLen >= 3 && !isAllPrintableAscii(items, i, runLen) && !suppressRanges) {
      flushBuf();
      const first = items[i];
      const last = items[i + runLen - 1];
      if (first !== undefined && last !== undefined && first.kind === "char" && last.kind === "char") {
        parts.push(`${fmtCodepoint(first.value)} .. ${fmtCodepoint(last.value)}`);
        i += runLen;
        continue;
      }
    }
    const item = items[i];
    if (item === undefined) { i++; continue; }
    if (item.kind === "char") {
      for (const ch of item.value) {
        if (isStringSafeChar(ch, metadata)) {
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
    i++;
  }
  flushBuf();
  return parts.join(" ");
}

export function emitStore(store: IRStore): string {
  const nameToken = store.isSystem ? `&${store.name}` : store.name;
  // &CasedKeys holds virtual keys, not a string — it keeps the token form.
  const metadata = store.isSystem && store.name.toUpperCase() !== "CASEDKEYS";
  let items = emitStoreItems(store.items, metadata);
  // An empty body with a trailing comment would re-parse as content: the
  // bare `store(x)  c foo` line has no value token for stripTrailingComment
  // to anchor on (the `c` sits at the start of the value, where the
  // left-whitespace test fails), so `c foo` is misread as store items —
  // and, since #2633 decodes bare numbers as octal, a numeric comment word
  // becomes a bogus codepoint (eo_plus `store(S1) '' c 1` re-parsed `1` as
  // U+0001). Spell the empty body as `''` — the source spelling — so the
  // comment stays a comment. A comment-less empty store keeps the pinned
  // bare `store(x) ` form (see emit.test.ts "emptied store").
  if (items === "" && store.trailingComment !== undefined) items = "''";
  let line = `store(${nameToken}) ${items}`;
  // Trailing `c <comment>` — same convention as emitRule.
  if (store.trailingComment !== undefined) {
    line = `${line} c ${store.trailingComment}`;
  }
  // Target-selector prefixes are never emitted (#2633 backstop — see
  // emitRule): a stale IR carrying one has it dropped silently.
  return line;
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
// Store-declaration dependency ordering (#2404)
// ---------------------------------------------------------------------------

/**
 * kmcmplib resolves `outs(X)` at *declaration* time: a store whose body
 * expands `outs(X)` must be declared AFTER X, or compilation fails with
 * KMCMP 5251101 "Store referenced does not exist".
 *
 * The per-path placement above can invert that order. On eo_plus the opaque
 * `store(letters) outs(letters_lower) outs(letters_upper)` fragment is a
 * global pre-`begin` fragment (it precedes every group header in the source)
 * while the typed stores it expands are attributed into the first group's
 * body — so the emitter writes the `outs()` store before its targets.
 *
 * `orderStoreDeclarations` repairs this with a dependency-ordered topological
 * sort over every user store declaration about to be emitted (typed stores
 * and opaque `store(...)` fragments alike), keeping the existing order
 * wherever there is no dependency: declarations are visited in stable
 * topological order and each one moves — never earlier, only later — to just
 * after the latest-placed declaration its `outs()` references resolve to.
 * Declarations with no `outs()` dependencies never move, so output is
 * byte-identical when the feature is absent.
 */

/** Declared store name from a `store(name) ...` declaration line, or null. */
function parseStoreDeclName(text: string): string | null {
  const m = /^\s*(?:\$[^:]+:\s*)?store\s*\(\s*(&?[^\s(),]+)\s*\)/i.exec(text);
  return m?.[1] ?? null;
}

/**
 * `outs(name)` references in a store declaration's text. Mirrors the
 * parse-side token classification (parse.ts `parseOuts` over whitespace-
 * delimited tokens): the scan is quote-, bracket- and trailing-comment-aware,
 * so a literal `'outs(x)'` string, a `[K_...]` key name, or a `c` comment
 * mentioning outs() is never mistaken for a store reference.
 */
function outsRefsInDecl(text: string): string[] {
  const refs: string[] = [];
  let token = "";
  let inS = false;
  let inD = false;
  let depth = 0;
  const flush = (): void => {
    const m = /^outs\s*\(\s*([^\s(),]+)\s*\)$/i.exec(token);
    if (m?.[1] !== undefined) refs.push(m[1]);
    token = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (ch === "'" && !inD) { inS = !inS; continue; }
    if (ch === '"' && !inS) { inD = !inD; continue; }
    if (inS || inD) continue;
    if (ch === "[") { depth++; continue; }
    if (ch === "]") { depth--; continue; }
    // A whitespace-delimited `c` at depth 0 outside quotes starts a trailing
    // comment running to end of line (parse.ts stripTrailingComment) — nothing
    // after it can be a store reference.
    if (
      depth === 0 && ch === "c" &&
      /\s/.test(text[i - 1] ?? "") &&
      (i === text.length - 1 || /\s/.test(text[i + 1] ?? ""))
    ) break;
    if (/\s/.test(ch)) { flush(); continue; }
    token += ch;
  }
  flush();
  return refs;
}

interface StoreDecl {
  item: GroupBodyItem;
  nameKey: string;
  targets: StoreDecl[];
}

/**
 * Reorder user store declarations across the given emission sites (visited in
 * site order) so every `outs(X)` use follows X's declaration. Mutates the
 * site arrays in place; rules and non-store fragments keep their exact
 * positions.
 */
function orderStoreDeclarations(sites: GroupBodyItem[][]): void {
  // Collect declarations in existing global emission order.
  const decls: StoreDecl[] = [];
  const byName = new Map<string, StoreDecl>();
  for (const site of sites) {
    for (const item of site) {
      if (item.kind !== "store" && item.kind !== "frag") continue;
      const name = item.kind === "store" ? item.name : parseStoreDeclName(item.text);
      if (name === null || name.startsWith("&")) continue; // not a user store declaration
      const nameKey = name.toLowerCase();
      // A duplicate declaration is a kmcmplib error regardless of order;
      // first wins for dependency resolution.
      if (!byName.has(nameKey)) {
        const decl: StoreDecl = { item, nameKey, targets: [] };
        byName.set(nameKey, decl);
        decls.push(decl);
      }
    }
  }
  // Resolve outs() references to declared stores.
  for (const decl of decls) {
    const seen = new Set<string>();
    for (const ref of outsRefsInDecl(decl.item.text)) {
      const key = ref.toLowerCase();
      if (key === decl.nameKey || seen.has(key)) continue;
      seen.add(key);
      const target = byName.get(key);
      if (target !== undefined) decl.targets.push(target);
    }
  }
  // Stable topological order: Kahn's algorithm, each round picking the first
  // ready declaration in existing order.
  const topo: StoreDecl[] = [];
  const indegree = new Map<StoreDecl, number>();
  const dependents = new Map<StoreDecl, StoreDecl[]>();
  for (const d of decls) { indegree.set(d, d.targets.length); dependents.set(d, []); }
  for (const d of decls) for (const t of d.targets) dependents.get(t)?.push(d);
  const remaining = new Set(decls);
  for (;;) {
    let pick: StoreDecl | undefined;
    for (const d of decls) {
      if (remaining.has(d) && indegree.get(d) === 0) { pick = d; break; }
    }
    if (pick === undefined) break;
    remaining.delete(pick);
    topo.push(pick);
    for (const dep of dependents.get(pick) ?? []) indegree.set(dep, (indegree.get(dep) ?? 1) - 1);
  }
  // Cyclic leftovers are uncompilable in any order; keep existing order and
  // never relocate them.
  for (const d of decls) {
    if (remaining.has(d)) { d.targets = []; topo.push(d); }
  }
  // Topological order identical to existing order means every dependency is
  // already satisfied — nothing to relocate.
  if (topo.every((d, i) => decls[i] === d)) return;

  // Place each declaration no earlier than its existing slot and no earlier
  // than its targets' final slots. Topological order guarantees every target
  // is already final when its dependents are placed.
  const siteRank = new Map<GroupBodyItem[], number>(sites.map((s, i) => [s, i]));
  const pos = new Map<GroupBodyItem, { site: GroupBodyItem[]; idx: number }>();
  const rebuildPos = (): void => {
    pos.clear();
    for (const site of sites) site.forEach((item, idx) => pos.set(item, { site, idx }));
  };
  rebuildPos();
  const isLater = (
    a: { site: GroupBodyItem[]; idx: number },
    b: { site: GroupBodyItem[]; idx: number },
  ): boolean =>
    siteRank.get(a.site)! > siteRank.get(b.site)! ||
    (a.site === b.site && a.idx > b.idx);
  // Chain tail per anchor: a dependent is inserted immediately after the tail,
  // preserving existing relative order among dependents of the same target.
  const lastPlaced = new Map<StoreDecl, StoreDecl>(topo.map(d => [d, d]));
  for (const d of topo) {
    let anchor = d;
    let anchorPos = pos.get(d.item);
    if (anchorPos === undefined) continue; // unreachable; defensive
    for (const t of d.targets) {
      const p = pos.get(t.item);
      if (p !== undefined && isLater(p, anchorPos)) { anchor = t; anchorPos = p; }
    }
    if (anchor === d) continue;
    const from = pos.get(d.item);
    if (from === undefined) continue; // unreachable; defensive
    from.site.splice(from.idx, 1);
    rebuildPos();
    const tail = lastPlaced.get(anchor);
    const at = tail === undefined ? undefined : pos.get(tail.item);
    if (at === undefined) continue; // unreachable; defensive
    at.site.splice(at.idx + 1, 0, d.item);
    lastPlaced.set(anchor, d);
    rebuildPos();
  }
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
  | { kind: "store"; sourceLine: number; text: string; nodeId: string; name: string }
  | { kind: "rule";  sourceLine: number; text: string; nodeId: string }
  | { kind: "frag";  sourceLine: number; text: string; nodeId: string };

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
 *
 * Returns the ordered items; the caller emits them (and their leading
 * comments) after the store-declaration dependency pass (#2404) has run.
 */
function emitGroupBodyFaithful(
  group: IRGroup,
  groupFragments: RawKmnFragment[],
  positionalStores: IRStore[],      // stores positionally attributed to this group
  unsourcedStores: IRStore[],       // stores without sourceLine — use name-ref fallback
  emittedStores: Set<string>,       // dedup guard: nodeIds already emitted
): GroupBodyItem[] {
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
      name: store.name,
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
      name: store.name,
    });
  }

  // Typed rules. A rule without a sourceLine (synthesized: carve guards, rule
  // additions) takes the position of the NEXT sourced rule in group.rules, so it
  // stays immediately ahead of it (first-match semantics); the stable sort keeps
  // consecutive unsourced rules in group order. Trailing unsourced rules have no
  // following sourced rule and stay at the back.
  const ruleLines: number[] = new Array<number>(group.rules.length);
  let nextLine = Number.MAX_SAFE_INTEGER;
  for (let i = group.rules.length - 1; i >= 0; i--) {
    const own = group.rules[i]!.sourceLine;
    if (own !== undefined) nextLine = own;
    ruleLines[i] = nextLine;
  }
  for (const [i, rule] of group.rules.entries()) {
    items.push({
      kind: "rule",
      sourceLine: ruleLines[i]!,
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
      nodeId: frag.nodeId,
    });
  }

  // Sort by sourceLine. Items lacking sourceLine (fallback MAX_SAFE_INTEGER)
  // sort to the back, appending after original source-ordered content.
  // Sort is stable in V8/Node >= 11, so equal-sourceLine items preserve
  // insertion order.
  items.sort((a, b) => a.sourceLine - b.sourceLine);

  return items;
}

// ---------------------------------------------------------------------------
// Main emit function
// ---------------------------------------------------------------------------

/** Result of {@link emit} with `{ lineMap: true }`. */
export interface EmitWithLineMap {
  readonly text: string;
  /** 1-based line of `text` that emits each store, rule, group header, and raw fragment, by node id. */
  readonly lineByNodeId: ReadonlyMap<string, number>;
}

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
 * With `{ lineMap: true }` the result also carries `lineByNodeId`: the 1-based
 * line of the emitted text that holds each store, rule, group header, and raw
 * fragment (a multi-line fragment maps to its first line). The text is the same
 * as the plain call's.
 *
 * @param ir  The keyboard IR to serialize.
 * @returns   Canonical .kmn text with trailing newline.
 */
export function emit(ir: KeyboardIR): string;
export function emit(ir: KeyboardIR, options: { lineMap: true }): EmitWithLineMap;
export function emit(ir: KeyboardIR, options?: { lineMap?: boolean }): string | EmitWithLineMap {
  const entryIndexByNodeId = new Map<string, number>();
  const lines = emitLines(ir, entryIndexByNodeId);
  const text = lines.join("\n");
  if (options?.lineMap !== true) return text;

  // An entry of `lines` may itself span several physical lines (opaque
  // fragments), so turn entry indexes into line numbers by prefix sum.
  const startLine: number[] = [];
  let line = 1;
  for (const entry of lines) {
    startLine.push(line);
    line += entry.split("\n").length;
  }
  const lineByNodeId = new Map<string, number>();
  for (const [nodeId, index] of entryIndexByNodeId) {
    lineByNodeId.set(nodeId, startLine[index]!);
  }
  return { text, lineByNodeId };
}

function emitLines(ir: KeyboardIR, entryIndexByNodeId: Map<string, number>): string[] {
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

  // Look up by upper-cased key so mixed-case canonical names (e.g. "CasedKeys")
  // match the upper-cased map keys and are emitted in their canonical slot.
  for (const name of SYSTEM_STORE_ORDER) {
    const key = name.toUpperCase();
    const store = sysMap.get(key);
    if (store) {
      pushLeadingComments(store.nodeId, commentMap, lines);
      entryIndexByNodeId.set(store.nodeId, lines.length);
      lines.push(emitStore(store));
      sysMap.delete(key);
    }
  }
  // Remaining system stores not in the canonical list, alphabetical.
  const remainingSys = [...sysMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const store of remainingSys) {
    entryIndexByNodeId.set(store.nodeId, lines.length);
    lines.push(emitStore(store));
  }

  // Preserve non-system user stores referenced by no typed rule in any group
  // (orphan stores) — previously silently dropped on the fragment-free path.
  // Emitted before `begin` in ir.stores declaration order, matching real .kmn
  // source layout; store declarations are global/position-independent so this
  // re-parses identically. Preserve over warn — emit() has no diagnostic
  // channel and faithful emit (D9) requires lossless store round-trip.
  // Collected as an item site first: the #2404 dependency pass may relocate
  // an outs()-dependent store later.
  const orphanSite: GroupBodyItem[] = [];
  if (ir.raw.length === 0) {
    const allReferenced = new Set<string>();
    for (const g of ir.groups) {
      for (const n of referencedStoreNamesIn(g.rules)) allReferenced.add(n);
    }
    for (const store of ir.stores) {
      if (!store.isSystem && !allReferenced.has(store.name)) {
        orphanSite.push({
          kind: "store",
          sourceLine: Number.MAX_SAFE_INTEGER,
          text: emitStore(store),
          nodeId: store.nodeId,
          name: store.name,
        });
      }
    }
  }

  // When fragments are present, emit global (pre-begin) fragments before the
  // begin directive, in sourceLine order. These are fragments whose groupNodeId
  // is undefined (UNKNOWN_PRE_BEGIN and similar global-scope opaques).
  // Collected as an item site first: the #2404 dependency pass may relocate
  // an outs()-dependent store fragment later.
  const preBeginSite: GroupBodyItem[] = [];
  if (ir.raw.length > 0) {
    const globalFrags = ir.raw
      .filter(f => f.groupNodeId === undefined)
      .sort((a, b) => (a.sourceLine ?? 0) - (b.sourceLine ?? 0));
    for (const frag of globalFrags) {
      preBeginSite.push({
        kind: "frag",
        sourceLine: frag.sourceLine ?? 0,
        text: frag.sourceText,
        nodeId: frag.nodeId,
      });
    }
  }

  // begin directive — FR-004: reuse the modelled entry group so a keyboard
  // with more than one entry group round-trips without the emitter
  // rebuilding a single entry from the first non-readonly group.
  // (Emitted below, after the orphan / pre-begin sites.)
  const entryName = ir.header.entryPoints?.main
    ?? ir.groups.find(g => !g.readonly)?.name
    ?? "main";
  const beginLine = `begin ${ir.header.encoding ?? "Unicode"} > use(${entryName})`;

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

  // Groups: build one item site per group (the #2404 dependency pass reorders
  // store declarations across sites before anything is written to lines).
  const groupHeaders: string[] = [];
  const groupSites: GroupBodyItem[][] = [];       // faithful path: stores+rules+frags
  const groupStoreSites: GroupBodyItem[][] = [];  // fragment-free path: stores only
  for (const group of ir.groups) {
    groupHeaders.push(group.usingKeys
      ? `group(${group.name}) using keys`
      : `group(${group.name})`);

    if (ir.raw.length > 0) {
      // Position-faithful path: interleave ALL user stores + rules + group-owned
      // fragments in their original source order.
      const groupFragments = ir.raw.filter(f => f.groupNodeId === group.nodeId);
      const positionalStores = storeAttribution?.get(group.nodeId) ?? [];
      groupSites.push(emitGroupBodyFaithful(
        group, groupFragments, positionalStores, unsourcedStores,
        emittedStores,
      ));
    } else {
      // Standard path (fragment-free, byte-identical to pre-fix): heuristic
      // store attribution + rules in IR order.

      // User stores that belong to this group: heuristic — stores referenced in
      // this group's rules. Iterated in ir.stores declaration order to preserve
      // round-trip comment anchoring (I3).
      const site: GroupBodyItem[] = [];
      const referencedStoreNames = referencedStoreNamesIn(group.rules);
      for (const store of ir.stores) {
        if (!store.isSystem && referencedStoreNames.has(store.name)) {
          // Dedup across groups: a store referenced by rules in more than one
          // group must be emitted only once (KMN store declarations are global;
          // a duplicate `store(...)` is a kmcmplib error and breaks round-trip).
          if (emittedStores.has(store.nodeId)) continue;
          emittedStores.add(store.nodeId);
          site.push({
            kind: "store",
            sourceLine: Number.MAX_SAFE_INTEGER,
            text: emitStore(store),
            nodeId: store.nodeId,
            name: store.name,
          });
        }
      }
      groupStoreSites.push(site);
    }
  }

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
  // Collected as an item site first: the #2404 dependency pass may relocate
  // an outs()-dependent store later.
  const catchAllSite: GroupBodyItem[] = [];
  if (ir.raw.length > 0) {
    for (const store of userStores) {
      if (emittedStores.has(store.nodeId)) continue;
      emittedStores.add(store.nodeId);
      catchAllSite.push({
        kind: "store",
        sourceLine: Number.MAX_SAFE_INTEGER,
        text: emitStore(store),
        nodeId: store.nodeId,
        name: store.name,
      });
    }
  }

  // Store-declaration dependency order (#2404): reorder user store
  // declarations across emission sites so every `outs(X)` use follows X's
  // declaration. Stable — sites are byte-identical when no dependency exists.
  if (ir.raw.length === 0) {
    orderStoreDeclarations([orphanSite, ...groupStoreSites]);
  } else {
    orderStoreDeclarations([preBeginSite, ...groupSites, catchAllSite]);
  }

  // Emit. Fragment-free: orphan stores, begin, per-group stores then rules.
  // Faithful: global fragments, begin, per-group interleaved bodies, catch-all.
  const pushStoreSite = (site: GroupBodyItem[]): void => {
    for (const item of site) {
      if (item.kind !== "store") continue; // unreachable; these sites hold stores only
      pushLeadingComments(item.nodeId, commentMap, lines);
      entryIndexByNodeId.set(item.nodeId, lines.length);
      lines.push(item.text);
    }
  };
  pushStoreSite(orphanSite);
  for (const item of preBeginSite) {
    lines.push("");
    entryIndexByNodeId.set(item.nodeId, lines.length);
    lines.push(item.text);
  }
  lines.push("");
  lines.push(beginLine);
  ir.groups.forEach((group, gi) => {
    lines.push("");
    entryIndexByNodeId.set(group.nodeId, lines.length);
    lines.push(groupHeaders[gi] ?? "");
    if (ir.raw.length > 0) {
      for (const item of groupSites[gi] ?? []) {
        if (item.kind === "store" || item.kind === "rule") {
          pushLeadingComments(item.nodeId, commentMap, lines);
        }
        entryIndexByNodeId.set(item.nodeId, lines.length);
        lines.push(item.text);
      }
    } else {
      pushStoreSite(groupStoreSites[gi] ?? []);
      for (const rule of group.rules) {
        pushLeadingComments(rule.nodeId, commentMap, lines);
        entryIndexByNodeId.set(rule.nodeId, lines.length);
        lines.push(emitRule(rule, group.usingKeys));
      }
    }
  });
  pushStoreSite(catchAllSite);

  lines.push(""); // trailing newline
  return lines;
}
